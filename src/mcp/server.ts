import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  desconectarDocencia,
  estadoConexion,
  extraerComoUsuario,
  misCursos,
} from "../docencia/service.js";
import { excelJustificaciones, excelLista } from "../docencia/excel.js";
import { ScrapeError } from "../docencia/utils.js";
import type { Alumno, Justificacion } from "../docencia/client.js";

const cursoSchema = z.string().describe("Código del curso en mayúsculas. Ejemplo: ENMES250.");
const periodoSchema = z.string().describe("Periodo de 5 dígitos. Ejemplo: 20262.");
const seccionesSchema = z
  .union([z.string(), z.array(z.union([z.string(), z.number()]))])
  .describe("Secciones a extraer: string con comas o arreglo.");

// Máximo de filas devueltas como JSON por herramienta (el Excel no tiene límite).
const MAX_FILAS_JSON = 1000;

type Fila = Alumno | Justificacion;

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

function resumenFilas(filas: Array<Fila>): string {
  const recorte = filas.length > MAX_FILAS_JSON;
  const visibles = recorte ? filas.slice(0, MAX_FILAS_JSON) : filas;
  const nota = recorte
    ? "\nNota: se muestran las primeras " + MAX_FILAS_JSON + " de " + filas.length + " filas. Usa docencia_exportar_excel para el archivo completo."
    : "";
  return "Filas: " + filas.length + "." + nota + "\n" + JSON.stringify(visibles, null, 2);
}

// Un servidor MCP por petición, con el userId en el closure: así cada usuario
// autenticado (Better Auth) opera solo sobre su propia conexión de DocenciaWeb.
export function createUserMcpServer(ctx: { userId: string; email: string }): McpServer {
  const server = new McpServer({ name: "docenciaweb-mcp", version: "1.0.0" });
  const userId = ctx.userId;

  server.registerTool(
    "docencia_estado",
    {
      description: "Indica si este usuario ya conectó su cuenta de DocenciaWeb.",
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
      description: "Lista los cursos visibles en DocenciaWeb (código, sección y periodo). Requiere haber iniciado sesión en el navegador; nunca pidas la clave por chat.",
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
        "Extrae la lista de alumnos (RUT, código, nombre, repitencias, carrera) de una o más secciones. Devuelve JSON rápido; prefiérela sobre exportar_excel. Requiere haber iniciado sesión en el navegador; nunca pidas la clave por chat.",
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
        return texto(resumenFilas(filas));
      } catch (err) {
        return textoError(err);
      }
    },
  );

  server.registerTool(
    "docencia_justificaciones",
    {
      description:
        "Extrae las justificaciones (nombre, RUT, tipo, fechas, observaciones) de una o más secciones. Devuelve JSON rápido; prefiérela sobre exportar_excel. Requiere haber iniciado sesión en el navegador; nunca pidas la clave por chat.",
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
        return texto(resumenFilas(filas));
      } catch (err) {
        return textoError(err);
      }
    },
  );

  server.registerTool(
    "docencia_exportar_excel",
    {
      description:
        "LENTA con muchas secciones (raspa una por una, puede tardar un minuto o más): úsala solo si el usuario pide explícitamente un archivo .xlsx; si no, usa las herramientas JSON. Con muchas secciones, divide en llamados de pocas secciones. Devuelve el Excel en base64 con el formato original.",
      inputSchema: {
        curso: cursoSchema,
        periodo: periodoSchema,
        secciones: seccionesSchema,
        tipo: z
          .enum(["lista", "justificaciones"])
          .default("lista")
          .describe("Tipo de planilla: lista o justificaciones."),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ curso, periodo, secciones, tipo }) => {
      try {
        const filas = await extraerComoUsuario(userId, { curso, periodo, tipo, secciones });
        const buffer =
          tipo === "justificaciones"
            ? excelJustificaciones(filas as Array<Justificacion>)
            : excelLista(filas as Array<Alumno>);
        const fecha = new Date().toISOString().slice(0, 10);
        const nombre = (tipo === "lista" ? "Lista" : "Justificaciones") + "-" + curso.toUpperCase() + "-" + fecha + ".xlsx";
        return texto(
          "Archivo " + nombre + " (" + filas.length + " filas, " + buffer.length + " bytes).\n" +
            JSON.stringify({
              archivo: nombre,
              mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              filas: filas.length,
              excelBase64: buffer.toString("base64"),
            }),
        );
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
