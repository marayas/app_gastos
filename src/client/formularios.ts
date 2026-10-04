import { pagosRestantes, sumarMeses } from '../shared/calc.ts';
import type { Categoria, Coleccion, CompraMSI, Gasto, Ingreso, Mes, TipoCategoria } from '../shared/tipos.ts';
import { fmt, nuevoId } from './ui.ts';

export type Valor = string | boolean | number[];
export type Valores = Record<string, Valor>;

/** Valor del selector de categoría cuando se va a crear una nueva; el nombre va en `<campo>Nueva`. */
export const NUEVA = '__nueva__';

export interface Campo {
  k: string;
  etiqueta: string;
  tipo: 'texto' | 'numero' | 'entero' | 'mes' | 'fecha' | 'select' | 'check' | 'dias';
  opcional?: boolean;
  opciones?: [string, string][];
  crear?: boolean; // el selector ofrece «+ Nueva categoría…»
  maxDe?: string; // el valor no puede pasar del de ese otro campo
  ayuda?: string;
  si?: string; // solo se muestra si ese otro campo (check) está activo
}

export interface Formulario {
  titulo: string;
  campos: Campo[];
  nota?(v: Valores): string | null; // resumen calculado con lo que se va tecleando
  aForm(item: Record<string, unknown> | null): Valores;
  deForm(v: Valores, id: string): Record<string, unknown> & { id: string };
}

export const FRECUENCIAS: [string, string][] = [
  ['mes', 'por mes'],
  ['bimestre', 'por bimestre'],
  ['anio', 'por año'],
];

export const COLORES: [string, string][] = [
  ['c1', 'Índigo'], ['c2', 'Rosa'], ['c3', 'Ámbar'], ['c4', 'Azul'], ['c5', 'Gris'],
  ['c6', 'Violeta'], ['c7', 'Rojo'], ['c8', 'Verde'], ['c9', 'Dorado'], ['c10', 'Verde azulado'],
];

export const deTipo = (categorias: Categoria[], tipo: TipoCategoria) => categorias.filter((c) => c.tipo === tipo);

/** Categoría nueva con el primer color que ese tipo aún no usa. */
export function nuevaCategoria(categorias: Categoria[], tipo: TipoCategoria, nombre = ''): Categoria {
  const usados = new Set(deTipo(categorias, tipo).map((c) => c.color));
  const libre = COLORES.find(([c]) => !usados.has(c)) ?? COLORES[usados.size % COLORES.length];
  return { id: nuevoId(), nombre, tipo, color: libre[0], orden: Math.max(0, ...categorias.map((c) => c.orden)) + 1 };
}

function aForm(campos: Campo[], item: Record<string, unknown>): Valores {
  const v: Valores = {};
  for (const c of campos) {
    const x = item[c.k];
    if (c.tipo === 'check') v[c.k] = x === true;
    else if (c.tipo === 'dias') v[c.k] = Array.isArray(x) ? (x as number[]) : [];
    else if (typeof x === 'number') v[c.k] = String(Math.round(x * 100) / 100);
    else v[c.k] = typeof x === 'string' ? x : '';
  }
  return v;
}

function deForm(campos: Campo[], v: Valores, id: string) {
  const item: Record<string, unknown> & { id: string } = { id };
  for (const c of campos) {
    const x = v[c.k];
    if (c.tipo === 'numero' || c.tipo === 'entero') item[c.k] = Number(x);
    else if (c.tipo === 'check' || c.tipo === 'dias') item[c.k] = x;
    else if (x !== '') item[c.k] = (x as string).trim();
  }
  return item;
}

const simple = (titulo: string, campos: Campo[], porDefecto: Record<string, unknown> = {}): Formulario => ({
  titulo,
  campos,
  aForm: (item) => aForm(campos, item ?? porDefecto),
  deForm: (v, id) => deForm(campos, v, id),
});

function campoCategoria(categorias: Categoria[], tipo: TipoCategoria): Campo {
  return { k: 'categoria', etiqueta: 'Categoría', tipo: 'select', crear: true, opciones: deTipo(categorias, tipo).map((c) => [c.id, c.nombre]) };
}

/** Categoría con la que abre el formulario: la del elemento si sigue existiendo, o la primera del tipo. */
function categoriaInicial(categorias: Categoria[], tipo: TipoCategoria, actual?: string): string {
  const lista = deTipo(categorias, tipo);
  return lista.find((c) => c.id === actual)?.id ?? lista[0]?.id ?? NUEVA;
}

/** `origen` es el elemento que se edita o, al crear, sus valores iniciales. */
export function formulario(col: Coleccion, categorias: Categoria[], mes: Mes, origen: Record<string, unknown> | null): Formulario {
  switch (col) {
    case 'ingresos': {
      const campos: Campo[] = [
        { k: 'nombre', etiqueta: 'Concepto', tipo: 'texto' },
        campoCategoria(categorias, 'ingreso'),
        { k: 'monto', etiqueta: 'Monto por mes', tipo: 'numero' },
        { k: 'desde', etiqueta: 'Primer mes con este ingreso', tipo: 'mes', opcional: true },
        {
          k: 'hasta', etiqueta: 'Último mes con este ingreso', tipo: 'mes', opcional: true,
          ayuda: 'Déjalos vacíos si llega todos los meses. Para un ingreso de una sola vez (bono, aguinaldo), pon el mismo mes en los dos.',
        },
      ];
      return {
        titulo: 'ingreso',
        campos,
        aForm: (item) => aForm(campos, { ...item, categoria: categoriaInicial(categorias, 'ingreso', (item as Ingreso | null)?.categoria) }),
        deForm: (v, id) => deForm(campos, v, id),
      };
    }
    case 'msi': {
      // Se captura lo que dice el estado de cuenta: pago mensual, plazo y pagos que faltan.
      // De ahí salen el total de la compra y el mes del primer pago, y los restantes bajan solos cada mes.
      const campos: Campo[] = [
        { k: 'nombre', etiqueta: 'Compra', tipo: 'texto' },
        { k: 'pagoMensual', etiqueta: 'Pago mensual', tipo: 'numero' },
        { k: 'plazoTotal', etiqueta: 'Plazo total (número de meses)', tipo: 'entero' },
        {
          k: 'restantes', etiqueta: 'Pagos restantes', tipo: 'entero', maxDe: 'plazoTotal',
          ayuda: 'Como aparece en tu tarjeta, contando el pago de este mes. Después baja solo, uno cada mes.',
        },
      ];
      const compra = origen as CompraMSI | null;
      const restantesAhora = compra ? pagosRestantes(compra, mes) : null;
      return {
        titulo: 'compra a MSI',
        campos,
        nota(v) {
          const pago = Number(v.pagoMensual);
          const plazo = Number(v.plazoTotal);
          if (!(pago > 0) || !(plazo >= 1)) return null;
          const restantes = Number(v.restantes);
          return `Total de la compra: ${fmt(pago * plazo)}` + (restantes >= 1 && restantes <= plazo ? ` · faltan ${fmt(pago * restantes)}` : '');
        },
        aForm: (item) => aForm(campos, item ? { ...item, restantes: restantesAhora } : {}),
        deForm(v, id) {
          const { restantes, ...c } = deForm(campos, v, id);
          // Sin cambios en plazo ni restantes se conserva el inicio (importa en compras que aún no empiezan).
          if (compra && restantes === restantesAhora && c.plazoTotal === compra.plazoTotal) return { ...c, inicio: compra.inicio };
          return { ...c, inicio: sumarMeses(mes, (restantes as number) - (c.plazoTotal as number)) };
        },
      };
    }
    case 'ciclos':
      return simple('ciclo escolar', [
        { k: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
        { k: 'inicio', etiqueta: 'Primer día de clases', tipo: 'fecha' },
        { k: 'fin', etiqueta: 'Último día de clases', tipo: 'fecha' },
      ]);
    case 'sinClases':
      return simple('día sin clases', [
        { k: 'motivo', etiqueta: 'Motivo', tipo: 'texto' },
        { k: 'desde', etiqueta: 'Desde', tipo: 'fecha' },
        { k: 'hasta', etiqueta: 'Hasta', tipo: 'fecha', ayuda: 'Para un solo día, usa la misma fecha.' },
      ]);
    case 'categorias': {
      const campos: Campo[] = [
        { k: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
        { k: 'color', etiqueta: 'Color', tipo: 'select', opciones: COLORES },
      ];
      const cat = origen as Partial<Categoria> | null;
      return {
        titulo: cat?.tipo === 'ingreso' ? 'categoría de ingreso' : 'categoría de gasto',
        campos,
        aForm: () => aForm(campos, origen ?? {}),
        // El tipo y el orden no se editan: se conservan los del origen.
        deForm: (v, id) => ({ ...deForm(campos, v, id), tipo: cat?.tipo ?? 'gasto', orden: cat?.orden ?? 0 }),
      };
    }
    case 'gastos': {
      const campos: Campo[] = [
        { k: 'nombre', etiqueta: 'Concepto', tipo: 'texto' },
        campoCategoria(categorias, 'gasto'),
        { k: 'monto', etiqueta: 'Monto', tipo: 'numero', ayuda: 'Si se cobra por día, es la tarifa de cada día.' },
        { k: 'frecuencia', etiqueta: 'Frecuencia', tipo: 'select', opciones: FRECUENCIAS },
        { k: 'nota', etiqueta: 'Nota', tipo: 'texto', opcional: true },
        { k: 'recortable', etiqueta: 'Recortable (se puede quitar en un escenario)', tipo: 'check' },
        { k: 'cobroPorDia', etiqueta: 'Se cobra por día de clases (after school)', tipo: 'check' },
        { k: 'dias', etiqueta: 'Días de asistencia', tipo: 'dias', si: 'cobroPorDia' },
      ];
      return {
        titulo: 'gasto',
        campos,
        aForm(item) {
          const g = item as Gasto | null;
          return aForm(campos, {
            frecuencia: 'mes',
            ...g,
            categoria: categoriaInicial(categorias, 'gasto', g?.categoria),
            monto: g?.porDia ? g.porDia.tarifa : g?.monto,
            cobroPorDia: !!g?.porDia,
            dias: g?.porDia?.diasSemana ?? [1, 2, 3],
          });
        },
        deForm(v, id) {
          const { cobroPorDia, dias, ...g } = deForm(campos, v, id);
          if (!cobroPorDia) return g;
          return { ...g, frecuencia: 'mes', porDia: { tarifa: g.monto, diasSemana: dias } };
        },
      };
    }
  }
}
