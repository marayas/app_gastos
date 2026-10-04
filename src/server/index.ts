import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { SEMILLA_BASE } from '../shared/semilla.ts';
import type { Estado, Sesion, Usuario } from '../shared/tipos.ts';
import { cookieSesion, intentos, tokenBearer } from './auth.ts';
import { abrirAlmacen, ErrorPeticion, esColeccion } from './db.ts';
import { informeLiquidez, informeResumen } from './informes.ts';
import { responderMcp } from './mcp.ts';

const PUERTO = Number(process.env.PORT ?? 8080);
const RUTA_DB = process.env.DB_PATH ?? join(import.meta.dirname, '../../data/finanzas.db');
const DIST = join(import.meta.dirname, '../../dist');
// Actívalo cuando la app esté detrás de HTTPS, para que la cookie no viaje por http.
const COOKIE_SEGURA = process.env.COOKIE_SECURE === '1';

// Actívalo detrás de un proxy inverso, para que el límite de intentos use la dirección real del cliente.
const TRAS_PROXY = process.env.TRUST_PROXY === '1';

const almacen = abrirAlmacen(RUTA_DB);
const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024, trustProxy: TRAS_PROXY });

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario | null;
    conToken: boolean; // autenticado con un token de acceso (solo lectura), no con sesión
  }
}
app.decorateRequest('usuario', null);
app.decorateRequest('conToken', false);

// Cabeceras de seguridad para cuando la app se expone fuera de la red local.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

app.addHook('onSend', async (_req, res) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('Referrer-Policy', 'no-referrer');
  res.header('Content-Security-Policy', CSP);
  if (COOKIE_SEGURA) res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

// Fecha local del servidor (según TZ), para que todos los dispositivos vean el mismo mes.
function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function coleccion(nombre: string) {
  if (!esColeccion(nombre)) throw new ErrorPeticion('Colección desconocida', 404);
  return nombre;
}

function ponerCookie(res: FastifyReply, token: string | null) {
  const vida = token ? 30 * 24 * 60 * 60 : 0;
  res.header('Set-Cookie', `sesion=${token ?? ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${vida}${COOKIE_SEGURA ? '; Secure' : ''}`);
}

function iniciarSesion(res: FastifyReply, usuario: Usuario): Sesion {
  ponerCookie(res, almacen.crearSesion(usuario.id));
  return { usuario, requiereConfiguracion: false };
}

/** Datos del usuario de la sesión; es la única puerta a la información. */
const datosDe = (req: FastifyRequest) => almacen.para(req.usuario!.id);

function soloAdmin(req: FastifyRequest) {
  if (req.usuario?.rol !== 'admin') throw new ErrorPeticion('Solo el administrador puede hacer esto', 403);
}

const SIN_SESION = new Set(['/api/sesion', '/api/configurar', '/api/entrar', '/api/salir']);

// Lo único que puede leer un token de acceso por la API; el resto exige sesión.
const LECTURA_CON_TOKEN = new Set(['/api/estado', '/api/exportar', '/api/resumen', '/api/liquidez']);

app.addHook('preHandler', async (req, res) => {
  const ruta = req.url.split('?')[0];
  const esMcp = ruta === '/mcp';
  if (!ruta.startsWith('/api/') && !esMcp) return;

  if (req.headers.authorization !== undefined || esMcp) {
    const origen = `token|${req.ip}`;
    if (intentos.bloqueado(origen)) throw new ErrorPeticion('Demasiados intentos fallidos. Espera 15 minutos.', 429);
    const token = tokenBearer(req.headers.authorization);
    req.usuario = token ? almacen.usuarioDeTokenApi(token) : null;
    if (!req.usuario) {
      if (req.headers.authorization !== undefined) intentos.fallo(origen);
      res.header('WWW-Authenticate', 'Bearer');
      throw new ErrorPeticion('Token de acceso faltante, inválido o revocado', 401);
    }
    req.conToken = true;
    if (!esMcp && !(req.method === 'GET' && LECTURA_CON_TOKEN.has(ruta))) {
      throw new ErrorPeticion('Los tokens de acceso son de solo lectura', 403);
    }
    return;
  }

  const sesion = cookieSesion(req.headers.cookie);
  req.usuario = sesion ? almacen.usuarioDeSesion(sesion) : null;
  if (!req.usuario && !SIN_SESION.has(ruta)) throw new ErrorPeticion('Inicia sesión', 401);
});

app.get('/health', () => ({ ok: true }));

// --- Sesión ---

app.get('/api/sesion', (req): Sesion => ({ usuario: req.usuario, requiereConfiguracion: !almacen.hayUsuarios() }));

// Primera vez: quien abre la app crea la cuenta de administrador. Empieza limpia, como todas.
app.post('/api/configurar', (req, res) => {
  if (almacen.hayUsuarios()) throw new ErrorPeticion('La app ya está configurada', 409);
  const { nombre, clave } = (req.body ?? {}) as Record<string, unknown>;
  return iniciarSesion(res, almacen.crearUsuario(nombre, clave, 'admin', SEMILLA_BASE));
});

app.post('/api/entrar', (req, res) => {
  const { nombre, clave } = (req.body ?? {}) as Record<string, unknown>;
  const intento = `${req.ip}|${String(nombre).trim().toLowerCase()}`;
  if (intentos.bloqueado(intento)) throw new ErrorPeticion('Demasiados intentos fallidos. Espera 15 minutos.', 429);
  const usuario = almacen.verificarClave(nombre, clave);
  if (!usuario) {
    intentos.fallo(intento);
    throw new ErrorPeticion('Usuario o contraseña incorrectos', 401);
  }
  intentos.exito(intento);
  return iniciarSesion(res, usuario);
});

app.post('/api/salir', (req, res) => {
  const token = cookieSesion(req.headers.cookie);
  if (token) almacen.cerrarSesion(token);
  ponerCookie(res, null);
  return { ok: true };
});

app.post('/api/clave', (req) => {
  const { actual, nueva } = (req.body ?? {}) as Record<string, unknown>;
  if (!almacen.verificarClave(req.usuario!.nombre, actual)) throw new ErrorPeticion('La contraseña actual no es correcta', 403);
  almacen.cambiarClave(req.usuario!.id, nueva, cookieSesion(req.headers.cookie)!);
  return { ok: true };
});

// --- Tokens de acceso para asistentes (se administran solo con sesión) ---

app.get('/api/tokens', (req) => almacen.listarTokensApi(req.usuario!.id));

app.post('/api/tokens', (req, res) => {
  res.code(201);
  return almacen.crearTokenApi(req.usuario!.id, ((req.body ?? {}) as Record<string, unknown>).nombre);
});

app.delete<{ Params: { id: string } }>('/api/tokens/:id', (req) => {
  almacen.borrarTokenApi(req.usuario!.id, req.params.id);
  return { ok: true };
});

// --- Usuarios (solo administrador) ---

app.get('/api/usuarios', (req) => {
  soloAdmin(req);
  return almacen.listarUsuarios();
});

app.post('/api/usuarios', (req, res) => {
  soloAdmin(req);
  const { nombre, clave } = (req.body ?? {}) as Record<string, unknown>;
  res.code(201);
  return almacen.crearUsuario(nombre, clave, 'usuario', SEMILLA_BASE);
});

app.post<{ Params: { id: string } }>('/api/usuarios/:id/clave', (req) => {
  soloAdmin(req);
  almacen.cambiarClave(req.params.id, ((req.body ?? {}) as Record<string, unknown>).clave);
  return { ok: true };
});

app.delete<{ Params: { id: string } }>('/api/usuarios/:id', (req) => {
  soloAdmin(req);
  almacen.borrarUsuario(req.params.id);
  return { ok: true };
});

// --- Datos del usuario de la sesión ---

app.get('/api/estado', (req): Estado => ({ ...datosDe(req).leerDatos(), hoy: hoy() }));

// --- Informes ya calculados ---

function mesPedido(valor: unknown): string {
  if (valor === undefined) return hoy().slice(0, 7);
  if (typeof valor !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) throw new ErrorPeticion('El mes debe tener el formato AAAA-MM');
  return valor;
}

app.get<{ Querystring: { mes?: string; periodo?: string } }>('/api/resumen', (req) =>
  informeResumen(datosDe(req).leerDatos(), mesPedido(req.query.mes), req.query.periodo === 'anio' ? 'anio' : 'mes'),
);

app.get<{ Querystring: { mes?: string } }>('/api/liquidez', (req) =>
  informeLiquidez(datosDe(req).leerDatos(), mesPedido(req.query.mes)),
);

// --- MCP: herramientas de lectura para asistentes, autenticadas con token ---

app.post('/mcp', (req, res) => {
  const ctx = { datos: () => datosDe(req).leerDatos(), mesActual: hoy().slice(0, 7) };
  const cuerpo = req.body;
  if (Array.isArray(cuerpo)) {
    const respuestas = cuerpo.map((m) => responderMcp(m, ctx)).filter((r) => r !== null);
    return respuestas.length ? respuestas : res.code(202).send();
  }
  const respuesta = responderMcp(cuerpo, ctx);
  return respuesta ?? res.code(202).send();
});

// Sin estado: no hay flujo de eventos que abrir ni sesión que cerrar.
app.route({
  method: ['GET', 'DELETE'],
  url: '/mcp',
  handler: (_req, res) => res.code(405).header('Allow', 'POST').send({ error: 'Usa POST' }),
});

app.get('/api/exportar', (req, res) => {
  res.header('Content-Disposition', `attachment; filename="finanzas-${hoy()}.json"`);
  return { version: 1, exportado: new Date().toISOString(), ...datosDe(req).leerDatos() };
});

app.post('/api/importar', (req) => {
  datosDe(req).importar(req.body);
  return { ok: true };
});

app.post('/api/pagos', (req) => {
  const { mes, itemId, pagado } = (req.body ?? {}) as Record<string, unknown>;
  datosDe(req).marcarPago(mes, itemId, pagado);
  return { ok: true };
});

app.delete<{ Params: { mes: string } }>('/api/pagos/:mes', (req) => {
  datosDe(req).reiniciarMes(req.params.mes);
  return { ok: true };
});

app.post<{ Params: { col: string } }>('/api/:col', (req, res) => {
  res.code(201);
  return datosDe(req).crear(coleccion(req.params.col), req.body);
});

app.put<{ Params: { col: string; id: string } }>('/api/:col/:id', (req) => {
  datosDe(req).actualizar(coleccion(req.params.col), req.params.id, req.body);
  return { ok: true };
});

app.delete<{ Params: { col: string; id: string } }>('/api/:col/:id', (req) => {
  datosDe(req).borrar(coleccion(req.params.col), req.params.id);
  return { ok: true };
});

if (existsSync(DIST)) {
  app.register(fastifyStatic, { root: DIST });
}

app.listen({ port: PUERTO, host: '0.0.0.0' }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, async () => {
    await app.close();
    almacen.cerrar();
    process.exit(0);
  });
}
