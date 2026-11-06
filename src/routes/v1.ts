import { Router, type NextFunction, type Response } from "express";
import {
  estadoConexion,
  extraerComoUsuario,
  misCursos,
} from "../docencia/service.js";
import { alumnosJson, justificacionesJson } from "../docencia/json.js";
import { ScrapeError, validarExtraccion } from "../docencia/utils.js";
import { requiereApiKey, type PeticionApiKey } from "../middleware/apiKey.js";
import { limiteApi } from "../middleware/rateLimit.js";
import type { Alumno, Justificacion } from "../docencia/client.js";

// API REST "tradicional" para integraciones con API key (Google Apps Script, etc.).
// Devuelve JSON y opera siempre sobre la conexión de DocenciaWeb del dueño de la key.

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(limiteApi);
router.use(requiereApiKey);

function responderError(res: Response, err: unknown, next: NextFunction): void {
  if (err instanceof ScrapeError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  next(err);
}

// Una key sin `cursosPermitidos` puede leer todos los cursos del usuario.
// Si tiene la lista, solo esos códigos (comparación en mayúsculas).
function permiteCurso(req: PeticionApiKey, curso: string): boolean {
  const permitidos = req.apiKeyCursos;
  if (!permitidos?.length) return true;
  return permitidos.map((c) => c.toUpperCase()).includes(curso.toUpperCase());
}

function errorCursoNoPermitido(req: PeticionApiKey, curso: string): string {
  const permitidos = (req.apiKeyCursos ?? []).join(", ");
  return `Esta API key no tiene permiso para el curso ${curso}. Cursos permitidos: ${permitidos}.`;
}

function permitePeriodo(req: PeticionApiKey, periodo: string): boolean {
  const permitidos = req.apiKeyPeriodos;
  if (!permitidos?.length) return true;
  return permitidos.includes(String(periodo).trim());
}

function errorPeriodoNoPermitido(req: PeticionApiKey, periodo: string): string {
  const permitidos = (req.apiKeyPeriodos ?? []).join(", ");
  return `Esta API key no tiene permiso para el periodo ${periodo}. Periodos permitidos: ${permitidos}.`;
}

// Acepta parámetros por body (POST) o query string (GET).
function entrada(req: PeticionApiKey): Record<string, unknown> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = req.query as Record<string, unknown>;
  return {
    curso: body.curso ?? query.curso,
    periodo: body.periodo ?? query.periodo,
    secciones: body.secciones ?? query.secciones,
  };
}

router.get("/estado", async (req: PeticionApiKey, res, next) => {
  try {
    const estado = await estadoConexion(req.userId!);
    res.json({
      ok: true,
      conectado: estado.conectado,
      usuario: estado.usuario,
      actualizadoEn: estado.actualizadoEn,
    });
  } catch (err) {
    responderError(res, err, next);
  }
});

router.get("/cursos", async (req: PeticionApiKey, res, next) => {
  try {
    const todos = await misCursos(req.userId!);
    const cursos = todos.filter(
      (c) => permiteCurso(req, c.catedra) && permitePeriodo(req, c.periodo),
    );
    res.json({
      ok: true,
      total: cursos.length,
      cursos,
      restringido: Boolean(req.apiKeyCursos?.length || req.apiKeyPeriodos?.length),
      cursosPermitidos: req.apiKeyCursos ?? null,
      periodosPermitidos: req.apiKeyPeriodos ?? null,
    });
  } catch (err) {
    responderError(res, err, next);
  }
});

async function alumnos(req: PeticionApiKey, res: Response, next: NextFunction): Promise<void> {
  try {
    const p = validarExtraccion({ ...entrada(req), tipo: "lista" });
    if (!permiteCurso(req, p.curso)) {
      res.status(403).json({ error: errorCursoNoPermitido(req, p.curso) });
      return;
    }
    if (!permitePeriodo(req, p.periodo)) {
      res.status(403).json({ error: errorPeriodoNoPermitido(req, p.periodo) });
      return;
    }
    const filas = (await extraerComoUsuario(req.userId!, p)) as Alumno[];
    if (filas.length === 0) {
      res.status(404).json({
        error: "No encontré alumnos en esas secciones. Revisa curso, secciones y periodo.",
      });
      return;
    }
    res.json({
      ok: true,
      curso: p.curso,
      periodo: p.periodo,
      secciones: p.secciones,
      total: filas.length,
      filas: alumnosJson(filas),
    });
  } catch (err) {
    responderError(res, err, next);
  }
}

async function justificaciones(
  req: PeticionApiKey,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const p = validarExtraccion({ ...entrada(req), tipo: "justificaciones" });
    if (!permiteCurso(req, p.curso)) {
      res.status(403).json({ error: errorCursoNoPermitido(req, p.curso) });
      return;
    }
    if (!permitePeriodo(req, p.periodo)) {
      res.status(403).json({ error: errorPeriodoNoPermitido(req, p.periodo) });
      return;
    }
    const filas = (await extraerComoUsuario(req.userId!, p)) as Justificacion[];
    res.json({
      ok: true,
      curso: p.curso,
      periodo: p.periodo,
      secciones: p.secciones,
      total: filas.length,
      filas: justificacionesJson(filas),
    });
  } catch (err) {
    responderError(res, err, next);
  }
}

router.get("/alumnos", alumnos);
router.post("/alumnos", alumnos);
router.get("/justificaciones", justificaciones);
router.post("/justificaciones", justificaciones);

export const v1Router = router;
