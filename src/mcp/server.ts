import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desconectarDocencia,
  estadoConexion,
  extraerComoUsuario,
  misCursos,
} from "../docencia/service.js";
import { csvJustificaciones, csvLista } from "../docencia/csv.js";
import { ScrapeError } from "../docencia/utils.js";
import type { Alumno, Justificacion } from "../docencia/client.js";

const cursoSchema = z.string().describe("Código del curso en mayúsculas. Ejemplo: ENMES250.");
const periodoSchema = z.string().describe("Periodo de 5 dígitos. Ejemplo: 20262.");
const seccionesSchema = z
  .union([z.string(), z.array(z.union([z.string(), z.number()]))])
  .describe("Secciones a extraer: string con comas o arreglo.");

// Máximo de filas devueltas por herramienta.
const MAX_FILAS_CSV = 1000;

const SOLO_LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

function mensajeError(err: unknown): string {
  if (err instanceof ScrapeError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error interno.";
}

function texto(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function textoError(err: unknown) {
  return { content: [{ type: "text" as const, text: "Error: " + mensajeError(err) }], isError: true };
}

function csvRecortado<T>(filas: Array<T>, construir: (f: Array<T>) => string): string {
  const recorte = filas.length > MAX_FILAS_CSV;
  const visibles = recorte ? filas.slice(0, MAX_FILAS_CSV) : filas;
  const nota = recorte ? " (primeras " + MAX_FILAS_CSV + " filas; pide por partes)" : "";
  return "Filas: " + filas.length + nota + "\n" + construir(visibles);
}

// Un servidor MCP por petición, con el userId en el closure: así cada usuario
// autenticado (Better Auth) opera solo sobre su propia conexión de DocenciaWeb.
export function createUserMcpServer(ctx: { userId: string; email: string }): McpServer {
  const server = new McpServer({ name: "docenciaweb-mcp", version: "1.0.0" });
  const userId = ctx.userId;

  server.registerTool(
    "docencia_estado",
    {
      description: "Indica si la cuenta de DocenciaWeb está conectada.",
      inputSchema: {},
      annotations: SOLO_LECTURA,
    },
    async () => {
      try {
        const e = await estadoConexion(userId);
        return texto(
          e.conectado
            ? "Conectado como " + e.usuario + " (actualizado: " + (e.actualizadoEn ? e.actualizadoEn.toISOString() : "-") + ")."
            : "No conectado. Usa docencia_conectar con tu usuario y clave de DocenciaWeb.",
        );
      } catch (err) {
        return textoError(err);
      }
    },
  );

  server.registerTool(
    "docencia_mis_cursos",
    {
      description: "Cursos visibles: código, sección y periodo.",
      inputSchema: {},
      annotations: SOLO_LECTURA,
    },
    async () => {
      try {
        const cursos = await misCursos(userId);
        if (!cursos.length) return texto("No se encontraron cursos en tu cuenta de DocenciaWeb.");
        return texto(
          "Cursos (" + cursos.length + "):\n" +
            cursos.map((c) => "- " + c.catedra + " sección " + c.seccion + " (periodo " + c.periodo + ")").join("\n"),
        );
      } catch (err) {
        return textoError(err);
      }
    },
  );

  server.registerTool(
    "docencia_lista_alumnos",
    {
      description:
        "Lista de alumnos en CSV (curso, periodo, secciones).",
      inputSchema: { curso: cursoSchema, periodo: periodoSchema, secciones: seccionesSchema },
      annotations: SOLO_LECTURA,
    },
    async ({ curso, periodo, secciones }) => {
      try {
        const filas = (await extraerComoUsuario(userId, {
          curso,
          periodo,
          tipo: "lista",
          secciones,
        })) as Array<Alumno>;
        if (!filas.length) {
          return textoError(
            new ScrapeError(
              "No encontré alumnos en esas secciones. Revisa el código del curso, las secciones y el periodo.",
              404,
            ),
          );
        }
        return texto(csvRecortado(filas, csvLista));
      } catch (err) {
        return textoError(err);
      }
    },
  );

  server.registerTool(
    "docencia_justificaciones",
    {
      description:
        "Justificaciones en CSV (curso, periodo, secciones).",
      inputSchema: { curso: cursoSchema, periodo: periodoSchema, secciones: seccionesSchema },
      annotations: SOLO_LECTURA,
    },
    async ({ curso, periodo, secciones }) => {
      try {
        const filas = (await extraerComoUsuario(userId, {
          curso,
          periodo,
          tipo: "justificaciones",
          secciones,
        })) as Array<Justificacion>;
        return texto(csvRecortado(filas, csvJustificaciones));
      } catch (err) {
        return textoError(err);
      }
    },
  );

  server.registerTool(
    "docencia_desconectar",
    {
      description: "Borra las credenciales de DocenciaWeb guardadas para este usuario.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async () => {
      try {
        await desconectarDocencia(userId);
        return texto("Cuenta de DocenciaWeb desconectada: se borraron tus credenciales guardadas.");
      } catch (err) {
        return textoError(err);
      }
    },
  );

  return server;
}
