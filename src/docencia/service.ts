import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { docenciaConnection } from "../db/schema.js";
import { cifrarClavePlana, descifrarClavePlana } from "../crypto.js";
import {
  extraer,
  listarCursos,
  type Alumno,
  type CursoInfo,
  type Justificacion,
} from "./client.js";
import { ScrapeError, validarExtraccion } from "./utils.js";

export interface EntradaExtraccion {
  curso: string;
  periodo: string;
  tipo?: string;
  secciones: string | (string | number)[];
}

// Conecta (o reconecta) la cuenta de DocenciaWeb del usuario de la app.
// Valida las credenciales contra la plataforma antes de guardarlas cifradas.
export async function conectarDocencia(
  userId: string,
  usuario: string,
  clave: string,
): Promise<{ conectado: boolean; usuario: string; totalCursos: number; cursos: CursoInfo[] }> {
  usuario = usuario.trim();
  if (!usuario || !clave) {
    throw new ScrapeError("Falta el usuario o la contraseña de DocenciaWeb.", 400);
  }
  const cursos = await listarCursos({ usuario, clave });
  const cifrado = cifrarClavePlana(clave);
  await db
    .insert(docenciaConnection)
    .values({ userId, docenciaUsuario: usuario, ...cifrado })
    .onConflictDoUpdate({
      target: docenciaConnection.userId,
      set: { docenciaUsuario: usuario, ...cifrado, updatedAt: new Date() },
    });
  return { conectado: true, usuario, totalCursos: cursos.length, cursos };
}

// Lee y descifra las credenciales guardadas. Falla 401 si no hay conexión.
export async function leerCredenciales(
  userId: string,
): Promise<{ usuario: string; clave: string }> {
  const filas = await db
    .select()
    .from(docenciaConnection)
    .where(eq(docenciaConnection.userId, userId))
    .limit(1);
  const fila = filas[0];
  if (!fila) {
    throw new ScrapeError(
      "Tu cuenta no está conectada a DocenciaWeb. Conéctala con tu usuario y clave (herramienta docencia_conectar o POST /api/docencia/connect).",
      401,
    );
  }
  return {
    usuario: fila.docenciaUsuario,
    clave: descifrarClavePlana(fila),
  };
}

export async function estadoConexion(
  userId: string,
): Promise<{ conectado: boolean; usuario: string | null; actualizadoEn: Date | null }> {
  const filas = await db
    .select()
    .from(docenciaConnection)
    .where(eq(docenciaConnection.userId, userId))
    .limit(1);
  const fila = filas[0];
  if (!fila) return { conectado: false, usuario: null, actualizadoEn: null };
  return { conectado: true, usuario: fila.docenciaUsuario, actualizadoEn: fila.updatedAt };
}

export async function desconectarDocencia(userId: string): Promise<{ desconectado: boolean }> {
  await db.delete(docenciaConnection).where(eq(docenciaConnection.userId, userId));
  return { desconectado: true };
}

export async function misCursos(userId: string): Promise<CursoInfo[]> {
  return listarCursos(await leerCredenciales(userId));
}

export async function extraerComoUsuario(
  userId: string,
  entrada: EntradaExtraccion,
): Promise<Alumno[] | Justificacion[]> {
  const p = validarExtraccion(entrada);
  const creds = await leerCredenciales(userId);
  if (p.tipo === "lista") {
    return extraer({ ...creds, curso: p.curso, secciones: p.secciones, periodo: p.periodo, tipo: "lista" });
  }
  return extraer({
    ...creds,
    curso: p.curso,
    secciones: p.secciones,
    periodo: p.periodo,
    tipo: "justificaciones",
  });
}
