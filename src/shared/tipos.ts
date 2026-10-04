export type Frecuencia = 'mes' | 'bimestre' | 'anio';

/** Mes en formato "YYYY-MM". */
export type Mes = string;

export type TipoCategoria = 'gasto' | 'ingreso';

export interface Categoria {
  id: string;
  nombre: string;
  tipo: TipoCategoria;
  color: string; // token "c1".."c10" (cambia con el tema) o un color CSS
  orden: number;
}

export interface Ingreso {
  id: string;
  nombre: string;
  categoria?: string; // id de una categoría de tipo "ingreso"
  monto: number; // por mes
  desde?: Mes; // primer mes con ingreso; vacío = desde siempre
  hasta?: Mes; // último mes con ingreso; vacío = indefinido. desde = hasta para un ingreso de una sola vez
  reparto?: Reparto; // de quién es
}

/** Usuario que comparte el hogar: todos sus miembros ven y editan los mismos datos. */
export interface Persona {
  id: string;
  nombre: string;
}

/**
 * Cómo se reparte un monto entre los miembros del hogar. Sin reparto = partes iguales.
 * "solo": todo es de `de`. "pct"/"monto": `de` pone ese porcentaje o esa cantidad
 * (en la unidad del elemento: su frecuencia, o por mes) y el resto se divide entre los demás.
 */
export type Reparto = { tipo: 'solo'; de: string } | { tipo: 'pct' | 'monto'; de: string; valor: number };

/** Gasto compartido con gente de fuera del hogar: de `monto` solo cuenta la parte del hogar. */
export interface Split {
  personas: number; // entre cuántas personas se divide, contando al usuario
  tipo: 'iguales' | 'monto' | 'pct';
  valor?: number; // la parte del usuario: cantidad (en la frecuencia del gasto) o porcentaje; no aplica en "iguales"
}

export interface Gasto {
  id: string;
  nombre: string;
  categoria: string;
  monto: number;
  frecuencia: Frecuencia;
  meses?: Mes[]; // solo se paga en esos meses, completo cada vez; vacío = todos los meses
  recortable?: boolean;
  nota?: string;
  porDia?: {
    tarifa: number;
    diasSemana: number[]; // 1=lunes ... 5=viernes
  };
  split?: Split;
  reparto?: Reparto;
}

export interface CompraMSI {
  id: string;
  nombre: string;
  pagoMensual: number;
  plazoTotal: number;
  inicio: Mes; // mes del primer pago
  reparto?: Reparto;
}

export interface PagoMarcado {
  mes: Mes;
  itemId: string; // Gasto.id o CompraMSI.id
}

export interface CicloEscolar {
  id: string;
  nombre: string;
  inicio: string; // "YYYY-MM-DD"
  fin: string;
}

/** Día o periodo sin clases; un solo día tiene desde = hasta. */
export interface SinClases {
  id: string;
  desde: string; // "YYYY-MM-DD"
  hasta: string;
  motivo: string;
}

export interface Datos {
  categorias: Categoria[];
  ingresos: Ingreso[];
  gastos: Gasto[];
  msi: CompraMSI[];
  pagos: PagoMarcado[];
  ciclos: CicloEscolar[];
  sinClases: SinClases[];
  miembros?: Persona[]; // quienes comparten estos datos, el dueño primero; no va en los respaldos
}

export interface Estado extends Datos {
  hoy: string; // fecha del servidor, "YYYY-MM-DD"
}

export type Coleccion = 'categorias' | 'ingresos' | 'gastos' | 'msi' | 'ciclos' | 'sinClases';

export type Rol = 'admin' | 'usuario';

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
  hogar?: string | null; // id del usuario cuyos datos comparte; vacío = los suyos
}

export interface Sesion {
  usuario: Usuario | null;
  requiereConfiguracion: boolean; // aún no existe ningún usuario
}

/** Token de acceso de solo lectura para un asistente (API y MCP). */
export interface TokenApi {
  id: string;
  nombre: string;
  creado: string;
  ultimoUso: string | null;
}
