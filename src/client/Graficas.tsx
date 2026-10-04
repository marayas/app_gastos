import type { FilaLiquidez } from '../shared/calc.ts';
import { fmt, mesCorto, mesLargo, pct } from './ui.ts';

export interface Parte {
  id: string;
  nombre: string;
  color: string;
  total: number;
}

interface RankingProps {
  partes: Parte[];
  base: number; // el 100 % de la barra (el ingreso del periodo)
  tono: 'in' | 'out';
  sobrante?: { nombre: string; total: number };
}

/**
 * Lista ordenada con una barra de un solo tono por renglón: el largo es la parte del ingreso.
 * El punto de color solo identifica la categoría junto a su nombre; no codifica nada por sí solo.
 */
export function Ranking({ partes, base, tono, sobrante }: RankingProps) {
  const ancho = (v: number) => `${Math.min(Math.max((v / (base || 1)) * 100, 0), 100)}%`;
  return (
    <ul className="rank">
      {partes.map((p) => (
        <li key={p.id} className={p.total === 0 ? 'cero' : ''}>
          <span className="nm"><span className="dot" style={{ background: p.color }} />{p.nombre}</span>
          <span className="pct">{pct(p.total, base)}</span>
          <span className="amt">{fmt(p.total)}</span>
          <span className="track"><i className={'grow ' + tono} style={{ width: ancho(p.total) }} /></span>
        </li>
      ))}
      {sobrante && (
        <li className="resto">
          <span className="nm"><span className="dot free" />{sobrante.nombre}</span>
          <span className="pct">{pct(Math.max(sobrante.total, 0), base)}</span>
          <span className="amt">{fmt(sobrante.total)}</span>
          <span className="track"><i className="grow free" style={{ width: ancho(sobrante.total) }} /></span>
        </li>
      )}
    </ul>
  );
}

/** Columnas de liquidez por mes. Los valores exactos están en el tooltip y en la tabla de Pagos. */
export function Columnas({ filas, grande }: { filas: FilaLiquidez[]; grande?: boolean }) {
  const max = Math.max(...filas.map((f) => Math.abs(f.liquidez)), 1);
  return (
    <div className={'spark' + (grande ? ' big' : '')} role="img" aria-label="Liquidez proyectada por mes">
      {filas.map((f, i) => (
        <div
          key={f.mes} className={'col' + (f.liquidez < 0 ? ' neg' : '')} tabIndex={0}
          data-tip={`${mesLargo(f.mes)}: ${fmt(f.liquidez)}`}
        >
          <i className="rise" style={{ height: `${Math.max((Math.abs(f.liquidez) / max) * 100, 3)}%`, animationDelay: `${i * 35}ms` }} />
          <span>{mesCorto(f.mes).slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

/** Anillo de avance con el porcentaje al centro. */
export function Anillo({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const r = 52;
  const largo = 2 * Math.PI * r;
  const v = Math.min(Math.max(valor, 0), 1);
  return (
    <div className="ring" role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={r} className="ring-track" />
        <circle cx="64" cy="64" r={r} className="ring-fill" strokeDasharray={largo} strokeDashoffset={largo * (1 - v)} />
      </svg>
      <b>{Math.round(v * 100)}%</b>
    </div>
  );
}
