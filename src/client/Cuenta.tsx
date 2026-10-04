import { useEffect, useState } from 'react';
import type { TokenApi, Usuario } from '../shared/tipos.ts';
import { api, mensaje } from './store.ts';

type Aviso = { ok: boolean; texto: string } | null;

const Mensaje = ({ aviso }: { aviso: Aviso }) =>
  aviso && <p className={'note first ' + (aviso.ok ? 'ok' : 'neg')} role={aviso.ok ? 'status' : 'alert'}>{aviso.texto}</p>;

export function Cuenta({ usuario }: { usuario: Usuario }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);

  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/api/clave', { actual, nueva });
      setActual('');
      setNueva('');
      setAviso({ ok: true, texto: 'Contraseña cambiada. Las demás sesiones abiertas se cerraron.' });
    } catch (err) {
      setAviso({ ok: false, texto: mensaje(err) });
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Cambiar contraseña</h2>
        <form onSubmit={cambiar}>
          <div className="field">
            <label htmlFor="c-actual">Contraseña actual</label>
            <input id="c-actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="c-nueva">Contraseña nueva</label>
            <input id="c-nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} required minLength={8} maxLength={200} />
            <small>Mínimo 8 caracteres.</small>
          </div>
          <Mensaje aviso={aviso} />
          <div className="actions"><button type="submit" className="primary">Cambiar contraseña</button></div>
        </form>
      </section>
      <Tokens />
      {usuario.rol === 'admin' && <Usuarios />}
    </>
  );
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'nunca';

/** Tokens de solo lectura para conectar un asistente (LLM) por MCP o por la API. */
function Tokens() {
  const [lista, setLista] = useState<TokenApi[]>([]);
  const [nombre, setNombre] = useState('');
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const url = `${location.origin}/mcp`;

  const cargar = () => api<TokenApi[]>('GET', '/api/tokens').then(setLista);
  useEffect(() => {
    cargar().catch((err) => setAviso({ ok: false, texto: mensaje(err) }));
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    try {
      const creado = await api<TokenApi & { token: string }>('POST', '/api/tokens', { nombre });
      setNuevo(creado.token);
      setNombre('');
      setAviso(null);
      await cargar();
    } catch (err) {
      setAviso({ ok: false, texto: mensaje(err) });
    }
  }

  async function revocar(t: TokenApi) {
    if (!confirm(`¿Revocar el token «${t.nombre}»? El asistente que lo use dejará de tener acceso.`)) return;
    try {
      await api('DELETE', `/api/tokens/${t.id}`);
      setNuevo(null);
      await cargar();
    } catch (err) {
      setAviso({ ok: false, texto: mensaje(err) });
    }
  }

  return (
    <section className="panel">
      <h2>Acceso para asistentes (LLM)</h2>
      <p className="note first">
        Un token deja que un asistente consulte <b>tus</b> datos en modo de solo lectura: no puede cambiar nada ni ver a otros usuarios.
        Se conecta por MCP en <code>{url}</code>, mandando el token en la cabecera <code>Authorization: Bearer …</code>.
        Cambiar tu contraseña revoca todos tus tokens.
      </p>
      {lista.map((t) => (
        <div key={t.id} className="lrow">
          <span className="pn">{t.nombre}<small>Creado el {fecha(t.creado)} · último uso: {fecha(t.ultimoUso)}</small></span>
          <button className="ghost danger" onClick={() => revocar(t)}>Revocar</button>
        </div>
      ))}
      {nuevo && (
        <div className="secret" role="status">
          <p className="note first"><b>Copia el token ahora.</b> No se vuelve a mostrar.</p>
          <code>{nuevo}</code>
          <div className="btns">
            <button className="ghost" onClick={() => navigator.clipboard?.writeText(nuevo)}>Copiar token</button>
            <button className="ghost" onClick={() => navigator.clipboard?.writeText(`claude mcp add --transport http finanzas ${url} --header "Authorization: Bearer ${nuevo}"`)}>
              Copiar comando para Claude Code
            </button>
          </div>
        </div>
      )}
      <h3>Crear token</h3>
      <form onSubmit={crear} style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor="t-nombre">Nombre</label>
          <input id="t-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60} placeholder="Claude en mi Mac" autoComplete="off" />
          <small>Para reconocerlo después, por ejemplo el asistente o el dispositivo que lo usa.</small>
        </div>
        <Mensaje aviso={aviso} />
        <div className="actions"><button type="submit" className="primary">Crear token</button></div>
      </form>
    </section>
  );
}

function Usuarios() {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);

  const cargar = () => api<Usuario[]>('GET', '/api/usuarios').then(setLista);
  const hacer = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion();
      await cargar();
      setAviso({ ok: true, texto: exito });
    } catch (err) {
      setAviso({ ok: false, texto: mensaje(err) });
    }
  };

  useEffect(() => {
    cargar().catch((err) => setAviso({ ok: false, texto: mensaje(err) }));
  }, []);

  function crear(e: React.FormEvent) {
    e.preventDefault();
    hacer(async () => {
      await api('POST', '/api/usuarios', { nombre, clave });
      setNombre('');
      setClave('');
    }, `Usuario «${nombre.trim()}» creado. Compártele su contraseña; podrá cambiarla al entrar.`);
  }

  function restablecer(u: Usuario) {
    const nueva = prompt(`Contraseña nueva para ${u.nombre} (mínimo 8 caracteres):`);
    if (nueva) hacer(() => api('POST', `/api/usuarios/${u.id}/clave`, { clave: nueva }), `Contraseña de «${u.nombre}» restablecida; sus sesiones se cerraron.`);
  }

  function borrar(u: Usuario) {
    if (confirm(`¿Borrar a ${u.nombre} y TODA su información? No se puede deshacer.`)) {
      hacer(() => api('DELETE', `/api/usuarios/${u.id}`), `Usuario «${u.nombre}» borrado.`);
    }
  }

  return (
    <section className="panel">
      <h2>Usuarios</h2>
      <p className="note first">
        Cada usuario tiene su propia información y no puede ver la de los demás. Como administrador creas y borras cuentas, pero tampoco ves sus datos.
      </p>
      {lista.map((u) => (
        <div key={u.id} className="lrow">
          <span className="pn">{u.nombre}<small>{u.rol === 'admin' ? 'Administrador' : 'Usuario'}</small></span>
          {u.rol !== 'admin' && (
            <span className="btns">
              <button className="ghost" onClick={() => restablecer(u)}>Restablecer contraseña</button>
              <button className="ghost danger" onClick={() => borrar(u)}>Borrar</button>
            </span>
          )}
        </div>
      ))}
      <h3>Agregar usuario</h3>
      <form onSubmit={crear} style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor="u-nombre">Usuario</label>
          <input id="u-nombre" autoComplete="off" autoCapitalize="none" value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="u-clave">Contraseña inicial</label>
          <input id="u-clave" type="text" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} required minLength={8} maxLength={200} />
          <small>Mínimo 8 caracteres. La cuenta empieza limpia, sin datos cargados.</small>
        </div>
        <Mensaje aviso={aviso} />
        <div className="actions"><button type="submit" className="primary">Agregar usuario</button></div>
      </form>
    </section>
  );
}
