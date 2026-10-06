import { diasConClases, gastoDelMes, rangoMeses } from '../shared/calc.ts';
import type { Coleccion, Datos, Mes, TipoCategoria } from '../shared/tipos.ts';
import { CLASES, deTipo, nuevaCategoria } from './formularios.ts';
import type { Item, Store } from './store.ts';
import { colorDe, fechaLarga, fmt, mesLargo } from './ui.ts';

interface Props {
  real: Datos;
  mes: Mes;
  store: Store;
  abrir(col: Coleccion, item: Item | null, base?: Record<string, unknown>): void;
}

export function DatosTab({ real, mes, store, abrir }: Props) {
  const porDia = real.gastos.filter((g) => g.porDia);
  const meses = rangoMeses(mes, 12);
  const finCiclos = real.ciclos.reduce((f, c) => (c.fin > f ? c.fin : f), '');
  const sinCalendario = meses.filter((m) => m > finCiclos.slice(0, 7));

  async function importar(archivo: File | undefined) {
    if (!archivo) return;
    let datos: unknown;
    try {
      datos = JSON.parse(await archivo.text());
    } catch {
      alert('El archivo no es un JSON válido.');
      return;
    }
    if (confirm('Importar reemplaza TODOS los datos actuales con los del respaldo. ¿Continuar?')) await store.importar(datos);
  }

  const enUso = (id: string) => real.gastos.filter((g) => g.categoria === id).length + real.ingresos.filter((x) => x.categoria === id).length;
  const listaCategorias = (tipo: TipoCategoria, titulo: string) => (
    <>
      <div className="rowbtn sub2">
        <h3>{titulo}</h3>
        <button className="ghost" onClick={() => abrir('categorias', null, { ...nuevaCategoria(real.categorias, tipo) })}>+ Categoría</button>
      </div>
      {deTipo(real.categorias, tipo).map((c) => (
        <div key={c.id} className="lrow">
          <span className="dot" style={{ background: colorDe(c) }} />
          <span className="pn grow">{c.nombre}<small>{tipo === 'gasto' && `${CLASES.find(([k]) => k === (c.clase ?? 'basico'))?.[1]} · `}{enUso(c.id) ? `En uso: ${enUso(c.id)}` : 'Sin usar'}</small></span>
          <button className="icon" aria-label={`Editar ${c.nombre}`} onClick={() => abrir('categorias', c)}>✎</button>
        </div>
      ))}
    </>
  );

  return (
    <>
      <section className="panel">
        <h2>Categorías</h2>
        <p className="note first">
          También puedes crear una categoría al capturar un ingreso o un gasto, con «+ Nueva categoría…». Solo se pueden borrar las que no están en uso.
          Cada categoría de gasto dice si sus gastos son básicos, lujos o ahorro, para la regla 50/20/30 del Resumen.
        </p>
        {listaCategorias('ingreso', 'De ingresos')}
        {listaCategorias('gasto', 'De gastos')}
      </section>

      <section className="panel">
        <div className="rowbtn">
          <h2>Calendario escolar</h2>
          <button className="ghost" onClick={() => abrir('ciclos', null)}>+ Ciclo</button>
        </div>
        <p className="note first">
          Los gastos que se cobran por día de clases (after school) solo cuentan los días dentro de un ciclo y que no estén en la lista de días sin clases.
        </p>
        {real.ciclos.length === 0 && <p className="note">Aún no hay ciclos escolares.</p>}
        {real.ciclos.map((c) => (
          <div key={c.id} className="lrow">
            <span className="pn">{c.nombre}<small>{fechaLarga(c.inicio)} – {fechaLarga(c.fin)}</small></span>
            <button className="icon" aria-label={`Editar ${c.nombre}`} onClick={() => abrir('ciclos', c)}>✎</button>
          </div>
        ))}
        {porDia.length > 0 && sinCalendario.length > 0 && (
          <p className="note warn">
            No hay ciclo escolar cargado a partir de {mesLargo(sinCalendario[0])}; esos meses cuentan $0 de cobro por día. Agrega el ciclo siguiente cuando se publique.
          </p>
        )}
      </section>

      {porDia.map((g) => (
        <section key={g.id} className="panel">
          <h2>{g.nombre}: días y cobro por mes</h2>
          <div className="tablewrap">
            <table className="compact">
              <thead><tr><th>Mes</th><th className="r">Días</th><th className="r">Cobro</th></tr></thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m}>
                    <td>{mesLargo(m)}</td>
                    <td className="r">{diasConClases(real, g.porDia!.diasSemana, m)}</td>
                    <td className="r strong">{fmt(gastoDelMes(real, g, m))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="panel">
        <div className="rowbtn">
          <h2>Días sin clases</h2>
          <button className="ghost" onClick={() => abrir('sinClases', null)}>+ Día o periodo</button>
        </div>
        {real.sinClases.length === 0 && <p className="note">Aún no hay días sin clases.</p>}
        {real.sinClases.map((p) => (
          <div key={p.id} className="lrow">
            <span className="pn">
              {p.motivo}
              <small>{p.desde === p.hasta ? fechaLarga(p.desde) : `${fechaLarga(p.desde)} – ${fechaLarga(p.hasta)}`}</small>
            </span>
            <button className="icon" aria-label={`Editar ${p.motivo}`} onClick={() => abrir('sinClases', p)}>✎</button>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Respaldo</h2>
        <p className="note first">Exporta todos los datos a un archivo JSON, o restaura un respaldo anterior.</p>
        <div className="btns">
          <a className="ghost" href="/api/exportar" download>Exportar JSON</a>
          <label className="ghost">
            Importar JSON
            <input
              type="file" accept="application/json,.json" hidden
              onChange={(e) => {
                importar(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </section>
    </>
  );
}
