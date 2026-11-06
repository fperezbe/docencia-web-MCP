-- Scoping de API keys por periodo (ej. solo 20262).
-- Uso: psql "$DATABASE_URL" -f drizzle/0005_api_key_periodos.sql   (o `npm run db:push`)
-- Requiere 0003_api_keys.sql (y 0004 si vienes de una versión anterior).
-- Idempotente: puede correrse varias veces sin duplicar nada.

ALTER TABLE "api_key"
  ADD COLUMN IF NOT EXISTS "periodos_permitidos" text[];
