import { Router } from "express";
import { crearApiKey, listarApiKeys, revocarApiKey } from "../apiKeys.js";
import { limiteApiKeys } from "../middleware/rateLimit.js";
import { requiereSesion, type PeticionAutenticada } from "../middleware/session.js";

// Gestión de API keys personales. Requiere sesión de la app (cookie o Bearer),
// nunca la API key: así una key robada no puede crear ni revocar otras keys.

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(limiteApiKeys);
router.use(requiereSesion);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/", async (req: PeticionAutenticada, res, next) => {
  try {
    res.json({ keys: await listarApiKeys(req.userId!) });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req: PeticionAutenticada, res, next) => {
  try {
    const { nombre, expiraEnDias, cursos, periodos } = (req.body ?? {}) as {
      nombre?: unknown;
      expiraEnDias?: unknown;
      cursos?: unknown;
      periodos?: unknown;
    };

    const nombreLimpio = String(nombre ?? "").trim() || "Apps Script";
    if (nombreLimpio.length > 80) {
      res.status(400).json({ error: "El nombre de la key no puede superar 80 caracteres." });
      return;
    }

    let dias: number | null = null;
    if (expiraEnDias !== undefined && expiraEnDias !== null && expiraEnDias !== "") {
      dias = Number(expiraEnDias);
      if (!Number.isInteger(dias) || dias < 1 || dias > 3650) {
        res.status(400).json({ error: "expiraEnDias debe ser un entero entre 1 y 3650." });
        return;
      }
    }

    // Cursos permitidos: vacío = todos. Se normalizan a mayúsculas y sin duplicados.
    const crudos = Array.isArray(cursos) ? cursos : String(cursos ?? "").split(",");
    const cursosPermitidos = [
      ...new Set(
        crudos
          .map((c) => String(c).trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    if (cursosPermitidos.length > 50) {
      res.status(400).json({ error: "Máximo 50 cursos por API key." });
      return;
    }
    const cursoInvalido = cursosPermitidos.find((c) => !/^[A-Z0-9]{3,20}$/.test(c));
    if (cursoInvalido) {
      res.status(400).json({
        error: `Código de curso inválido: ${cursoInvalido}. Ejemplo: ENMES2505.`,
      });
      return;
    }

    const periodosCrudos = Array.isArray(periodos)
      ? periodos
      : String(periodos ?? "").split(",");
    const periodosPermitidos = [
      ...new Set(
        periodosCrudos
          .map((p) => String(p).trim())
          .filter(Boolean),
      ),
    ];
    if (periodosPermitidos.length > 50) {
      res.status(400).json({ error: "Máximo 50 periodos por API key." });
      return;
    }
    const periodoInvalido = periodosPermitidos.find((p) => !/^\d{5}$/.test(p));
    if (periodoInvalido) {
      res.status(400).json({
        error: `Periodo inválido: ${periodoInvalido}. Debe tener 5 dígitos. Ejemplo: 20262.`,
      });
      return;
    }

    const creada = await crearApiKey(
      req.userId!,
      nombreLimpio,
      dias,
      cursosPermitidos.length ? cursosPermitidos : null,
      periodosPermitidos.length ? periodosPermitidos : null,
    );
    res.status(201).json({
      ...creada,
      aviso: "Guarda esta clave ahora: no se puede volver a mostrar.",
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req: PeticionAutenticada, res, next) => {
  try {
    const id = String(req.params.id ?? "");
    if (!UUID.test(id)) {
      res.status(400).json({ error: "Id de key inválido." });
      return;
    }
    const revocada = await revocarApiKey(req.userId!, id);
    if (!revocada) {
      res.status(404).json({ error: "API key no encontrada." });
      return;
    }
    res.json({ ok: true, id, revocada: true });
  } catch (err) {
    next(err);
  }
});

export const apiKeysRouter = router;
