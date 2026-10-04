import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Coleccion, Datos, Sesion, Usuario } from '../shared/tipos.ts';
import { Acceso } from './Acceso.tsx';
import { Cuenta } from './Cuenta.tsx';
import { DatosTab } from './DatosTab.tsx';
import { Dialogo } from './Dialogo.tsx';
import { deTipo, formulario, NUEVA, nuevaCategoria, type Valores } from './formularios.ts';
import { Pagos } from './Pagos.tsx';
import { Resumen } from './Resumen.tsx';
import { api, mensaje, SIN_SESION, useDatos, type Item } from './store.ts';
import { mesLargo, nuevoId, usePref } from './ui.ts';

const TABS = [
  ['resumen', 'Resumen'],
  ['pagos', 'Pagos mensuales'],
  ['datos', 'Datos'],
  ['cuenta', 'Cuenta'],
] as const;
type Tab = (typeof TABS)[number][0];

// ?hoy=AAAA-MM-DD simula otra fecha para ver cómo se mueve el calendario sin tocar los datos.
const simulada = new URLSearchParams(location.search).get('hoy');
const HOY_SIMULADO = simulada && /^\d{4}-\d{2}-\d{2}$/.test(simulada) ? simulada : null;

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revisar = useCallback(() => {
    api<Sesion>('GET', '/api/sesion').then(setSesion, (e) => setError('No se pudo conectar con el servidor: ' + mensaje(e)));
  }, []);

  useEffect(() => {
    revisar();
    window.addEventListener(SIN_SESION, revisar);
    return () => window.removeEventListener(SIN_SESION, revisar);
  }, [revisar]);

  if (!sesion) {
    return <main>{error ? <p className="banner" role="alert">{error}</p> : <p className="sub">Cargando…</p>}</main>;
  }
  if (!sesion.usuario) return <Acceso configurar={sesion.requiereConfiguracion} onEntrar={setSesion} />;

  const salir = () => api('POST', '/api/salir').finally(revisar);
  // key: al cambiar de usuario se descarta todo el estado del anterior.
  return <Panel key={sesion.usuario.id} usuario={sesion.usuario} onSalir={salir} />;
}

function Panel({ usuario, onSalir }: { usuario: Usuario; onSalir(): void }) {
  const store = useDatos();
  const { estado, error } = store;
  const [tab, setTab] = usePref<Tab>('tab', 'resumen');
  const [excluidos, setExcluidos] = usePref<string[]>(`escenario:${usuario.id}`, []);
  const [edicion, setEdicion] = useState<{ col: Coleccion; item: Item | null; base?: Record<string, unknown> } | null>(null);

  // Escenario: los gastos recortados dejan de contar, pero siguen guardados.
  const datos = useMemo<Datos | null>(() => {
    if (!estado) return null;
    const activos = estado.gastos.filter((g) => g.recortable && excluidos.includes(g.id));
    if (activos.length === 0) return estado;
    return { ...estado, gastos: estado.gastos.filter((g) => !activos.includes(g)) };
  }, [estado, excluidos]);

  if (!estado || !datos) {
    return <main>{error ? <p className="banner" role="alert">{error}</p> : <p className="sub">Cargando…</p>}</main>;
  }

  const mes = (HOY_SIMULADO ?? estado.hoy).slice(0, 7);
  const abrir = (col: Coleccion, item: Item | null, base?: Record<string, unknown>) => setEdicion({ col, item, base });
  const form = edicion && formulario(edicion.col, estado.categorias, mes, (edicion.item as Record<string, unknown> | null) ?? edicion.base ?? null);

  async function guardarEdicion(v: Valores) {
    if (!edicion || !form) return;
    const { col } = edicion;
    const item = form.deForm(v, edicion.item?.id ?? nuevoId());
    setEdicion(null);
    if (item.categoria === NUEVA) {
      // Si ya hay una con ese nombre se reutiliza; si no, se crea antes de guardar el elemento que la usa.
      const tipo = col === 'ingresos' ? 'ingreso' : 'gasto';
      const nombre = String(v.categoriaNueva ?? '').trim();
      const existente = deTipo(estado!.categorias, tipo).find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
      const categoria = existente ?? nuevaCategoria(estado!.categorias, tipo, nombre);
      if (!existente) await store.guardar('categorias', categoria);
      item.categoria = categoria.id;
    }
    store.guardar(col, item);
  }

  return (
    <main>
      <div className="top">
        <h1>Finanzas familiares</h1>
        <button className="ghost" onClick={onSalir}>Salir</button>
      </div>
      <p className="sub">
        {usuario.nombre} · <span className="cap">{mesLargo(mes)}</span>
        {HOY_SIMULADO && <span className="flag">fecha simulada</span>} · Los cambios se guardan solos.
      </p>
      {error && <p className="banner" role="alert">{error}</p>}

      <div className="tabs" role="tablist" aria-label="Secciones">
        {TABS.map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{nombre}</button>
        ))}
      </div>

      {tab === 'resumen' && (
        <Resumen real={estado} datos={datos} mes={mes} excluidos={excluidos} setExcluidos={setExcluidos} store={store} abrir={abrir} />
      )}
      {tab === 'pagos' && <Pagos real={estado} datos={datos} mes={mes} store={store} abrir={abrir} />}
      {tab === 'datos' && <DatosTab real={estado} mes={mes} store={store} abrir={abrir} />}
      {tab === 'cuenta' && <Cuenta usuario={usuario} />}

      {edicion && form && (
        <Dialogo
          form={form}
          item={edicion.item as Record<string, unknown> | null}
          onCerrar={() => setEdicion(null)}
          onGuardar={guardarEdicion}
          onBorrar={
            edicion.item
              ? () => {
                  if (!confirm('¿Borrar este elemento? No se puede deshacer.')) return;
                  store.borrar(edicion.col, edicion.item!.id);
                  setEdicion(null);
                }
              : undefined
          }
        />
      )}
    </main>
  );
}
