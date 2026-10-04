import { describe, expect, it } from 'vitest';
import { informeLiquidez, informeMsi, informePagos, informeResumen } from '../src/server/informes.ts';
import { responderMcp } from '../src/server/mcp.ts';
import { EJEMPLO } from './datos-ejemplo.ts';

const ctx = { datos: () => EJEMPLO, mesActual: '2026-10' };
const rpc = (method: string, params?: unknown, id: number | undefined = 1) =>
  responderMcp({ jsonrpc: '2.0', id, method, params }, ctx) as { result?: any; error?: any } | null;

describe('informes calculados', () => {
  it('resumen del mes con nombres de categoría', () => {
    const r = informeResumen(EJEMPLO, '2026-10', 'mes');
    expect(r).toMatchObject({ ingresos: 75000, egresos: 40760, sobrante: 34240, porcentajeDelIngresoUsado: 54 });
    expect(r.ingresosPorCategoria).toEqual([{ categoria: 'Sueldo', total: 70000 }, { categoria: 'Rentas', total: 5000 }]);
    expect(r.egresosPorCategoria[0]).toEqual({ categoria: 'Casa y servicios', total: 15600 });
    expect(r.egresosPorCategoria).toContainEqual({ categoria: 'Meses sin intereses', total: 4500.5 });
  });

  it('liquidez, MSI y pagos', () => {
    const l = informeLiquidez(EJEMPLO, '2026-10');
    expect(l.meses[0]).toEqual({ mes: '2026-10', ingresos: 75000, gastosFijos: 36259.5, msi: 4500.5, liquidez: 34240 });
    expect(l).toMatchObject({ todosLosMesesAlcanzan: true, mesMasAjustado: { mes: '2027-05', liquidez: 32740.5 }, primerMesSinMSI: '2027-06' });

    const m = informeMsi(EJEMPLO, '2026-11');
    expect(m.compras.map((c) => [c.compra, c.pagosRestantes, c.estado])).toEqual([
      ['Audífonos', 0, 'terminada'], ['Lavadora', 1, 'activa'], ['Laptop', 7, 'activa'],
    ]);
    expect(m.faltaPorPagarEnTotal).toBe(9000.5);

    const p = informePagos({ ...EJEMPLO, pagos: [{ mes: '2026-10', itemId: 'hipoteca' }] }, '2026-10');
    expect(p).toMatchObject({ totalPorPagar: 40760, pagado: 15000, pendiente: 25760 });
  });
});

describe('servidor MCP', () => {
  it('negocia la versión y anuncia solo herramientas de lectura', () => {
    expect(rpc('initialize', { protocolVersion: '2025-03-26' })!.result).toMatchObject({
      protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'finanzas-familiares' },
    });
    expect(rpc('initialize', { protocolVersion: '1999-01-01' })!.result.protocolVersion).toBe('2025-06-18');

    const { tools } = rpc('tools/list')!.result;
    expect(tools.map((t: any) => t.name)).toEqual(['resumen', 'liquidez_proyectada', 'ingresos', 'gastos', 'meses_sin_intereses', 'pagos_del_mes']);
    for (const t of tools) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('ejecuta herramientas con el mes actual por defecto o el que se pida', () => {
    const r = rpc('tools/call', { name: 'resumen' })!.result;
    expect(r.isError).toBe(false);
    expect(r.structuredContent.sobrante).toBe(34240);
    expect(JSON.parse(r.content[0].text)).toEqual(r.structuredContent);

    expect(rpc('tools/call', { name: 'resumen', arguments: { mes: '2027-05' } })!.result.structuredContent.ingresos).toBe(70000);
    const g = rpc('tools/call', { name: 'gastos', arguments: { categoria: 'auto' } })!.result.structuredContent;
    expect(g.gastos.map((x: any) => x.concepto)).toEqual(['Pago del carro', 'Seguro del auto']);
  });

  it('distingue errores de herramienta de errores de protocolo', () => {
    const malArg = rpc('tools/call', { name: 'resumen', arguments: { mes: 'octubre' } })!;
    expect(malArg.result.isError).toBe(true);
    expect(malArg.result.content[0].text).toContain('AAAA-MM');
    expect(rpc('tools/call', { name: 'borrar_todo' })!.error.code).toBe(-32602);
    expect(rpc('resources/list')!.error.code).toBe(-32601);
    expect((responderMcp({ id: 1, method: 'ping' }, ctx) as any).error.code).toBe(-32600);
  });

  it('no responde a las notificaciones y contesta ping', () => {
    expect(responderMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).toBeNull();
    expect(rpc('ping')!.result).toEqual({});
  });
});
