import { useState } from 'react';
import type { Sesion } from '../shared/tipos.ts';
import { api, mensaje } from './store.ts';

interface Props {
  configurar: boolean; // primera vez: se crea la cuenta de administrador
  onEntrar(s: Sesion): void;
}

export function Acceso({ configurar, onEntrar }: Props) {
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      onEntrar(await api<Sesion>('POST', configurar ? '/api/configurar' : '/api/entrar', { nombre, clave }));
    } catch (err) {
      setError(mensaje(err));
      setEnviando(false);
    }
  }

  return (
    <main className="acceso">
      <h1>Finanzas familiares</h1>
      <p className="sub">
        {configurar
          ? 'Primera vez: crea la cuenta de administrador. Después podrás agregar a los demás usuarios.'
          : 'Inicia sesión para ver tu información.'}
      </p>
      <section className="panel">
        <form onSubmit={enviar}>
          <div className="field">
            <label htmlFor="a-nombre">Usuario</label>
            <input id="a-nombre" autoComplete="username" autoCapitalize="none" value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={40} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="a-clave">Contraseña</label>
            <input
              id="a-clave" type="password" autoComplete={configurar ? 'new-password' : 'current-password'}
              value={clave} onChange={(e) => setClave(e.target.value)} required minLength={configurar ? 8 : 1} maxLength={200}
            />
            {configurar && <small>Mínimo 8 caracteres.</small>}
          </div>
          {error && <p className="note first neg" role="alert">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={enviando}>{configurar ? 'Crear administrador' : 'Entrar'}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
