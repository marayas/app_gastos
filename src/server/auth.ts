import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Devuelve "scrypt$sal$hash" en hexadecimal. */
export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString('hex')}$${scryptSync(clave, sal, 32).toString('hex')}`;
}

export function claveCorrecta(clave: string, guardada: string): boolean {
  const [, sal, hash] = guardada.split('$');
  const esperado = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(clave, Buffer.from(sal, 'hex'), esperado.length), esperado);
}

// Se compara contra esto cuando el usuario no existe, para que la respuesta tarde lo mismo.
export const CLAVE_FALSA = hashClave(randomBytes(8).toString('hex'));

export const nuevoToken = () => randomBytes(32).toString('hex');

/** En la base solo se guarda el hash del token: una copia de la base no sirve para entrar. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const PREFIJO_TOKEN = 'fin_';
export const nuevoTokenApi = () => PREFIJO_TOKEN + randomBytes(32).toString('hex');

export function tokenBearer(cabecera: string | undefined): string | null {
  const m = cabecera?.match(/^Bearer (fin_[0-9a-f]{64})$/);
  return m ? m[1] : null;
}

export function cookieSesion(cabecera: string | undefined): string | null {
  const m = cabecera?.match(/(?:^|;\s*)sesion=([0-9a-f]{64})(?:;|$)/);
  return m ? m[1] : null;
}

const MAX_FALLOS = 8;
const BLOQUEO_MS = 15 * 60 * 1000;
const fallos = new Map<string, { n: number; hasta: number }>();

/** Límite de intentos fallidos de inicio de sesión por dirección y usuario. */
export const intentos = {
  bloqueado(clave: string): boolean {
    const f = fallos.get(clave);
    if (f && f.hasta < Date.now()) fallos.delete(clave);
    return (fallos.get(clave)?.n ?? 0) >= MAX_FALLOS;
  },
  fallo(clave: string) {
    const f = fallos.get(clave) ?? { n: 0, hasta: 0 };
    fallos.set(clave, { n: f.n + 1, hasta: Date.now() + BLOQUEO_MS });
  },
  exito: (clave: string) => fallos.delete(clave),
};
