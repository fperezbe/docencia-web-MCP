import { Router, type NextFunction, type Request, type Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";
import {
  conectarDocencia,
  desconectarDocencia,
  estadoConexion,
  extraerComoUsuario,
  misCursos,
} from "../docencia/service.js";
import { csvJustificaciones, csvLista } from "../docencia/csv.js";
import { ScrapeError } from "../docencia/utils.js";
import { limiteConexionDocencia } from "../middleware/rateLimit.js";
import type { Alumno, Justificacion } from "../docencia/client.js";

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

function responderError(res: Response, err: unknown, next: NextFunction): void {
  if (err instanceof ScrapeError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  next(err);
}

const router = Router();

router.use(requiereSesion);

// Guarda (o reemplaza) la conexión con DocenciaWeb del usuario actual.
router.post("/connect", limiteConexionDocencia, async (req: PeticionAutenticada, res, next) => {
  try {
    const { usuario, clave } = (req.body ?? {}) as { usuario?: string; clave?: string };
    const r = await conectarDocencia(req.userId!, String(usuario ?? ""), String(clave ?? ""));
    res.json({ conectado: r.conectado, usuario: r.usuario, totalCursos: r.totalCursos });
  } catch (err) {
    responderError(res, err, next);
  }
});

router.get("/estado", async (req: PeticionAutenticada, res, next) => {
  try {
    res.json(await estadoConexion(req.userId!));
  } catch (err) {
    responderError(res, err, next);
  }
});

router.get("/cursos", async (req: PeticionAutenticada, res, next) => {
  try {
    res.json({ cursos: await misCursos(req.userId!) });
  } catch (err) {
    responderError(res, err, next);
  }
});

// Extrae y descarga el CSV (único formato de salida).
router.post("/extraer", async (req: PeticionAutenticada, res, next) => {
  try {
    const tipo = String((req.body as Record<string, unknown> | undefined)?.tipo ?? "lista");
    const filas = await extraerComoUsuario(req.userId!, {
      ...(req.body as object),
      tipo,
    } as { curso: string; periodo: string; tipo?: string; secciones: string });
    if (tipo === "lista" && filas.length === 0) {
      res
        .status(404)
        .json({ error: "No encontré alumnos en esas secciones. Revisa curso, secciones y periodo." });
      return;
    }
    const csv =
      tipo === "justificaciones"
        ? csvJustificaciones(filas as Justificacion[])
        : csvLista(filas as Alumno[]);
    const { curso } = req.body as { curso: string };
    const fecha = new Date().toLocaleDateString("sv-SE");
    const nombre = `${tipo === "lista" ? "Lista" : "Justificaciones"}-${String(curso).toUpperCase()}-${fecha}.csv`;
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "X-Filas": String(filas.length),
    });
    res.send(csv);
  } catch (err) {
    responderError(res, err, next);
  }
});

router.delete("/conexion", async (req: PeticionAutenticada, res, next) => {
  try {
    res.json(await desconectarDocencia(req.userId!));
  } catch (err) {
    responderError(res, err, next);
  }
});

export const docenciaRouter = router;
