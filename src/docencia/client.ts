import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import XLSX from "xlsx-js-style";
import {
  ScrapeError,
  claveCurso,
  extraerRol,
  pad2,
  sinSesion,
  type TipoExtraccion,
} from "./utils.js";

export const BASE = "https://docenciaweb.fen.uchile.cl";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
// El JS de la página llena el campo oculto "navegador" con navigator.appName + " " + navigator.appVersion
const NAVEGADOR = "Netscape " + UA.replace("Mozilla/", "");

export interface CredencialesDocencia {
  usuario: string;
  clave: string;
}

export interface Alumno {
  Seccion: number | string;
  RUT: string;
  "Cod Alumno": string;
  Nombre: string;
  Repitencias: string;
  Carrera: string;
}

export interface Justificacion {
  Seccion: number | string;
  Nombre: string;
  RUT: string;
  Tipo: string;
  Desde: string;
  Hasta: string;
  Observaciones: string;
}

export interface CursoInfo {
  catedra: string;
  seccion: string;
  periodo: string;
  url: string;
}

export interface OpcionesExtraccion extends CredencialesDocencia {
  curso: string;
  secciones: string[];
  periodo: string;
  tipo: TipoExtraccion;
  onProgreso?: (actual: number, total: number, seccion: string) => void;
}

// Cliente mínimo que usa el scraper (evita fricción de tipos entre axios y el wrapper de cookies).
export interface Http {
  get(url: string, config?: unknown): Promise<{ data: unknown }>;
  post(url: string, data?: unknown, config?: unknown): Promise<{ data: unknown }>;
}

function crearCliente(): Http {
  const crear = (axios as unknown as { create: (config: unknown) => unknown }).create;
  const instancia = crear({
    baseURL: BASE,
    jar: new CookieJar(),
    timeout: 30_000,
    maxRedirects: 5,
    headers: { "User-Agent": UA, "Accept-Language": "es-CL,es;q=0.9" },
  });
  return (wrapper as unknown as (x: unknown) => Http)(instancia);
}

function comoScrapeError(err: unknown, contexto: string): unknown {
  if (err instanceof ScrapeError) return err;
  if (axios.isAxiosError(err)) {
    const causa = err.response ? `HTTP ${err.response.status}` : err.code || err.message;
    return new ScrapeError(`No pude comunicarme con DocenciaWeb (${causa}) ${contexto}.`);
  }
  return err;
}

// --- Login -----------------------------------------------------------------

// Devuelve el HTML de /Home/MisCursos (confirma el login y ubica los cursos).
async function login(http: Http, usuario: string, clave: string): Promise<string> {
  // 1. La página de inicio trae el formulario con el token anti-CSRF (y la cookie asociada).
  const { data: inicio } = await http.get("/");
  const token = cheerio.load(String(inicio))('input[name="__RequestVerificationToken"]').first().val();
  if (!token) {
    throw new ScrapeError("No encontré el formulario de login en DocenciaWeb. ¿Cambió el sitio?");
  }

  // 2. Mismo POST que hace el navegador. axios sigue los 302 (/ -> /Home/MisCursos).
  await http.post(
    "/Home/ValidaAcceso",
    new URLSearchParams({
      username: usuario,
      password: clave,
      navegador: NAVEGADOR,
      __RequestVerificationToken: String(token),
    }),
    { headers: { Origin: BASE, Referer: `${BASE}/` } },
  );

  // 3. Si la clave es incorrecta el sitio responde 200 con el formulario de nuevo.
  const { data: misCursos } = await http.get("/Home/MisCursos");
  const html = String(misCursos);
  if (sinSesion(html)) {
    throw new ScrapeError("Usuario o contraseña incorrectos.", 401);
  }
  return html;
}

// MisCursos enlaza a cada curso con su EstatusCurso correcto (Vigente/Terminado).
function mapaCursos(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const mapa = new Map<string, string>();
  $('a[href*="DetalleCurso"]').each((_, a) => {
    try {
      const href = $(a).attr("href");
      if (!href) return;
      const u = new URL(href, BASE);
      const p = Object.fromEntries([...u.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
      if (p.catedra && p.seccion && p.periodo) {
        mapa.set(claveCurso(p.catedra, p.seccion, p.periodo), u.pathname + u.search);
      }
    } catch {
      /* enlace raro: lo ignoramos */
    }
  });
  return mapa;
}

function cursosDesdeMapa(mapa: Map<string, string>): CursoInfo[] {
  const cursos: CursoInfo[] = [];
  for (const [clave, url] of mapa) {
    const [catedra, seccion, periodo] = clave.split("|");
    if (catedra && seccion && periodo) cursos.push({ catedra, seccion, periodo, url });
  }
  cursos.sort(
    (a, b) =>
      b.periodo.localeCompare(a.periodo) ||
      a.catedra.localeCompare(b.catedra) ||
      a.seccion.localeCompare(b.seccion),
  );
  return cursos;
}

// Valida las credenciales contra DocenciaWeb y lista los cursos visibles.
export async function listarCursos(creds: CredencialesDocencia): Promise<CursoInfo[]> {
  const http = crearCliente();
  try {
    return cursosDesdeMapa(mapaCursos(await login(http, creds.usuario, creds.clave)));
  } catch (err) {
    throw comoScrapeError(err, "al iniciar sesión");
  }
}

// --- Curso actual en la sesión ------------------------------------------------

interface Ctx {
  http: Http;
  mapa: Map<string, string>;
}

// Las páginas /Curso/ListaCurso y /Curso/Justificaciones no reciben parámetros:
// el servidor recuerda "el curso actual" en la sesión. Se fija abriendo
// DetalleCurso y luego /Curso/Menu (la hace el JS de la página; aquí se pide a mano).
async function fijarCurso(ctx: Ctx, curso: string, seccion: string, periodo: string): Promise<void> {
  const sec = pad2(seccion);
  const url =
    ctx.mapa.get(claveCurso(curso, sec, periodo)) ??
    `/Curso/DetalleCurso?${new URLSearchParams({ Catedra: curso, Seccion: sec, Periodo: periodo })}`;

  const { data: htmlCrudo } = await ctx.http.get(url);
  const html = String(htmlCrudo);
  if (sinSesion(html)) throw new ScrapeError("La sesión en DocenciaWeb expiró. Intenta de nuevo.", 401);

  const rol = extraerRol(html);
  if (!rol) {
    throw new ScrapeError(
      `No pude abrir ${curso}/${sec} del periodo ${periodo}. Revisa el código, la sección y el periodo, y que tengas acceso a ese curso.`,
      404,
    );
  }

  await ctx.http.get("/Curso/Menu", {
    params: { catedra: curso, seccion: sec, periodo, RolenCurso: rol },
  });
}

// --- Extracción ----------------------------------------------------------------

const seccionNumero = (s: string): number | string => (Number.isNaN(Number(s)) ? s : Number(s));
const texto = (v: unknown): string => (v === undefined || v === null ? "" : String(v).trim());

async function listaSeccion(ctx: Ctx, curso: string, seccion: string, periodo: string): Promise<Alumno[]> {
  await fijarCurso(ctx, curso, seccion, periodo);

  const res = await ctx.http.get("/Curso/ListaCursoExcel", { responseType: "arraybuffer" });
  const buf = Buffer.from(res.data as ArrayBuffer);
  if (sinSesion(buf.subarray(0, 4000).toString("utf8"))) {
    throw new ScrapeError("La sesión en DocenciaWeb expiró. Intenta de nuevo.", 401);
  }

  const wb = XLSX.read(buf, { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][];

  const alumnos: Alumno[] = [];
  for (const f of filas) {
    if (!Array.isArray(f)) continue;
    // Solo filas de alumno: la primera columna es el número correlativo y hay RUT.
    const n = f[0];
    if (n === undefined || n === null || n === "" || Number.isNaN(Number(n)) || !f[1]) continue;
    alumnos.push({
      Seccion: seccionNumero(seccion),
      RUT: texto(f[1]),
      "Cod Alumno": texto(f[2]),
      Nombre: texto(f[3]),
      Repitencias: texto(f[4]),
      Carrera: texto(f[5]),
    });
  }
  return alumnos;
}

async function justificacionesSeccion(
  ctx: Ctx,
  curso: string,
  seccion: string,
  periodo: string,
): Promise<Justificacion[]> {
  await fijarCurso(ctx, curso, seccion, periodo);

  const { data: htmlCrudo } = await ctx.http.get("/Curso/Justificaciones");
  const html = String(htmlCrudo);
  if (sinSesion(html)) throw new ScrapeError("La sesión en DocenciaWeb expiró. Intenta de nuevo.", 401);

  const $ = cheerio.load(html);
  const justificaciones: Justificacion[] = [];
  $("table.u-table-mobile tbody tr").each((_, tr) => {
    const celda = (nombre: string): string =>
      $(tr).find(`td[name="${nombre}"]`).text().replace(/\s+/g, " ").trim();
    const nombre = celda("nombre");
    if (!nombre) return;
    justificaciones.push({
      Seccion: seccionNumero(seccion),
      Nombre: nombre,
      RUT: celda("run"),
      Tipo: celda("tipo"),
      Desde: celda("desde"),
      Hasta: celda("hasta"),
      Observaciones: celda("observaciones"),
    });
  });
  return justificaciones;
}

// Recorre las secciones en orden (una tras otra, con la misma sesión): como el curso
// actual vive en la sesión del servidor, hacerlo en paralelo mezclaría los datos.
export async function extraer(
  op: OpcionesExtraccion & { tipo: "lista" },
): Promise<Alumno[]>;
export async function extraer(
  op: OpcionesExtraccion & { tipo: "justificaciones" },
): Promise<Justificacion[]>;
export async function extraer(op: OpcionesExtraccion): Promise<(Alumno | Justificacion)[]> {
  const http = crearCliente();

  let ctx: Ctx;
  try {
    ctx = { http, mapa: mapaCursos(await login(http, op.usuario, op.clave)) };
  } catch (err) {
    throw comoScrapeError(err, "al iniciar sesión");
  }

  const filas: (Alumno | Justificacion)[] = [];
  for (const [i, seccion] of op.secciones.entries()) {
    op.onProgreso?.(i + 1, op.secciones.length, seccion);
    try {
      if (op.tipo === "lista") {
        filas.push(...(await listaSeccion(ctx, op.curso, seccion, op.periodo)));
      } else {
        filas.push(...(await justificacionesSeccion(ctx, op.curso, seccion, op.periodo)));
      }
    } catch (err) {
      throw comoScrapeError(err, `en la sección ${pad2(seccion)}`);
    }
  }
  return filas;
}
