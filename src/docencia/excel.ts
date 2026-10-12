import XLSX from "xlsx-js-style";
import type { Alumno, Justificacion } from "./client.js";

const linea = { style: "thin", color: { auto: 1 } };
const borde = { top: linea, bottom: linea, left: linea, right: linea };

const ESTILO = {
  encabezado: {
    fill: { fgColor: { rgb: "005596" } },
    font: { color: { rgb: "FFFFFF" }, bold: true },
    alignment: { horizontal: "center", vertical: "center" },
    border: borde,
  },
  dato: { border: borde, alignment: { vertical: "center" } },
  centro: { border: borde, alignment: { horizontal: "center", vertical: "center" } },
  centroNegrita: {
    border: borde,
    alignment: { horizontal: "center", vertical: "center" },
    font: { bold: true },
  },
};

const aBuffer = (wb: unknown): Buffer =>
  XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

const ordenSecciones = (a: number | string, b: number | string): number =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));

// Hoja "Alumnos": título combinado, tabla de alumnos (A:G) y, al lado (I:J),
// la cantidad de alumnos por sección con fórmulas COUNTIF y un total con SUM.
export function excelLista(alumnos: Alumno[]): Buffer {
  const encabezados = ["N°", "Sección", "RUT", "Código Alumno", "Nombre", "Repitencias", "Carrera"];
  const aoa: unknown[][] = [
    ["ALUMNOS/AS", "", "", "", "", "", ""],
    encabezados,
    ...alumnos.map((a, i) => [
      i + 1,
      a.Seccion,
      a.RUT,
      a["Cod Alumno"],
      a.Nombre,
      a.Repitencias,
      a.Carrera,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const ultimaFila = aoa.length - 1;

  // Estilos de la tabla principal. Centradas: N°, Sección, RUT, Repitencias y Carrera.
  for (let r = 0; r <= ultimaFila; r++) {
    for (let c = 0; c <= 6; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (!celda) continue;
      celda.s = r <= 1 ? ESTILO.encabezado : [0, 1, 2, 5, 6].includes(c) ? ESTILO.centro : ESTILO.dato;
    }
  }
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  ws["!cols"] = [{ wch: 4 }, { wch: 8 }, { wch: 13 }, { wch: 18 }, { wch: 45 }, { wch: 12 }, { wch: 8 }];

  // Distribución por sección (fórmula + valor calculado para visores sin recálculo).
  const secciones = [...new Set(alumnos.map((a) => a.Seccion))].sort(ordenSecciones);
  const tabla: unknown[][] = secciones.map((sec, i) => [
    sec,
    {
      t: "n",
      f: `COUNTIF(Alumnos!B:B, I${i + 2})`,
      v: alumnos.filter((a) => a.Seccion === sec).length,
    },
  ]);
  tabla.push(["", { t: "n", f: `SUM(J2:J${secciones.length + 1})`, v: alumnos.length }]);
  XLSX.utils.sheet_add_aoa(ws, tabla, { origin: "I2" });

  for (let r = 1; r <= secciones.length + 1; r++) {
    const colI = ws[XLSX.utils.encode_cell({ r, c: 8 })];
    const colJ = ws[XLSX.utils.encode_cell({ r, c: 9 })];
    if (colI) colI.s = ESTILO.centro;
    if (colJ) colJ.s = r === secciones.length + 1 ? ESTILO.centroNegrita : ESTILO.centro;
  }

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(ultimaFila, secciones.length + 1), c: 9 },
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Alumnos");
  return aBuffer(wb);
}

// Hoja "Justificaciones": una fila por justificación, sin estilos.
export function excelJustificaciones(justificaciones: Justificacion[]): Buffer {
  const aoa: unknown[][] = [
    ["Sección", "Nombre", "RUT", "Tipo", "Desde", "Hasta", "Observaciones"],
    ...justificaciones.map((j) => [j.Seccion, j.Nombre, j.RUT, j.Tipo, j.Desde, j.Hasta, j.Observaciones]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Justificaciones");
  return aBuffer(wb);
}
