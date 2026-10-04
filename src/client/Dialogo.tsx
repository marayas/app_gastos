import { useEffect, useRef, useState } from 'react';
import { NUEVA, type Campo, type Formulario, type Valores } from './formularios.ts';

const DIAS: [number, string][] = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie']];

interface Props {
  form: Formulario;
  item: Record<string, unknown> | null; // null = nuevo
  onGuardar(v: Valores): void;
  onBorrar?(): void;
  onCerrar(): void;
}

export function Dialogo({ form, item, onGuardar, onBorrar, onCerrar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState<Valores>(() => form.aForm(item));
  const set = (k: string, x: Valores[string]) => setV((a) => ({ ...a, [k]: x }));

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const campo = (c: Campo) => {
    if (c.si && !v[c.si]) return null;
    const id = 'f-' + c.k;
    if (c.tipo === 'check') {
      return (
        <label key={c.k} className="check">
          <input type="checkbox" checked={v[c.k] as boolean} onChange={(e) => set(c.k, e.target.checked)} />
          {c.etiqueta}
        </label>
      );
    }
    if (c.tipo === 'dias') {
      const dias = v[c.k] as number[];
      return (
        <fieldset key={c.k} className="dias">
          <legend>{c.etiqueta}</legend>
          {DIAS.map(([n, nombre]) => (
            <label key={n} className="check">
              <input
                type="checkbox"
                checked={dias.includes(n)}
                onChange={(e) => set(c.k, e.target.checked ? [...dias, n].sort() : dias.filter((d) => d !== n))}
              />
              {nombre}
            </label>
          ))}
        </fieldset>
      );
    }
    const valor = v[c.k] as string;
    let control;
    if (c.tipo === 'select') {
      control = (
        <>
          <select id={id} value={valor} onChange={(e) => set(c.k, e.target.value)} required>
            {c.opciones!.map(([val, txt]) => (
              <option key={val} value={val}>{txt}</option>
            ))}
            {c.crear && <option value={NUEVA}>+ Nueva categoría…</option>}
          </select>
          {c.crear && valor === NUEVA && (
            <input
              type="text" maxLength={200} required autoFocus
              aria-label="Nombre de la nueva categoría" placeholder="Nombre de la nueva categoría"
              value={(v[c.k + 'Nueva'] as string | undefined) ?? ''} onChange={(e) => set(c.k + 'Nueva', e.target.value)}
            />
          )}
        </>
      );
    } else if (c.tipo === 'numero' || c.tipo === 'entero') {
      control = (
        <input
          id={id} type="number" inputMode={c.tipo === 'entero' ? 'numeric' : 'decimal'}
          min={c.tipo === 'entero' ? 1 : 0} step={c.tipo === 'entero' ? 1 : 'any'}
          max={c.maxDe && v[c.maxDe] !== '' ? Number(v[c.maxDe]) : undefined}
          value={valor} onChange={(e) => set(c.k, e.target.value)} required
        />
      );
    } else if (c.tipo === 'mes') {
      // Los navegadores sin selector de mes lo muestran como texto; el patrón valida igual.
      control = (
        <input
          id={id} type="month" pattern="\d{4}-(0[1-9]|1[0-2])" placeholder="AAAA-MM"
          value={valor} onChange={(e) => set(c.k, e.target.value)} required={!c.opcional}
        />
      );
    } else {
      control = (
        <input
          id={id} type={c.tipo === 'fecha' ? 'date' : 'text'} maxLength={200}
          value={valor} onChange={(e) => set(c.k, e.target.value)} required={!c.opcional}
        />
      );
    }
    return (
      <div key={c.k} className="field">
        <label htmlFor={id}>{c.etiqueta}{c.opcional && <span className="opc"> (opcional)</span>}</label>
        {control}
        {c.ayuda && <small>{c.ayuda}</small>}
      </div>
    );
  };

  return (
    <dialog ref={ref} onClose={onCerrar} onClick={(e) => e.target === ref.current && onCerrar()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar(v);
        }}
      >
        <h2>{item ? 'Editar' : 'Agregar'} {form.titulo}</h2>
        {form.campos.map(campo)}
        {form.nota?.(v) && <p className="note first calc" role="status">{form.nota(v)}</p>}
        <div className="actions">
          {onBorrar && (
            <button type="button" className="ghost danger" onClick={onBorrar}>Borrar</button>
          )}
          <span className="grow" />
          <button type="button" className="ghost" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </div>
      </form>
    </dialog>
  );
}
