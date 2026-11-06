-- API keys personales para integraciones (Google Apps Script, planillas, etc.).
-- Uso: psql "$DATABASE_URL" -f drizzle/0003_api_keys.sql   (o `npm run db:push`)
-- Requiere 0001_init.sql (referencia a "user").
-- Idempotente: puede correrse varias veces sin duplicar nada.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "api_key" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "key_prefix" text NOT NULL,
  "scopes" text[] NOT NULL DEFAULT ARRAY['leer']::text[],
  "cursos_permitidos" text[],
  "periodos_permitidos" text[],
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "lastUsedAt" timestamp,
  "expiresAt" timestamp,
  "revokedAt" timestamp
);

CREATE INDEX IF NOT EXISTS "apiKey_userId_idx" ON "api_key" ("userId");
