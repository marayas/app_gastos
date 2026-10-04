import { describe, expect, it } from 'vitest';
import {
  diasConClases,
  difMeses,
  gastoDelMes,
  ingresoDelMes,
  msiDelMes,
  msiRestanteTotal,
  pagosRestantes,
  proyeccion,
  resumen,
  sumarMeses,
  ultimoMesMSI,
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
