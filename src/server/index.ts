import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { SEMILLA_BASE } from '../shared/semilla.ts';
import type { Estado, Sesion, Usuario } from '../shared/tipos.ts';
import { cookieSesion, intentos } from './auth.ts';
import { abrirAlmacen, ErrorPeticion, esColeccion } from './db.ts';

const PUERTO = Number(process.env.PORT ?? 8080);
const RUTA_DB = process.env.DB_PATH ?? join(import.meta.dirname, '../../data/finanzas.db');
const DIST = join(import.meta.dirname, '../../dist');
// Actívalo cuando la app esté detrás de HTTPS, para que la cookie no viaje por http.
const COOKIE_SEGURA = process.env.COOKIE_SECURE === '1';

const almacen = abrirAlmacen(RUTA_DB);
const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 });

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario | null;
  }
}
app.decorateRequest('usuario', null);

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

app.addHook('preHandler', async (req) => {
  if (!req.url.startsWith('/api/')) return;
  const token = cookieSesion(req.headers.cookie);
  req.usuario = token ? almacen.usuarioDeSesion(token) : null;
  if (!req.usuario && !SIN_SESION.has(req.url.split('?')[0])) throw new ErrorPeticion('Inicia sesión', 401);
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
