import type { NextFunction, Request, Response } from "express";
import { autenticarApiKey } from "../apiKeys.js";

export interface PeticionApiKey extends Request {
  userId?: string;
  userEmail?: string;
  apiKeyId?: string;
  apiKeyScopes?: string[];
  apiKeyCursos?: string[] | null;
  apiKeyPeriodos?: string[] | null;
}

// Acepta `Authorization: Bearer dwmcp_...` y también `X-API-Key: dwmcp_...`.
// No se acepta por query string: las URLs terminan en logs e historiales.
export function claveDePeticion(req: Request): string | null {
  const cabecera = req.header("x-api-key");
  if (cabecera?.trim()) return cabecera.trim();

  const autorizacion = req.header("authorization");
  if (!autorizacion) return null;
  const coincidencia = /^Bearer\s+(.+)$/i.exec(autorizacion.trim());
  return coincidencia?.[1]?.trim() || null;
}

export async function requiereApiKey(
  req: PeticionApiKey,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const clave = claveDePeticion(req);
  if (!clave) {
    res.status(401).json({
      error:
        "Falta la API key. Envía Authorization: Bearer <clave> o X-API-Key: <clave>.",
    });
    return;
  }

  try {
    const identidad = await autenticarApiKey(clave);
    if (!identidad) {
      res.status(401).json({ error: "API key inválida, revocada o expirada." });
      return;
    }
    req.userId = identidad.userId;
    req.userEmail = identidad.email;
    req.apiKeyId = identidad.keyId;
    req.apiKeyScopes = identidad.scopes;
    req.apiKeyCursos = identidad.cursosPermitidos;
    req.apiKeyPeriodos = identidad.periodosPermitidos;
    next();
  } catch (err) {
    next(err);
  }
}
