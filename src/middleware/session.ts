import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

export interface PeticionAutenticada extends Request {
  userId?: string;
  userEmail?: string;
}

// Acepta sesión por cookie (navegador) o por Bearer token (clientes MCP/API).
export async function requiereSesion(
  req: PeticionAutenticada,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const datos = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!datos?.user) {
      res
        .status(401)
        .json({ error: "No autenticado. Inicia sesión o envía Authorization: Bearer <token>." });
      return;
    }
    req.userId = datos.user.id;
    req.userEmail = datos.user.email;
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida." });
  }
}
