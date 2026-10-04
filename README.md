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

La base queda en `data/finanzas.db` (se crea sola la primera vez). Variables: `PORT` (8080), `DB_PATH`, `TZ`, `COOKIE_SECURE`, `TRUST_PROXY`.

## Servidor local con Docker

Cada push a `main` publica la imagen en `ghcr.io/marayas/app_gastos:latest` (workflow [docker.yml](.github/workflows/docker.yml), para amd64 y arm64).

En el servidor, copia [docker-compose.yml](docker-compose.yml) y ejecuta:

```sh
docker compose pull
docker compose up -d
```

Para actualizar, repite los mismos dos comandos. La imagen es pública, así que no hace falta iniciar sesión en GHCR.

Para construir la imagen en el propio servidor en lugar de bajarla: `docker compose up -d --build`.

- Los datos están en el volumen `finanzas-data` (`/data/finanzas.db`).
- `GET /health` sirve para monitoreo.
- **La imagen es pública y el repo no debe llevar datos personales.** A la imagen solo entran `src/server`, `src/shared` y el frontend compilado. La carpeta `respaldo/` (datos reales, documentos privados) no se sube a git ni a la imagen.
- En la red local la app viaja por http, así que las contraseñas y los tokens no van cifrados. Para sacarla de casa, sigue la sección «Exponer la app a internet».

## Usuarios

- **Primera vez:** al abrir la app recién instalada pide crear la cuenta de **administrador**. Hazlo en cuanto la despliegues: quien llegue primero se queda con esa cuenta.
- **Más usuarios:** el administrador los crea en la pestaña **Cuenta** (no hay límite). 
- **Cuentas limpias:** toda cuenta, incluida la del administrador, empieza sin datos: solo trae las categorías. Para cargar datos existentes usa **Datos → Respaldo → Importar JSON**.
- **Categorías:** hay categorías de gasto y de ingreso (Sueldo, Bono, Aguinaldo…). Se crean al capturar, con «+ Nueva categoría…», o en **Datos → Categorías**, donde también se renombran y se borran las que no están en uso.
- **Información separada:** cada usuario solo ve y modifica lo suyo. El administrador crea cuentas, restablece contraseñas y borra usuarios (con toda su información), pero no ve los datos de los demás desde la app.
- Las contraseñas se guardan con hash (scrypt) y las sesiones duran 30 días. Tras 8 intentos fallidos, ese usuario queda bloqueado 15 minutos desde esa dirección.
- Si el administrador olvida su contraseña no hay recuperación desde la interfaz: hay que restaurar un respaldo del volumen o editar la base a mano.

## Conectar un asistente (LLM)

La app incluye un servidor **MCP** de solo lectura en `/mcp`, para que un asistente consulte los datos de un usuario.

1. En la pestaña **Cuenta → Acceso para asistentes**, crea un token. Se muestra una sola vez.
2. Conecta el asistente a `http://TU-SERVIDOR:8080/mcp` mandando el token en la cabecera `Authorization: Bearer fin_…`. Con Claude Code:

   ```sh
   claude mcp add --transport http finanzas http://TU-SERVIDOR:8080/mcp --header "Authorization: Bearer fin_…"
   ```

Herramientas disponibles: `resumen`, `liquidez_proyectada`, `ingresos`, `gastos`, `meses_sin_intereses` y `pagos_del_mes`. Todas devuelven montos ya calculados y aceptan un `mes` opcional (`AAAA-MM`).

- Un token solo ve los datos de su dueño y **no puede modificar nada**.
- Se revoca desde la misma pantalla; cambiar la contraseña revoca todos los tokens del usuario.
- El mismo token sirve para la API de lectura: `GET /api/resumen`, `/api/liquidez`, `/api/estado` y `/api/exportar`.
- La autenticación es por token fijo. Los clientes que solo aceptan conectores con OAuth necesitarían un flujo OAuth que la app todavía no tiene.

## Exponer la app a internet

La app está preparada para vivir detrás de un proxy inverso con HTTPS; **no la publiques por http directo**.

1. **Crea la cuenta de administrador antes de exponerla.** Quien abra primero una instalación nueva se queda con esa cuenta.
2. Pon delante un proxy que termine HTTPS. Con [Caddy](https://caddyserver.com) basta un `Caddyfile` así:

   ```
   finanzas.tudominio.com {
       reverse_proxy localhost:8080
   }
   ```

3. Agrega estas variables al `environment` del compose:

   | Variable | Para qué |
   |---|---|
   | `COOKIE_SECURE: "1"` | La cookie de sesión solo viaja por HTTPS y se activa HSTS. |
   | `TRUST_PROXY: "1"` | El límite de intentos fallidos usa la dirección real del visitante, no la del proxy. |

4. Deja de publicar el puerto 8080 hacia fuera (en el compose, `"127.0.0.1:8080:8080"`), para que solo se entre por el proxy.

Lo que ya hace la app: contraseñas con hash, bloqueo tras intentos fallidos (inicio de sesión y tokens), cookies `HttpOnly` y `SameSite=Strict`, cabeceras de seguridad (CSP, anti-iframe, `nosniff`) y tokens de asistente de solo lectura. Lo que no hace: segundo factor ni recuperación de contraseña. Si solo la vas a usar tú, una alternativa más segura a abrirla es una red privada como Tailscale.

## Respaldo

En la pestaña **Datos**: «Exportar JSON» descarga los datos del usuario que tiene la sesión abierta y «Importar JSON» los restaura (reemplaza solo los de ese usuario). Para respaldar a todos a la vez, copia el volumen de vez en cuando.

## Cómo está organizado

| Carpeta | Contenido |
|---|---|
| `src/shared` | Tipos, cálculos y categorías iniciales. Los usan el servidor, el frontend y las pruebas. |
| `src/server` | API REST con Fastify, usuarios, sesiones y tokens (`auth.ts`), informes calculados (`informes.ts`), servidor MCP (`mcp.ts`), SQLite y migraciones versionadas (`migraciones.ts`: agrega una nueva al final, nunca edites una aplicada). |
| `src/client` | Frontend React. |
| `tests` | Pruebas con Vitest sobre una familia ficticia (`datos-ejemplo.ts`). |

Agrega `?hoy=AAAA-MM-DD` a la URL para simular otra fecha y ver cómo avanzan los MSI y la liquidez sin tocar los datos.
