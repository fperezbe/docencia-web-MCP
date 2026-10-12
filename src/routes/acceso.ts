import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { hashPassword } from "better-auth/crypto";
import { auth } from "../auth.js";
import { db, schema } from "../db/index.js";
import { listarCursos } from "../docencia/client.js";
import { guardarConexion } from "../docencia/service.js";
import { ScrapeError } from "../docencia/utils.js";
import { limiteConexionDocencia } from "../middleware/rateLimit.js";

// Email interno determinista por usuario de DocenciaWeb. Solo identifica la cuenta
// de la app (nunca se envía correo). Inyectivo: cada usuario cae en un email distinto.
export function emailParaUsuario(usuario: string): string {
  const normalizado = usuario
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, (c) => `-x${(c.codePointAt(0) ?? 0).toString(16)}-`);
  return `dw_${normalizado}@docenciaweb.local`;
}

const router = Router();

// Login único con credenciales de DocenciaWeb (usuario + clave, sin email):
// valida contra la plataforma, crea o actualiza el usuario de la app, deja la
// conexión guardada y devuelve una clave temporal para completar el sign-in
// en el navegador (que sí crea la sesión con cookies).
router.post("/acceso", limiteConexionDocencia, async (req, res, next) => {
  try {
    const { usuario: u, clave } = (req.body ?? {}) as { usuario?: unknown; clave?: unknown };
    const usuario = String(u ?? "").trim();
    if (!usuario || typeof clave !== "string" || !clave) {
      res.status(400).json({ error: "Falta el usuario o la contraseña." });
      return;
    }

    try {
      await listarCursos({ usuario, clave });
    } catch (err) {
      if (err instanceof ScrapeError && err.status === 401) {
        res.status(401).json({ error: "Usuario o contraseña incorrectos." });
        return;
      }
      throw err;
    }

    const email = emailParaUsuario(usuario);
    const existentes = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);
    let userId = existentes[0]?.id;
    if (!userId) {
      await auth.api.signUpEmail({
        body: { name: usuario, email, password: randomBytes(24).toString("base64url") },
        headers: fromNodeHeaders(req.headers),
      });
      userId = (
        await db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.email, email))
          .limit(1)
      )[0]?.id;
      if (!userId) {
        res.status(500).json({ error: "No pude crear tu cuenta. Intenta de nuevo." });
        return;
      }
    }

    // Clave temporal de un solo uso para el sign-in del navegador (rota en cada login).
    const temporal = randomBytes(24).toString("base64url");
    const hash = await hashPassword(temporal);
    const cuentas = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")))
      .limit(1);
    if (cuentas[0]) {
      await db
        .update(schema.account)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(schema.account.id, cuentas[0].id));
    } else {
      await db.insert(schema.account).values({
        id: randomBytes(16).toString("hex"),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await guardarConexion(userId, usuario, clave);
    res.json({ ok: true, usuario, email, claveTemporal: temporal });
  } catch (err) {
    if (err instanceof ScrapeError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

export const accesoRouter = router;
