import {
  FACTOR,
  finMSI,
  gastoDelMes,
  ingresoVigente,
  msiActiva,
  msiDelMes,
  msiRestanteTotal,
  pagosRestantes,
  proyeccion,
  repartir,
  resumen,
  resumenPorPersona,
  sumarMeses,
  ultimoMesMSI,
} from '../shared/calc.ts';
import type { Datos, Mes } from '../shared/tipos.ts';

/**
 * Informes ya calculados para consumo externo (API con token y herramientas MCP).
 * Usan los mismos cálculos que la interfaz, para que un asistente no tenga que rehacer las cuentas.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const MSI = 'Meses sin intereses';

function nombresDeCategoria(d: Datos) {
  const nombres = new Map(d.categorias.map((c) => [c.id, c.nombre]));
  return (id: string | undefined) => (id ? (nombres.get(id) ?? id) : 'Sin categoría');
}

/** Montos por miembro del hogar; null si el hogar es de una sola persona. */
function porPersona(d: Datos, partes: number[]) {
  const miembros = d.miembros ?? [];
  return miembros.length > 1 ? miembros.map((m, i) => ({ persona: m.nombre, monto: r2(partes[i]) })) : null;
}

const porTotal = (a: { total: number }, b: { total: number }) => b.total - a.total;

export function informeResumen(d: Datos, mes: Mes, periodo: 'mes' | 'anio') {
  const r = resumen(d, mes, periodo);
  const nombre = nombresDeCategoria(d);
  return {
    moneda: 'MXN',
    periodo: periodo === 'mes' ? `mes ${mes}` : `12 meses a partir de ${mes}`,
    ingresos: r2(r.ingresos),
    egresos: r2(r.egresos),
    sobrante: r2(r.sobrante),
    porcentajeDelIngresoUsado: r.ingresos ? Math.round((r.egresos / r.ingresos) * 100) : null,
    ingresosPorCategoria: Object.entries(r.ingresosPorCategoria)
      .map(([id, total]) => ({ categoria: nombre(id || undefined), total: r2(total) }))
      .sort(porTotal),
    egresosPorCategoria: [
      ...Object.entries(r.porCategoria).map(([id, total]) => ({ categoria: nombre(id), total: r2(total) })),
      { categoria: MSI, total: r2(r.msi) },
    ]
      .filter((c) => c.total > 0)
      .sort(porTotal),
    // Hogar de varias personas: lo que gana, lo que le toca aportar y lo que le queda a cada una.
    porPersona:
      (d.miembros ?? []).length > 1
        ? resumenPorPersona(d, mes, periodo).map((p) => ({
            persona: p.persona.nombre, ingresos: r2(p.ingresos), leTocaAportar: r2(p.egresos), leQueda: r2(p.sobrante),
          }))
        : null,
    nota: periodo === 'anio' ? 'En la vista de 12 meses, MSI es lo que falta pagar en total.' : undefined,
  };
}

export function informeLiquidez(d: Datos, mes: Mes) {
  const filas = proyeccion(d, mes);
  const peor = filas.reduce((a, b) => (b.liquidez < a.liquidez ? b : a));
  const ultimo = ultimoMesMSI(d, mes);
  return {
    moneda: 'MXN',
    formula: 'liquidez = ingresos − gastos fijos (incluye ahorros y apartados) − pagos de MSI',
    meses: filas.map((f) => ({
      mes: f.mes, ingresos: r2(f.ingreso), gastosFijos: r2(f.fijos), msi: r2(f.msi), liquidez: r2(f.liquidez),
    })),
    todosLosMesesAlcanzan: filas.every((f) => f.liquidez >= 0),
    mesMasAjustado: { mes: peor.mes, liquidez: r2(peor.liquidez) },
    ultimoPagoDeMSI: ultimo,
    primerMesSinMSI: ultimo ? sumarMeses(ultimo, 1) : mes,
  };
}

export function informeIngresos(d: Datos, mes: Mes) {
  const nombre = nombresDeCategoria(d);
  return {
    moneda: 'MXN',
    mes,
    ingresos: d.ingresos.map((x) => ({
      concepto: x.nombre,
      categoria: nombre(x.categoria),
      montoMensual: r2(x.monto),
      desde: x.desde ?? null,
      hasta: x.hasta ?? null,
      vigenteEsteMes: ingresoVigente(x, mes),
    })),
  };
}

export function informeGastos(d: Datos, mes: Mes, categoria?: string) {
  const nombre = nombresDeCategoria(d);
  const filtro = categoria?.trim().toLowerCase();
  const gastos = d.gastos
    .map((g) => ({
      concepto: g.nombre,
      categoria: nombre(g.categoria),
      monto: r2(g.porDia ? g.porDia.tarifa : g.monto),
      frecuencia: g.porDia ? 'por día de clases' : g.frecuencia === 'anio' ? 'año' : g.frecuencia,
      costoEsteMes: r2(gastoDelMes(d, g, mes)),
      equivalenteMensual: g.porDia ? null : r2(gastoDelMes(d, g, mes)),
      // Compartido con gente de fuera del hogar: `monto` es el total y los costos ya son solo la parte del hogar.
      compartido: g.split
        ? { personas: g.split.personas, parteDelHogar: g.split.tipo === 'iguales' ? 'partes iguales' : g.split.tipo === 'pct' ? `${g.split.valor}%` : r2(g.split.valor ?? 0) }
        : null,
      repartoEsteMes: porPersona(d, repartir(g.reparto, gastoDelMes(d, g, mes), d.miembros ?? [], FACTOR[g.frecuencia])),
      recortable: g.recortable === true,
      nota: g.nota ?? null,
    }))
    .filter((g) => !filtro || g.categoria.toLowerCase() === filtro)
    .sort((a, b) => b.costoEsteMes - a.costoEsteMes);
  return { moneda: 'MXN', mes, totalEsteMes: r2(gastos.reduce((s, g) => s + g.costoEsteMes, 0)), gastos };
}

export function informeMsi(d: Datos, mes: Mes) {
  return {
    moneda: 'MXN',
    mes,
    pagoDeEsteMes: r2(msiDelMes(d, mes)),
    faltaPorPagarEnTotal: r2(msiRestanteTotal(d, mes)),
    compras: d.msi.map((c) => {
      const restantes = pagosRestantes(c, mes);
      return {
        compra: c.nombre,
        pagoMensual: r2(c.pagoMensual),
        plazoTotal: c.plazoTotal,
        totalDeLaCompra: r2(c.pagoMensual * c.plazoTotal),
        pagosRestantes: restantes,
        faltaPorPagar: r2(c.pagoMensual * restantes),
        primerPago: c.inicio,
        ultimoPago: finMSI(c),
        estado: restantes === 0 ? 'terminada' : c.inicio > mes ? 'aún no empieza' : 'activa',
      };
    }),
  };
}

export function informePagos(d: Datos, mes: Mes) {
  const nombre = nombresDeCategoria(d);
  const pagado = new Set(d.pagos.filter((p) => p.mes === mes).map((p) => p.itemId));
  const pagos = [
    ...d.gastos.map((g) => ({
      concepto: g.nombre, tipo: 'gasto', categoria: nombre(g.categoria), monto: r2(gastoDelMes(d, g, mes)), pagado: pagado.has(g.id),
    })),
    ...d.msi.filter((c) => msiActiva(c, mes)).map((c) => ({
      concepto: c.nombre, tipo: 'msi', categoria: MSI, monto: r2(c.pagoMensual), pagado: pagado.has(c.id),
    })),
  ].sort((a, b) => b.monto - a.monto);
  const total = pagos.reduce((s, p) => s + p.monto, 0);
  const hecho = pagos.reduce((s, p) => s + (p.pagado ? p.monto : 0), 0);
  return { moneda: 'MXN', mes, totalPorPagar: r2(total), pagado: r2(hecho), pendiente: r2(total - hecho), pagos };
}
