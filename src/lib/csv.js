// Generador de CSV (texto plano separado por comas), el formato que Google
// Sheets y Numbers abren/importan sin problemas en una Mac sin Excel de pago.
//
// POR QUÉ CSV Y NO .xlsx: el .xlsx hecho a mano (OOXML) daba líos al editar y
// descargar en Mac (Numbers lo maltrata, Google Sheets a veces no lo importa
// limpio). El CSV es universal: se abre con doble clic en Numbers y se sube/
// importa a Google Sheets tal cual. Se pierde el color y las celdas combinadas,
// pero los DATOS —que es lo que se corrige en la mesa de control— quedan
// intactos y editables.
//
// Escapado RFC 4180: una celda se entrecomilla si trae coma, comilla o salto de
// línea, y las comillas internas se duplican. Filas separadas por CRLF (lo más
// compatible entre programas de planilla).

// Convierte un valor de celda a su forma segura para CSV.
//
// Anti "inyección de fórmulas": Google Sheets/Excel/Numbers interpretan como
// FÓRMULA cualquier celda que empiece con = + - @ (o tab/retorno). Un nombre de
// asistente tecleado como "=1+1", o un teléfono "+569..." puesto en el campo del
// nombre, saldría evaluado y corrompería la planilla (o, con =HYPERLINK/IMPORTXML,
// filtraría datos). Se antepone un apóstrofo, que esos programas tratan como
// "texto literal" y no muestran. Los NÚMEROS no se tocan (nunca son fórmula y así
// se mantienen numéricos para sumar/ordenar en la hoja).
export function csvCell(v) {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// De una matriz de filas (cada fila, un arreglo de valores) arma el texto CSV.
export function toCsv(rows) {
  return (rows || [])
    .map(row => (Array.isArray(row) ? row : []).map(csvCell).join(","))
    .join("\r\n");
}

// Documento CSV listo para descargar: lleva el BOM de UTF-8 al inicio
// para que los acentos (José, Wélter) y símbolos (⚠) salgan bien tanto al abrir
// con doble clic en Numbers como al importar en Google Sheets.
export function csvDocument(rows) {
  return String.fromCharCode(0xFEFF) + toCsv(rows);
}
