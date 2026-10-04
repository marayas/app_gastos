/**
 * Migraciones versionadas: la posición en el arreglo es la versión (PRAGMA user_version).
 * Nunca edites una migración ya aplicada; agrega una nueva al final.
 *
 * Todas las tablas de datos llevan usuario_id en la llave primaria: cada usuario
 * tiene su propia información y los ids pueden repetirse entre usuarios.
 */
export const MIGRACIONES: string[] = [
  `
  CREATE TABLE usuarios (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
    clave TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'usuario')),
    creado TEXT NOT NULL
  );
  CREATE TABLE sesiones (
    token TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira INTEGER NOT NULL
  );
  CREATE TABLE categorias (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    id TEXT NOT NULL, nombre TEXT NOT NULL, color TEXT NOT NULL, orden INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (usuario_id, id)
  );
  CREATE TABLE ingresos (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    id TEXT NOT NULL, nombre TEXT NOT NULL, monto REAL NOT NULL, hasta TEXT,
    PRIMARY KEY (usuario_id, id)
  );
  CREATE TABLE gastos (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    id TEXT NOT NULL, nombre TEXT NOT NULL, categoria TEXT NOT NULL,
    monto REAL NOT NULL, frecuencia TEXT NOT NULL,
    recortable INTEGER NOT NULL DEFAULT 0, nota TEXT, por_dia TEXT,
    PRIMARY KEY (usuario_id, id),
    FOREIGN KEY (usuario_id, categoria) REFERENCES categorias(usuario_id, id)
  );
  CREATE TABLE compras_msi (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    id TEXT NOT NULL, nombre TEXT NOT NULL,
    pago_mensual REAL NOT NULL, plazo_total INTEGER NOT NULL, inicio TEXT NOT NULL,
    PRIMARY KEY (usuario_id, id)
  );
  CREATE TABLE pagos_marcados (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mes TEXT NOT NULL, item_id TEXT NOT NULL,
    PRIMARY KEY (usuario_id, mes, item_id)
  );
  CREATE TABLE ciclos_escolares (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    id TEXT NOT NULL, nombre TEXT NOT NULL, inicio TEXT NOT NULL, fin TEXT NOT NULL,
    PRIMARY KEY (usuario_id, id)
  );
  CREATE TABLE sin_clases (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    id TEXT NOT NULL, desde TEXT NOT NULL, hasta TEXT NOT NULL, motivo TEXT NOT NULL,
    PRIMARY KEY (usuario_id, id)
  );
  `,
  // 2: categorías de ingreso, y mes de inicio para ingresos de una sola vez (bono, aguinaldo).
  `
  ALTER TABLE categorias ADD COLUMN tipo TEXT NOT NULL DEFAULT 'gasto';
  ALTER TABLE ingresos ADD COLUMN categoria TEXT;
  ALTER TABLE ingresos ADD COLUMN desde TEXT;
  INSERT OR IGNORE INTO categorias (usuario_id, id, nombre, color, orden, tipo)
    SELECT u.id, c.column1, c.column2, c.column3, c.column4, 'ingreso'
    FROM usuarios u, (VALUES
      ('sueldo', 'Sueldo', 'c10', 101), ('bono', 'Bono', 'c4', 102), ('aguinaldo', 'Aguinaldo', 'c3', 103),
      ('renta', 'Rentas', 'c6', 104), ('otros-ingresos', 'Otros ingresos', 'c5', 105)) c;
  UPDATE ingresos SET categoria = 'otros-ingresos' WHERE categoria IS NULL;
  `,
  // 3: tokens de acceso de solo lectura para asistentes (API y MCP). Solo se guarda el hash.
  `
  CREATE TABLE tokens_api (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    creado TEXT NOT NULL,
    ultimo_uso TEXT
  );
  `,
  // 4: gastos compartidos (split): solo cuenta la parte del usuario. Se guarda como JSON.
  `
  ALTER TABLE gastos ADD COLUMN split TEXT;
  `,
  // 5: hogar compartido. Un usuario con `hogar` ve y edita los datos de ese otro usuario en lugar de los suyos,
  // y cada ingreso, gasto y compra dice cómo se reparte entre los miembros (JSON; vacío = partes iguales).
  `
  ALTER TABLE usuarios ADD COLUMN hogar TEXT;
  ALTER TABLE ingresos ADD COLUMN reparto TEXT;
  ALTER TABLE gastos ADD COLUMN reparto TEXT;
  ALTER TABLE compras_msi ADD COLUMN reparto TEXT;
  `,
  // 6: gastos que solo se pagan en ciertos meses (uno o varios). Lista de meses en JSON; vacío = todos.
  `
  ALTER TABLE gastos ADD COLUMN meses TEXT;
  `,
];
