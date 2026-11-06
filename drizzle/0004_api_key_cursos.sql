-- Scoping de API keys por curso (ej. solo ENMES2505).
-- Uso: psql "$DATABASE_URL" -f drizzle/0004_api_key_cursos.sql   (o `npm run db:push`)
-- Requiere 0003_api_keys.sql.
-- Idempotente: puede correrse varias veces sin duplicar nada.

ALTER TABLE "api_key"
  ADD COLUMN IF NOT EXISTS "cursos_permitidos" text[];
