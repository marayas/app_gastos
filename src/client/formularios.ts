import { pagosRestantes, parteDeSplit, repartir, sumarMeses } from '../shared/calc.ts';
import type { Categoria, Coleccion, CompraMSI, Gasto, Ingreso, Mes, Persona, Reparto, Split, TipoCategoria } from '../shared/tipos.ts';
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
  min?: number;
  max?: number | ((v: Valores) => number | undefined);
  maxDe?: string; // el valor no puede pasar del de ese otro campo
  ayuda?: string;
  si?(v: Valores): boolean; // solo se muestra (y se valida) si se cumple
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

export const PARTES_SPLIT: [string, string][] = [
  ['iguales', 'Partes iguales'],
  ['monto', 'Una cantidad'],
  ['pct', 'Un porcentaje'],
];

/** El split que describe el formulario, o null si no está activo o aún le faltan datos. */
function splitDeForm(v: Valores): Split | null {
  const personas = Number(v.personas);
  if (!v.split || !Number.isInteger(personas) || personas < 2) return null;
  if (v.splitTipo === 'iguales') return { personas, tipo: 'iguales' };
  const tipo = v.splitTipo === 'pct' ? 'pct' : 'monto';
  const texto = v[tipo === 'pct' ? 'splitPct' : 'splitMonto'];
  return texto === '' || !(Number(texto) >= 0) ? null : { personas, tipo, valor: Number(texto) };
}

/** Quiénes comparten el hogar y quién está usando la app. */
export interface Hogar {
  miembros: Persona[];
  yo?: string;
}

const IGUALES = 'iguales';
const OTRO = 'otro';
const SOLO = 'solo:';

/** Campos para repartir un monto entre los miembros del hogar; ninguno si el hogar es de una sola persona. */
function camposReparto({ miembros }: Hogar, etiqueta: string): Campo[] {
  if (miembros.length < 2) return [];
  const otro = (v: Valores) => v.repartoTipo === OTRO;
  return [
    {
      k: 'repartoTipo', etiqueta, tipo: 'select',
      opciones: [
        [IGUALES, miembros.length === 2 ? 'Los dos (50/50)' : 'Todos, en partes iguales'],
        ...miembros.map((m): [string, string] => [SOLO + m.id, `Solo ${m.nombre}`]),
        [OTRO, 'Otro reparto'],
      ],
    },
    { k: 'repartoDe', etiqueta: 'Quién pone una parte distinta', tipo: 'select', opciones: miembros.map((m) => [m.id, m.nombre]), si: otro },
    { k: 'repartoModo', etiqueta: 'Su parte es', tipo: 'select', opciones: [['pct', 'Un porcentaje'], ['monto', 'Una cantidad']], si: otro },
    {
      k: 'repartoValor', etiqueta: 'Porcentaje o cantidad', tipo: 'numero', si: otro,
      max: (v) => (v.repartoModo === 'pct' ? 100 : undefined), ayuda: 'El resto se divide entre los demás.',
    },
  ];
}

/** Valores de esos campos para un reparto guardado; sin reparto abre en `porDefecto`. */
function repartoAForm(r: Reparto | undefined, { miembros }: Hogar, porDefecto = IGUALES) {
  const vigente = r && miembros.some((m) => m.id === r.de) ? r : undefined;
  return {
    repartoTipo: !vigente ? porDefecto : vigente.tipo === 'solo' ? SOLO + vigente.de : OTRO,
    repartoDe: vigente?.de ?? miembros[0]?.id,
    repartoModo: vigente && vigente.tipo !== 'solo' ? vigente.tipo : 'pct',
    repartoValor: vigente && vigente.tipo !== 'solo' ? vigente.valor : undefined,
  };
}

function repartoDeForm(v: Valores): Reparto | undefined {
  const tipo = v.repartoTipo;
  if (typeof tipo !== 'string' || tipo === IGUALES) return undefined;
  if (tipo.startsWith(SOLO)) return { tipo: 'solo', de: tipo.slice(SOLO.length) };
  return { tipo: v.repartoModo === 'monto' ? 'monto' : 'pct', de: v.repartoDe as string, valor: Number(v.repartoValor) };
}

/** Quita del elemento los campos del formulario de reparto y le pone el reparto que describen. */
function conReparto(item: Record<string, unknown> & { id: string }, v: Valores, origen: Record<string, unknown> | null) {
  const { repartoTipo: _tipo, repartoDe: _de, repartoModo: _modo, repartoValor: _valor, ...resto } = item;
  // Hogar de una persona: el formulario no pregunta, así que se conserva el reparto que ya tuviera.
  const reparto = 'repartoTipo' in v ? repartoDeForm(v) : origen?.reparto;
  return (reparto ? { ...resto, reparto } : resto) as Record<string, unknown> & { id: string };
}

/** "Marco $10,500 · Ana $4,500" con lo que se lleva tecleado; null si no hay a quién repartir. */
function notaReparto(v: Valores, total: number, { miembros }: Hogar): string | null {
  if (miembros.length < 2 || !('repartoTipo' in v) || !(total > 0)) return null;
  return repartir(repartoDeForm(v), total, miembros).map((parte, i) => `${miembros[i].nombre} ${fmt(parte)}`).join(' · ');
}

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
export function formulario(col: Coleccion, categorias: Categoria[], mes: Mes, origen: Record<string, unknown> | null, hogar: Hogar = { miembros: [] }): Formulario {
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
        ...camposReparto(hogar, '¿De quién es?'),
      ];
      return {
        titulo: 'ingreso',
        campos,
        nota: (v) => notaReparto(v, Number(v.monto), hogar),
        aForm(item) {
          const x = item as Ingreso | null;
          // Un ingreso nuevo abre a nombre de quien lo captura.
          const porDefecto = !x && hogar.yo ? SOLO + hogar.yo : IGUALES;
          return aForm(campos, { ...x, categoria: categoriaInicial(categorias, 'ingreso', x?.categoria), ...repartoAForm(x?.reparto, hogar, porDefecto) });
        },
        deForm: (v, id) => conReparto(deForm(campos, v, id), v, origen),
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
        ...camposReparto(hogar, '¿Quién la paga?'),
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
          const partes = notaReparto(v, pago, hogar);
          return (
            `Total de la compra: ${fmt(pago * plazo)}` +
            (restantes >= 1 && restantes <= plazo ? ` · faltan ${fmt(pago * restantes)}` : '') +
            (partes ? ` · cada mes: ${partes}` : '')
          );
        },
        aForm: (item) => aForm(campos, { ...(item && { ...item, restantes: restantesAhora }), ...repartoAForm(compra?.reparto, hogar) }),
        deForm(v, id) {
          const { restantes, ...c } = conReparto(deForm(campos, v, id), v, origen);
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
      const conSplit = (v: Valores) => v.split === true;
      const campos: Campo[] = [
        { k: 'nombre', etiqueta: 'Concepto', tipo: 'texto' },
        campoCategoria(categorias, 'gasto'),
        { k: 'monto', etiqueta: 'Monto', tipo: 'numero' },
        { k: 'frecuencia', etiqueta: 'Frecuencia', tipo: 'select', opciones: FRECUENCIAS },
        { k: 'nota', etiqueta: 'Nota', tipo: 'texto', opcional: true },
        ...camposReparto(hogar, '¿Quién lo paga?'),
        { k: 'recortable', etiqueta: 'Recortable (se puede quitar en un escenario)', tipo: 'check' },
        { k: 'split', etiqueta: 'Hacer split de este gasto (se comparte con gente de fuera del hogar)', tipo: 'check' },
        { k: 'personas', etiqueta: '¿Entre cuántas personas?', tipo: 'entero', min: 2, max: 99, ayuda: 'Contando a tu hogar como una.', si: conSplit },
        { k: 'splitTipo', etiqueta: 'Tu parte', tipo: 'select', opciones: PARTES_SPLIT, si: conSplit },
        {
          k: 'splitMonto', etiqueta: 'Cantidad que te toca', tipo: 'numero', maxDe: 'monto',
          ayuda: 'En la misma frecuencia que el monto.', si: (v) => conSplit(v) && v.splitTipo === 'monto',
        },
        { k: 'splitPct', etiqueta: 'Porcentaje que te toca (%)', tipo: 'numero', max: 100, si: (v) => conSplit(v) && v.splitTipo === 'pct' },
      ];
      // El cobro por día de clases ya no se ofrece al capturar; un gasto que lo trae lo conserva.
      const porDia = (origen as Gasto | null)?.porDia;
      return {
        titulo: 'gasto',
        campos,
        nota(v) {
          const s = splitDeForm(v);
          const monto = Number(v.monto);
          if (!(monto > 0)) return null;
          const frecuencia = porDia ? 'por día' : (FRECUENCIAS.find(([f]) => f === v.frecuencia)?.[1] ?? '');
          const parte = s ? parteDeSplit(s, monto) : monto;
          const lineas = [
            s && `${hogar.miembros.length > 1 ? 'Parte del hogar' : 'Tu parte'}: ${fmt(parte)} ${frecuencia} de ${fmt(monto)}`,
            notaReparto(v, parte, hogar),
          ].filter(Boolean);
          return lineas.length ? lineas.join(' · ') : null;
        },
        aForm(item) {
          const g = item as Gasto | null;
          return aForm(campos, {
            frecuencia: 'mes',
            ...g,
            categoria: categoriaInicial(categorias, 'gasto', g?.categoria),
            monto: g?.porDia ? g.porDia.tarifa : g?.monto,
            split: !!g?.split,
            personas: g?.split?.personas ?? 2,
            splitTipo: g?.split?.tipo ?? 'iguales',
            splitMonto: g?.split?.tipo === 'monto' ? g.split.valor : undefined,
            splitPct: g?.split?.tipo === 'pct' ? g.split.valor : undefined,
            ...repartoAForm(g?.reparto, hogar),
          });
        },
        deForm(v, id) {
          const { split: _split, personas: _personas, splitTipo: _tipo, splitMonto: _monto, splitPct: _pct, ...g } = conReparto(deForm(campos, v, id), v, origen);
          return {
            ...g,
            ...(porDia && { frecuencia: 'mes', porDia: { ...porDia, tarifa: g.monto } }),
            ...(v.split === true && { split: splitDeForm(v) }),
          };
        },
      };
    }
  }
}
