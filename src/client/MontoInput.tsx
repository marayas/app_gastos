import { useState } from 'react';
import { entero } from './ui.ts';

interface Props {
  valor: number;
  etiqueta: string;
  onChange(v: number): void;
}

/** Muestra el monto sin decimales; mientras se edita conserva lo que se teclea. */
export function MontoInput({ valor, etiqueta, onChange }: Props) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      type="number" inputMode="decimal" min={0} step="any" aria-label={etiqueta}
      value={texto ?? String(entero(valor))}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n) && n >= 0) onChange(n);
      }}
      onBlur={() => setTexto(null)}
    />
  );
}
