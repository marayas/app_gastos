import { SEMILLA_BASE } from '../src/shared/semilla.ts';
import type { Datos } from '../src/shared/tipos.ts';

const dia = (fecha: string, motivo: string) => ({ id: `sc-${fecha}`, desde: fecha, hasta: fecha, motivo });

const CTE = ['2026-09-25', '2026-10-30', '2026-11-27', '2027-01-29', '2027-02-26', '2027-03-26', '2027-04-30', '2027-05-28', '2027-06-25'];

/**
 * Familia ficticia para las pruebas, con montos redondos para poder verificar a mano.
 * El calendario es el oficial de la SEP 2026-2027 (información pública).
 *
 * Gastos fijos sin after school: 15,000 + 6,000 + 600 + 1,000 + 500 + 2,000 + 199.50 + 10,000 = 35,299.50
 */
export const EJEMPLO: Datos = {
  categorias: SEMILLA_BASE.categorias,
  ingresos: [
    { id: 'sueldo-a', nombre: 'Sueldo A', categoria: 'sueldo', monto: 40000 },
    { id: 'sueldo-b', nombre: 'Sueldo B', categoria: 'sueldo', monto: 30000 },
    { id: 'renta-depto', nombre: 'Renta de departamento', categoria: 'renta', monto: 5000, hasta: '2027-04' },
  ],
  gastos: [
    { id: 'hipoteca', nombre: 'Hipoteca', categoria: 'casa', monto: 15000, frecuencia: 'mes' },
    { id: 'carro', nombre: 'Pago del carro', categoria: 'auto', monto: 6000, frecuencia: 'mes' },
    { id: 'luz', nombre: 'Luz', categoria: 'casa', monto: 1200, frecuencia: 'bimestre' },
    { id: 'seguro', nombre: 'Seguro del auto', categoria: 'auto', monto: 12000, frecuencia: 'anio', nota: 'Se paga en enero' },
    { id: 'medicinas', nombre: 'Medicinas', categoria: 'salud', monto: 500, frecuencia: 'mes' },
    { id: 'cafe', nombre: 'Café', categoria: 'personal', monto: 2000, frecuencia: 'mes', recortable: true },
    { id: 'streaming', nombre: 'Streaming', categoria: 'suscripciones', monto: 199.5, frecuencia: 'mes' },
    { id: 'ahorro', nombre: 'Ahorro mensual', categoria: 'ahorro', monto: 10000, frecuencia: 'mes' },
    {
      id: 'after-school', nombre: 'After school', categoria: 'educacion', monto: 80, frecuencia: 'mes',
      nota: '$80 por día, lunes a miércoles',
      porDia: { tarifa: 80, diasSemana: [1, 2, 3] },
    },
  ],
  msi: [
    { id: 'msi-a', nombre: 'Audífonos', pagoMensual: 1500, plazoTotal: 1, inicio: '2026-10' },
    { id: 'msi-b', nombre: 'Lavadora', pagoMensual: 2000.5, plazoTotal: 2, inicio: '2026-10' },
    { id: 'msi-c', nombre: 'Laptop', pagoMensual: 1000, plazoTotal: 8, inicio: '2026-10' },
  ],
  pagos: [],
  ciclos: [{ id: 'sep-2026-2027', nombre: 'SEP 2026-2027', inicio: '2026-08-31', fin: '2027-07-09' }],
  sinClases: [
    dia('2026-09-16', 'Día de la Independencia'),
    dia('2026-11-02', 'Día de Muertos'),
    dia('2026-11-16', 'Revolución Mexicana'),
    { id: 'sc-invierno', desde: '2026-12-21', hasta: '2027-01-05', motivo: 'Vacaciones de invierno' },
    dia('2027-01-06', 'Sin clases (regreso el 7 de enero)'),
    dia('2027-02-01', 'Día de la Constitución'),
    dia('2027-03-15', 'Natalicio de Benito Juárez'),
    { id: 'sc-semana-santa', desde: '2027-03-22', hasta: '2027-04-02', motivo: 'Vacaciones de Semana Santa' },
    dia('2027-05-05', 'Batalla de Puebla'),
    ...CTE.map((f) => dia(f, 'Consejo Técnico Escolar')),
  ],
};
