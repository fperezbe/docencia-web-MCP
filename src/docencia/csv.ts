import type { Alumno, Justificacion } from "./client.js";

// CSV con `;` (abre bien en Excel en español) y BOM UTF-8 (acentos intactos).
const SEP = ";";
const BOM = String.fromCharCode(0xFEFF);

function celda(v: unknown): string {
  const t = v === undefined || v === null ? "" : String(v);
  return /[";\n\r]/.test(t) || t !== t.trim() ? `"${t.replace(/"/g, '""')}"` : t;
}

function csv(filas: unknown[][]): string {
  return BOM + filas.map((f) => f.map(celda).join(SEP)).join("\r\n") + "\r\n";
}

export function csvLista(alumnos: Alumno[]): string {
  return csv([
    ["N°", "Sección", "RUT", "Código Alumno", "Nombre", "Repitencias", "Carrera"],
    ...alumnos.map((a, i) => [i + 1, a.Seccion, a.RUT, a["Cod Alumno"], a.Nombre, a.Repitencias, a.Carrera]),
  ]);
}

export function csvJustificaciones(justificaciones: Justificacion[]): string {
  return csv([
    ["Sección", "Nombre", "RUT", "Tipo", "Desde", "Hasta", "Observaciones"],
    ...justificaciones.map((j) => [j.Seccion, j.Nombre, j.RUT, j.Tipo, j.Desde, j.Hasta, j.Observaciones]),
  ]);
}
