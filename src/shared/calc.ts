import type { CompraMSI, Datos, Frecuencia, Gasto, Ingreso, Mes, Persona, Reparto, Split } from './tipos.ts';

export const FACTOR: Record<Frecuencia, number> = { mes: 1, bimestre: 1 / 2, anio: 1 / 12 };

export function sumarMeses(m: Mes, n: number): Mes {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Meses que hay de `a` a `b` (positivo si `b` es posterior). */
export function difMeses(a: Mes, b: Mes): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export const rangoMeses = (desde: Mes, n: number): Mes[] =>
  Array.from({ length: n }, (_, i) => sumarMeses(desde, i));

type Calendario = Pick<Datos, 'ciclos' | 'sinClases'>;

/** Días del mes que caen en `diasSemana`, dentro de un ciclo escolar y con clases. */
export function diasConClases(cal: Calendario, diasSemana: number[], mes: Mes): number {
  const [y, mo] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= ultimo; d++) {
    if (!diasSemana.includes(new Date(Date.UTC(y, mo - 1, d)).getUTCDay())) continue;
    const fecha = `${mes}-${String(d).padStart(2, '0')}`;
    if (!cal.ciclos.some((c) => fecha >= c.inicio && fecha <= c.fin)) continue;
    if (cal.sinClases.some((p) => fecha >= p.desde && fecha <= p.hasta)) continue;
    n++;
  }
  return n;
}

/** Parte de `total` que le toca al usuario en un gasto compartido; nunca más que el total. */
export function parteDeSplit(s: Split, total: number): number {
  if (s.tipo === 'iguales') return total / Math.max(s.personas, 1);
  if (s.tipo === 'pct') return (total * Math.min(s.valor ?? 0, 100)) / 100;
  return Math.min(s.valor ?? 0, total);
}

/** Un gasto con meses elegidos solo cuenta en ellos; los demás, todos los meses. */
export const gastoVigente = (g: Gasto, mes: Mes): boolean => !g.meses?.length || g.meses.includes(mes);

/** Ya pasaron todos los meses en que se pagaba. */
export const gastoTerminado = (g: Gasto, mes: Mes): boolean => !!g.meses?.length && g.meses.every((m) => m < mes);

export function gastoDelMes(cal: Calendario, g: Gasto, mes: Mes): number {
  if (!gastoVigente(g, mes)) return 0;
  if (g.porDia) {
    const total = g.porDia.tarifa * diasConClases(cal, g.porDia.diasSemana, mes);
    return g.split ? parteDeSplit(g.split, total) : total;
  }
  return (g.split ? parteDeSplit(g.split, g.monto) : g.monto) * FACTOR[g.frecuencia];
}

export const ingresoVigente = (x: Ingreso, mes: Mes): boolean =>
  (!x.desde || mes >= x.desde) && (!x.hasta || mes <= x.hasta);

export const ingresoDelMes = (d: Datos, mes: Mes): number =>
  d.ingresos.reduce((s, x) => s + (ingresoVigente(x, mes) ? x.monto : 0), 0);

export const fijosDelMes = (d: Datos, mes: Mes): number =>
  d.gastos.reduce((s, g) => s + gastoDelMes(d, g, mes), 0);

export function pagosRestantes(c: CompraMSI, mes: Mes): number {
  const transcurridos = Math.max(0, difMeses(c.inicio, mes));
  return Math.max(0, c.plazoTotal - transcurridos);
}

export function msiActiva(c: CompraMSI, mes: Mes): boolean {
  const k = difMeses(c.inicio, mes);
  return k >= 0 && k < c.plazoTotal;
}

export const msiDelMes = (d: Datos, mes: Mes): number =>
  d.msi.reduce((s, c) => s + (msiActiva(c, mes) ? c.pagoMensual : 0), 0);

export const msiRestanteTotal = (d: Datos, mes: Mes): number =>
  d.msi.reduce((s, c) => s + c.pagoMensual * pagosRestantes(c, mes), 0);

export const finMSI = (c: CompraMSI): Mes => sumarMeses(c.inicio, c.plazoTotal - 1);

/** Mes del último pago de MSI pendiente a partir de `mes`; null si no queda ninguno. */
export function ultimoMesMSI(d: Datos, mes: Mes): Mes | null {
  let ultimo: Mes | null = null;
  for (const c of d.msi) {
    if (pagosRestantes(c, mes) === 0) continue;
    const fin = finMSI(c);
    if (!ultimo || fin > ultimo) ultimo = fin;
  }
  return ultimo;
}

export interface FilaLiquidez {
  mes: Mes;
  ingreso: number;
  fijos: number;
  msi: number;
  liquidez: number;
}

export function filaLiquidez(d: Datos, mes: Mes): FilaLiquidez {
  const ingreso = ingresoDelMes(d, mes);
  const fijos = fijosDelMes(d, mes);
  const msi = msiDelMes(d, mes);
  return { mes, ingreso, fijos, msi, liquidez: ingreso - fijos - msi };
}

/** Del mes actual al primer mes sin MSI, con un mínimo de 10 meses. */
export function proyeccion(d: Datos, mes: Mes): FilaLiquidez[] {
  const ultimo = ultimoMesMSI(d, mes);
  const hastaSinMSI = ultimo ? difMeses(mes, ultimo) + 1 : 0;
  return rangoMeses(mes, Math.max(hastaSinMSI, 9) + 1).map((m) => filaLiquidez(d, m));
}

export interface Resumen {
  ingresos: number;
  ingresosPorCategoria: Record<string, number>; // '' = ingresos sin categoría
  porCategoria: Record<string, number>;
  msi: number;
  egresos: number;
  sobrante: number;
}

/** En vista anual los MSI cuentan lo que falta pagar en total, no 12 veces el pago del mes. */
export function resumen(d: Datos, mes: Mes, periodo: 'mes' | 'anio'): Resumen {
  const meses = periodo === 'mes' ? [mes] : rangoMeses(mes, 12);
  const ingresosPorCategoria: Record<string, number> = {};
  for (const x of d.ingresos) {
    const total = x.monto * meses.filter((m) => ingresoVigente(x, m)).length;
    const cat = x.categoria ?? '';
    ingresosPorCategoria[cat] = (ingresosPorCategoria[cat] ?? 0) + total;
  }
  const ingresos = Object.values(ingresosPorCategoria).reduce((s, v) => s + v, 0);
  const porCategoria: Record<string, number> = {};
  for (const c of d.categorias) if (c.tipo !== 'ingreso') porCategoria[c.id] = 0;
  for (const g of d.gastos) {
    const total = meses.reduce((s, m) => s + gastoDelMes(d, g, m), 0);
    porCategoria[g.categoria] = (porCategoria[g.categoria] ?? 0) + total;
  }
  const msi = periodo === 'mes' ? msiDelMes(d, mes) : msiRestanteTotal(d, mes);
  const egresos = Object.values(porCategoria).reduce((s, v) => s + v, 0) + msi;
  return { ingresos, ingresosPorCategoria, porCategoria, msi, egresos, sobrante: ingresos - egresos };
}

/**
 * Reparte `total` entre los miembros del hogar, en su mismo orden. Sin reparto (o si quien lo
 * tenía ya no es miembro) va en partes iguales. `factor` lleva la cantidad fija a la unidad de `total`.
 */
export function repartir(r: Reparto | undefined, total: number, miembros: Persona[], factor = 1): number[] {
  const n = miembros.length;
  const i = r ? miembros.findIndex((m) => m.id === r.de) : -1;
  if (!r || i < 0 || n < 2) return miembros.map(() => total / n);
  const parte = r.tipo === 'solo' ? total : r.tipo === 'pct' ? (total * Math.min(r.valor, 100)) / 100 : Math.min(r.valor * factor, total);
  return miembros.map((_, j) => (j === i ? parte : (total - parte) / (n - 1)));
}

export interface ResumenPersona {
  persona: Persona;
  ingresos: number;
  egresos: number; // lo que le toca aportar
  sobrante: number;
}

/** El mismo resumen del hogar, visto por persona; sus sumas dan los totales de `resumen`. */
export function resumenPorPersona(d: Datos, mes: Mes, periodo: 'mes' | 'anio'): ResumenPersona[] {
  const miembros = d.miembros ?? [];
  const meses = periodo === 'mes' ? [mes] : rangoMeses(mes, 12);
  const ingresos = miembros.map(() => 0);
  const egresos = miembros.map(() => 0);
  const sumar = (a: number[], partes: number[]) => partes.forEach((p, i) => (a[i] += p));
  for (const x of d.ingresos) {
    const n = meses.filter((m) => ingresoVigente(x, m)).length;
    sumar(ingresos, repartir(x.reparto, x.monto * n, miembros, n));
  }
  for (const g of d.gastos) {
    const total = meses.reduce((s, m) => s + gastoDelMes(d, g, m), 0);
    sumar(egresos, repartir(g.reparto, total, miembros, FACTOR[g.frecuencia] * meses.filter((m) => gastoVigente(g, m)).length));
  }
  for (const c of d.msi) {
    const pagos = periodo === 'mes' ? (msiActiva(c, mes) ? 1 : 0) : pagosRestantes(c, mes);
    sumar(egresos, repartir(c.reparto, c.pagoMensual * pagos, miembros, pagos));
  }
  return miembros.map((persona, i) => ({ persona, ingresos: ingresos[i], egresos: egresos[i], sobrante: ingresos[i] - egresos[i] }));
}
