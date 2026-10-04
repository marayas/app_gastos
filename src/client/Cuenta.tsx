import { useEffect, useState } from 'react';
import type { Usuario } from '../shared/tipos.ts';
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
      {usuario.rol === 'admin' && <Usuarios />}
    </>
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
