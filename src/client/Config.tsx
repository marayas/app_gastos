import type { Tema } from '../shared/tipos.ts';

const MODOS: [Tema['modo'], string][] = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']];

/**
 * Temas disponibles; sus colores están en styles.css y aquí solo va la muestra (fondo, tarjeta, acento).
 * `propio` es el modo con que typeUI define el tema: es el que se usa en «automático».
 * Con `fijo`, además, el tema no tiene el modo contrario.
 */
export const PALETAS: { id: string; nombre: string; detalle: string; muestra: [string, string, string]; propio?: 'light' | 'dark'; fijo?: boolean }[] = [
  { id: 'power', nombre: 'Power', detalle: 'Índigo y naranja, el original', muestra: ['#262642', '#323256', '#FF7A2E'] },
  { id: 'skeuo', nombre: 'Skeumorphism', detalle: 'Crema con relieve y botones naranjas con brillo', muestra: ['#F5EDE0', '#EDE5D5', '#E17712'], propio: 'light' },
  { id: 'vintage', nombre: 'Vintage', detalle: 'Windows 98: gris plata, verde azulado y letra pixel', muestra: ['#008080', '#C0C0C0', '#000080'], propio: 'light', fijo: true },
  { id: 'dark', nombre: 'Dark', detalle: 'Negro berenjena, acento malva y títulos con serifa', muestra: ['#13111C', '#26222F', '#8A7596'], propio: 'dark', fijo: true },
  { id: 'forest', nombre: 'Forest', detalle: 'Verde bosque con acento lima', muestra: ['#192A03', '#345401', '#A1DA02'], propio: 'dark' },
];

/** Antes solo se guardaba claro u oscuro en este navegador; quien ya lo eligió lo conserva. */
function modoPrevio(): Tema['modo'] {
  try {
    const m: unknown = JSON.parse(localStorage.getItem('tema') ?? 'null');
    return m === 'light' || m === 'dark' ? m : 'auto';
  } catch {
    return 'auto';
  }
}

export const TEMA_INICIAL: Tema = { paleta: 'power', modo: modoPrevio() };

const paletaDe = (tema: Tema) => PALETAS.find((p) => p.id === tema.paleta) ?? PALETAS[0];

/** Si el tema admite cambiar entre claro y oscuro. */
export const cambiaDeModo = (tema: Tema) => !paletaDe(tema).fijo;

/** El modo que se ve: el elegido, o en automático el propio del tema (en Power, el del dispositivo). */
export function modoVisible(tema: Tema): 'light' | 'dark' {
  const p = paletaDe(tema);
  if (p.propio && (p.fijo || tema.modo === 'auto')) return p.propio;
  if (tema.modo !== 'auto') return tema.modo;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Pone el tema en la página; una paleta que ya no existe cae en la original. */
export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement.dataset;
  const p = paletaDe(tema);
  if (!p.propio && tema.modo === 'auto') delete raiz.theme;
  else raiz.theme = modoVisible(tema);
  if (p.id === 'power') delete raiz.paleta;
  else raiz.paleta = p.id;
}

export function Config({ tema, onTema }: { tema: Tema; onTema(t: Tema): void }) {
  const actual = paletaDe(tema);
  return (
    <section className="panel">
      <h2>Tema</h2>
      <p className="note first">Se guarda en tu cuenta: lo verás igual en cualquier dispositivo donde entres.</p>
      <div className="temas" role="radiogroup" aria-label="Tema">
        {PALETAS.map((p) => (
          <button
            key={p.id} type="button" role="radio" className="tema"
            // Un tema recién elegido abre en su modo propio.
            aria-checked={actual.id === p.id} onClick={() => actual.id !== p.id && onTema({ paleta: p.id, modo: 'auto' })}
          >
            <span className="muestra" style={{ background: p.muestra[0] }}>
              <i style={{ background: p.muestra[1] }} />
              <i style={{ background: p.muestra[2] }} />
            </span>
            <span className="pn">{p.nombre}<small>{p.detalle}</small></span>
          </button>
        ))}
      </div>
      <h3>Claro u oscuro</h3>
      {actual.fijo ? (
        <p className="note">{actual.nombre} solo tiene versión {actual.propio === 'dark' ? 'oscura' : 'clara'}.</p>
      ) : (
        <>
          <div className="seg" role="group" aria-label="Claro u oscuro" style={{ marginTop: 12 }}>
            {MODOS.map(([m, nombre]) => (
              <button key={m} type="button" aria-pressed={tema.modo === m} onClick={() => onTema({ ...tema, modo: m })}>
                {m === 'auto' && actual.propio ? 'Original' : nombre}
              </button>
            ))}
          </div>
          <p className="note">
            {actual.propio
              ? `«Original» es ${actual.nombre} como lo define typeUI (${actual.propio === 'dark' ? 'oscuro' : 'claro'}); el otro modo es una adaptación.`
              : '«Automático» sigue al tema claro u oscuro del dispositivo.'}
            {' '}También puedes cambiarlo con el botón de sol o luna de la barra superior.
          </p>
        </>
      )}
    </section>
  );
}
