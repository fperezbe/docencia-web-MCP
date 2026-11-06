import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db/index.js";

// Prefijo reconocible para poder buscar/filtrar claves filtradas en logs o repos.
const PREFIJO = "dwmcp_";
const BYTES_ALEATORIOS = 32;
// Solo se actualiza `lastUsedAt` si pasó este tiempo (evita un UPDATE por petición).
const REFRESCO_USO_MS = 60 * 1000;

export interface ApiKeyCreada {
  id: string;
  nombre: string;
  clave: string;
  keyPrefix: string;
  scopes: string[];
  cursosPermitidos: string[] | null;
  periodosPermitidos: string[] | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface ApiKeyListada {
  id: string;
  nombre: string;
  keyPrefix: string;
  scopes: string[];
  cursosPermitidos: string[] | null;
  periodosPermitidos: string[] | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface IdentidadApiKey {
  userId: string;
  email: string;
  keyId: string;
  scopes: string[];
  cursosPermitidos: string[] | null;
  periodosPermitidos: string[] | null;
}

// Las claves tienen 256 bits de entropía: SHA-256 sin sal es suficiente y permite
// buscar por índice sin guardar nunca el valor en claro.
export function hashApiKey(clave: string): string {
  return createHash("sha256").update(clave).digest("hex");
}

export async function crearApiKey(
  userId: string,
  nombre: string,
  expiraEnDias: number | null,
  cursosPermitidos: string[] | null,
  periodosPermitidos: string[] | null,
): Promise<ApiKeyCreada> {
  const clave = PREFIJO + randomBytes(BYTES_ALEATORIOS).toString("base64url");
  const keyPrefix = clave.slice(0, PREFIJO.length + 6);
  const expiresAt =
    expiraEnDias && expiraEnDias > 0
      ? new Date(Date.now() + expiraEnDias * 24 * 60 * 60 * 1000)
      : null;

  const filas = await db
    .insert(schema.apiKey)
    .values({
      userId,
      nombre,
      keyHash: hashApiKey(clave),
      keyPrefix,
      scopes: ["leer"],
      cursosPermitidos,
      periodosPermitidos,
      expiresAt,
    })
    .returning();

  const fila = filas[0]!;
  return {
    id: fila.id,
    nombre: fila.nombre,
    clave,
    keyPrefix: fila.keyPrefix,
    scopes: fila.scopes,
    cursosPermitidos: fila.cursosPermitidos,
    periodosPermitidos: fila.periodosPermitidos,
    createdAt: fila.createdAt,
    expiresAt: fila.expiresAt,
  };
}

export async function listarApiKeys(userId: string): Promise<ApiKeyListada[]> {
  return db
    .select({
      id: schema.apiKey.id,
      nombre: schema.apiKey.nombre,
      keyPrefix: schema.apiKey.keyPrefix,
      scopes: schema.apiKey.scopes,
      cursosPermitidos: schema.apiKey.cursosPermitidos,
      periodosPermitidos: schema.apiKey.periodosPermitidos,
      createdAt: schema.apiKey.createdAt,
      lastUsedAt: schema.apiKey.lastUsedAt,
      expiresAt: schema.apiKey.expiresAt,
      revokedAt: schema.apiKey.revokedAt,
    })
    .from(schema.apiKey)
    .where(eq(schema.apiKey.userId, userId))
    .orderBy(desc(schema.apiKey.createdAt));
}

export async function revocarApiKey(userId: string, id: string): Promise<boolean> {
  const filas = await db
    .update(schema.apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKey.id, id), eq(schema.apiKey.userId, userId)))
    .returning({ id: schema.apiKey.id });
  return filas.length > 0;
}

// Busca la clave por hash y valida revocación/expiración. Devuelve la identidad
// del dueño para que las rutas operen sobre su propia conexión de DocenciaWeb.
export async function autenticarApiKey(clave: string): Promise<IdentidadApiKey | null> {
  const filas = await db
    .select({
      id: schema.apiKey.id,
      userId: schema.apiKey.userId,
      scopes: schema.apiKey.scopes,
      cursosPermitidos: schema.apiKey.cursosPermitidos,
      periodosPermitidos: schema.apiKey.periodosPermitidos,
      expiresAt: schema.apiKey.expiresAt,
      revokedAt: schema.apiKey.revokedAt,
      lastUsedAt: schema.apiKey.lastUsedAt,
      email: schema.user.email,
    })
    .from(schema.apiKey)
    .innerJoin(schema.user, eq(schema.user.id, schema.apiKey.userId))
    .where(eq(schema.apiKey.keyHash, hashApiKey(clave)))
    .limit(1);

  const fila = filas[0];
  if (!fila || fila.revokedAt) return null;
  if (fila.expiresAt && fila.expiresAt.getTime() <= Date.now()) return null;

  if (!fila.lastUsedAt || Date.now() - fila.lastUsedAt.getTime() > REFRESCO_USO_MS) {
    void db
      .update(schema.apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKey.id, fila.id))
      .catch(() => {
        /* el uso no debe romper la petición */
      });
  }

  return {
    userId: fila.userId,
    email: fila.email,
    keyId: fila.id,
    scopes: fila.scopes,
    cursosPermitidos: fila.cursosPermitidos,
    periodosPermitidos: fila.periodosPermitidos,
  };
}
