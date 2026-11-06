import { Router, type NextFunction, type Response } from "express";
import {
  conectarDocencia,
  desconectarDocencia,
  estadoConexion,
  extraerComoUsuario,
  misCursos,
  urlLoginDocencia,
} from "../docencia/service.js";
import { csvJustificaciones, csvLista } from "../docencia/csv.js";
import { ScrapeError } from "../docencia/utils.js";
import { limiteConexionDocencia } from "../middleware/rateLimit.js";
import { requiereSesion, type PeticionAutenticada } from "../middleware/session.js";
import type { Alumno, Justificacion } from "../docencia/client.js";

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

// Endpoint para el chat: devuelve el form de login para (re)conectar.
// El chat no puede abrir el navegador solo; debe mostrar este `url` como enlace.
router.get("/conectar", async (req: PeticionAutenticada, res, next) => {
  try {
    const estado = await estadoConexion(req.userId!);
    res.json({
      conectado: estado.conectado,
      usuario: estado.usuario,
      url: urlLoginDocencia(),
      instrucciones:
        "Abre el url en tu navegador e inicia sesión con tu usuario y clave (no las escribas en el chat). Luego vuelve aquí y continúa.",
    });
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
