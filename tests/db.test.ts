import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { abrirAlmacen } from '../src/server/db.ts';
import { MIGRACIONES } from '../src/server/migraciones.ts';
import { SEMILLA_BASE } from '../src/shared/semilla.ts';
import { EJEMPLO } from './datos-ejemplo.ts';
import type { Gasto } from '../src/shared/tipos.ts';

function conAdmin() {
  const almacen = abrirAlmacen(':memory:');
  const admin = almacen.crearUsuario('Admin', 'secreto-largo', 'admin', EJEMPLO);
  return { almacen, admin, a: almacen.para(admin.id) };
}

describe('datos de un usuario', () => {
  it('carga los datos iniciales tal cual', () => {
    const d = conAdmin().a.leerDatos();
    expect(d.gastos).toHaveLength(EJEMPLO.gastos.length);
    expect(d.gastos.find((g) => g.id === 'after-school')).toEqual(EJEMPLO.gastos.find((g) => g.id === 'after-school'));
    expect(d.gastos.find((g) => g.id === 'cafe')?.recortable).toBe(true);
    expect(d.ingresos).toEqual(EJEMPLO.ingresos);
    expect(d.msi).toEqual(EJEMPLO.msi);
    expect(d.sinClases).toHaveLength(EJEMPLO.sinClases.length);
  });

  it('crea, actualiza y borra', () => {
    const { a } = conAdmin();
    const { id } = a.crear('gastos', { nombre: 'Gym', categoria: 'salud', monto: 500, frecuencia: 'mes' });
    a.actualizar('gastos', id, { nombre: 'Gym', categoria: 'salud', monto: 650, frecuencia: 'bimestre' });
    const g = a.leerDatos().gastos.find((x) => x.id === id) as Gasto;
    expect(g).toMatchObject({ monto: 650, frecuencia: 'bimestre' });
    a.borrar('gastos', id);
    expect(a.leerDatos().gastos.some((x) => x.id === id)).toBe(false);
  });

  it('guarda y quita el split de un gasto', () => {
    const { a } = conAdmin();
    const gasto = { nombre: 'Renta', categoria: 'casa', monto: 12000, frecuencia: 'mes' };
    const { id } = a.crear('gastos', { ...gasto, split: { personas: 2, tipo: 'pct', valor: 60 } });
    const leer = () => a.leerDatos().gastos.find((x) => x.id === id) as Gasto;
    expect(leer().split).toEqual({ personas: 2, tipo: 'pct', valor: 60 });
    a.actualizar('gastos', id, gasto);
    expect(leer().split).toBeUndefined();
    expect(() => a.crear('gastos', { ...gasto, split: { personas: 1, tipo: 'iguales' } })).toThrow();
    expect(() => a.crear('gastos', { ...gasto, split: { personas: 2, tipo: 'pct', valor: 120 } })).toThrow();
  });

  it('hogar compartido: el otro usuario ve y edita los mismos datos, y puede volver a los suyos', () => {
    const { almacen, admin, a } = conAdmin();
    const ana = almacen.crearUsuario('Ana', 'secreto-largo', 'usuario', SEMILLA_BASE);
    const deAna = () => almacen.para(almacen.hogarDe(ana.id));
    expect(deAna().leerDatos().gastos).toEqual([]);
    expect(a.leerDatos().miembros).toEqual([{ id: admin.id, nombre: 'Admin' }]);

    almacen.asignarHogar(ana.id, admin.id);
    expect(almacen.hogarDe(ana.id)).toBe(admin.id);
    expect(deAna().leerDatos().gastos).toHaveLength(EJEMPLO.gastos.length);
    expect(deAna().leerDatos().miembros).toEqual([{ id: admin.id, nombre: 'Admin' }, { id: ana.id, nombre: 'Ana' }]);

    // Lo que captura Ana queda en los datos del hogar, con su reparto.
    const { id } = deAna().crear('gastos', { nombre: 'Gym', categoria: 'salud', monto: 800, frecuencia: 'mes', reparto: { tipo: 'solo', de: ana.id } });
    deAna().crear('ingresos', { nombre: 'Sueldo de Ana', monto: 1000, reparto: { tipo: 'pct', de: ana.id, valor: 100 } });
    expect((a.leerDatos().gastos.find((g) => g.id === id) as Gasto).reparto).toEqual({ tipo: 'solo', de: ana.id });
    expect(() => a.crear('gastos', { nombre: 'X', categoria: 'salud', monto: 1, frecuencia: 'mes', reparto: { tipo: 'pct', de: ana.id, valor: 101 } })).toThrow();
    expect(() => a.crear('gastos', { nombre: 'X', categoria: 'salud', monto: 1, frecuencia: 'mes', reparto: { tipo: 'solo' } })).toThrow();

    expect(() => almacen.asignarHogar(admin.id, ana.id)).toThrow(); // el dueño de un hogar con miembros no se muda
    almacen.asignarHogar(ana.id, null);
    expect(deAna().leerDatos().gastos).toEqual([]);
    expect(a.leerDatos().gastos.some((g) => g.id === id)).toBe(true);
  });

  it('al borrar al dueño de un hogar, sus miembros vuelven a sus propios datos', () => {
    const { almacen } = conAdmin();
    const ana = almacen.crearUsuario('Ana', 'secreto-largo', 'usuario', SEMILLA_BASE);
    const luis = almacen.crearUsuario('Luis', 'secreto-largo', 'usuario', SEMILLA_BASE);
    almacen.asignarHogar(luis.id, ana.id);
    almacen.borrarUsuario(ana.id);
    expect(almacen.hogarDe(luis.id)).toBe(luis.id);
  });

  it('rechaza datos inválidos', () => {
    const { a } = conAdmin();
    expect(() => a.crear('gastos', { nombre: 'X', categoria: 'salud', monto: -1, frecuencia: 'mes' })).toThrow();
    expect(() => a.crear('gastos', { nombre: 'X', categoria: 'no-existe', monto: 1, frecuencia: 'mes' })).toThrow();
    expect(() => a.crear('msi', { nombre: 'X', pagoMensual: 1, plazoTotal: 3, inicio: 'octubre' })).toThrow();
    expect(() => a.actualizar('ingresos', 'no-existe', { nombre: 'X', monto: 1 })).toThrow();
    expect(() => a.borrar('categorias', 'salud')).toThrow();
  });

  it('guarda los pagos por mes y exporta/importa sin pérdidas', () => {
    const { almacen, a } = conAdmin();
    a.marcarPago('2026-10', 'carro', true);
    a.marcarPago('2026-11', 'carro', true);
    a.reiniciarMes('2026-10');
    const { miembros: _miembros, ...respaldo } = a.leerDatos(); // los miembros del hogar no van en el respaldo
    expect(respaldo.pagos).toEqual([{ mes: '2026-11', itemId: 'carro' }]);

    const b = almacen.para(almacen.crearUsuario('Otra', 'secreto-largo', 'usuario', SEMILLA_BASE).id);
    b.importar(JSON.parse(JSON.stringify(respaldo)));
    expect(b.leerDatos()).toMatchObject(respaldo);
    expect(() => b.importar({ gastos: [] })).toThrow();
    expect(b.leerDatos()).toMatchObject(respaldo); // un respaldo inválido no borra nada
  });
});

describe('categorías', () => {
  it('se crean categorías nuevas de ingreso y de gasto, y cada una solo sirve para lo suyo', () => {
    const { a } = conAdmin();
    a.crear('categorias', { id: 'freelance', nombre: 'Freelance', tipo: 'ingreso', color: 'c2', orden: 200 });
    a.crear('categorias', { id: 'mascotas', nombre: 'Mascotas', tipo: 'gasto', color: 'c6', orden: 201 });
    a.crear('ingresos', { id: 'proyecto', nombre: 'Proyecto', categoria: 'freelance', monto: 8000, desde: '2026-12', hasta: '2026-12' });
    a.crear('gastos', { id: 'croquetas', nombre: 'Croquetas', categoria: 'mascotas', monto: 900, frecuencia: 'mes' });
    const d = a.leerDatos();
    expect(d.ingresos.find((x) => x.id === 'proyecto')).toEqual({ id: 'proyecto', nombre: 'Proyecto', categoria: 'freelance', monto: 8000, desde: '2026-12', hasta: '2026-12' });
    expect(d.categorias.find((c) => c.id === 'freelance')?.tipo).toBe('ingreso');

    expect(() => a.crear('ingresos', { nombre: 'X', categoria: 'mascotas', monto: 1 })).toThrow('no existe');
    expect(() => a.crear('gastos', { nombre: 'X', categoria: 'freelance', monto: 1, frecuencia: 'mes' })).toThrow('no existe');
    expect(() => a.actualizar('gastos', 'croquetas', { nombre: 'X', categoria: 'sueldo', monto: 1, frecuencia: 'mes' })).toThrow('no existe');
  });

  it('no se borra una categoría en uso ni se le cambia el tipo', () => {
    const { a } = conAdmin();
    expect(() => a.borrar('categorias', 'sueldo')).toThrow('en uso');
    expect(() => a.borrar('categorias', 'auto')).toThrow('en uso');
    expect(() => a.actualizar('categorias', 'sueldo', { nombre: 'Sueldo', tipo: 'gasto', color: 'c1', orden: 1 })).toThrow('tipo');
    a.actualizar('categorias', 'bono', { nombre: 'Bonos', tipo: 'ingreso', color: 'c1', orden: 102 });
    a.borrar('categorias', 'bono');
    expect(a.leerDatos().categorias.some((c) => c.id === 'bono')).toBe(false);
  });

  it('una base de la versión 1 se migra sin perder datos', () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'finanzas-')), 'v1.db');
    const v1 = new DatabaseSync(ruta);
    v1.exec(MIGRACIONES[0]);
    v1.exec(`PRAGMA user_version = 1;
      INSERT INTO usuarios VALUES ('u1', 'Admin', 'x', 'admin', '2026-10-04');
      INSERT INTO categorias VALUES ('u1', 'auto', 'Auto', 'c2', 2);
      INSERT INTO ingresos VALUES ('u1', 'sueldo-a', 'Sueldo A', 40000, NULL);
      INSERT INTO gastos VALUES ('u1', 'carro', 'Pago del carro', 'auto', 6000, 'mes', 0, NULL, NULL);`);
    v1.close();

    const d = abrirAlmacen(ruta).para('u1').leerDatos();
    expect(d.categorias.find((c) => c.id === 'auto')?.tipo).toBe('gasto');
    expect(d.categorias.filter((c) => c.tipo === 'ingreso').map((c) => c.id)).toEqual(['sueldo', 'bono', 'aguinaldo', 'renta', 'otros-ingresos']);
    expect(d.ingresos).toEqual([{ id: 'sueldo-a', nombre: 'Sueldo A', categoria: 'otros-ingresos', monto: 40000 }]);
    expect(d.gastos).toHaveLength(1);
  });
});

describe('usuarios y segregación', () => {
  it('una cuenta nueva empieza limpia: solo categorías', () => {
    const { almacen } = conAdmin();
    const d = almacen.para(almacen.crearUsuario('Ana', 'secreto-largo', 'usuario', SEMILLA_BASE).id).leerDatos();
    expect(d.categorias).toHaveLength(EJEMPLO.categorias.length);
    expect([d.ingresos, d.gastos, d.msi, d.pagos, d.ciclos, d.sinClases]).toEqual([[], [], [], [], [], []]);
  });

  it('nadie lee, modifica ni borra datos de otro usuario', () => {
    const { almacen, a } = conAdmin();
    const b = almacen.para(almacen.crearUsuario('Ana', 'secreto-largo', 'usuario', SEMILLA_BASE).id);
    const antes = a.leerDatos();

    // El mismo id puede existir en dos usuarios sin mezclarse.
    b.crear('gastos', { id: 'carro', nombre: 'Mi carro', categoria: 'auto', monto: 1, frecuencia: 'mes' });
    b.actualizar('gastos', 'carro', { nombre: 'Mi carro', categoria: 'auto', monto: 2, frecuencia: 'mes' });
    expect(() => b.actualizar('gastos', 'cafe', { nombre: 'X', categoria: 'personal', monto: 0, frecuencia: 'mes' })).toThrow('No existe');
    b.borrar('gastos', 'cafe');
    b.borrar('ingresos', 'sueldo-a');
    b.marcarPago('2026-10', 'carro', true);
    b.reiniciarMes('2026-10');
    b.importar({ ...SEMILLA_BASE });

    expect(a.leerDatos()).toEqual(antes);
    expect(b.leerDatos().gastos).toEqual([]);
  });

  it('valida nombre y contraseña, y no repite nombres', () => {
    const { almacen } = conAdmin();
    expect(() => almacen.crearUsuario('Ana', 'corta', 'usuario', SEMILLA_BASE)).toThrow('al menos 8');
    expect(() => almacen.crearUsuario('', 'secreto-largo', 'usuario', SEMILLA_BASE)).toThrow();
    expect(() => almacen.crearUsuario('admin', 'secreto-largo', 'usuario', SEMILLA_BASE)).toThrow('Ya existe');
    expect(almacen.listarUsuarios().map((u) => u.nombre)).toEqual(['Admin']);
  });

  it('inicia sesión solo con la contraseña correcta y nunca expone el hash', () => {
    const { almacen, admin } = conAdmin();
    expect(almacen.verificarClave('admin', 'secreto-largo')).toEqual(admin);
    expect(almacen.verificarClave('Admin', 'otra-clave')).toBeNull();
    expect(almacen.verificarClave('nadie', 'secreto-largo')).toBeNull();
    expect(Object.keys(almacen.listarUsuarios()[0]).sort()).toEqual(['hogar', 'id', 'nombre', 'rol']);
  });

  it('las sesiones se cierran al salir y al cambiar la contraseña', () => {
    const { almacen, admin } = conAdmin();
    const t1 = almacen.crearSesion(admin.id);
    const t2 = almacen.crearSesion(admin.id);
    expect(almacen.usuarioDeSesion(t1)).toEqual(admin);
    expect(almacen.usuarioDeSesion('f'.repeat(64))).toBeNull();

    almacen.cambiarClave(admin.id, 'nueva-clave-larga', t1);
    expect(almacen.usuarioDeSesion(t1)).toEqual(admin);
    expect(almacen.usuarioDeSesion(t2)).toBeNull();
    expect(almacen.verificarClave('Admin', 'secreto-largo')).toBeNull();
    expect(almacen.verificarClave('Admin', 'nueva-clave-larga')).toEqual(admin);

    almacen.cerrarSesion(t1);
    expect(almacen.usuarioDeSesion(t1)).toBeNull();
  });

  it('borrar un usuario elimina sus datos y sesiones; el administrador no se puede borrar', () => {
    const { almacen, admin, a } = conAdmin();
    const ana = almacen.crearUsuario('Ana', 'secreto-largo', 'usuario', SEMILLA_BASE);
    almacen.para(ana.id).crear('gastos', { nombre: 'Renta', categoria: 'casa', monto: 9000, frecuencia: 'mes' });
    const token = almacen.crearSesion(ana.id);

    almacen.borrarUsuario(ana.id);
    expect(almacen.usuarioDeSesion(token)).toBeNull();
    expect(almacen.para(ana.id).leerDatos().categorias).toEqual([]);
    expect(almacen.listarUsuarios()).toEqual([{ ...admin, hogar: null }]);
    expect(() => almacen.borrarUsuario(admin.id)).toThrow();
    expect(a.leerDatos().gastos).toHaveLength(EJEMPLO.gastos.length);
  });
});

describe('tokens de acceso', () => {
  it('se crean, autentican a su dueño y se revocan', () => {
    const { almacen, admin } = conAdmin();
    const { token, id } = almacen.crearTokenApi(admin.id, 'Claude en mi Mac');
    expect(token).toMatch(/^fin_[0-9a-f]{64}$/);
    expect(almacen.usuarioDeTokenApi(token)).toEqual(admin);
    expect(almacen.usuarioDeTokenApi('fin_' + '0'.repeat(64))).toBeNull();

    const [listado] = almacen.listarTokensApi(admin.id);
    expect(listado).toMatchObject({ id, nombre: 'Claude en mi Mac' });
    expect(listado.ultimoUso).not.toBeNull();
    expect(JSON.stringify(listado)).not.toContain(token); // el listado nunca devuelve el secreto

    almacen.borrarTokenApi(admin.id, id);
    expect(almacen.usuarioDeTokenApi(token)).toBeNull();
  });

  it('cada quien administra solo los suyos, y se revocan al cambiar la contraseña o borrar al usuario', () => {
    const { almacen, admin } = conAdmin();
    const ana = almacen.crearUsuario('Ana', 'secreto-largo', 'usuario', SEMILLA_BASE);
    const deAdmin = almacen.crearTokenApi(admin.id, 'a');
    const deAna = almacen.crearTokenApi(ana.id, 'b');
    expect(almacen.listarTokensApi(ana.id).map((t) => t.id)).toEqual([deAna.id]);
    expect(() => almacen.borrarTokenApi(ana.id, deAdmin.id)).toThrow('No existe');
    expect(() => almacen.crearTokenApi(ana.id, '')).toThrow();

    almacen.cambiarClave(admin.id, 'otra-clave-larga');
    expect(almacen.usuarioDeTokenApi(deAdmin.token)).toBeNull();
    almacen.borrarUsuario(ana.id);
    expect(almacen.usuarioDeTokenApi(deAna.token)).toBeNull();
  });
});
