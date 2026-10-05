import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coleccion, Datos, Sesion, Tema, Usuario } from '../shared/tipos.ts';
import { Acceso } from './Acceso.tsx';
import { Config, aplicarTema, cambiaDeModo, modoVisible, TEMA_INICIAL } from './Config.tsx';
import { Cuenta } from './Cuenta.tsx';
import { DatosTab } from './DatosTab.tsx';
import { Dialogo } from './Dialogo.tsx';
import { Icono } from './Icono.tsx';
import { deTipo, formulario, NUEVA, nuevaCategoria, type Valores } from './formularios.ts';
import { Pagos } from './Pagos.tsx';
import { Resumen } from './Resumen.tsx';
import { api, mensaje, SIN_SESION, useDatos, type Item } from './store.ts';
import { mesLargo, nuevoId, usePref } from './ui.ts';

const TABS = [
  ['resumen', 'Resumen', 'Tu dinero, de un vistazo'],
  ['pagos', 'Pagos', 'Pagos del mes'],
  ['datos', 'Datos', 'Tus datos'],
] as const;
// Cuenta y Configuración no van en la navegación: se abren desde el menú del usuario.
const DEL_USUARIO = [
  ['cuenta', 'Cuenta', 'Tu cuenta'],
  ['config', 'Configuración', 'Configuración'],
] as const;
type Tab = (typeof TABS)[number][0] | (typeof DEL_USUARIO)[number][0];

// ?hoy=AAAA-MM-DD simula otra fecha para ver cómo se mueve el calendario sin tocar los datos.
const simulada = new URLSearchParams(location.search).get('hoy');
const HOY_SIMULADO = simulada && /^\d{4}-\d{2}-\d{2}$/.test(simulada) ? simulada : null;

export function App() {
  // El tema vive en la cuenta; la copia de este navegador evita el parpadeo al abrir y viste la pantalla de acceso.
  const [tema, setTema] = usePref<Tema>('apariencia', TEMA_INICIAL);
  useEffect(() => aplicarTema(tema), [tema]);

  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Al entrar manda el tema de la cuenta; quien aún no elige ve el original, no el del usuario anterior en este navegador.
  useEffect(() => {
    if (sesion?.usuario) setTema(sesion.tema ?? TEMA_INICIAL);
  }, [sesion, setTema]);
  const cambiarTema = (t: Tema) => {
    setTema(t);
    api('PUT', '/api/tema', t).catch((e) => setError('No se pudo guardar el tema: ' + mensaje(e)));
  };

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
  return <Panel key={sesion.usuario.id} usuario={sesion.usuario} onSalir={salir} tema={tema} onTema={cambiarTema} />;
}

interface PanelProps {
  usuario: Usuario;
  onSalir(): void;
  tema: Tema;
  onTema(t: Tema): void;
}

function Panel({ usuario, onSalir, tema, onTema }: PanelProps) {
  const store = useDatos();
  const { estado, error } = store;
  const [tab, setTab] = usePref<Tab>('tab', 'resumen');
  const [excluidos, setExcluidos] = usePref<string[]>(`escenario:${usuario.id}`, []);
  const [menu, setMenu] = useState(false);
  const refMenu = useRef<HTMLDivElement>(null);
  // El menú del usuario se cierra al tocar fuera (Safari no da foco a los botones, así que no basta con blur).
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => !refMenu.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menu]);
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
  const form = edicion && formulario(edicion.col, estado.categorias, mes, (edicion.item as Record<string, unknown> | null) ?? edicion.base ?? null, { miembros: estado.miembros ?? [], yo: usuario.id });

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

  const oscuro = modoVisible(tema) === 'dark';
  const titulo = [...TABS, ...DEL_USUARIO].find(([id]) => id === tab)?.[2] ?? '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo"><Icono n="marca" s={16} /></span>Finanzas</div>
        <nav className="nav" role="tablist" aria-label="Secciones">
          {TABS.map(([id, nombre]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              <Icono n={id} />{nombre}
            </button>
          ))}
        </nav>
        <div
          className="user" ref={refMenu}
          onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}
        >
          <button
            className="iconbtn" disabled={!cambiaDeModo(tema)} onClick={() => onTema({ ...tema, modo: oscuro ? 'light' : 'dark' })}
            aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            title={cambiaDeModo(tema) ? undefined : 'Este tema solo tiene un modo'}
          >
            <Icono n={oscuro ? 'sol' : 'luna'} />
          </button>
          <button className="chip" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <span>{usuario.nombre}</span><Icono n="abajo" s={14} />
          </button>
          {menu && (
            <div className="menu" role="menu">
              {DEL_USUARIO.map(([id, nombre]) => (
                <button key={id} role="menuitem" aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setMenu(false); }}>
                  <Icono n={id} />{nombre}
                </button>
              ))}
            </div>
          )}
          <button className="iconbtn" onClick={onSalir} aria-label="Salir"><Icono n="salir" /></button>
        </div>
      </header>

      <main>
      <div className="pagehead">
        <p className="eyebrow">
          {mesLargo(mes)}
          {HOY_SIMULADO && <span className="flag">fecha simulada</span>}
        </p>
        <h1>{tab === 'resumen' ? <>Hola, {usuario.nombre}.</> : titulo}</h1>
      </div>
      {error && <p className="banner" role="alert">{error}</p>}

      {tab === 'resumen' && (
        <Resumen real={estado} datos={datos} mes={mes} excluidos={excluidos} setExcluidos={setExcluidos} store={store} abrir={abrir} />
      )}
      {tab === 'pagos' && <Pagos real={estado} datos={datos} mes={mes} store={store} abrir={abrir} />}
      {tab === 'datos' && <DatosTab real={estado} mes={mes} store={store} abrir={abrir} />}
      {tab === 'cuenta' && <Cuenta usuario={usuario} />}
      {tab === 'config' && <Config tema={tema} onTema={onTema} />}

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
    </div>
  );
}
