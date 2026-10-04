# Finanzas familiares

Dashboard de presupuesto familiar (México, MXN): cuánto entra, cuánto se paga (con ahorros y meses sin intereses) y cuánta liquidez queda cada mes. Los datos viven en SQLite en el servidor, así que se ven igual desde cualquier dispositivo de la red local.

## Desarrollo

Requiere Node 24 o superior (usa `node:sqlite` y ejecuta TypeScript directo, sin compilar el servidor).

```sh
npm install
npm run dev        # API en :8080 y frontend con recarga en http://localhost:5173
npm test           # cálculos, calendario escolar y base de datos
npm run typecheck
```

Para probar como en producción: `npm run build && npm start` y abre http://localhost:8080.

La base queda en `data/finanzas.db` (se crea sola la primera vez). Variables: `PORT` (8080), `DB_PATH`, `TZ`, `COOKIE_SECURE`.

## Servidor local con Docker

Cada push a `main` publica la imagen en `ghcr.io/marayas/app_gastos:latest` (workflow [docker.yml](.github/workflows/docker.yml), para amd64 y arm64).

En el servidor, copia [docker-compose.yml](docker-compose.yml) y ejecuta:

```sh
docker compose pull
docker compose up -d
```

Para actualizar, repite los mismos dos comandos. Si el paquete de GHCR es privado, primero inicia sesión en el servidor con un token personal con permiso `read:packages`:

```sh
echo TU_TOKEN | docker login ghcr.io -u marayas --password-stdin
```

Para construir la imagen en el propio servidor en lugar de bajarla: `docker compose up -d --build`.

- Los datos están en el volumen `finanzas-data` (`/data/finanzas.db`).
- `GET /health` sirve para monitoreo.
- **La imagen es pública y el repo no debe llevar datos personales.** A la imagen solo entran `src/server`, `src/shared` y el frontend compilado. La carpeta `respaldo/` (datos reales, documentos privados) no se sube a git ni a la imagen.
- En la red local la app viaja por http, así que las contraseñas no van cifradas. Si la expones fuera de casa, ponla detrás de un proxy inverso con HTTPS y agrega `COOKIE_SECURE: "1"` al `environment` del compose.

## Usuarios

- **Primera vez:** al abrir la app recién instalada pide crear la cuenta de **administrador**. Hazlo en cuanto la despliegues: quien llegue primero se queda con esa cuenta.
- **Más usuarios:** el administrador los crea en la pestaña **Cuenta** (no hay límite). 
- **Cuentas limpias:** toda cuenta, incluida la del administrador, empieza sin datos: solo trae las categorías. Para cargar datos existentes usa **Datos → Respaldo → Importar JSON**.
- **Categorías:** hay categorías de gasto y de ingreso (Sueldo, Bono, Aguinaldo…). Se crean al capturar, con «+ Nueva categoría…», o en **Datos → Categorías**, donde también se renombran y se borran las que no están en uso.
- **Información separada:** cada usuario solo ve y modifica lo suyo. El administrador crea cuentas, restablece contraseñas y borra usuarios (con toda su información), pero no ve los datos de los demás desde la app.
- Las contraseñas se guardan con hash (scrypt) y las sesiones duran 30 días. Tras 8 intentos fallidos, ese usuario queda bloqueado 15 minutos desde esa dirección.
- Si el administrador olvida su contraseña no hay recuperación desde la interfaz: hay que restaurar un respaldo del volumen o editar la base a mano.

## Respaldo

En la pestaña **Datos**: «Exportar JSON» descarga los datos del usuario que tiene la sesión abierta y «Importar JSON» los restaura (reemplaza solo los de ese usuario). Para respaldar a todos a la vez, copia el volumen de vez en cuando.

## Cómo está organizado

| Carpeta | Contenido |
|---|---|
| `src/shared` | Tipos, cálculos y categorías iniciales. Los usan el servidor, el frontend y las pruebas. |
| `src/server` | API REST con Fastify, usuarios y sesiones (`auth.ts`), SQLite y migraciones versionadas (`migraciones.ts`: agrega una nueva al final, nunca edites una aplicada). |
| `src/client` | Frontend React. |
| `tests` | Pruebas con Vitest sobre una familia ficticia (`datos-ejemplo.ts`). |

Agrega `?hoy=AAAA-MM-DD` a la URL para simular otra fecha y ver cómo avanzan los MSI y la liquidez sin tocar los datos.
