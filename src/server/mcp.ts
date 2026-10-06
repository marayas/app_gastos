import type { Datos, Mes } from '../shared/tipos.ts';
import { informeGastos, informeIngresos, informeLiquidez, informeMsi, informePagos, informeResumen } from './informes.ts';

/**
 * Servidor MCP mínimo (Model Context Protocol) sobre HTTP, sin estado: cada POST trae un mensaje
 * JSON-RPC y recibe su respuesta en JSON. Solo expone herramientas de lectura sobre los datos del
 * usuario dueño del token.
 */

const VERSIONES = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const MES = {
  type: 'string',
  pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  description: 'Mes en formato AAAA-MM. Si se omite, se usa el mes actual.',
};

interface Contexto {
  datos(): Datos;
  mesActual: Mes;
}

interface Herramienta {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; additionalProperties: false };
  ejecutar(args: Record<string, unknown>, ctx: Contexto): unknown;
}

function mesDe(args: Record<string, unknown>, ctx: Contexto): Mes {
  if (args.mes === undefined) return ctx.mesActual;
  if (typeof args.mes !== 'string' || !RE_MES.test(args.mes)) throw new Error('El argumento "mes" debe tener el formato AAAA-MM.');
  return args.mes;
}

const HERRAMIENTAS: Herramienta[] = [
  {
    name: 'resumen',
    title: 'Resumen de ingresos y egresos',
    description:
      'Ingresos, egresos y sobrante del hogar, con el desglose por categoría y, si lo comparten varias personas, lo que le toca aportar y le queda a cada una. Incluye la regla 50/20/30 (qué parte del ingreso fijo se va a básicos, lujos y ahorro) y el nivel de endeudamiento contra su tope de 30 %, con el margen para otra mensualidad. Úsala para preguntas como "¿cuánto me sobra este mes?", "¿en qué se va mi dinero?" o "¿puedo meter otra compra a meses?". Montos en pesos mexicanos (MXN).',
    inputSchema: {
      type: 'object',
      properties: {
        mes: MES,
        periodo: { type: 'string', enum: ['mes', 'anio'], description: '"mes" (por defecto) o "anio" para los 12 meses a partir del mes indicado.' },
      },
      additionalProperties: false,
    },
    ejecutar(args, ctx) {
      if (args.periodo !== undefined && args.periodo !== 'mes' && args.periodo !== 'anio') throw new Error('El argumento "periodo" debe ser "mes" o "anio".');
      return informeResumen(ctx.datos(), mesDe(args, ctx), args.periodo === 'anio' ? 'anio' : 'mes');
    },
  },
  {
    name: 'liquidez_proyectada',
    title: 'Liquidez proyectada por mes',
    description:
      'Liquidez mes a mes (ingresos − gastos fijos − meses sin intereses) desde el mes indicado hasta que terminan los MSI, con el mes más ajustado. Úsala para saber si alcanza el dinero en los próximos meses.',
    inputSchema: { type: 'object', properties: { mes: MES }, additionalProperties: false },
    ejecutar: (args, ctx) => informeLiquidez(ctx.datos(), mesDe(args, ctx)),
  },
  {
    name: 'ingresos',
    title: 'Lista de ingresos',
    description: 'Todos los ingresos registrados, con su categoría, monto mensual y vigencia, y las inversiones con lo invertido, su tasa anual y el rendimiento estimado al mes.',
    inputSchema: { type: 'object', properties: { mes: MES }, additionalProperties: false },
    ejecutar: (args, ctx) => informeIngresos(ctx.datos(), mesDe(args, ctx)),
  },
  {
    name: 'gastos',
    title: 'Lista de gastos',
    description:
      'Gastos y ahorros registrados, ordenados por lo que cuestan en el mes. Se puede filtrar por nombre de categoría (por ejemplo "Suscripciones"). Incluye el tipo de cada uno (básico, lujo, ahorro o deuda), cuáles se pagan solo en ciertos meses (soloEnMeses; fuera de ellos cuestan 0), cuáles están marcados como recortables y, si el hogar tiene varios miembros, cuánto le toca pagar a cada uno.',
    inputSchema: {
      type: 'object',
      properties: { mes: MES, categoria: { type: 'string', description: 'Nombre exacto de la categoría para filtrar. Opcional.' } },
      additionalProperties: false,
    },
    ejecutar(args, ctx) {
      if (args.categoria !== undefined && typeof args.categoria !== 'string') throw new Error('El argumento "categoria" debe ser texto.');
      return informeGastos(ctx.datos(), mesDe(args, ctx), args.categoria);
    },
  },
  {
    name: 'meses_sin_intereses',
    title: 'Compras a meses sin intereses',
    description: 'Compras a MSI con pago mensual, pagos restantes, lo que falta por pagar y el mes en que termina cada una.',
    inputSchema: { type: 'object', properties: { mes: MES }, additionalProperties: false },
    ejecutar: (args, ctx) => informeMsi(ctx.datos(), mesDe(args, ctx)),
  },
  {
    name: 'pagos_del_mes',
    title: 'Pagos del mes',
    description: 'Todo lo que hay que pagar en el mes, marcando qué ya está pagado y cuánto queda pendiente.',
    inputSchema: { type: 'object', properties: { mes: MES }, additionalProperties: false },
    ejecutar: (args, ctx) => informePagos(ctx.datos(), mesDe(args, ctx)),
  },
];

interface Mensaje {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

const error = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Responde un mensaje JSON-RPC de MCP. Devuelve null para las notificaciones, que no llevan respuesta. */
export function responderMcp(mensaje: unknown, ctx: Contexto): object | null {
  const m = mensaje as Mensaje | null;
  if (typeof m !== 'object' || m === null || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    return error((m as Mensaje | null)?.id, -32600, 'Mensaje JSON-RPC inválido');
  }
  if (m.id === undefined) return null;
  const params = (typeof m.params === 'object' && m.params !== null ? m.params : {}) as Record<string, unknown>;
  const resultado = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });

  switch (m.method) {
    case 'initialize':
      return resultado({
        protocolVersion: VERSIONES.includes(params.protocolVersion as string) ? params.protocolVersion : VERSIONES[1],
        capabilities: { tools: {} },
        serverInfo: { name: 'finanzas-familiares', title: 'Finanzas familiares', version: '1.0.0' },
        instructions:
          'Datos de presupuesto familiar de un solo usuario, en pesos mexicanos (MXN). Solo lectura. ' +
          'Los montos ya vienen calculados: no hace falta recalcular liquidez ni pagos restantes.',
      });
    case 'ping':
      return resultado({});
    case 'tools/list':
      return resultado({
        tools: HERRAMIENTAS.map(({ name, title, description, inputSchema }) => ({
          name, title, description, inputSchema,
          annotations: { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const herramienta = HERRAMIENTAS.find((h) => h.name === params.name);
      if (!herramienta) return error(m.id, -32602, `Herramienta desconocida: ${String(params.name)}`);
      const args = (typeof params.arguments === 'object' && params.arguments !== null ? params.arguments : {}) as Record<string, unknown>;
      try {
        const datos = herramienta.ejecutar(args, ctx);
        return resultado({ content: [{ type: 'text', text: JSON.stringify(datos, null, 2) }], structuredContent: datos, isError: false });
      } catch (e) {
        // Un argumento inválido es un error de la herramienta, no del protocolo: así el modelo puede corregirlo.
        return resultado({ content: [{ type: 'text', text: e instanceof Error ? e.message : 'Error' }], isError: true });
      }
    }
    default:
      return error(m.id, -32601, `Método no soportado: ${m.method}`);
  }
}
