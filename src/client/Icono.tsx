const TRAZOS = {
  resumen: 'M4 19V10m6 9V5m6 14v-7m4 7H2',
  pagos: 'M4 7h16v12H4zM4 11h16M8 15h3',
  datos: 'M4 6h16M4 12h16M4 18h10',
  cuenta: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5',
  salir: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  sol: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 16a4 4 0 100-8 4 4 0 000 8z',
  luna: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  mas: 'M12 5v14M5 12h14',
  marca: 'M4 16l5-6 4 4 7-9M4 20h16',
  entra: 'M12 19V5m-6 6 6-6 6 6',
  sale: 'M12 5v14m-6-6 6 6 6-6',
  meta: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z',
};

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ n, s = 18 }: { n: NombreIcono; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRAZOS[n]} />
    </svg>
  );
}
