import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env.js";

// Cifrado AES-256-GCM para las claves de DocenciaWeb guardadas en Postgres.
// ENCRYPTION_KEY debe ser de 64 caracteres hex (generada con `npm run gen:key`).
function clave(): Buffer {
  const k = env.ENCRYPTION_KEY.trim();
  if (/^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, "hex");
  if (k.length === 32) return Buffer.from(k, "utf8");
  throw new Error("ENCRYPTION_KEY inválida: usa 64 caracteres hex (genera una con `npm run gen:key`).");
}

export interface ClaveCifrada {
  claveCifrada: string;
  iv: string;
  authTag: string;
}

export function cifrarClavePlana(clavePlana: string): ClaveCifrada {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", clave(), iv);
  const cifrado = Buffer.concat([cipher.update(clavePlana, "utf8"), cipher.final()]);
  return {
    claveCifrada: cifrado.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

export function descifrarClavePlana(d: ClaveCifrada): string {
  const decipher = createDecipheriv("aes-256-gcm", clave(), Buffer.from(d.iv, "hex"));
  decipher.setAuthTag(Buffer.from(d.authTag, "hex"));
  const plano = Buffer.concat([
    decipher.update(Buffer.from(d.claveCifrada, "hex")),
    decipher.final(),
  ]);
  return plano.toString("utf8");
}
