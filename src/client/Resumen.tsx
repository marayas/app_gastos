import {
  CATEGORIA_INVERSIONES, claseDeGasto, diasConClases, finMSI, gastoDelMes, gastoTerminado, ingresoVigente, META, msiRestanteTotal, pagosRestantes,
  proyeccion, rangoMeses, regla, rendimientoMensual, resumen, resumenPorPersona, saldoInversion, tasaEfectivaAnual, TOPE_DEUDA, totalInversiones,
} from '../shared/calc.ts';
import type { Clase, Coleccion, Datos, Frecuencia, Gasto, Ingreso, Mes, Reparto } from '../shared/tipos.ts';
import { CAPITALIZACIONES, CLASES, deTipo, FRECUENCIAS } from './formularios.ts';
import { Columnas, Ranking } from './Graficas.tsx';
import { Icono } from './Icono.tsx';
import { MontoInput } from './MontoInput.tsx';
import type { Item, Store } from './store.ts';
import { COLOR_MSI, colorDe, fmt, mesCorto, mesLargo, pct, textoMeses, textoReparto, textoSplit, usePref } from './ui.ts';

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
    { id: CATEGORIA_INVERSIONES, nombre: 'Rendimiento de inversiones', color: COLOR_MSI, total: r.ingresosPorCategoria[CATEGORIA_INVERSIONES] ?? 0 },
    { id: '', nombre: 'Sin categoría', color: 'var(--mute)', total: r.ingresosPorCategoria[''] ?? 0 },
  ].filter((f) => f.total > 0).sort((a, b) => b.total - a.total);
  const gruposIngreso = [
    ...deTipo(real.categorias, 'ingreso').map((c) => ({ id: c.id, nombre: c.nombre, color: colorDe(c) })),
    { id: '', nombre: 'Sin categoría', color: 'var(--mute)' },
  ]
    .map((g) => ({ ...g, items: real.ingresos.filter((x) => (x.categoria ?? '') === g.id) }))
    .filter((g) => g.items.length > 0);

  // Los gastos de ciertos meses dejan de listarse cuando ya pasaron todos sus meses.
  const gastos = real.gastos.filter((g) => !gastoTerminado(g, mes));
  const recortables = gastos.filter((g) => g.recortable);
  const inversiones = real.inversiones ?? [];
  const invertido = totalInversiones(real, mes);
  const rindenAlMes = inversiones.reduce((s, x) => s + rendimientoMensual(x, mes), 0);
  const sobranteReal = resumen(real, mes, periodo).sobrante;
  const alternar = (id: string) =>
    setExcluidos(excluidos.includes(id) ? excluidos.filter((x) => x !== id) : [...excluidos, id]);

  const totalGasto = (g: Gasto) => meses.reduce((s, m) => s + gastoDelMes(real, g, m), 0);
  const msiPendientes = real.msi.filter((c) => pagosRestantes(c, mes) > 0);
  const usado = r.ingresos ? r.egresos / r.ingresos : 0;
  const personas = resumenPorPersona(datos, mes, periodo);
  const reparto = (x: { reparto?: Reparto }) => textoReparto(x.reparto, real.miembros);
  // Ingresos del periodo sin dueño: se reparten a partes iguales, lo que casi nunca es cierto para un sueldo.
  const sinDuenio = real.ingresos.filter((x) => !x.reparto && meses.some((m) => ingresoVigente(x, m)));
  const rg = regla(datos, mes, periodo);
  const cuando = anual ? 'al año' : 'al mes';
  // Básicos, lujos y deudas tienen un máximo; el ahorro, un mínimo.
  const grupos = [
    { id: 'basico', nombre: 'Básicos', total: rg.basico, meta: META.basico, minimo: false, que: 'Lo que necesitas sí o sí para vivir.' },
    { id: 'lujo', nombre: 'Lujos', total: rg.lujo, meta: META.lujo, minimo: false, que: 'Lo que podrías dejar sin que falte lo esencial.' },
    { id: 'ahorro', nombre: 'Ahorro', total: rg.ahorro, meta: META.ahorro, minimo: true, que: 'Lo que guardas o inviertes.' },
    { id: 'deuda', nombre: 'Deudas', total: rg.deuda, meta: TOPE_DEUDA, minimo: false, que: 'Meses sin intereses y créditos. Se miden aparte.' },
  ];

  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Periodo">
          <button aria-pressed={!anual} onClick={() => setPeriodo('mes')}>Por mes</button>
          <button aria-pressed={anual} onClick={() => setPeriodo('anio')}>Por año</button>
        </div>
        <span className="btns">
          <button className="add" onClick={() => abrir('ingresos', null)}><Icono n="mas" s={16} />Ingreso</button>
          <button className="add" onClick={() => abrir('gastos', null)}><Icono n="mas" s={16} />Gasto</button>
          <button className="add" onClick={() => abrir('msi', null)}><Icono n="mas" s={16} />MSI</button>
          <button className="add" onClick={() => abrir('inversiones', null)}><Icono n="mas" s={16} />Inversión</button>
        </span>
      </div>

      <section className="hero" aria-label="Sobrante">
        <div className="hero-main">
          <p className="eyebrow">Sobrante {anual ? 'de los próximos 12 meses' : `de ${mesLargo(mes)}`}</p>
          <p className="hero-num">{fmt(r.sobrante)}</p>
          <div className="meter" role="img" aria-label={`Usas ${pct(r.egresos, r.ingresos)} de tu ingreso`}>
            <i className="grow" style={{ width: `${Math.min(usado, 1) * 100}%` }} />
          </div>
          <p className="hero-sub">
            {r.ingresos === 0
              ? 'Agrega tus ingresos y gastos para ver cuánto te queda.'
              : r.sobrante < 0
                ? <>Tus egresos rebasan tu ingreso por <b>{fmt(-r.sobrante)}</b>.</>
                : <>Usas <b>{pct(r.egresos, r.ingresos)}</b> de tu ingreso y te queda <b>{pct(r.sobrante, r.ingresos)}</b> libre.</>}
          </p>
        </div>
        <div className="hero-side">
          <p className="eyebrow">Liquidez de los próximos meses</p>
          <Columnas filas={proyeccion(datos, mes).slice(0, 10)} />
        </div>
      </section>

      <section className="kpis" aria-label="Resumen">
        <div className="kpi">
          <span className="ibox"><Icono n="entra" /></span>
          <div className="l">Ingresos</div>
          <div className="num">{fmt(r.ingresos)}</div>
          <div className="n">{anual ? 'Próximos 12 meses' : mesLargo(mes)}</div>
        </div>
        <div className="kpi">
          <span className="ibox"><Icono n="sale" /></span>
          <div className="l">Egresos</div>
          <div className="num">{fmt(r.egresos)}</div>
          <div className="n">{pct(r.egresos, r.ingresos)} del ingreso</div>
        </div>
        {r.porCategoria.terreno ? (
          <div className="kpi">
            <span className="ibox"><Icono n="meta" /></span>
            <div className="l">Sin terreno</div>
            <div className="num">{fmt(r.egresos - r.porCategoria.terreno)}</div>
            <div className="n">Egresos sin el descuento</div>
          </div>
        ) : (
          <div className="kpi">
            <span className="ibox"><Icono n="pagos" /></span>
            <div className="l">MSI por pagar</div>
            <div className="num">{fmt(msiRestanteTotal(real, mes))}</div>
            <div className="n">Total de pagos restantes</div>
          </div>
        )}
      </section>

      {rg.ingresoFijo > 0 && (
        <section className="panel">
          <h2>Regla 50/20/30</h2>
          <p className="note first">
            Qué parte de tu ingreso fijo ({fmt(rg.ingresoFijo)} {cuando}, sin bonos ni aguinaldo) se va a cada cosa. La guía: hasta {META.basico}% en básicos,
            hasta {META.lujo}% en lujos y al menos {META.ahorro}% en ahorro. Las deudas no entran en esos tres: su tope sano es {TOPE_DEUDA}%.
          </p>
          <div className="personas">
            {grupos.map((g) => {
              const p = (g.total / rg.ingresoFijo) * 100;
              const objetivo = (rg.ingresoFijo * g.meta) / 100;
              const bien = g.minimo ? p >= g.meta : p <= g.meta;
              const dif = Math.abs(g.total - objetivo);
              return (
                <div key={g.id} className="persona meta">
                  <h3>{g.nombre}</h3>
                  <p className={'metanum' + (bien ? '' : ' neg')}>{Math.round(p)}%<small>{g.minimo ? 'meta: al menos' : g.id === 'deuda' ? 'tope:' : 'meta: hasta'} {g.meta}%</small></p>
                  <div className="conmeta" role="img" aria-label={`${g.nombre}: ${Math.round(p)}% del ingreso fijo; la guía es ${g.meta}%`}>
                    <span className="track"><i className="grow" style={{ width: `${Math.min(p, 100)}%`, background: bien ? 'var(--in)' : 'var(--neg)' }} /></span>
                    <span className="marca" style={{ left: `${g.meta}%` }} />
                  </div>
                  <p className="note">
                    <b>{fmt(g.total)}</b> {cuando}.{' '}
                    {g.id === 'deuda'
                      ? bien
                        ? <>Te cabe otra mensualidad de hasta <b>{fmt(Math.max(rg.margenDeuda, 0))}</b> al mes.</>
                        : <>Te pasas del tope por <b className="neg">{fmt(dif)}</b>; no conviene sumar otra mensualidad.</>
                      : g.minimo
                        ? bien ? <>Cumples la meta, con {fmt(dif)} de más.</> : <>Te faltan <b className="neg">{fmt(dif)}</b> para la meta.</>
                        : bien ? <>Te quedan {fmt(dif)} antes del límite.</> : <>Te pasas por <b className="neg">{fmt(dif)}</b>.</>}
                  </p>
                  <p className="note metaque">{g.que}</p>
                </div>
              );
            })}
          </div>
          <p className="note">Cada gasto toma el tipo de su categoría (se cambia en Datos → Categorías); en la tabla de Detalle puedes ponerle otro a un gasto en particular. {datos !== real && 'Incluye el escenario de recortes activo.'}</p>
        </section>
      )}

      {personas.length > 1 && (
        <section className="panel">
          <h2>Por persona</h2>
          <p className="note first">
            Lo que gana cada quien, lo que le toca aportar a los gastos del hogar y lo que le queda {anual ? 'en los próximos 12 meses' : 'este mes'}.
            Cada gasto se reparte en partes iguales, salvo que diga otra cosa.
          </p>
          <div className="personas">
            {personas.map((p) => (
              <div key={p.persona.id} className="persona">
                <h3>{p.persona.nombre}</h3>
                <dl>
                  <div><dt>Ingresos</dt><dd>{fmt(p.ingresos)}</dd></div>
                  <div><dt>Le toca aportar</dt><dd>{fmt(p.egresos)}</dd></div>
                  <div className="tot"><dt>Le queda</dt><dd className={p.sobrante < 0 ? 'neg' : ''}>{fmt(p.sobrante)}</dd></div>
                </dl>
              </div>
            ))}
          </div>
          {sinDuenio.length > 0 && (
            <p className="note">
              Estos ingresos no dicen de quién son y por eso se reparten en partes iguales:{' '}
              {sinDuenio.map((x, i) => (
                <span key={x.id}>{i > 0 && ', '}<button className="link" onClick={() => abrir('ingresos', x)}>{x.nombre}</button> ({fmt(x.monto)})</span>
              ))}
              . Toca uno y elige en «¿De quién es?» para que cuente solo para esa persona.
            </p>
          )}
        </section>
      )}

      <div className="grid two sesgo">
        <div className="stack">
          <section className="panel">
            <h2>De dónde viene</h2>
            {fuentes.length === 0 ? (
              <p className="note first">Aún no hay ingresos {anual ? 'en los próximos 12 meses' : 'este mes'}. Agrega uno con «Ingreso».</p>
            ) : (
              <Ranking partes={fuentes} base={r.ingresos} tono="in" />
            )}
          </section>

          {inversiones.length > 0 && (
            <section className="panel">
              <h2>Inversiones</h2>
              <div className="lrow"><span className="pn">Compartido<small>Lo que ve todo el hogar</small></span><b className="amt">{fmt(invertido.compartido)}</b></div>
              <div className="lrow"><span className="pn">Personal<small>Tus inversiones privadas; solo tú las ves</small></span><b className="amt">{fmt(invertido.personal)}</b></div>
              <div className="psub"><span>Total</span><b className="amt">{fmt(invertido.compartido + invertido.personal)}</b></div>
              <p className="note">
                Saldos estimados a {mesLargo(mes)}; rinden alrededor de <b>{fmt(rindenAlMes)}</b> al mes. Lo que se reinvierte hace crecer el saldo solo:
                si no coincide con tu estado de cuenta, corrígelo en la tabla de Detalle.
              </p>
            </section>
          )}

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
        </div>

        <section className="panel">
          <h2>A dónde se va</h2>
          <Ranking
            partes={partes} base={base} tono="out" columnas
            sobrante={{ nombre: `Sobrante ${anual ? 'al año' : 'al mes'}`, total: r.sobrante }}
          />
        </section>
      </div>

      <section className="panel">
        <h2>Detalle</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="r">Monto</th>
                <th>Frecuencia</th>
                <th>Tipo</th>
                <th className="r">{anual ? 'Al año' : 'Al mes'}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="catrow">
                <td colSpan={4}><span className="tag" style={{ background: 'var(--in)' }} />Ingresos</td>
                <td className="r">{fmt(r.ingresos)}</td>
              </tr>
              {gruposIngreso.map((g) => (
                <Categoria key={g.id} nombre={g.nombre} color={g.color} total={r.ingresosPorCategoria[g.id] ?? 0} sub>
                  {g.items.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <button className="link" onClick={() => abrir('ingresos', x)}>{x.nombre}</button>
                        {reparto(x) && <small>{reparto(x)}</small>}
                      </td>
                      <td className="r">
                        <MontoInput valor={x.monto} etiqueta={x.nombre} onChange={(monto) => store.guardar('ingresos', { ...x, monto }, true)} />
                      </td>
                      <td>{vigencia(x)}</td>
                      <td />
                      <td className="r">{fmt(meses.reduce((s, m) => s + (ingresoVigente(x, m) ? x.monto : 0), 0))}</td>
                    </tr>
                  ))}
                </Categoria>
              ))}
              {inversiones.length > 0 && (
                <Categoria nombre="Inversiones" color={COLOR_MSI} total={r.ingresosPorCategoria[CATEGORIA_INVERSIONES] ?? 0} sub>
                  {inversiones.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <button className="link" onClick={() => abrir('inversiones', x)}>{x.nombre}</button>
                        {x.privadaDe && <span className="flag">privada</span>}
                        <small>
                          Rinde {fmt(rendimientoMensual(x, mes))} al mes{!x.comoIngreso && ', que se reinvierte'}
                          {!x.privadaDe && reparto(x) ? ` · ${reparto(x)}` : ''}
                        </small>
                      </td>
                      <td className="r">
                        <MontoInput valor={saldoInversion(x, mes)} etiqueta={`Saldo de ${x.nombre}`} onChange={(monto) => store.guardar('inversiones', { ...x, monto, desde: mes }, true)} />
                        {!x.comoIngreso && x.desde && x.desde !== mes && <small>estimado; {fmt(x.monto)} en {mesCorto(x.desde)}</small>}
                      </td>
                      <td>
                        {x.tasa}% anual
                        <small>interés {CAPITALIZACIONES.find(([k]) => k === x.capitalizacion)?.[1].toLowerCase()} · {(tasaEfectivaAnual(x) * 100).toFixed(2)}% efectivo</small>
                      </td>
                      <td />
                      <td className="r">{x.comoIngreso ? fmt(rendimientoMensual(x, mes) * meses.length) : '—'}</td>
                    </tr>
                  ))}
                </Categoria>
              )}
              {categoriasGasto.map((c) => (
                <Categoria key={c.id} nombre={c.nombre} color={colorDe(c)} total={r.porCategoria[c.id] ?? 0}>
                  {gastos.filter((g) => g.categoria === c.id).map((g) => {
                    const fuera = excluidos.includes(g.id);
                    return (
                      <tr key={g.id} className={fuera ? 'off' : ''}>
                        <td>
                          <button className="link" onClick={() => abrir('gastos', g)}>{g.nombre}</button>
                          {g.recortable && <span className="flag">{fuera ? 'recortado' : 'recortable'}</span>}
                          {g.split && <span className="flag">split</span>}
                          {g.nota && <small>{g.nota}</small>}
                          {g.split && <small>{textoSplit(g.split)}</small>}
                          {reparto(g) && <small>{reparto(g)}</small>}
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
                          ) : g.meses ? (
                            textoMeses(g.meses)
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
                        <td>
                          <select
                            aria-label={`Tipo de ${g.nombre}`}
                            value={claseDeGasto(real, g)}
                            onChange={(e) => store.guardar('gastos', { ...g, clase: e.target.value as Clase })}
                          >
                            {CLASES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                          </select>
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
                      <td>
                        <button className="link" onClick={() => abrir('msi', c)}>{c.nombre}</button>
                        {reparto(c) && <small>{reparto(c)}</small>}
                      </td>
                      <td className="r">{fmt(c.pagoMensual)}</td>
                      <td>{k} de {c.plazoTotal} {k === 1 ? 'pago restante' : 'pagos restantes'}<small>termina en {mesLargo(finMSI(c))}</small></td>
                      <td>Deuda</td>
                      <td className="r">{fmt(anual ? c.pagoMensual * k : c.inicio <= mes ? c.pagoMensual : 0)}</td>
                    </tr>
                  );
                })}
              </Categoria>
            </tbody>
          </table>
        </div>
        <p className="note">
          Toca un concepto para editarlo o borrarlo. Los montos, frecuencias y tipos se guardan solos al cambiarlos.
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
        <td colSpan={4}><span className="tag" style={{ background: color }} />{nombre}</td>
        <td className="r">{fmt(total)}</td>
      </tr>
      {children}
    </>
  );
}
