import {
  diasConClases,
  finMSI,
  gastoDelMes,
  msiActiva,
  msiDelMes,
  msiRestanteTotal,
  pagosRestantes,
  proyeccion,
  sumarMeses,
  ultimoMesMSI,
} from '../shared/calc.ts';
import type { Coleccion, CompraMSI, Datos, Gasto, Mes } from '../shared/tipos.ts';
import type { Item, Store } from './store.ts';
import { COLOR_MSI, colorDe, fmt, mesCorto, mesLargo } from './ui.ts';

interface Props {
  real: Datos;
  datos: Datos; // con el escenario aplicado; solo afecta la liquidez
  mes: Mes;
  store: Store;
  abrir(col: Coleccion, item: Item | null): void;
}

const CUANDO = { mes: '', bimestre: 'cada bimestre', anio: 'al año' };

export function Pagos({ real, datos, mes, store, abrir }: Props) {
  const pagado = new Set(real.pagos.filter((p) => p.mes === mes).map((p) => p.itemId));
  const monto = (g: Gasto) => gastoDelMes(real, g, mes);
  const categoria = (g: Gasto) => real.categorias.find((c) => c.id === g.categoria);

  const msiMes = real.msi.filter((c) => msiActiva(c, mes));
  const msiFuturas = real.msi.filter((c) => c.inicio > mes);
  const msiTerminadas = real.msi.filter((c) => pagosRestantes(c, mes) === 0);
  const totalMsiMes = msiDelMes(real, mes);

  const total = real.gastos.reduce((s, g) => s + monto(g), 0) + totalMsiMes;
  const hecho =
    real.gastos.reduce((s, g) => s + (pagado.has(g.id) ? monto(g) : 0), 0) +
    msiMes.reduce((s, c) => s + (pagado.has(c.id) ? c.pagoMensual : 0), 0);

  const porMonto = (a: Gasto, b: Gasto) => monto(b) - monto(a);
  const fijos = real.gastos.filter((g) => g.frecuencia === 'mes').sort(porMonto);
  const apartados = real.gastos.filter((g) => g.frecuencia !== 'mes').sort(porMonto);

  const ultimo = ultimoMesMSI(real, mes);
  const sinMsi = ultimo ? sumarMeses(ultimo, 1) : mes;
  const filas = proyeccion(datos, mes);
  const peor = filas.reduce((a, b) => (b.liquidez < a.liquidez ? b : a));
  const despues = filas.find((f) => f.mes === sinMsi) ?? filas[filas.length - 1];
  const todosAlcanzan = filas.every((f) => f.liquidez >= 0);
  const maxMsi = Math.max(...filas.map((f) => msiDelMes(real, f.mes)), 1);

  const filaGasto = (g: Gasto) => (
    <Fila
      key={g.id} id={g.id} nombre={g.nombre} color={colorDe(categoria(g))} monto={monto(g)}
      pagado={pagado.has(g.id)} onMarcar={(v) => store.marcar(mes, g.id, v)} onEditar={() => abrir('gastos', g)}
      detalle={
        g.porDia
          ? `${diasConClases(real, g.porDia.diasSemana, mes)} días × ${fmt(g.porDia.tarifa)}`
          : g.frecuencia !== 'mes'
            ? `Se paga ${fmt(g.monto)} ${CUANDO[g.frecuencia]}`
            : (g.nota ?? categoria(g)?.nombre ?? '')
      }
    />
  );

  const filaMsi = (c: CompraMSI, activa: boolean) => {
    const k = pagosRestantes(c, mes);
    return (
      <Fila
        key={c.id} id={c.id} nombre={c.nombre} color={COLOR_MSI} monto={c.pagoMensual}
        pagado={pagado.has(c.id)} onMarcar={activa ? (v) => store.marcar(mes, c.id, v) : undefined} onEditar={() => abrir('msi', c)}
        detalle={
          k === 0
            ? `Terminó en ${mesLargo(finMSI(c))}`
            : `${activa ? '' : `Empieza en ${mesLargo(c.inicio)} · `}${k} de ${c.plazoTotal} ${k === 1 ? 'pago restante' : 'pagos restantes'} · faltan ${fmt(c.pagoMensual * k)} · termina en ${mesLargo(finMSI(c))}`
        }
      />
    );
  };

  return (
    <>
      <section className="kpis" aria-label="Resumen de pagos del mes">
        <div className="kpi wide">
          <div className="l">Por pagar en {mesLargo(mes)}</div>
          <div className="num">{fmt(total)}</div>
          <div className="n">Incluye ahorros, apartados y MSI</div>
        </div>
        <div className="kpi in"><div className="l">Pagado</div><div className="num">{fmt(hecho)}</div></div>
        <div className="kpi out"><div className="l">Pendiente</div><div className="num">{fmt(total - hecho)}</div></div>
      </section>

      <div className="panel">
        <div className="prog" role="progressbar" aria-label="Avance de pagos del mes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total ? Math.round((hecho / total) * 100) : 0}>
          <i style={{ width: `${total ? (hecho / total) * 100 : 0}%` }} />
        </div>
        <div className="rowbtn">
          <span className="note first">Marca cada pago cuando lo hagas. Las casillas empiezan vacías cada mes.</span>
          <button
            className="ghost"
            disabled={pagado.size === 0}
            onClick={() => confirm(`¿Desmarcar todos los pagos de ${mesLargo(mes)}?`) && store.reiniciarMes(mes)}
          >
            Reiniciar mes
          </button>
        </div>
      </div>

      <section className="panel">
        <h2>Liquidez mensual</h2>
        <p className="note first">
          {todosAlcanzan ? <b>Todos los meses alcanzan.</b> : <b className="neg">Hay meses en negativo.</b>} El mes más ajustado es{' '}
          <b>{mesLargo(peor.mes)}</b>: ingresos {fmt(peor.ingreso)} − pagos fijos {fmt(peor.fijos)} − MSI {fmt(peor.msi)} = {fmt(peor.liquidez)} libres.{' '}
          {ultimo
            ? <>Sin MSI, desde {mesLargo(sinMsi)}, la liquidez queda en {fmt(despues.liquidez)}.</>
            : 'No hay compras a MSI pendientes.'}
          {datos !== real && ' Incluye el escenario de recortes activo.'}
        </p>
        <div className="tablewrap">
          <table className="compact">
            <thead>
              <tr><th>Mes</th><th className="r">Fijos</th><th className="r">MSI</th><th className="r">Liquidez</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.mes}>
                  <td>{mesCorto(f.mes)}</td>
                  <td className="r">{fmt(f.fijos)}</td>
                  <td className="r">{f.msi ? fmt(f.msi) : '—'}</td>
                  <td className={'r strong' + (f.liquidez < 0 ? ' neg' : '')}>{fmt(f.liquidez)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Liquidez = ingresos − pagos fijos (incluye ahorros y apartados) − MSI.</p>
      </section>

      <section className="panel">
        <div className="rowbtn">
          <h2>Meses sin intereses</h2>
          <button className="ghost" onClick={() => abrir('msi', null)}>+ Compra</button>
        </div>
        <p className="note first">
          {ultimo
            ? <>Último pago: <b>{mesLargo(ultimo)}</b>. Sin MSI a partir de <b>{mesLargo(sinMsi)}</b>. Faltan {fmt(msiRestanteTotal(real, mes))} en total.</>
            : 'No hay compras a MSI pendientes.'}
        </p>
        {msiMes.map((c) => filaMsi(c, true))}
        {msiMes.length > 0 && <div className="psub"><span>Este mes</span><b className="amt">{fmt(totalMsiMes)}</b></div>}
        {msiFuturas.length > 0 && (
          <>
            <h3>Empiezan después</h3>
            {msiFuturas.map((c) => filaMsi(c, false))}
          </>
        )}
        {msiTerminadas.length > 0 && (
          <details>
            <summary>Compras terminadas ({msiTerminadas.length})</summary>
            {msiTerminadas.map((c) => filaMsi(c, false))}
          </details>
        )}
      </section>

      {ultimo && (
        <section className="panel">
          <h2>Cuánto pagas de MSI cada mes</h2>
          <div className="vs">
            {filas.filter((f) => f.mes <= sinMsi).map((f) => {
              const v = msiDelMes(real, f.mes);
              const w = v ? Math.max((v / maxMsi) * 68, 2) : 0;
              return (
                <div key={f.mes} className="vsrow">
                  <span>{mesCorto(f.mes)}</span>
                  <div className="vsbar">
                    <i style={{ width: `${w}%`, background: COLOR_MSI }} />
                    <b className={v ? 'out' : 'out ok'} style={{ left: `calc(${w}% + 8px)` }}>{v ? fmt(v) : 'Sin MSI'}</b>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Pagos fijos de cada mes</h2>
        {fijos.map(filaGasto)}
        <div className="psub"><span>Subtotal</span><b className="amt">{fmt(fijos.reduce((s, g) => s + monto(g), 0))}</b></div>
      </section>

      {apartados.length > 0 && (
        <section className="panel">
          <h2>Apartar cada mes</h2>
          <p className="note first">Se pagan cada bimestre o una vez al año; aquí ves cuánto separar al mes para cubrirlos.</p>
          {apartados.map(filaGasto)}
          <div className="psub"><span>Subtotal</span><b className="amt">{fmt(apartados.reduce((s, g) => s + monto(g), 0))}</b></div>
        </section>
      )}
    </>
  );
}

interface FilaProps {
  id: string;
  nombre: string;
  detalle: string;
  color: string;
  monto: number;
  pagado: boolean;
  onMarcar?(v: boolean): void; // sin casilla si no se paga este mes
  onEditar(): void;
}

function Fila({ id, nombre, detalle, color, monto, pagado, onMarcar, onEditar }: FilaProps) {
  return (
    <div className={'prow' + (pagado && onMarcar ? ' done' : '')}>
      {onMarcar
        ? <input type="checkbox" id={'p-' + id} checked={pagado} onChange={(e) => onMarcar(e.target.checked)} />
        : <span />}
      <span className="dot" style={{ background: color }} />
      <label htmlFor={'p-' + id} className="pn">{nombre}<small>{detalle}</small></label>
      <span className="amt">{fmt(monto)}</span>
      <button className="icon" aria-label={`Editar ${nombre}`} onClick={onEditar}>✎</button>
    </div>
  );
}
