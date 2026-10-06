import { describe, expect, it } from 'vitest';
import {
  diasConClases,
  difMeses,
  gastoDelMes,
  gastoTerminado,
  ingresoDelMes,
  msiDelMes,
  msiRestanteTotal,
  pagosRestantes,
  proyeccion,
  regla,
  rendimientoMensual,
  resumen,
  saldoInversion,
  totalInversiones,
  sumarMeses,
  tasaEfectivaAnual,
  ultimoMesMSI,
  repartir,
  resumenPorPersona,
} from '../src/shared/calc.ts';
import { EJEMPLO } from './datos-ejemplo.ts';

const d = EJEMPLO;
const FIJOS = 35299.5; // gastos fijos al mes sin after school (ver datos-ejemplo.ts)

describe('meses', () => {
  it('suma y resta cruzando años', () => {
    expect(sumarMeses('2026-10', 3)).toBe('2027-01');
    expect(sumarMeses('2027-01', -1)).toBe('2026-12');
    expect(difMeses('2026-10', '2027-05')).toBe(7);
  });
});

describe('cobro por día y calendario SEP 2026-2027', () => {
  const esperado: [string, number][] = [
    ['2026-10', 12], ['2026-11', 11], ['2026-12', 8], ['2027-01', 9], ['2027-02', 11],
    ['2027-03', 8], ['2027-04', 12], ['2027-05', 12], ['2027-06', 14], ['2027-07', 3],
  ];
  it.each(esperado)('%s tiene %i días de lunes a miércoles con clases', (mes, dias) => {
    expect(diasConClases(d, [1, 2, 3], mes)).toBe(dias);
  });
  it('suma 100 días y $8,000 de octubre a julio; $0 fuera del ciclo', () => {
    const as = d.gastos.find((x) => x.porDia)!;
    const total = esperado.reduce((s, [mes]) => s + gastoDelMes(d, as, mes), 0);
    expect(total).toBe(8000);
    expect(gastoDelMes(d, as, '2027-08')).toBe(0);
  });
});

describe('gastos compartidos (split)', () => {
  const base = { id: 'x', nombre: 'Renta', categoria: 'casa', monto: 12000, frecuencia: 'mes' as const };
  it('solo cuenta la parte del usuario', () => {
    expect(gastoDelMes(d, { ...base, split: { personas: 3, tipo: 'iguales' } }, '2026-10')).toBe(4000);
    expect(gastoDelMes(d, { ...base, split: { personas: 2, tipo: 'pct', valor: 60 } }, '2026-10')).toBe(7200);
    expect(gastoDelMes(d, { ...base, split: { personas: 2, tipo: 'monto', valor: 5000 } }, '2026-10')).toBe(5000);
  });
  it('respeta la frecuencia y nunca pasa del total', () => {
    expect(gastoDelMes(d, { ...base, frecuencia: 'anio', split: { personas: 2, tipo: 'monto', valor: 6000 } }, '2026-10')).toBe(500);
    expect(gastoDelMes(d, { ...base, split: { personas: 2, tipo: 'monto', valor: 99999 } }, '2026-10')).toBe(12000);
  });
});

describe('gastos de ciertos meses', () => {
  const unico = { id: 'u', nombre: 'Plomero', categoria: 'casa', monto: 3000, frecuencia: 'mes' as const, meses: ['2026-10'] };
  const con = { ...d, gastos: [...d.gastos, unico] };
  it('cuenta completo en su mes y nada en los demás', () => {
    expect(gastoDelMes(d, unico, '2026-10')).toBe(3000);
    expect(gastoDelMes(d, unico, '2026-09')).toBe(0);
    expect(gastoDelMes(d, unico, '2026-11')).toBe(0);
  });
  it('baja el sobrante solo de ese mes y entra una vez en la vista anual', () => {
    expect(resumen(con, '2026-10', 'mes').sobrante).toBeCloseTo(resumen(d, '2026-10', 'mes').sobrante - 3000, 2);
    expect(resumen(con, '2026-11', 'mes').sobrante).toBeCloseTo(resumen(d, '2026-11', 'mes').sobrante, 2);
    expect(resumen(con, '2026-10', 'anio').egresos).toBeCloseTo(resumen(d, '2026-10', 'anio').egresos + 3000, 2);
  });
  it('con varios meses cuenta completo en cada uno, aunque no sean seguidos', () => {
    const varios = { ...unico, meses: ['2026-10', '2026-12', '2027-03'] };
    expect(['2026-10', '2026-11', '2026-12', '2027-03', '2027-04'].map((m) => gastoDelMes(d, varios, m))).toEqual([3000, 0, 3000, 3000, 0]);
    expect(resumen({ ...d, gastos: [...d.gastos, varios] }, '2026-10', 'anio').egresos).toBeCloseTo(resumen(d, '2026-10', 'anio').egresos + 9000, 2);
    expect([gastoTerminado(varios, '2027-03'), gastoTerminado(varios, '2027-04'), gastoTerminado(d.gastos[0], '2030-01')]).toEqual([false, true, false]);
  });
  it('una cantidad fija del reparto se cobra una sola vez, no cada mes del año', () => {
    const miembros = [{ id: 'm', nombre: 'Marco' }, { id: 'a', nombre: 'Ana' }];
    const hogar = { ...d, miembros, gastos: [{ ...unico, reparto: { tipo: 'monto', de: 'a', valor: 1000 } as const }] };
    expect(resumenPorPersona(hogar, '2026-10', 'anio').map((p) => p.egresos - resumenPorPersona({ ...hogar, gastos: [] }, '2026-10', 'anio').find((q) => q.persona.id === p.persona.id)!.egresos)).toEqual([2000, 1000]);
  });
});

describe('inversiones', () => {
  const base = { id: 'i', nombre: 'Cetes', monto: 100000, tasa: 12 };
  it('rinde más al año entre más seguido se calcula el interés', () => {
    expect(tasaEfectivaAnual({ ...base, capitalizacion: 'anual' })).toBeCloseTo(0.12, 6);
    expect(tasaEfectivaAnual({ ...base, capitalizacion: 'mensual' })).toBeCloseTo(0.126825, 6);
    expect(tasaEfectivaAnual({ ...base, capitalizacion: 'diaria' })).toBeCloseTo(0.127475, 5);
  });
  it('el rendimiento mensual, compuesto doce veces, da la tasa efectiva anual', () => {
    expect(rendimientoMensual({ ...base, capitalizacion: 'mensual' })).toBeCloseTo(1000, 6); // 1 % al mes
    const anual = rendimientoMensual({ ...base, capitalizacion: 'anual' });
    expect(100000 * ((1 + anual / 100000) ** 12 - 1)).toBeCloseTo(12000, 4);
  });
  it('si se reinvierte, el saldo crece solo desde el mes en que se capturó', () => {
    const x = { ...base, capitalizacion: 'anual' as const, desde: '2026-10' };
    expect(saldoInversion(x, '2026-10')).toBe(100000);
    expect(saldoInversion(x, '2027-10')).toBeCloseTo(112000, 4);
    expect(saldoInversion(x, '2028-10')).toBeCloseTo(125440, 4);
    expect(saldoInversion(x, '2026-08')).toBe(100000); // antes de capturarlo no se adivina
    expect(rendimientoMensual(x, '2027-10')).toBeCloseTo(rendimientoMensual(x) * 1.12, 6);
    expect(saldoInversion({ ...x, comoIngreso: true }, '2028-10')).toBe(100000); // si se retira, no crece
  });
  it('separa el total compartido del personal', () => {
    const inversiones = [
      { ...base, capitalizacion: 'anual' as const, desde: '2026-10' },
      { ...base, id: 'p', monto: 40000, capitalizacion: 'anual' as const, desde: '2026-10', privadaDe: 'm' },
    ];
    expect(totalInversiones({ ...d, inversiones }, '2026-10')).toEqual({ compartido: 100000, personal: 40000 });
    const enUnAnio = totalInversiones({ ...d, inversiones }, '2027-10');
    expect([enUnAnio.compartido, enUnAnio.personal]).toEqual([expect.closeTo(112000, 4), expect.closeTo(44800, 4)]);
  });
  it('solo suma a los ingresos si así se marcó, y entra al ingreso fijo', () => {
    const con = (comoIngreso: boolean) => ({ ...d, inversiones: [{ ...base, capitalizacion: 'mensual' as const, comoIngreso }] });
    expect(resumen(con(false), '2026-10', 'mes').ingresos).toBe(75000);
    expect(resumen(con(true), '2026-10', 'mes').ingresos).toBeCloseTo(76000, 6);
    expect(resumen(con(true), '2026-10', 'mes').ingresosPorCategoria.inversiones).toBeCloseTo(1000, 6);
    expect(regla(con(true), '2026-10', 'mes').ingresoFijo).toBeCloseTo(76000, 6);
  });
  it('una privada es ingreso solo de su dueño', () => {
    const miembros = [{ id: 'm', nombre: 'Marco' }, { id: 'a', nombre: 'Ana' }];
    const hogar = { ...d, miembros, inversiones: [{ ...base, capitalizacion: 'mensual' as const, comoIngreso: true, privadaDe: 'a' }] };
    const sin = resumenPorPersona({ ...hogar, inversiones: [] }, '2026-10', 'mes');
    const con = resumenPorPersona(hogar, '2026-10', 'mes');
    expect([con[0].ingresos - sin[0].ingresos, con[1].ingresos - sin[1].ingresos]).toEqual([0, 1000].map((v) => expect.closeTo(v, 6)));
  });
});

describe('frecuencia trimestral', () => {
  it('cuenta un tercio cada mes', () => {
    expect(gastoDelMes(d, { id: 't', nombre: 'Agua', categoria: 'casa', monto: 900, frecuencia: 'trimestre' }, '2026-10')).toBe(300);
  });
});

describe('regla 50/20/30 y endeudamiento', () => {
  it('el gasto toma la clase de su categoría, y las deudas van aparte', () => {
    const r = regla(d, '2026-10', 'mes');
    expect(r.ingresoFijo).toBe(75000);
    expect(r.lujo).toBeCloseTo(2000 + 199.5, 2); // café (personal) y streaming (suscripciones)
    expect(r.ahorro).toBe(10000);
    expect(r.basico + r.lujo + r.ahorro).toBeCloseTo(FIJOS + 960, 2); // todos los gastos del mes
    expect(r.deuda).toBe(4500.5); // solo MSI
    expect(r.margenDeuda).toBeCloseTo(75000 * 0.3 - 4500.5, 2);
  });
  it('cambiar la clase de la categoría mueve sus gastos, salvo los que tienen la suya', () => {
    const categorias = d.categorias.map((c) => (c.id === 'auto' ? { ...c, clase: 'deuda' as const } : c));
    const gastos = d.gastos.map((g) => (g.id === 'seguro' ? { ...g, clase: 'basico' as const } : g));
    expect(regla({ ...d, categorias, gastos }, '2026-10', 'mes').deuda).toBe(4500.5 + 6000); // el carro sí, el seguro no
    expect(regla({ ...d, categorias: d.categorias.map(({ clase: _c, ...c }) => c) }, '2026-10', 'mes').lujo).toBe(0); // sin clase = básico
  });
  it('la clase puesta a mano manda, y una deuda sale de los básicos', () => {
    const con = { ...d, gastos: d.gastos.map((g) => (g.id === 'carro' ? { ...g, clase: 'deuda' as const } : g.id === 'cafe' ? { ...g, clase: 'basico' as const } : g)) };
    const a = regla(d, '2026-10', 'mes');
    const b = regla(con, '2026-10', 'mes');
    expect(b.deuda).toBe(4500.5 + 6000);
    expect(b.basico).toBeCloseTo(a.basico - 6000 + 2000, 2);
    expect(b.lujo).toBeCloseTo(199.5, 2);
  });
  it('el ingreso fijo no cuenta los ingresos de una sola vez', () => {
    const con = { ...d, ingresos: [...d.ingresos, { id: 'ag', nombre: 'Aguinaldo', monto: 30000, desde: '2026-12', hasta: '2026-12' }] };
    expect(regla(con, '2026-12', 'mes').ingresoFijo).toBe(regla(d, '2026-12', 'mes').ingresoFijo);
    expect(resumen(con, '2026-12', 'mes').ingresos).toBe(resumen(d, '2026-12', 'mes').ingresos + 30000);
  });
});

describe('reparto entre los miembros del hogar', () => {
  const marco = { id: 'm', nombre: 'Marco' };
  const ana = { id: 'a', nombre: 'Ana' };
  const dos = [marco, ana];
  it('sin reparto va en partes iguales; con reparto, el resto es de los demás', () => {
    expect(repartir(undefined, 1000, dos)).toEqual([500, 500]);
    expect(repartir({ tipo: 'solo', de: 'a' }, 1000, dos)).toEqual([0, 1000]);
    expect(repartir({ tipo: 'pct', de: 'm', valor: 70 }, 1000, dos)).toEqual([700, 300]);
    expect(repartir({ tipo: 'monto', de: 'a', valor: 250 }, 1000, dos)).toEqual([750, 250]);
    expect(repartir({ tipo: 'monto', de: 'a', valor: 6000 }, 1000, dos, 1 / 12)).toEqual([500, 500]); // $6,000 al año = $500 al mes
    expect(repartir({ tipo: 'pct', de: 'm', valor: 40 }, 900, [...dos, { id: 'l', nombre: 'Luis' }])).toEqual([360, 270, 270]);
  });
  it('si quien tenía el reparto ya no está, o el hogar es de una persona, no cambia el total', () => {
    expect(repartir({ tipo: 'solo', de: 'otro' }, 1000, dos)).toEqual([500, 500]);
    expect(repartir({ tipo: 'solo', de: 'a' }, 1000, [marco])).toEqual([1000]);
  });
  it.each(['mes', 'anio'] as const)('por persona suma lo mismo que el resumen del hogar (%s)', (periodo) => {
    const hogar = {
      ...d,
      miembros: dos,
      ingresos: d.ingresos.map((x, i) => ({ ...x, reparto: i === 0 ? ({ tipo: 'solo', de: 'm' } as const) : i === 1 ? ({ tipo: 'solo', de: 'a' } as const) : undefined })),
      gastos: d.gastos.map((g, i) => ({ ...g, reparto: i === 0 ? ({ tipo: 'pct', de: 'm', valor: 70 } as const) : i === 3 ? ({ tipo: 'monto', de: 'a', valor: 3000 } as const) : undefined })),
      msi: d.msi.map((c, i) => ({ ...c, reparto: i === 2 ? ({ tipo: 'solo', de: 'a' } as const) : undefined })),
    };
    const r = resumen(hogar, '2026-10', periodo);
    const p = resumenPorPersona(hogar, '2026-10', periodo);
    expect(p.map((x) => x.persona.nombre)).toEqual(['Marco', 'Ana']);
    expect(p[0].ingresos + p[1].ingresos).toBeCloseTo(r.ingresos, 2);
    expect(p[0].egresos + p[1].egresos).toBeCloseTo(r.egresos, 2);
    expect(p[0].sobrante + p[1].sobrante).toBeCloseTo(r.sobrante, 2);
    if (periodo === 'mes') {
      expect(p[0].ingresos).toBe(40000 + 2500); // su sueldo y la mitad de la renta
      // Hipoteca 70/30 y seguro anual: Ana pone $3,000 al año ($250 al mes) y Marco el resto ($750).
      expect(p[0].egresos - p[1].egresos).toBeCloseTo(15000 * 0.4 + 500 - 1000, 2);
    }
  });
});

describe('resumen y liquidez', () => {
  it('octubre 2026: ingresos, egresos y sobrante', () => {
    const r = resumen(d, '2026-10', 'mes');
    expect(r.ingresos).toBe(75000);
    expect(r.egresos).toBeCloseTo(FIJOS + 960 + 4500.5, 2); // fijos + after school + MSI = 40,760
    expect(r.sobrante).toBeCloseTo(34240, 2);
    expect(r.porCategoria.casa).toBe(15000 + 600); // la luz bimestral cuenta la mitad
    expect(r.porCategoria.auto).toBe(6000 + 1000); // el seguro anual cuenta un doceavo
  });

  it('liquidez mensual: del mes actual al primer mes sin MSI, mínimo 10 meses', () => {
    const esperado = [34240, 35820, 38060.5, 37980.5, 37820.5, 38060.5, 37740.5, 32740.5, 33580.5, 34460.5];
    const filas = proyeccion(d, '2026-10');
    expect(filas.map((f) => f.mes)).toEqual([
      '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07',
    ]);
    filas.forEach((f, i) => expect(f.liquidez).toBeCloseTo(esperado[i], 2));
  });

  it('un ingreso con fecha de fin deja de sumarse después', () => {
    expect(ingresoDelMes(d, '2027-04')).toBe(75000);
    expect(ingresoDelMes(d, '2027-05')).toBe(70000);
  });

  it('vista anual: MSI restantes totales, no el pago del mes por 12', () => {
    const r = resumen(d, '2026-10', 'anio');
    expect(r.msi).toBeCloseTo(1500 + 2000.5 * 2 + 1000 * 8, 2);
    expect(r.msi).not.toBeCloseTo(msiDelMes(d, '2026-10') * 12, 0);
    expect(r.ingresos).toBe(75000 * 7 + 70000 * 5);
  });
});

describe('ingresos con vigencia', () => {
  it('un ingreso de una sola vez (aguinaldo) solo cuenta en su mes', () => {
    const conAguinaldo = { ...d, ingresos: [...d.ingresos, { id: 'ag', nombre: 'Aguinaldo', categoria: 'aguinaldo', monto: 50000, desde: '2026-12', hasta: '2026-12' }] };
    expect(ingresoDelMes(conAguinaldo, '2026-11')).toBe(75000);
    expect(ingresoDelMes(conAguinaldo, '2026-12')).toBe(125000);
    expect(ingresoDelMes(conAguinaldo, '2027-01')).toBe(75000);
    expect(resumen(conAguinaldo, '2026-10', 'anio').ingresos).toBe(75000 * 7 + 70000 * 5 + 50000);
  });
  it('desglosa los ingresos por categoría, por mes y por año', () => {
    expect(resumen(d, '2026-10', 'mes').ingresosPorCategoria).toEqual({ sueldo: 70000, renta: 5000 });
    expect(resumen(d, '2026-10', 'anio').ingresosPorCategoria).toEqual({ sueldo: 70000 * 12, renta: 5000 * 7 });
    const sinCategoria = { ...d, ingresos: [{ id: 'x', nombre: 'Extra', monto: 500 }] };
    expect(resumen(sinCategoria, '2026-10', 'mes').ingresosPorCategoria).toEqual({ '': 500 });
  });
  it('las categorías de ingreso no aparecen como egresos', () => {
    expect(Object.keys(resumen(d, '2026-10', 'mes').porCategoria)).not.toContain('sueldo');
  });
});

describe('MSI según la fecha', () => {
  it('los pagos restantes avanzan con el mes sin tocar los datos', () => {
    const dos = d.msi.find((c) => c.id === 'msi-b')!;
    expect(pagosRestantes(dos, '2026-09')).toBe(2);
    expect(pagosRestantes(dos, '2026-10')).toBe(2);
    expect(pagosRestantes(dos, '2026-11')).toBe(1);
    expect(pagosRestantes(dos, '2026-12')).toBe(0);
  });
  it('termina en mayo 2027 y diciembre solo paga la compra larga', () => {
    expect(ultimoMesMSI(d, '2026-10')).toBe('2027-05');
    expect(msiDelMes(d, '2026-12')).toBe(1000);
    expect(msiDelMes(d, '2027-06')).toBe(0);
    expect(ultimoMesMSI(d, '2027-06')).toBeNull();
    expect(msiRestanteTotal(d, '2027-05')).toBe(1000);
  });
});
