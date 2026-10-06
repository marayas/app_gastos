import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coleccion, Estado, Mes } from '../shared/tipos.ts';

export interface Item {
  id: string;
}

export const SIN_SESION = 'sin-sesion';

export async function api<T = unknown>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const res = await fetch(ruta, {
    method: metodo,
    headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!res.ok) {
    // La sesión venció o se cerró desde otro lado: la app vuelve a la pantalla de acceso.
    if (res.status === 401 && ruta !== '/api/entrar') window.dispatchEvent(new Event(SIN_SESION));
    const detalle = await res.json().catch(() => null);
    throw new Error(detalle?.message ?? `Error ${res.status}`);
  }
  return res.json();
}

export const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type Store = ReturnType<typeof useDatos>;

/** Estado del servidor con cambios optimistas: la pantalla se actualiza al instante y luego se guarda. */
export function useDatos() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actual = useRef(estado);
  actual.current = estado;
  const diferidos = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const cargar = useCallback(async () => {
    setEstado(await api<Estado>('GET', '/api/estado'));
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError('No se pudieron cargar los datos: ' + mensaje(e)));
  }, [cargar]);

  const enviar = useCallback(
    async (peticion: () => Promise<unknown>) => {
      try {
        await peticion();
        setError(null);
      } catch (e) {
        await cargar().catch(() => {});
        setError('No se pudo guardar: ' + mensaje(e));
      }
    },
    [cargar],
  );

  /** Con `diferido`, espera a que se deje de teclear antes de guardar. */
  const guardar = useCallback(
    <T extends Item>(col: Coleccion, item: T, diferido = false) => {
      const existe = (actual.current?.[col] as Item[] | undefined)?.some((x) => x.id === item.id) ?? false;
      setEstado((d) => {
        if (!d) return d;
        const lista = (d[col] ?? []) as Item[];
        return { ...d, [col]: existe ? lista.map((x) => (x.id === item.id ? item : x)) : [...lista, item] };
      });
      const peticion = () => (existe ? api('PUT', `/api/${col}/${item.id}`, item) : api('POST', `/api/${col}`, item));
      const clave = `${col}:${item.id}`;
      clearTimeout(diferidos.current.get(clave));
      if (!diferido) return enviar(peticion);
      diferidos.current.set(clave, setTimeout(() => enviar(peticion), 500));
    },
    [enviar],
  );

  const borrar = useCallback(
    (col: Coleccion, id: string) => {
      clearTimeout(diferidos.current.get(`${col}:${id}`));
      setEstado((d) => d && { ...d, [col]: ((d[col] ?? []) as Item[]).filter((x) => x.id !== id) });
      enviar(() => api('DELETE', `/api/${col}/${id}`));
    },
    [enviar],
  );

  const marcar = useCallback(
    (mes: Mes, itemId: string, pagado: boolean) => {
      setEstado((d) => {
        if (!d) return d;
        const resto = d.pagos.filter((p) => !(p.mes === mes && p.itemId === itemId));
        return { ...d, pagos: pagado ? [...resto, { mes, itemId }] : resto };
      });
      enviar(() => api('POST', '/api/pagos', { mes, itemId, pagado }));
    },
    [enviar],
  );

  const reiniciarMes = useCallback(
    (mes: Mes) => {
      setEstado((d) => d && { ...d, pagos: d.pagos.filter((p) => p.mes !== mes) });
      enviar(() => api('DELETE', `/api/pagos/${mes}`));
    },
    [enviar],
  );

  const importar = useCallback(
    async (datos: unknown) => {
      try {
        await api('POST', '/api/importar', datos);
        await cargar();
        setError(null);
      } catch (e) {
        setError('No se pudo importar: ' + mensaje(e));
      }
    },
    [cargar],
  );

  return { estado, error, guardar, borrar, marcar, reiniciarMes, importar };
}
