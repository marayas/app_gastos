import type { Datos } from './tipos.ts';

/**
 * Punto de partida de toda cuenta nueva: solo las categorías (sin ellas no se puede capturar nada).
 * Este archivo va dentro de la imagen Docker: no pongas aquí datos personales.
 */
export const SEMILLA_BASE: Datos = {
  categorias: [
    { id: 'educacion', nombre: 'Educación y clases', tipo: 'gasto', color: 'c1', orden: 1 },
    { id: 'auto', nombre: 'Auto', tipo: 'gasto', color: 'c2', orden: 2 },
    { id: 'terreno', nombre: 'Terreno', tipo: 'gasto', color: 'c3', orden: 3 },
    { id: 'casa', nombre: 'Casa y servicios', tipo: 'gasto', color: 'c4', orden: 4 },
    { id: 'comida', nombre: 'Comida', tipo: 'gasto', color: 'c5', orden: 5 },
    { id: 'salud', nombre: 'Salud', tipo: 'gasto', color: 'c7', orden: 6 },
    { id: 'personal', nombre: 'Personal y estilo de vida', tipo: 'gasto', color: 'c8', orden: 7 },
    { id: 'suscripciones', nombre: 'Suscripciones', tipo: 'gasto', color: 'c9', orden: 8 },
    { id: 'ahorro', nombre: 'Ahorro', tipo: 'gasto', color: 'c10', orden: 9 },
    { id: 'sueldo', nombre: 'Sueldo', tipo: 'ingreso', color: 'c10', orden: 101 },
    { id: 'bono', nombre: 'Bono', tipo: 'ingreso', color: 'c4', orden: 102 },
    { id: 'aguinaldo', nombre: 'Aguinaldo', tipo: 'ingreso', color: 'c3', orden: 103 },
    { id: 'renta', nombre: 'Rentas', tipo: 'ingreso', color: 'c6', orden: 104 },
    { id: 'otros-ingresos', nombre: 'Otros ingresos', tipo: 'ingreso', color: 'c5', orden: 105 },
  ],
  ingresos: [],
  gastos: [],
  msi: [],
  pagos: [],
  ciclos: [],
  sinClases: [],
};
