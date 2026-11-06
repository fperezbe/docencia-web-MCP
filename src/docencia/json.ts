import type { Alumno, Justificacion } from "./client.js";

// Formato JSON estable para integraciones (Apps Script, planillas, etc.).
// Se normalizan los nombres de columna del Excel de DocenciaWeb a camelCase.

export interface AlumnoJson {
  seccion: number | string;
  rut: string;
  codigoAlumno: string;
  nombre: string;
  repitencias: string;
  carrera: string;
}

export interface JustificacionJson {
  seccion: number | string;
  nombre: string;
  rut: string;
  tipo: string;
  desde: string;
  hasta: string;
  observaciones: string;
}

export function alumnosJson(filas: Alumno[]): AlumnoJson[] {
  return filas.map((a) => ({
    seccion: a.Seccion,
    rut: a.RUT,
    codigoAlumno: a["Cod Alumno"],
    nombre: a.Nombre,
    repitencias: a.Repitencias,
    carrera: a.Carrera,
  }));
}

export function justificacionesJson(filas: Justificacion[]): JustificacionJson[] {
  return filas.map((j) => ({
    seccion: j.Seccion,
    nombre: j.Nombre,
    rut: j.RUT,
    tipo: j.Tipo,
    desde: j.Desde,
    hasta: j.Hasta,
    observaciones: j.Observaciones,
  }));
}
