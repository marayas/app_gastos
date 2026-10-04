import { diasConClases, gastoDelMes, ingresoVigente, msiRestanteTotal, pagosRestantes, rangoMeses, resumen } from '../shared/calc.ts';
import type { Coleccion, Datos, Frecuencia, Gasto, Ingreso, Mes } from '../shared/tipos.ts';
import { deTipo, FRECUENCIAS } from './formularios.ts';
import { MontoInput } from './MontoInput.tsx';
import type { Item, Store } from './store.ts';
import { COLOR_MSI, colorDe, fmt, mesLargo, pct, usePref } from './ui.ts';

interface Props {
  real: Datos; // datos guardados
  datos: Datos; // datos con el escenario aplicado
  mes: Mes;
  excluidos: string[];
  setExcluidos(v: string[]): void;
  store: Store;
  abrir(col: Coleccion, item: Item | null): void;
}

export function Resumen({ real, datos, mes, excluidos, setExcluidos, store, abrir }: Props) {
  const [periodo, setPeriodo] = usePref<'mes' | 'anio'>('periodo', 'mes');
  const anual = periodo === 'anio';
  const meses = anual ? rangoMeses(mes, 12) : [mes];
  const r = resumen(datos, mes, periodo);
  const base = Math.max(r.ingresos, r.egresos) || 1;

  const categoriasGasto = deTipo(real.categorias, 'gasto');
  const partes = [
    ...categoriasGasto.map((c) => ({ id: c.id, nombre: c.nombre, color: colorDe(c), total: r.porCategoria[c.id] ?? 0 })),
    { id: 'msi', nombre: 'Meses sin intereses', color: COLOR_MSI, total: r.msi },
  ].sort((a, b) => b.total - a.total);

  // Fuentes de ingreso con monto en el periodo, de mayor a menor; los ingresos sin categoría van aparte.
  const fuentes = [
    ...deTipo(real.categorias, 'ingreso').map((c) => ({ id: c.id, nombre: c.nombre, color: colorDe(c), total: r.ingresosPorCategoria[c.id] ?? 0 })),
    { id: '', nombre: 'Sin categoría', color: 'var(--mute)', total: r.ingresosPorCategoria[''] ?? 0 },
  ].filter((f) => f.total > 0).sort((a, b) => b.total - a.total);
  const gruposIngreso = [
    ...deTipo(real.categorias, 'ingreso').map((c) => ({ id: c.id, nombre: c.nombre, color: colorDe(c) })),
    { id: '', nombre: 'Sin categoría', color: 'var(--mute)' },
  ]
    .map((g) => ({ ...g, items: real.ingresos.filter((x) => (x.categoria ?? '') === g.id) }))
    .filter((g) => g.items.length > 0);

  const recortables = real.gastos.filter((g) => g.recortable);
  const sobranteReal = resumen(real, mes, periodo).sobrante;
  const alternar = (id: string) =>
    setExcluidos(excluidos.includes(id) ? excluidos.filter((x) => x !== id) : [...excluidos, id]);

  const totalGasto = (g: Gasto) => meses.reduce((s, m) => s + gastoDelMes(real, g, m), 0);
  const msiPendientes = real.msi.filter((c) => pagosRestantes(c, mes) > 0);
  const vs: [string, number, string][] = [
    ['Ingresos', r.ingresos, 'var(--in)'],
    ['Egresos', r.egresos, 'var(--out)'],
    ['Sobrante', Math.max(r.sobrante, 0), 'var(--free-solid)'],
  ];

  return (
    <>
      <div className="rowbtn barra">
        <div className="seg" role="group" aria-label="Periodo">
          <button aria-pressed={!anual} onClick={() => setPeriodo('mes')}>Por mes</button>
          <button aria-pressed={anual} onClick={() => setPeriodo('anio')}>Por año</button>
        </div>
        <span className="btns">
          <button className="ghost" onClick={() => abrir('ingresos', null)}>+ Ingreso</button>
          <button className="ghost" onClick={() => abrir('gastos', null)}>+ Gasto</button>
          <button className="ghost" onClick={() => abrir('msi', null)}>+ MSI</button>
        </span>
      </div>

      <section className="kpis" aria-label="Resumen">
        <div className="kpi in">
          <div className="l">Ingresos</div>
          <div className="num">{fmt(r.ingresos)}</div>
          <div className="n">{anual ? 'Próximos 12 meses' : mesLargo(mes)}</div>
        </div>
        <div className="kpi out">
          <div className="l">Egresos</div>
          <div className="num">{fmt(r.egresos)}</div>
          <div className="n">{pct(r.egresos, r.ingresos)} del ingreso</div>
        </div>
        <div className="kpi">
          <div className="l">Sobrante</div>
          <div className={'num' + (r.sobrante < 0 ? ' neg' : '')}>{fmt(r.sobrante)}</div>
          <div className="n">{pct(r.sobrante, r.ingresos)} del ingreso</div>
        </div>
        {r.porCategoria.terreno ? (
          <div className="kpi">
            <div className="l">Sin terreno</div>
            <div className="num">{fmt(r.egresos - r.porCategoria.terreno)}</div>
            <div className="n">Egresos sin el descuento</div>
          </div>
        ) : (
          <div className="kpi">
            <div className="l">MSI por pagar</div>
            <div className="num">{fmt(msiRestanteTotal(real, mes))}</div>
            <div className="n">Total de pagos restantes</div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>De dónde viene el ingreso</h2>
        {fuentes.length === 0 ? (
          <p className="note first">Aún no hay ingresos {anual ? 'en los próximos 12 meses' : 'este mes'}. Agrega uno con «+ Ingreso».</p>
        ) : (
          <>
            <div className="bar" role="img" aria-label="Ingresos por categoría">
              {fuentes.map((f) => (
                <div key={f.id} title={f.nombre} style={{ width: `${(f.total / r.ingresos) * 100}%`, background: f.color }} />
              ))}
            </div>
            <ul className="legend">
              {fuentes.map((f) => (
                <li key={f.id}>
                  <span className="dot" style={{ background: f.color }} />
                  <span>{f.nombre}</span>
                  <span className="pct">{pct(f.total, r.ingresos)}</span>
                  <span className="amt">{fmt(f.total)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel">
        <h2>A dónde se va el ingreso</h2>
        <div className="bar" role="img" aria-label="Distribución del ingreso por categoría">
          {partes.filter((p) => p.total > 0).map((p) => (
            <div key={p.id} title={p.nombre} style={{ width: `${(p.total / base) * 100}%`, background: p.color }} />
          ))}
          {r.sobrante > 0 && <div className="free" title="Sobrante" style={{ width: `${(r.sobrante / base) * 100}%` }} />}
        </div>
        <ul className="legend">
          {partes.map((p) => (
            <li key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <span>{p.nombre}</span>
              <span className="pct">{pct(p.total, r.ingresos)}</span>
              <span className="amt">{fmt(p.total)}</span>
            </li>
          ))}
          <li>
            <span className="dot free" />
            <span>Sobrante {anual ? 'al año' : 'al mes'}</span>
            <span className="pct">{pct(Math.max(r.sobrante, 0), r.ingresos)}</span>
            <span className="amt">{fmt(r.sobrante)}</span>
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Ingresos contra egresos</h2>
        <div className="vs">
          {vs.map(([nombre, valor, color]) => {
            const w = Math.max((valor / base) * 100, 1);
            // Con barras cortas la cifra no cabe dentro: va al lado para que siempre se lea.
            const fuera = w < 30;
            return (
              <div key={nombre} className="vsrow">
                <span>{nombre}</span>
                <div className="vsbar">
                  <i style={{ width: `${w}%`, background: color }} />
                  <b className={fuera ? 'out' : ''} style={fuera ? { left: `calc(${w}% + 8px)` } : undefined}>{fmt(valor)}</b>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Escenarios</h2>
        {recortables.length === 0 ? (
          <p className="note first">Marca un gasto como «recortable» al editarlo para probar aquí cómo cambia el sobrante sin borrarlo.</p>
        ) : (
          <>
            <p className="note first">Prueba cómo queda el sobrante si recortas un gasto. El dato original no se borra.</p>
            {recortables.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={excluidos.includes(g.id)} onChange={() => alternar(g.id)} />
                Recortar {g.nombre} ({fmt(totalGasto(g))} {anual ? 'al año' : 'al mes'})
              </label>
            ))}
            {datos !== real && (
              <p className="note">
                Con este escenario el sobrante pasa de <b>{fmt(sobranteReal)}</b> a <b>{fmt(r.sobrante)}</b> {anual ? 'al año' : 'al mes'}.
              </p>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Detalle</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="r">Monto</th>
                <th>Frecuencia</th>
                <th className="r">{anual ? 'Al año' : 'Al mes'}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="catrow">
                <td colSpan={3}><span className="tag" style={{ background: 'var(--in)' }} />Ingresos</td>
                <td className="r">{fmt(r.ingresos)}</td>
              </tr>
              {gruposIngreso.map((g) => (
                <Categoria key={g.id} nombre={g.nombre} color={g.color} total={r.ingresosPorCategoria[g.id] ?? 0} sub>
                  {g.items.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <button className="link" onClick={() => abrir('ingresos', x)}>{x.nombre}</button>
                      </td>
                      <td className="r">
                        <MontoInput valor={x.monto} etiqueta={x.nombre} onChange={(monto) => store.guardar('ingresos', { ...x, monto }, true)} />
                      </td>
                      <td>{vigencia(x)}</td>
                      <td className="r">{fmt(meses.reduce((s, m) => s + (ingresoVigente(x, m) ? x.monto : 0), 0))}</td>
                    </tr>
                  ))}
                </Categoria>
              ))}
              {categoriasGasto.map((c) => (
                <Categoria key={c.id} nombre={c.nombre} color={colorDe(c)} total={r.porCategoria[c.id] ?? 0}>
                  {real.gastos.filter((g) => g.categoria === c.id).map((g) => {
                    const fuera = excluidos.includes(g.id);
                    return (
                      <tr key={g.id} className={fuera ? 'off' : ''}>
                        <td>
                          <button className="link" onClick={() => abrir('gastos', g)}>{g.nombre}</button>
                          {g.recortable && <span className="flag">{fuera ? 'recortado' : 'recortable'}</span>}
                          {g.nota && <small>{g.nota}</small>}
                        </td>
                        <td className="r">
                          <MontoInput
                            valor={g.porDia ? g.porDia.tarifa : g.monto}
                            etiqueta={g.nombre}
                            onChange={(monto) =>
                              store.guardar('gastos', { ...g, monto, porDia: g.porDia && { ...g.porDia, tarifa: monto } }, true)
                            }
                          />
                        </td>
                        <td>
                          {g.porDia ? (
                            `por día (${diasConClases(real, g.porDia.diasSemana, mes)} días este mes)`
                          ) : (
                            <select
                              aria-label={`Frecuencia de ${g.nombre}`}
                              value={g.frecuencia}
                              onChange={(e) => store.guardar('gastos', { ...g, frecuencia: e.target.value as Frecuencia })}
                            >
                              {FRECUENCIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="r">{fmt(totalGasto(g))}</td>
                      </tr>
                    );
                  })}
                </Categoria>
              ))}
              <Categoria nombre="Meses sin intereses" color={COLOR_MSI} total={r.msi}>
                {msiPendientes.map((c) => {
                  const k = pagosRestantes(c, mes);
                  return (
                    <tr key={c.id}>
                      <td><button className="link" onClick={() => abrir('msi', c)}>{c.nombre}</button></td>
                      <td className="r">{fmt(c.pagoMensual)}</td>
                      <td>{k} de {c.plazoTotal} {k === 1 ? 'pago restante' : 'pagos restantes'}</td>
                      <td className="r">{fmt(anual ? c.pagoMensual * k : c.inicio <= mes ? c.pagoMensual : 0)}</td>
                    </tr>
                  );
                })}
              </Categoria>
            </tbody>
          </table>
        </div>
        <p className="note">
          Toca un concepto para editarlo o borrarlo. Los montos y frecuencias se guardan solos al cambiarlos.
          {anual && ' La vista anual suma los próximos 12 meses; en MSI muestra lo que falta pagar en total.'}
        </p>
      </section>
    </>
  );
}

function vigencia(x: Ingreso): string {
  if (x.desde && x.desde === x.hasta) return `solo en ${mesLargo(x.desde)}`;
  return 'por mes' + (x.desde ? ` desde ${mesLargo(x.desde)}` : '') + (x.hasta ? ` hasta ${mesLargo(x.hasta)}` : '');
}

interface CategoriaProps {
  nombre: string;
  color: string;
  total: number;
  sub?: boolean; // subgrupo dentro de Ingresos
  children: React.ReactNode;
}

function Categoria({ nombre, color, total, sub, children }: CategoriaProps) {
  return (
    <>
      <tr className={'catrow' + (sub ? ' subcat' : '')}>
        <td colSpan={3}><span className="tag" style={{ background: color }} />{nombre}</td>
        <td className="r">{fmt(total)}</td>
      </tr>
      {children}
    </>
  );
}
