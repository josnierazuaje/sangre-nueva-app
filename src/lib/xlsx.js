// Generador de libros de Excel (.xlsx) sin dependencias externas.
//
// Un .xlsx es un ZIP (ver zip.js) con varios XML del formato OOXML. Aquí se
// arman esos XML a partir de una descripción simple de hojas, para que las
// planillas del evento (cartelera, Super 4, peleadores) se puedan DESCARGAR
// EDITABLES en vez de solo imprimirse en PDF: en la mesa de control se corrige
// un nombre o un peso de último minuto sin volver a entrar a la app.
//
// El archivo resultante abre tal cual en Excel, en Numbers (viene con macOS),
// en Google Sheets y en LibreOffice.
//
// FORMA DE UNA HOJA:
//   {
//     name: "Cartelera",            // ≤31 caracteres, sin : \ / ? * [ ]
//     cols: [6, 26, 24],            // ancho de cada columna (en caracteres)
//     rows: [ [celda, celda, …], …],
//     merges: [[r1,c1,r2,c2], …],   // celdas combinadas, índices desde 0
//     freeze: 2,                    // congelar las 2 primeras filas
//     autoFilter: 1,                // fila (índice desde 0) con los filtros
//     rowHeights: { 0: 30 },        // alto puntual de una fila
//     landscape: true,              // orientación al imprimir desde Excel
//   }
//
// FORMA DE UNA CELDA: null | "texto" | 12.5 | { v, s } donde `s` es un objeto
// de estilo { bold, italic, size, color, fill, align, wrap, border }. Los
// colores van en hexadecimal RGB sin "#" ("FCA5A5"), igual que en el CSS de
// las planillas impresas, para que ambas salidas se vean iguales.

import { zipSync } from "./zip.js";

// Escapa texto para XML. Además quita los caracteres de control que XML 1.0
// prohíbe: si un nombre pegado desde otra parte trae uno, Excel rechazaría el
// libro entero como dañado.
export function escapeXml(s) {
  return String(s ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

// Índice de columna (0) → letra de Excel ("A", …, "Z", "AA", …).
export function colLetter(i) {
  let s = "", n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

// "A1", "BC12"… a partir de fila y columna con índice desde 0.
export function cellRef(row, col) { return colLetter(col) + (row + 1); }

// Los nombres de hoja que Excel rechaza (caracteres prohibidos o más de 31
// caracteres) hacen que el libro no abra. Se saneen en silencio.
function safeSheetName(name, fallback) {
  const clean = String(name || fallback).replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return clean || fallback;
}

// ============================================
// REGISTRO DE ESTILOS
// ============================================
// Excel no guarda el formato en la celda: la celda apunta con s="N" a una
// entrada de styles.xml. Este registro deduplica — mil filas con el mismo
// fondo rojo comparten una sola entrada.
class StyleRegistry {
  constructor() {
    // Las fuentes/rellenos/bordes en el índice 0 son los "por defecto" y deben
    // existir siempre. Además Excel EXIGE que el relleno 1 sea "gray125": si
    // falta, algunas versiones reparan el archivo al abrirlo.
    this.fonts = ['<font><sz val="11"/><color rgb="FF000000"/><name val="Arial"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.cache = new Map();
  }
  _index(list, xml) {
    const at = list.indexOf(xml);
    if (at !== -1) return at;
    list.push(xml);
    return list.length - 1;
  }
  // Devuelve el índice de estilo para un objeto de estilo (o 0 si no hay).
  get(style) {
    if (!style) return 0;
    const key = JSON.stringify(style, Object.keys(style).sort());
    if (this.cache.has(key)) return this.cache.get(key);
    const { bold, italic, size, color, fill, align, valign, wrap, border } = style;
    const fontId = this._index(this.fonts,
      "<font>" + (bold ? "<b/>" : "") + (italic ? "<i/>" : "") +
      `<sz val="${size || 11}"/><color rgb="FF${(color || "000000").toUpperCase()}"/><name val="Arial"/></font>`);
    const fillId = fill
      ? this._index(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${fill.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    const borderId = border
      ? this._index(this.borders, '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>')
      : 0;
    const alignment = (align || valign || wrap)
      ? `<alignment${align ? ` horizontal="${align}"` : ""} vertical="${valign || "center"}"${wrap ? ' wrapText="1"' : ""}/>`
      : "";
    const xf = `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      ` applyFont="1"${fillId ? ' applyFill="1"' : ""}${borderId ? ' applyBorder="1"' : ""}${alignment ? ' applyAlignment="1"' : ""}>` +
      alignment + "</xf>";
    const id = this._index(this.xfs, xf);
    this.cache.set(key, id);
    return id;
  }
  xml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>";
  }
}

// ============================================
// HOJA
// ============================================
function sheetXml(sheet, styles) {
  const rows = sheet.rows || [];
  const heights = sheet.rowHeights || {};
  let maxCols = 1;
  const rowsXml = rows.map((cells, r) => {
    const list = cells || [];
    if (list.length > maxCols) maxCols = list.length;
    const cellsXml = list.map((cell, c) => {
      // Vacía y sin estilo: no se escribe nada. (Para dejar una celda vacía
      // PERO con borde/fondo — las columnas "Nota" y "Rival propuesto", que se
      // rellenan a mano en la mesa — se pasa { v: "", s: estilo }.)
      if (cell === null || cell === undefined || cell === "") return "";
      const obj = (typeof cell === "object") ? cell : { v: cell };
      const s = styles.get(obj.s);
      const sAttr = s ? ` s="${s}"` : "";
      const ref = cellRef(r, c);
      if (typeof obj.v === "number") {
        // NaN/Infinity: pasa cuando a un peleador le falta el peso o la edad y
        // se hace Number(undefined). Se deja la celda VACÍA (pero con su borde
        // y color) en vez de escribir el texto "NaN", que en la mesa de
        // control se leería como un dato de verdad.
        if (!Number.isFinite(obj.v)) return `<c r="${ref}"${sAttr}/>`;
        // Los números van como número de verdad (no texto): así en Excel se
        // pueden ordenar, filtrar y sumar — la gracia de tenerlo en planilla.
        return `<c r="${ref}"${sAttr}><v>${obj.v}</v></c>`;
      }
      // Texto "en línea": evita tener que mantener la tabla sharedStrings.
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(obj.v)}</t></is></c>`;
    }).join("");
    const h = heights[r];
    return `<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>${cellsXml}</row>`;
  }).join("");

  const cols = (sheet.cols || []).length
    ? "<cols>" + sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>"
    : "";
  const freeze = sheet.freeze
    ? `<pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/>` +
      '<selection pane="bottomLeft"/>'
    : "";
  const merges = (sheet.merges || []).length
    ? `<mergeCells count="${sheet.merges.length}">` +
      sheet.merges.map(([r1, c1, r2, c2]) => `<mergeCell ref="${cellRef(r1, c1)}:${cellRef(r2, c2)}"/>`).join("") +
      "</mergeCells>"
    : "";
  const lastRow = Math.max(rows.length, 1);
  const filter = (sheet.autoFilter != null && rows.length)
    ? `<autoFilter ref="${cellRef(sheet.autoFilter, 0)}:${cellRef(lastRow - 1, maxCols - 1)}"/>`
    : "";
  // OJO: el orden de estos elementos NO es libre — el esquema de OOXML lo fija
  // (dimension, sheetViews, sheetFormatPr, cols, sheetData, autoFilter,
  // mergeCells, pageMargins, pageSetup). Cambiarlo hace que Excel pida
  // "reparar" el archivo.
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    // fitToWidth/fitToHeight del <pageSetup> los IGNORA Excel si no se activa
    // aquí "ajustar a la página". Sin esto, imprimir desde Excel corta las
    // columnas de la derecha en vez de encogerlas para que quepan.
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${cellRef(lastRow - 1, maxCols - 1)}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rowsXml}</sheetData>` +
    filter +
    merges +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    `<pageSetup orientation="${sheet.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
    "</worksheet>";
}

// ============================================
// LIBRO
// ============================================
// Devuelve el .xlsx completo como Uint8Array. Función pura: la misma entrada
// da siempre el mismo archivo (útil para los tests).
export function buildXlsx(sheets) {
  const list = (sheets && sheets.length) ? sheets : [{ name: "Hoja1", rows: [] }];
  const styles = new StyleRegistry();
  const sheetsXml = list.map(s => sheetXml(s, styles)); // primero: llena el registro de estilos
  const names = list.map((s, i) => safeSheetName(s.name, "Hoja" + (i + 1)));
  const files = [
    {
      name: "[Content_Types].xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    },
    {
      name: "xl/workbook.xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        "<sheets>" +
        names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets></workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    },
    { name: "xl/styles.xml", data: styles.xml() },
    ...sheetsXml.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml })),
  ];
  return zipSync(files);
}
