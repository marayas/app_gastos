# Finanzas familiares

Dashboard de presupuesto familiar (México, MXN): cuánto entra, cuánto se paga (con ahorros y meses sin intereses) y cuánta liquidez queda cada mes. Los datos viven en SQLite en el servidor, así que se ven igual desde cualquier dispositivo de la red local.

## Qué hace

- **Resumen:** ingresos, egresos y sobrante del mes o de los próximos 12 meses, con el desglose por categoría y el detalle de cada concepto.
- **Liquidez por mes:** una gráfica con lo que queda libre cada mes. Al tocar un mes se despliega su detalle: ingresos, gastos fijos, meses sin intereses y liquidez.
- **Pagos:** la lista de lo que hay que pagar en el mes, para irlo marcando, y el avance de las compras a meses sin intereses.
- **Regla 50/20/30:** cada categoría de gasto dice si sus gastos son básicos, lujos o ahorro (se elige al crearla o en Datos → Categorías), y a un gasto en particular se le puede poner otro tipo en la tabla de Detalle. Las compras a MSI son básico o lujo según lo comprado. El Resumen compara qué parte del ingreso fijo se va a cada grupo contra la guía: hasta 50 % en básicos, hasta 20 % en lujos y al menos 30 % en ahorro. Al tocar un grupo se ve qué incluye.
- **Endeudamiento:** es una medida aparte, no un cuarto grupo: qué parte del ingreso fijo son pagos de deuda (las compras a MSI y los gastos marcados como deuda, que ya cuentan en su grupo), contra un tope de 30 %. El Resumen dice cuánta mensualidad más cabe y el formulario de MSI avisa si una compra rebasa el tope.
- **Inversiones:** se captura lo invertido, la tasa anual y si el interés se calcula cada día, cada mes o una vez al año; la app estima lo que rinde al mes. Si el rendimiento se reinvierte, el saldo crece solo mes a mes y se corrige a mano cuando no coincide; si lo retiras, se suma a tus ingresos. El Resumen muestra el total compartido y el personal. Una inversión puede ser compartida o privada: la privada solo la ve quien la capturó, aunque comparta su hogar.
- **Gastos de ciertos meses:** al capturar un gasto puedes marcar «Solo se paga en ciertos meses» y elegir cuáles, entre los próximos 12: uno solo para un gasto único, o varios aunque no sean seguidos. El monto cuenta completo en cada mes elegido y nada en los demás. En Pagos sale aparte el mes que toca, y deja de listarse cuando ya pasó su último mes.
- **Temas:** en el menú del usuario → Configuración se elige el tema de la interfaz: Power (el original) o Skeumorphism, Vintage, Dark y Forest, tomados de los design skills de typeUI. El botón de sol/luna de la barra cambia entre claro y oscuro en los temas que tienen los dos modos (Vintage solo es claro y Dark solo oscuro). Se guarda en la cuenta de cada usuario, así que lo sigue a cualquier dispositivo y no cambia el de los demás.
- **Escenarios:** un gasto marcado como «recortable» se puede quitar de las cuentas sin borrarlo, para ver cómo cambia el sobrante.
- **Reparto del hogar:** cuando dos o más personas comparten el hogar (ver «Usuarios»), cada ingreso dice de quién es y cada gasto o compra a MSI quién lo paga. Por defecto va en partes iguales; se puede poner «solo» una persona, o que una ponga un porcentaje o una cantidad y el resto los demás. El Resumen muestra por persona lo que gana, lo que le toca aportar y lo que le queda.
- **Split:** un gasto que se comparte con gente de fuera del hogar (por ejemplo, una renta entre tres) se captura por el total, diciendo entre cuántas personas se divide y qué parte toca: partes iguales, una cantidad o un porcentaje. En las cuentas solo entra esa parte.

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
- **Más usuarios:** el administrador los crea en el menú del usuario → **Cuenta** (no hay límite). 
- **Cuentas limpias:** toda cuenta, incluida la del administrador, empieza sin datos: solo trae las categorías. Para cargar datos existentes usa **Datos → Respaldo → Importar JSON**.
- **Categorías:** hay categorías de gasto y de ingreso (Sueldo, Bono, Aguinaldo…). Se crean al capturar, con «+ Nueva categoría…», o en **Datos → Categorías**, donde también se renombran y se borran las que no están en uso.
- **Información separada:** cada usuario solo ve y modifica lo suyo, salvo que comparta el hogar del administrador (siguiente punto). El administrador crea cuentas, restablece contraseñas y borra usuarios (con toda su información), pero no ve los datos de quienes no comparten su hogar.
- **Hogar compartido:** al crear un usuario, el administrador puede marcar «Comparte mi hogar». Ese usuario entra con su propia cuenta, pero ve y edita los mismos datos que el administrador, incluidos los gastos personales de cada quien. También se puede agregar o sacar del hogar a un usuario que ya existe, desde la lista de usuarios; al sacarlo vuelve a su propia información, que se conserva aparte.
- Las contraseñas se guardan con hash (scrypt) y las sesiones duran 30 días. Tras 8 intentos fallidos, ese usuario queda bloqueado 15 minutos desde esa dirección.
- Si el administrador olvida su contraseña no hay recuperación desde la interfaz: hay que restaurar un respaldo del volumen o editar la base a mano.

## Conectar un asistente (LLM)

La app incluye un servidor **MCP** de solo lectura en `/mcp`, para que un asistente consulte los datos de un usuario (o los de su hogar, si lo comparte).

1. En el menú del usuario → **Cuenta → Acceso para asistentes**, crea un token. Se muestra una sola vez.
2. Conecta el asistente a `http://TU-SERVIDOR:8080/mcp` mandando el token en la cabecera `Authorization: Bearer fin_…`. Con Claude Code:

   ```sh
   claude mcp add --transport http finanzas http://TU-SERVIDOR:8080/mcp --header "Authorization: Bearer fin_…"
   ```

Herramientas disponibles: `resumen`, `liquidez_proyectada`, `ingresos`, `gastos`, `meses_sin_intereses` y `pagos_del_mes`. Todas devuelven montos ya calculados y aceptan un `mes` opcional (`AAAA-MM`).

- Un token solo ve los datos de su dueño, o los del hogar que comparte, y **no puede modificar nada**. Con varias personas en el hogar, `resumen` incluye lo que le toca a cada una y `gastos` cuánto paga cada quien.
- En `gastos`, el campo `soloEnMeses` trae los meses de un gasto que no se repite cada mes; fuera de ellos su costo es 0.
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

En la pestaña **Datos**: «Exportar JSON» descarga los datos del usuario que tiene la sesión abierta y «Importar JSON» los restaura (reemplaza solo los de ese usuario). Quien comparte un hogar exporta e importa los datos del hogar, así que al importar los reemplaza para todos sus miembros. Para respaldar a todos a la vez, copia el volumen de vez en cuando.

## Cómo está organizado

| Carpeta | Contenido |
|---|---|
| `src/shared` | Tipos, cálculos y categorías iniciales. Los usan el servidor, el frontend y las pruebas. |
| `src/server` | API REST con Fastify, usuarios, sesiones y tokens (`auth.ts`), informes calculados (`informes.ts`), servidor MCP (`mcp.ts`), SQLite y migraciones versionadas (`migraciones.ts`: agrega una nueva al final, nunca edites una aplicada). |
| `src/client` | Frontend React. |
| `tests` | Pruebas con Vitest sobre una familia ficticia (`datos-ejemplo.ts`). |

Agrega `?hoy=AAAA-MM-DD` a la URL para simular otra fecha y ver cómo avanzan los MSI y la liquidez sin tocar los datos.
