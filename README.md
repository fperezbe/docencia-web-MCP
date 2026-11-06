# DocenciaWeb MCP (multi-cuenta)

Servidor MCP para extraer listas de alumnos y justificaciones de DocenciaWeb FEN,
con el mismo scraper del extractor original, pero como servicio multi-usuario:

- **Login de la app con Better Auth** (email + contraseña, cookies o Bearer token).
- **Cada usuario conecta su propia cuenta de DocenciaWeb** (usuario + clave de la
  plataforma, validadas al momento y guardadas **cifradas con AES-256-GCM** en PostgreSQL).
- **Drizzle ORM + PostgreSQL** para persistencia, **Express** como servidor HTTP.
- **MCP Streamable HTTP** en `POST /mcp` (modo sin estado) + API REST equivalente.
- **API keys** revocables y limitables por curso y periodo para integraciones
  (Google Apps Script, planillas, etc.) y **API JSON** en `/api/v1`; se administran
  desde `/api-keys` con solo iniciar sesión.

## Arquitectura

```
Cliente MCP / navegador
        │  cookie de sesión o Authorization: Bearer <token> (Better Auth)
        ▼
Express ── /api/auth/* ──▶ Better Auth (login app, tabla user/session/account)
        ── /api/docencia/* ─▶ REST autenticada (connect, cursos, extraer csv, ...)
        ── POST /mcp ──▶ McpServer por petición (userId en closure)
                                │  credenciales descifradas solo en memoria
                                ▼
                         DocenciaWeb FEN (scraper: login, DetalleCurso, Excel)
PostgreSQL: user, session, account, verification + docencia_connection (1 fila por usuario)
```

Las contraseñas de DocenciaWeb nunca se guardan en claro ni se registran en logs.

## Requisitos

- Node.js 20+ y PostgreSQL 14+ corriendo localmente (o donde prefieras).

## Puesta en marcha

```bash
npm install
cp .env.example .env   # en Windows: copy .env.example .env
```

Completa `.env`:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL, ej. `postgresql://postgres:postgres@localhost:5432/docenciaweb` |
| `BETTER_AUTH_SECRET` | Secreto largo aleatorio para sesiones |
| `BETTER_AUTH_URL` | URL pública del servidor, ej. `http://localhost:3000` |
| `FRONTEND_URL` | Origen del frontend para CORS (si no hay, da igual) |
| `ENCRYPTION_KEY` | 64 hex para cifrar claves (`npm run gen:key` para generar una) |
| `PORT` / `HOST` | Puerto e interfaz (por defecto `3000` / `127.0.0.1`) |

```bash
# Crear la base y las tablas (elige una vía):
createdb docenciaweb
psql "$DATABASE_URL" -f drizzle/0001_init.sql
# o bien:
npm run db:push

npm run dev   # desarrollo (tsx watch)
# npm run build && npm start   # producción
```

Si actualizas una instalación existente, aplica también las migraciones nuevas:
`drizzle/0002_oauth.sql` (OAuth), `drizzle/0003_api_keys.sql` (API keys),
`drizzle/0004_api_key_cursos.sql` (scoping por curso) y
`drizzle/0005_api_key_periodos.sql` (scoping por periodo), o usa `npm run db:push`.

## Login de la app (Better Auth)

```bash
# Registro
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"Profe","email":"profe@ejemplo.cl","password":"clave-segura-123"}'

# Inicio de sesión (el Bearer token viene en el header `set-auth-token`)
curl -i -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"profe@ejemplo.cl","password":"clave-segura-123"}'
```

Guarda el valor de `set-auth-token`: es el `Bearer` para la API y el MCP.
Con navegador, la cookie de sesión basta (ver `GET /api/me` para comprobar).

## Conectar la cuenta de DocenciaWeb (por usuario)

Cada usuario de la app conecta su propia cuenta de la plataforma una vez:

```bash
curl -X POST http://localhost:3000/api/docencia/connect \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"usuario":"MI_USUARIO","clave":"MI_CLAVE"}'
```

El servidor valida las credenciales contra DocenciaWeb antes de guardarlas cifradas.

## Herramientas MCP (`POST /mcp`, header `Authorization: Bearer $TOKEN`)

| Herramienta | Descripción |
|---|---|
| `docencia_estado` | Indica si ya iniciaste sesión en el navegador |
| `docencia_mis_cursos` | Lista cursos visibles (código, sección, periodo) |
| `docencia_lista_alumnos` | Lista de alumnos en CSV (`curso`, `periodo`, `secciones`) |
| `docencia_justificaciones` | Justificaciones en CSV (mismos parámetros) |
| `docencia_desconectar` | Borra las credenciales guardadas |

> **Seguridad:** ninguna herramienta pide ni recibe tu clave de DocenciaWeb. Se ingresa
> una sola vez en el navegador (`/sign-in`) y queda cifrada. Si falta conexión, las
> herramientas responden con el enlace de login en vez de pedir la clave por chat.
> (`POST /api/docencia/connect` sigue existiendo solo para uso programático propio,
> nunca a través del chat.)

Configuración de ejemplo para el cliente en `mcp.example.json`.

## API REST (misma funcionalidad, con `Authorization: Bearer` o cookie)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/acceso` | Login único con usuario+clave de DocenciaWeb (crea usuario, guarda conexión, devuelve clave temporal para el sign-in) |
| `POST` | `/api/docencia/connect` | Guarda la conexión (`usuario`, `clave`) |
| `GET` | `/api/docencia/estado` | Estado de la conexión |
| `GET` | `/api/docencia/cursos` | Cursos visibles |
| `POST` | `/api/docencia/extraer` | Descarga el `.csv` (`curso`, `periodo`, `tipo`, `secciones`) |
| `DELETE` | `/api/docencia/conexion` | Borra la conexión |
| `GET` | `/api/me` / `/health` | Sesión actual / salud |

## Integración con Google Apps Script (API key)

Para planillas o scripts que corren solos (sin navegador) **no conviene guardar una
contraseña**. La opción recomendada es una **API key personal**, que:

- Es un token largo y aleatorio, no tu clave de DocenciaWeb ni la de la app.
- Se puede **revocar** o hacer expirar sin cambiar ninguna contraseña.
- Solo permite **leer** cursos, alumnos y justificaciones de tu propia conexión;
  no puede conectar/desconectar DocenciaWeb ni crear otras keys.
- Se guarda en el servidor solo como hash SHA-256.

> Una contraseña de la app en Apps Script sería peor: hay que almacenarla en claro,
> las sesiones expiran (habría que re-loguear) y una fuga compromete toda la cuenta.
> La API key es equivalente a "otras credenciales", pero acotada y revocable.

### 1. Crear la key

**Desde el navegador (recomendado):** abre `https://TU-APP/api-keys`, inicia sesión
con tu usuario y clave de DocenciaWeb y usa el formulario. Ahí mismo puedes ver tus
keys, copiar la nueva (se muestra una sola vez) y revocarlas. En **Cursos permitidos**
puedes escribir, por ejemplo, `ENMES2505`; en **Periodos permitidos**, `20262`. Si
dejas ambos vacíos, la key puede leer todos tus cursos y periodos. Las restricciones
se combinan: `ENMES2505` + `20262` solo permite ese curso en ese periodo.

**Por API (para automatizar):** necesitas una sesión de la app (cookie o Bearer de
`/api/auth/sign-in/email`):

```bash
curl -X POST https://TU-APP/api/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Planilla ENMES2505 2026-2","expiraEnDias":180,"cursos":["ENMES2505"],"periodos":["20262"]}'
```

La respuesta incluye `clave` (empieza con `dwmcp_`). **Se muestra una sola vez**;
guárdala en las Script Properties de Apps Script, no en el código ni en celdas.

```bash
# Listar (sin mostrar la clave) y revocar
curl https://TU-APP/api/keys -H "Authorization: Bearer $TOKEN"
curl -X DELETE https://TU-APP/api/keys/<ID> -H "Authorization: Bearer $TOKEN"
```

> Migración: aplica `drizzle/0003_api_keys.sql`, `drizzle/0004_api_key_cursos.sql`
> y `drizzle/0005_api_key_periodos.sql` (o `npm run db:push`) antes de usar estos
> endpoints.

### 2. Endpoints JSON (`/api/v1`)

Autenticación: `Authorization: Bearer dwmcp_...` o `X-API-Key: dwmcp_...`.
No se acepta la clave por query string (las URLs quedan en logs).

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/estado` | Si la cuenta de DocenciaWeb está conectada |
| `GET` | `/api/v1/cursos` | Cursos visibles (código, sección, periodo) |
| `GET`/`POST` | `/api/v1/alumnos` | Alumnos en JSON (`curso`, `periodo`, `secciones`) |
| `GET`/`POST` | `/api/v1/justificaciones` | Justificaciones en JSON (mismos parámetros) |

Si la key tiene `cursosPermitidos` o `periodosPermitidos`, `/api/v1/cursos` devuelve
solo las combinaciones permitidas y una extracción de otro curso/periodo responde
`403`. Sin esas listas, la key puede leer todos los cursos y periodos del usuario.

`GET` acepta query string; `POST` acepta JSON:

```bash
curl "https://TU-APP/api/v1/alumnos?curso=EC2106&periodo=20262&secciones=1,2" \
  -H "Authorization: Bearer dwmcp_..."

curl -X POST https://TU-APP/api/v1/justificaciones \
  -H "Authorization: Bearer dwmcp_..." -H 'Content-Type: application/json' \
  -d '{"curso":"EC2106","periodo":"20262","secciones":["1","2"]}'
```

Respuesta de alumnos (las justificaciones usan `tipo`, `desde`, `hasta`,
`observaciones`):

```json
{
  "ok": true,
  "curso": "EC2106",
  "periodo": "20262",
  "secciones": ["01", "02"],
  "total": 2,
  "filas": [
    { "seccion": "01", "rut": "12.345.678-9", "codigoAlumno": "2024001",
      "nombre": "Ana Pérez", "repitencias": "", "carrera": "Ingeniería Comercial" }
  ]
}
```

### 3. Pegar el script en Apps Script

El archivo listo para copiar está en [`apps-script/Code.gs`](apps-script/Code.gs).
Crea una planilla, abre **Extensiones → Apps Script**, pega el contenido y:

1. Edita `CONFIG_URL` y `CONFIG_API_KEY` al inicio del script y ejecuta `configurar`
   una vez desde el editor. (La key queda en las propiedades privadas del script;
   después puedes borrarla del código.)
2. Recarga la planilla: aparece el menú **DocenciaWeb**. Usa **Probar conexión**
   para verificar que la API key y la conexión de DocenciaWeb funcionan.
3. Importa alumnos/justificaciones desde el menú o, para programarlo, llama desde un
   trigger a `importarAlumnos("EC2106","20262","1,2")`.

Las claves quedan en **Script Properties**; cualquier editor del script puede verlas.
Comparte la planilla solo con personas que deban acceder a los datos y revoca la key
cuando ya no la uses.

## Seguridad

- Claves de DocenciaWeb cifradas con AES-256-GCM (`ENCRYPTION_KEY`); el usuario va en claro solo para mostrarlo.
- Las claves solo viven descifradas en memoria durante la extracción; los logs nunca imprimen cuerpos de petición.
- Rate limits: login de la app (100/15 min por IP), conexión DocenciaWeb (10/10 min por IP) y API v1 con key (120/15 min por IP).
- API keys: solo se guarda su hash SHA-256; son de solo lectura, revocables, con expiración opcional y límite opcional de cursos/periodos. No permiten ver ni cambiar la clave de DocenciaWeb.
- Las sesiones de DocenciaWeb son por extracción (un cookie jar por llamada); nada se comparte entre usuarios.
- En producción usa HTTPS (detrás de un proxy), `HOST=127.0.0.1` + proxy reverso, y rota `ENCRYPTION_KEY`/`BETTER_AUTH_SECRET` con cuidado (rotar la primera invalida las claves guardadas: los usuarios deben reconectar).

## ChatGPT y Claude Desktop (OAuth)

El servidor es también un proveedor OAuth 2.1 (plugin MCP de Better Auth), que es
lo que exigen ChatGPT y los conectores de Claude Desktop:

- Descubrimiento: `/.well-known/oauth-protected-resource/mcp` y
  `/api/auth/.well-known/oauth-authorization-server`.
- Registro: CIMD (opción recomendada en Claude) y DCR abierto (lo que usa ChatGPT).
- Login y consentimiento en `/sign-in` y `/consent` (páginas servidas por el mismo Express).
- `POST /mcp` acepta el access token OAuth (verificado contra JWKS, `aud` = la URL
  del `/mcp`) **además** de la sesión/Bearer de siempre. Sin credencial responde 401
  con el header `WWW-Authenticate` que inicia el flujo OAuth en el cliente.

Pasos para conectarlos:

1. Aplica la migración OAuth en Supabase: `npm run db:push` (o pega
   `drizzle/0002_oauth.sql` en el SQL Editor). Sin estas tablas el servidor no parte:
   al arrancar siembra el recurso OAuth en la BD.
2. Revisa que `BETTER_AUTH_URL` sea la URL pública exacta con `https`
   (ej. `https://docencia-web-mcp.vercel.app`). El `resource` OAuth es esa URL + `/mcp`.
3. Redespliega y comprueba:
   ```
   curl https://TU-APP/.well-known/oauth-protected-resource/mcp
   curl https://TU-APP/api/auth/.well-known/oauth-authorization-server
   curl -i -X POST https://TU-APP/mcp -H 'Content-Type: application/json' -d '{}'
   # -> 401 con header WWW-Authenticate: Bearer resource_metadata="...oauth-protected-resource/mcp"
   ```
4. En ChatGPT (Nuevo complemento) o Claude (Conector personalizado) ingresa
   `https://TU-APP/mcp`. El cliente se registra solo, te abre el login: entra con tu
   **usuario y clave de DocenciaWeb** (sin email; la cuenta de la app se crea sola y
   tu conexión queda guardada en el mismo paso). Apruebas el acceso y listo.
5. Después, dentro del chat, puedes extraer directo. Si cambias tu clave de
   DocenciaWeb, vuelve a entrar en `/sign-in` del navegador (actualiza la conexión).

## Si algo falla

- **El servidor no parte (`ECONNREFUSED` a Postgres al arrancar)**: la BD debe estar
  accesible en el boot (el plugin OAuth siembra el recurso). Revisa `DATABASE_URL`.
- **"No se han podido detectar los ajustes de OAuth"** en ChatGPT: redespliega con el
  código actual y repite los `curl` del punto 3.
- **401 en /mcp o /api/docencia**: sesión ausente o Bearer inválido → inicia sesión de nuevo.
- **"Usuario o contraseña incorrectos"**: credenciales de DocenciaWeb, no de la app.
- **"No pude abrir CURSO/01..."**: revisa código, sección, periodo y acceso al curso.
- **Tablas inexistentes**: ejecuta el SQL de `drizzle/` o `npm run db:push` con `DATABASE_URL` correcto.
