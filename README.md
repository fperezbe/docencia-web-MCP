# DocenciaWeb MCP (multi-cuenta)

Servidor MCP para extraer listas de alumnos y justificaciones de DocenciaWeb FEN,
con el mismo scraper del extractor original, pero como servicio multi-usuario:

- **Login de la app con Better Auth** (email + contraseña, cookies o Bearer token).
- **Cada usuario conecta su propia cuenta de DocenciaWeb** (usuario + clave de la
  plataforma, validadas al momento y guardadas **cifradas con AES-256-GCM** en PostgreSQL).
- **Drizzle ORM + PostgreSQL** para persistencia, **Express** como servidor HTTP.
- **MCP Streamable HTTP** en `POST /mcp` (modo sin estado) + API REST equivalente.

## Arquitectura

```
Cliente MCP / navegador
        │  cookie de sesión o Authorization: Bearer <token> (Better Auth)
        ▼
Express ── /api/auth/* ──▶ Better Auth (login app, tabla user/session/account)
        ── /api/docencia/* ─▶ REST autenticada (connect, cursos, extraer xlsx, ...)
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
| `docencia_conectar` | Conecta la cuenta de DocenciaWeb (`usuario`, `clave`) |
| `docencia_estado` | Indica si ya hay conexión guardada |
| `docencia_mis_cursos` | Lista cursos visibles (código, sección, periodo) |
| `docencia_lista_alumnos` | Lista de alumnos en JSON (`curso`, `periodo`, `secciones`) |
| `docencia_justificaciones` | Justificaciones en JSON (mismos parámetros) |
| `docencia_exportar_excel` | Mismo contenido en `.xlsx` (base64) con el formato original |
| `docencia_desconectar` | Borra las credenciales guardadas |

Configuración de ejemplo para el cliente en `mcp.example.json`.

Flujo típico con el asistente: `docencia_conectar` → `docencia_mis_cursos` →
`docencia_lista_alumnos` con `{curso: "ENMES250", periodo: "20262", secciones: "1,2,3"}`.

## API REST (misma funcionalidad, con `Authorization: Bearer` o cookie)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/docencia/connect` | Guarda la conexión (`usuario`, `clave`) |
| `GET` | `/api/docencia/estado` | Estado de la conexión |
| `GET` | `/api/docencia/cursos` | Cursos visibles |
| `POST` | `/api/docencia/extraer` | Descarga el `.xlsx` (`curso`, `periodo`, `tipo`, `secciones`) |
| `DELETE` | `/api/docencia/conexion` | Borra la conexión |
| `GET` | `/api/me` / `/health` | Sesión actual / salud |

## Seguridad

- Claves de DocenciaWeb cifradas con AES-256-GCM (`ENCRYPTION_KEY`); el usuario va en claro solo para mostrarlo.
- Las claves solo viven descifradas en memoria durante la extracción; los logs nunca imprimen cuerpos de petición.
- Rate limits: login de la app (100/15 min por IP) y conexión DocenciaWeb (10/10 min por IP).
- Las sesiones de DocenciaWeb son por extracción (un cookie jar por llamada); nada se comparte entre usuarios.
- En producción usa HTTPS (detrás de un proxy), `HOST=127.0.0.1` + proxy reverso, y rota `ENCRYPTION_KEY`/`BETTER_AUTH_SECRET` con cuidado (rotar la primera invalida las claves guardadas: los usuarios deben reconectar).

## Si algo falla

- **401 en /mcp o /api/docencia**: sesión ausente o Bearer inválido → inicia sesión de nuevo.
- **"Usuario o contraseña incorrectos"**: credenciales de DocenciaWeb, no de la app.
- **"No pude abrir CURSO/01..."**: revisa código, sección, periodo y acceso al curso.
- **Tablas inexistentes**: ejecuta el SQL de `drizzle/` o `npm run db:push` con `DATABASE_URL` correcto.
