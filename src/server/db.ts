import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Coleccion, Datos, PagoMarcado, Persona, Rol, TokenApi, Usuario } from '../shared/tipos.ts';
import { CLAVE_FALSA, claveCorrecta, hashClave, hashToken, nuevoToken, nuevoTokenApi } from './auth.ts';
import { MIGRACIONES } from './migraciones.ts';

export class ErrorPeticion extends Error {
  statusCode: number;
  constructor(mensaje: string, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

type Tipo = 'texto' | 'texto?' | 'numero' | 'entero' | 'bool' | 'mes' | 'mes?' | 'fecha' | 'frecuencia' | 'meses?' | 'porDia?' | 'split?' | 'reparto?' | 'tipoCategoria';
type Celda = string | number | null;

const COLECCIONES: Record<Coleccion, { tabla: string; campos: Record<string, Tipo> }> = {
  categorias: { tabla: 'categorias', campos: { nombre: 'texto', tipo: 'tipoCategoria', color: 'texto', orden: 'entero' } },
  ingresos: { tabla: 'ingresos', campos: { nombre: 'texto', categoria: 'texto?', monto: 'numero', desde: 'mes?', hasta: 'mes?', reparto: 'reparto?' } },
  gastos: {
    tabla: 'gastos',
    campos: {
      nombre: 'texto', categoria: 'texto', monto: 'numero', frecuencia: 'frecuencia', meses: 'meses?',
      recortable: 'bool', nota: 'texto?', porDia: 'porDia?', split: 'split?', reparto: 'reparto?',
    },
  },
  msi: { tabla: 'compras_msi', campos: { nombre: 'texto', pagoMensual: 'numero', plazoTotal: 'entero', inicio: 'mes', reparto: 'reparto?' } },
  ciclos: { tabla: 'ciclos_escolares', campos: { nombre: 'texto', inicio: 'fecha', fin: 'fecha' } },
  sinClases: { tabla: 'sin_clases', campos: { desde: 'fecha', hasta: 'fecha', motivo: 'texto' } },
};

// Orden de inserción: las categorías antes que los gastos que las referencian.
const ORDEN = Object.keys(COLECCIONES) as Coleccion[];

export const esColeccion = (s: string): s is Coleccion => Object.hasOwn(COLECCIONES, s);

const columna = (campo: string) => campo.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RE_ID = /^[\w.:-]{1,64}$/;
const SESION_MS = 30 * 24 * 60 * 60 * 1000;

function aCelda(tipo: Tipo, v: unknown, campo: string): Celda {
  const falla = (): never => {
    throw new ErrorPeticion(`Campo inválido: ${campo}`);
  };
  if (v === undefined || v === null || v === '') {
    if (tipo === 'bool') return 0;
    if (tipo === 'tipoCategoria') return 'gasto'; // respaldos anteriores a las categorías de ingreso
    return tipo.endsWith('?') ? null : falla();
  }
  switch (tipo) {
    case 'texto':
    case 'texto?': {
      if (typeof v !== 'string' || v.length > 200) return falla();
      return v.trim() || (tipo === 'texto' ? falla() : null);
    }
    case 'numero':
      return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : falla();
    case 'entero':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : falla();
    case 'bool':
      return v === true ? 1 : v === false ? 0 : falla();
    case 'mes':
    case 'mes?':
      return typeof v === 'string' && RE_MES.test(v) ? v : falla();
    case 'fecha':
      return typeof v === 'string' && RE_FECHA.test(v) ? v : falla();
    case 'frecuencia':
      return v === 'mes' || v === 'bimestre' || v === 'anio' ? v : falla();
    case 'tipoCategoria':
      return v === 'gasto' || v === 'ingreso' ? v : falla();
    case 'meses?': {
      if (!Array.isArray(v) || v.length > 60 || !v.every((m) => typeof m === 'string' && RE_MES.test(m))) return falla();
      return v.length ? JSON.stringify([...new Set(v as string[])].sort()) : null;
    }
    case 'porDia?': {
      const p = v as { tarifa?: unknown; diasSemana?: unknown };
      const ok =
        typeof p === 'object' &&
        typeof p.tarifa === 'number' && Number.isFinite(p.tarifa) && p.tarifa >= 0 &&
        Array.isArray(p.diasSemana) &&
        p.diasSemana.every((n) => Number.isInteger(n) && n >= 0 && n <= 6);
      return ok ? JSON.stringify({ tarifa: p.tarifa, diasSemana: p.diasSemana }) : falla();
    }
    case 'split?': {
      const s = v as { personas?: unknown; tipo?: unknown; valor?: unknown };
      if (typeof s !== 'object' || !Number.isInteger(s.personas) || (s.personas as number) < 2 || (s.personas as number) > 99) return falla();
      if (s.tipo === 'iguales') return JSON.stringify({ personas: s.personas, tipo: s.tipo });
      const ok =
        (s.tipo === 'monto' || s.tipo === 'pct') &&
        typeof s.valor === 'number' && Number.isFinite(s.valor) && s.valor >= 0 && (s.tipo === 'monto' || s.valor <= 100);
      return ok ? JSON.stringify({ personas: s.personas, tipo: s.tipo, valor: s.valor }) : falla();
    }
    case 'reparto?': {
      const r = v as { tipo?: unknown; de?: unknown; valor?: unknown };
      if (typeof r !== 'object' || typeof r.de !== 'string' || !RE_ID.test(r.de)) return falla();
      if (r.tipo === 'solo') return JSON.stringify({ tipo: r.tipo, de: r.de });
      const ok =
        (r.tipo === 'monto' || r.tipo === 'pct') &&
        typeof r.valor === 'number' && Number.isFinite(r.valor) && r.valor >= 0 && (r.tipo === 'monto' || r.valor <= 100);
      return ok ? JSON.stringify({ tipo: r.tipo, de: r.de, valor: r.valor }) : falla();
    }
  }
}

function deCelda(tipo: Tipo, v: unknown): unknown {
  if (tipo === 'bool') return v === 1 ? true : undefined;
  if (v === null) return undefined;
  return tipo === 'meses?' || tipo === 'porDia?' || tipo === 'split?' || tipo === 'reparto?' ? JSON.parse(v as string) : v;
}

function nombreValido(v: unknown): string {
  const nombre = typeof v === 'string' ? v.trim() : '';
  if (nombre.length < 2 || nombre.length > 40) throw new ErrorPeticion('El nombre de usuario debe tener entre 2 y 40 caracteres');
  return nombre;
}

function claveValida(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) throw new ErrorPeticion('La contraseña debe tener al menos 8 caracteres');
  return v;
}

export type Almacen = ReturnType<typeof abrirAlmacen>;
export type AlmacenUsuario = ReturnType<Almacen['para']>;

export function abrirAlmacen(ruta: string) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  function transaccion<T>(fn: () => T): T {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = user_version; v < MIGRACIONES.length; v++) {
    transaccion(() => {
      db.exec(MIGRACIONES[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }

  /** Operaciones sobre los datos de un solo usuario; ninguna consulta sale de su usuario_id. */
  function para(uid: string) {
    const tipoDeCategoria = (id: unknown) =>
      typeof id === 'string'
        ? (db.prepare('SELECT tipo FROM categorias WHERE usuario_id = ? AND id = ?').get(uid, id)?.tipo as string | undefined)
        : undefined;

    /** Un gasto solo puede usar categorías de gasto y un ingreso solo de ingreso, siempre del mismo usuario. */
    function revisarCategoria(col: Coleccion, obj: Record<string, unknown>) {
      const esperado = col === 'gastos' ? 'gasto' : col === 'ingresos' ? 'ingreso' : null;
      const sinCategoria = obj.categoria === undefined || obj.categoria === null || obj.categoria === '';
      if (!esperado || sinCategoria) return;
      if (tipoDeCategoria(obj.categoria) !== esperado) throw new ErrorPeticion(`La categoría de ${esperado} no existe`, 409);
    }

    function insertar(col: Coleccion, cuerpo: unknown): string {
      const { tabla, campos } = COLECCIONES[col];
      const obj = (cuerpo ?? {}) as Record<string, unknown>;
      revisarCategoria(col, obj);
      const id = obj.id === undefined ? randomUUID() : obj.id;
      if (typeof id !== 'string' || !RE_ID.test(id)) throw new ErrorPeticion('Campo inválido: id');
      const nombres = Object.keys(campos);
      const valores = nombres.map((k) => aCelda(campos[k], obj[k], k));
      try {
        db.prepare(
          `INSERT INTO ${tabla} (usuario_id, id, ${nombres.map(columna).join(', ')}) VALUES (?, ?${', ?'.repeat(nombres.length)})`,
        ).run(uid, id, ...valores);
      } catch (e) {
        throw aErrorPeticion(e);
      }
      return id;
    }

    function leer<T>(col: Coleccion): T[] {
      const { tabla, campos } = COLECCIONES[col];
      const orden = col === 'categorias' ? 'orden, rowid' : col === 'sinClases' ? 'desde' : 'rowid';
      return db.prepare(`SELECT * FROM ${tabla} WHERE usuario_id = ? ORDER BY ${orden}`).all(uid).map((fila) => {
        const item: Record<string, unknown> = { id: fila.id };
        for (const k of Object.keys(campos)) {
          const v = deCelda(campos[k], fila[columna(k)]);
          if (v !== undefined) item[k] = v;
        }
        return item as T;
      });
    }

    function leerDatos(): Datos {
      return {
        categorias: leer('categorias'),
        ingresos: leer('ingresos'),
        gastos: leer('gastos'),
        msi: leer('msi'),
        ciclos: leer('ciclos'),
        sinClases: leer('sinClases'),
        // Quienes comparten estos datos: el dueño y los usuarios que están en su hogar.
        miembros: db.prepare('SELECT id, nombre FROM usuarios WHERE id = ? OR hogar = ? ORDER BY rowid').all(uid, uid) as unknown as Persona[],
        pagos: db
          .prepare('SELECT mes, item_id AS itemId FROM pagos_marcados WHERE usuario_id = ? ORDER BY mes')
          .all(uid) as unknown as PagoMarcado[],
      };
    }

    function marcarPago(mes: unknown, itemId: unknown, pagado: unknown) {
      if (typeof mes !== 'string' || !RE_MES.test(mes)) throw new ErrorPeticion('Campo inválido: mes');
      if (typeof itemId !== 'string' || !RE_ID.test(itemId)) throw new ErrorPeticion('Campo inválido: itemId');
      if (pagado) db.prepare('INSERT OR IGNORE INTO pagos_marcados (usuario_id, mes, item_id) VALUES (?, ?, ?)').run(uid, mes, itemId);
      else db.prepare('DELETE FROM pagos_marcados WHERE usuario_id = ? AND mes = ? AND item_id = ?').run(uid, mes, itemId);
    }

    function vaciar() {
      db.prepare('DELETE FROM pagos_marcados WHERE usuario_id = ?').run(uid);
      for (const col of [...ORDEN].reverse()) db.prepare(`DELETE FROM ${COLECCIONES[col].tabla} WHERE usuario_id = ?`).run(uid);
    }

    function cargar(datos: Datos) {
      for (const col of ORDEN) {
        const lista = datos[col];
        if (!Array.isArray(lista)) throw new ErrorPeticion(`Falta la lista: ${col}`);
        for (const item of lista) insertar(col, item);
      }
      for (const p of datos.pagos ?? []) marcarPago(p.mes, p.itemId, true);
    }

    return {
      leerDatos,
      vaciar,
      cargar,
      crear: (col: Coleccion, cuerpo: unknown) => ({ id: insertar(col, cuerpo) }),
      actualizar(col: Coleccion, id: string, cuerpo: unknown) {
        const { tabla, campos } = COLECCIONES[col];
        const obj = (cuerpo ?? {}) as Record<string, unknown>;
        revisarCategoria(col, obj);
        if (col === 'categorias') {
          const tipo = tipoDeCategoria(id);
          if (tipo && tipo !== (obj.tipo ?? 'gasto')) throw new ErrorPeticion('No se puede cambiar el tipo de una categoría');
        }
        const nombres = Object.keys(campos);
        const valores = nombres.map((k) => aCelda(campos[k], obj[k], k));
        let cambios;
        try {
          cambios = db
            .prepare(`UPDATE ${tabla} SET ${nombres.map((k) => `${columna(k)} = ?`).join(', ')} WHERE usuario_id = ? AND id = ?`)
            .run(...valores, uid, id).changes;
        } catch (e) {
          throw aErrorPeticion(e);
        }
        if (!cambios) throw new ErrorPeticion('No existe', 404);
      },
      borrar(col: Coleccion, id: string) {
        if (col === 'categorias') {
          const enUso = db
            .prepare('SELECT 1 FROM gastos WHERE usuario_id = ? AND categoria = ? UNION ALL SELECT 1 FROM ingresos WHERE usuario_id = ? AND categoria = ?')
            .get(uid, id, uid, id);
          if (enUso) throw new ErrorPeticion('La categoría está en uso; cambia primero la categoría de esos gastos o ingresos', 409);
        }
        try {
          transaccion(() => {
            db.prepare(`DELETE FROM ${COLECCIONES[col].tabla} WHERE usuario_id = ? AND id = ?`).run(uid, id);
            db.prepare('DELETE FROM pagos_marcados WHERE usuario_id = ? AND item_id = ?').run(uid, id);
          });
        } catch (e) {
          throw aErrorPeticion(e);
        }
      },
      marcarPago,
      reiniciarMes(mes: string) {
        if (!RE_MES.test(mes)) throw new ErrorPeticion('Campo inválido: mes');
        db.prepare('DELETE FROM pagos_marcados WHERE usuario_id = ? AND mes = ?').run(uid, mes);
      },
      /** Reemplaza todos los datos de este usuario; si el respaldo es inválido no cambia nada. */
      importar(datos: unknown) {
        if (typeof datos !== 'object' || datos === null) throw new ErrorPeticion('El respaldo no es válido');
        transaccion(() => {
          vaciar();
          cargar(datos as Datos);
        });
      },
    };
  }

  const buscarUsuario = (id: string) =>
    db.prepare('SELECT id, nombre, rol, hogar FROM usuarios WHERE id = ?').get(id) as unknown as Usuario | undefined;

  return {
    para,
    hayUsuarios: () => db.prepare('SELECT 1 FROM usuarios LIMIT 1').get() !== undefined,
    listarUsuarios: () => db.prepare('SELECT id, nombre, rol, hogar FROM usuarios ORDER BY rowid').all() as unknown as Usuario[],

    /** Id del usuario dueño de los datos que ve `id`: el suyo, o el del hogar que comparte. */
    hogarDe: (id: string) => buscarUsuario(id)?.hogar ?? id,

    /** Mete a un usuario al hogar de otro (o lo saca, con null). Sus datos propios se conservan sin usarse. */
    asignarHogar(id: string, hogar: string | null) {
      const usuario = buscarUsuario(id);
      if (!usuario) throw new ErrorPeticion('No existe', 404);
      if (hogar !== null) {
        if (hogar === id || buscarUsuario(hogar)?.hogar) throw new ErrorPeticion('Ese hogar no es válido');
        if (db.prepare('SELECT 1 FROM usuarios WHERE hogar = ?').get(id)) throw new ErrorPeticion('Otros usuarios comparten el hogar de esta cuenta');
      }
      db.prepare('UPDATE usuarios SET hogar = ? WHERE id = ?').run(hogar, id);
    },

    /** Crea la cuenta y le carga sus datos iniciales. */
    crearUsuario(nombre: unknown, clave: unknown, rol: Rol, datosIniciales: Datos): Usuario {
      const usuario: Usuario = { id: randomUUID(), nombre: nombreValido(nombre), rol };
      const hash = hashClave(claveValida(clave));
      try {
        transaccion(() => {
          db.prepare('INSERT INTO usuarios (id, nombre, clave, rol, creado) VALUES (?, ?, ?, ?, ?)').run(
            usuario.id, usuario.nombre, hash, rol, new Date().toISOString(),
          );
          para(usuario.id).cargar(datosIniciales);
        });
      } catch (e) {
        if (e instanceof Error && e.message.includes('usuarios.nombre')) throw new ErrorPeticion('Ya existe un usuario con ese nombre', 409);
        throw e;
      }
      return usuario;
    },

    verificarClave(nombre: unknown, clave: unknown): Usuario | null {
      if (typeof nombre !== 'string' || typeof clave !== 'string') return null;
      const fila = db.prepare('SELECT id, nombre, rol, clave FROM usuarios WHERE nombre = ?').get(nombre.trim()) as
        | (Usuario & { clave: string })
        | undefined;
      if (!claveCorrecta(clave, fila?.clave ?? CLAVE_FALSA) || !fila) return null;
      return { id: fila.id, nombre: fila.nombre, rol: fila.rol };
    },

    /** Cambia la contraseña, cierra las demás sesiones del usuario y revoca sus tokens de acceso. */
    cambiarClave(id: string, nueva: unknown, conservarToken?: string) {
      const hash = hashClave(claveValida(nueva));
      if (!db.prepare('UPDATE usuarios SET clave = ? WHERE id = ?').run(hash, id).changes) throw new ErrorPeticion('No existe', 404);
      db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?').run(id, conservarToken ? hashToken(conservarToken) : '');
      db.prepare('DELETE FROM tokens_api WHERE usuario_id = ?').run(id);
    },

    /** El token completo solo existe en esta respuesta: en la base queda su hash. */
    crearTokenApi(usuarioId: string, nombre: unknown): TokenApi & { token: string } {
      const etiqueta = typeof nombre === 'string' ? nombre.trim() : '';
      if (etiqueta.length < 1 || etiqueta.length > 60) throw new ErrorPeticion('Ponle un nombre al token (hasta 60 caracteres)');
      const cuantos = db.prepare('SELECT count(*) AS n FROM tokens_api WHERE usuario_id = ?').get(usuarioId) as { n: number };
      if (cuantos.n >= 10) throw new ErrorPeticion('Ya tienes 10 tokens; revoca alguno antes de crear otro');
      const token = nuevoTokenApi();
      const fila = { id: randomUUID(), nombre: etiqueta, creado: new Date().toISOString() };
      db.prepare('INSERT INTO tokens_api (id, usuario_id, nombre, hash, creado) VALUES (?, ?, ?, ?, ?)').run(
        fila.id, usuarioId, fila.nombre, hashToken(token), fila.creado,
      );
      return { ...fila, ultimoUso: null, token };
    },

    listarTokensApi: (usuarioId: string) =>
      db
        .prepare('SELECT id, nombre, creado, ultimo_uso AS ultimoUso FROM tokens_api WHERE usuario_id = ? ORDER BY rowid')
        .all(usuarioId) as unknown as TokenApi[],

    borrarTokenApi(usuarioId: string, id: string) {
      if (!db.prepare('DELETE FROM tokens_api WHERE usuario_id = ? AND id = ?').run(usuarioId, id).changes) throw new ErrorPeticion('No existe', 404);
    },

    usuarioDeTokenApi(token: string): Usuario | null {
      const hash = hashToken(token);
      const fila = db
        .prepare('SELECT u.id, u.nombre, u.rol FROM tokens_api t JOIN usuarios u ON u.id = t.usuario_id WHERE t.hash = ?')
        .get(hash) as unknown as Usuario | undefined;
      if (!fila) return null;
      db.prepare('UPDATE tokens_api SET ultimo_uso = ? WHERE hash = ?').run(new Date().toISOString(), hash);
      return { id: fila.id, nombre: fila.nombre, rol: fila.rol };
    },

    borrarUsuario(id: string) {
      const usuario = buscarUsuario(id);
      if (!usuario) throw new ErrorPeticion('No existe', 404);
      if (usuario.rol === 'admin') throw new ErrorPeticion('No se puede borrar al administrador');
      transaccion(() => {
        para(id).vaciar();
        db.prepare('UPDATE usuarios SET hogar = NULL WHERE hogar = ?').run(id);
        db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
      });
    },

    crearSesion(usuarioId: string): string {
      const token = nuevoToken();
      db.prepare('DELETE FROM sesiones WHERE expira < ?').run(Date.now());
      db.prepare('INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, ?)').run(hashToken(token), usuarioId, Date.now() + SESION_MS);
      return token;
    },

    usuarioDeSesion(token: string): Usuario | null {
      const fila = db
        .prepare('SELECT u.id, u.nombre, u.rol FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND s.expira > ?')
        .get(hashToken(token), Date.now()) as unknown as Usuario | undefined;
      return fila ? { id: fila.id, nombre: fila.nombre, rol: fila.rol } : null;
    },

    cerrarSesion(token: string) {
      db.prepare('DELETE FROM sesiones WHERE token = ?').run(hashToken(token));
    },

    cerrar: () => db.close(),
  };
}

function aErrorPeticion(e: unknown): unknown {
  if (e instanceof ErrorPeticion) return e;
  const msg = e instanceof Error ? e.message : '';
  if (msg.includes('FOREIGN KEY')) return new ErrorPeticion('Hay gastos que usan esa categoría, o la categoría no existe', 409);
  if (msg.includes('UNIQUE')) return new ErrorPeticion('Ya existe un elemento con ese id', 409);
  return e;
}
