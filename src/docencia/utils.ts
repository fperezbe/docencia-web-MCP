// Funciones puras: errores, validación y detección sobre el HTML de DocenciaWeb.

export class ScrapeError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "ScrapeError";
    this.status = status;
  }
}

export const pad2 = (s: string | number): string => String(s).padStart(2, "0");

export const claveCurso = (
  catedra: string | number,
  seccion: string | number,
  periodo: string | number,
): string => `${String(catedra).toUpperCase()}|${pad2(seccion)}|${periodo}`;

// Si el servidor devuelve el formulario de login, es que no hay sesión (o expiró).
export const sinSesion = (html: string): boolean =>
  /id=["']loginform["']|name=["']password["']/i.test(html);

// DetalleCurso trae el rol en un script: var Cod_RolenCurso = "AYUDANTE";
// Las demás páginas declaran la misma variable vacía (""), que cuenta como "sin curso".
export function extraerRol(html: string): string | null {
  const m = /var\s+Cod_RolenCurso\s*=\s*"([^"]*)"/.exec(html);
  return m?.[1] ? m[1] : null;
}

export type TipoExtraccion = "lista" | "justificaciones";

export interface ParametrosExtraccion {
  curso: string;
  periodo: string;
  tipo: TipoExtraccion;
  secciones: string[];
}

const MAX_SECCIONES = 30;

// Valida curso/periodo/tipo/secciones y devuelve los datos normalizados.
// Las credenciales NO van aquí: se leen de la conexión guardada del usuario.
export function validarExtraccion(body: unknown): ParametrosExtraccion {
  const b = (body ?? {}) as Record<string, unknown>;
  const malo = (msg: string): ScrapeError => new ScrapeError(msg, 400);

  const curso = String(b.curso ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(curso)) {
    throw malo("El código del curso no es válido. Ejemplo: ENMES250.");
  }

  const periodo = String(b.periodo ?? "").trim();
  if (!/^\d{5}$/.test(periodo)) {
    throw malo("El periodo debe tener 5 dígitos. Ejemplo: 20262.");
  }

  const tipo = (b.tipo ?? "lista") as string;
  if (tipo !== "lista" && tipo !== "justificaciones") {
    throw malo('El tipo debe ser "lista" o "justificaciones".');
  }

  const crudas = (Array.isArray(b.secciones) ? b.secciones : String(b.secciones ?? "").split(","))
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (!crudas.length || crudas.some((s) => !/^\d{1,2}$/.test(s))) {
    throw malo("Las secciones deben ser números separados por coma. Ejemplo: 1, 2, 3.");
  }
  const secciones = [...new Set(crudas.map(pad2))];
  if (secciones.length > MAX_SECCIONES) {
    throw malo(`Máximo ${MAX_SECCIONES} secciones por extracción.`);
  }

  return { curso, periodo, tipo, secciones };
}
