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
}

export interface Gasto {
  id: string;
  nombre: string;
  categoria: string;
  monto: number;
  frecuencia: Frecuencia;
  recortable?: boolean;
  nota?: string;
  porDia?: {
    tarifa: number;
    diasSemana: number[]; // 1=lunes ... 5=viernes
  };
}

export interface CompraMSI {
  id: string;
  nombre: string;
  pagoMensual: number;
  plazoTotal: number;
  inicio: Mes; // mes del primer pago
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
