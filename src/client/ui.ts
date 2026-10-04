import { useCallback, useState } from 'react';
import type { Categoria, Mes, Persona, Reparto, Split } from '../shared/tipos.ts';

/** Redondeo solo al mostrar: hacia arriba, sin decimales. */
export function fmt(v: number): string {
  const n = Math.ceil(v - 1e-6);
  return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('es-MX');
}

export const entero = (v: number) => Math.ceil(v - 1e-6);

export const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0) + '%';

const fechaDeMes = (m: Mes) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1);
};

export const mesLargo = (m: Mes) => fechaDeMes(m).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
export const mesCorto = (m: Mes) => fechaDeMes(m).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });

export function fechaLarga(f: string): string {
  const [y, mo, d] = f.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "tu parte: 50% · entre 2 personas" */
export function textoSplit(s: Split): string {
  const parte = s.tipo === 'iguales' ? 'partes iguales' : s.tipo === 'pct' ? `${s.valor ?? 0}%` : fmt(s.valor ?? 0);
  return `tu parte: ${parte} · entre ${s.personas} personas`;
}

/** "solo Ana" o "Marco 70%, el resto Ana"; null si el reparto no aplica (hogar de una persona o miembro que ya no está). */
export function textoReparto(r: Reparto | undefined, miembros: Persona[] = []): string | null {
  const quien = miembros.find((m) => m.id === r?.de);
  if (!r || !quien || miembros.length < 2) return null;
  if (r.tipo === 'solo') return `solo ${quien.nombre}`;
  const otros = miembros.filter((m) => m !== quien).map((m) => m.nombre).join(' y ');
  return `${quien.nombre} ${r.tipo === 'pct' ? r.valor + '%' : fmt(r.valor)}, el resto ${otros}`;
}

export const COLOR_MSI = 'var(--c11)';
export const colorDe = (c?: Categoria) => (!c ? 'var(--mute)' : /^c\d+$/.test(c.color) ? `var(--${c.color})` : c.color);

// crypto.randomUUID no existe en http fuera de localhost, y la app se usa por IP en la red local.
export const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Preferencia de interfaz guardada en este navegador. */
export function usePref<T>(clave: string, inicial: T): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const s = localStorage.getItem(clave);
      return s === null ? inicial : (JSON.parse(s) as T);
    } catch {
      return inicial;
    }
  });
  const guardar = useCallback(
    (v: T) => {
      setValor(v);
      try {
        localStorage.setItem(clave, JSON.stringify(v));
      } catch {
        // sin almacenamiento disponible: la preferencia dura lo que la sesión
      }
    },
    [clave],
  );
  return [valor, guardar];
}
