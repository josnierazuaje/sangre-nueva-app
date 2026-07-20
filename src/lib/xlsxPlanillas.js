// Las tres planillas del evento en formato Excel editable (.xlsx).
//
// POR QUÉ: hasta ahora la app solo sabía IMPRIMIR (PDF). Un PDF no se puede
// corregir sin programas de pago, y en la mesa de control siempre hay cambios
// de último minuto (un atleta que no llega, un peso que cambia en la balanza).
// Con estas planillas se baja el archivo, se edita en Numbers / Excel / Google
// Sheets y se imprime desde ahí, sin volver a entrar a la app.
//
// Cada planilla replica la impresa: mismas columnas, mismos colores, mismo
// orden y agrupación. La lógica de agrupar y ordenar NO se duplica: se importa
// de los módulos de impresión (carteleraGroups) para que las dos salidas digan
// siempre lo mismo.

import { buildXlsx } from "./xlsx.js";
import { carteleraGroups, carteleraPeso } from "./printCartelera.js";
import { bracketPrintTitle, bracketMaxFights } from "./super4.js";
import { getAgeCategory, getCategoryInfo, getExperienceInfo, weightRangeLabel, EVENT_LABELS } from "../constants.js";

// Paleta: los MISMOS hex del CSS de las planillas impresas, para que el Excel
// y el PDF se vean iguales.
const NEGRO = "000000", ORO = "FDE047";
const AZUL_TITULO = "BFDBFE", ROJO_JEFE = "EF4444", AZUL_JEFE = "2563EB";
const ROJO_CELDA = "FCA5A5", AZUL_CELDA = "93C5FD";
const GRIS_GRUPO = "E5E7EB", ALERTA_FONDO = "FEE2E2", ALERTA_TEXTO = "B91C1C";
const NARANJA_SUB = "FED7AA", ORO_SUAVE = "F5E6C4", ORO_TEXTO = "7A5B0A";

// Estilos reutilizados (el registro de xlsx.js los deduplica igual, pero
// tenerlos con nombre hace las planillas legibles).
const S = {
  titulo: { bold: true, size: 18, color: ORO, fill: NEGRO, align: "center" },
  subtitulo: { bold: true, size: 11, fill: NARANJA_SUB, align: "center", border: true },
  jefe: { bold: true, fill: AZUL_TITULO, align: "center", border: true, wrap: true },
  jefeRojo: { bold: true, color: "FFFFFF", fill: ROJO_JEFE, align: "center", border: true },
  jefeAzul: { bold: true, color: "FFFFFF", fill: AZUL_JEFE, align: "center", border: true },
  grupo: { bold: true, size: 12, fill: GRIS_GRUPO, align: "center", border: true },
  grupoAlerta: { bold: true, size: 12, color: ALERTA_TEXTO, fill: ALERTA_FONDO, align: "center", border: true },
  celda: { align: "center", border: true },
  celdaIzq: { align: "left", border: true },
  escuela: { bold: true, align: "center", border: true, wrap: true },
  atletaRojo: { bold: true, fill: ROJO_CELDA, align: "center", border: true, wrap: true },
  atletaAzul: { bold: true, fill: AZUL_CELDA, align: "center", border: true, wrap: true },
  nota: { align: "left", border: true, wrap: true },
  pie: { italic: true, bold: true, color: ALERTA_TEXTO, align: "center" },
  campeon: { bold: true, fill: ORO_SUAVE, color: ORO_TEXTO, align: "center", border: true },
  fase: { bold: true, fill: ORO_SUAVE, align: "center", border: true, wrap: true },
};

// ============================================
// 1) CARTELERA
// ============================================
// Mismas columnas que la planilla impresa, con una diferencia a propósito: el
// detalle de categoría ("U15 · 3R × 1,5min") va en su propia columna en vez de
// como letra chica bajo el peso — una celda de Excel no admite dos tamaños de
// letra, y separado además se puede filtrar por categoría.
export function buildCarteleraXlsx(matchups, fighters, subtitulo = EVENT_LABELS.rango) {
  const NCOL = 9;
  const rows = [];
  const merges = [];
  rows.push([{ v: "Sangre Nueva — La Velada", s: S.titulo }]);
  merges.push([0, 0, 0, NCOL - 1]);
  rows.push([{ v: subtitulo, s: S.subtitulo }]);
  merges.push([1, 0, 1, NCOL - 1]);
  rows.push([
    { v: "N°", s: S.jefe }, { v: "Escuela", s: S.jefe }, { v: "Atleta", s: S.jefeRojo },
    { v: "VS", s: S.jefe }, { v: "Atleta", s: S.jefeAzul }, { v: "Escuela", s: S.jefe },
    { v: "Peso", s: S.jefe }, { v: "Categoría", s: S.jefe }, { v: "Nota", s: S.jefe },
  ]);

  carteleraGroups(matchups, fighters).forEach(g => {
    merges.push([rows.length, 0, rows.length, NCOL - 1]);
    rows.push([{ v: g.headerText, s: g.mixta ? S.grupoAlerta : S.grupo }]);
    g.list.forEach(({ m, r, b }, i) => {
      const { rango, detalle } = carteleraPeso(r, b);
      rows.push([
        { v: i + 1, s: S.celda },
        { v: (r.gym || "").toUpperCase(), s: S.escuela },
        { v: r.fullName, s: S.atletaRojo },
        { v: "-", s: S.celda },
        { v: b.fullName, s: S.atletaAzul },
        { v: (b.gym || "").toUpperCase(), s: S.escuela },
        { v: rango, s: S.celda },
        { v: detalle, s: S.celda },
        // Vacía pero con borde: es la columna que se rellena a mano.
        { v: m.nota || "", s: S.nota },
      ]);
    });
  });

  rows.push([]);
  merges.push([rows.length, 0, rows.length, NCOL - 1]);
  rows.push([{ v: "La grilla está sujeta a modificaciones.", s: S.pie }]);

  return buildXlsx([{
    name: "Cartelera",
    cols: [5, 22, 24, 4, 24, 22, 14, 20, 22],
    rows,
    merges,
    freeze: 3,          // el título y los encabezados quedan fijos al bajar
    rowHeights: { 0: 30 },
    landscape: true,
  }]);
}

// ============================================
// 2) SUPER 4
// ============================================
// Las llaves no caben como dibujo en una planilla, así que van como lista:
// una fila por peleador, agrupadas por llave y por fase (Semifinal 1,
// Semifinal 2, Final). La columna "Ganador" lleva el ✓ del que avanzó, y se
// puede corregir a mano si el resultado cambia.
export function buildSuper4Xlsx(super4, byId, fecha = "") {
  const NCOL = 7;
  const rows = [];
  const merges = [];
  const nombre = fid => byId[fid]?.fullName || "—";
  const f = fid => byId[fid] || null;

  rows.push([{ v: "Torneo Super 4 — Sangre Nueva", s: S.titulo }]);
  merges.push([0, 0, 0, NCOL - 1]);
  const sub = `Semifinales: ${EVENT_LABELS.semiLong} · Finales por el cinturón: ${EVENT_LABELS.finalLong}`;
  rows.push([{ v: sub, s: S.subtitulo }]);
  merges.push([1, 0, 1, NCOL - 1]);
  // Tope de peleas con el que se armaron las llaves: se lee de cada bracket
  // guardado, no del selector (que puede haber cambiado sin regenerar). Ojo:
  // cada llave guarda SU tope, y se pueden generar por tandas con topes
  // distintos — la nota general solo se pone si TODAS coinciden; si no, el
  // tope va en el encabezado de cada llave para no afirmar algo falso.
  const topes = new Set((super4 || []).map(b => bracketMaxFights(b)));
  const topeComun = topes.size === 1 ? [...topes][0] : null;
  const etiquetaTope = n => `hasta ${n} pelea${n === 1 ? "" : "s"}`;
  if (topeComun != null) {
    rows.push([{ v: `Torneo limitado a peleadores con ${etiquetaTope(topeComun)}`, s: S.campeon }]);
    merges.push([rows.length - 1, 0, rows.length - 1, NCOL - 1]);
  }
  const filaJefe = rows.length;
  rows.push([
    { v: "Fase", s: S.jefe }, { v: "Esquina", s: S.jefe }, { v: "Peleador", s: S.jefe },
    { v: "Escuela", s: S.jefe }, { v: "Peso", s: S.jefe }, { v: "Edad", s: S.jefe }, { v: "Ganador", s: S.jefe },
  ]);

  (super4 || []).forEach(b => {
    // Si las llaves NO comparten tope, cada una lleva el suyo en su encabezado.
    const topePropio = topeComun == null ? bracketMaxFights(b) : null;
    merges.push([rows.length, 0, rows.length, NCOL - 1]);
    rows.push([{ v: `🏆 ${bracketPrintTitle(b)} — ${b.regla || ""}${topePropio != null ? ` · ${etiquetaTope(topePropio)}` : ""}`, s: S.grupo }]);
    // Una fase = dos filas (rojo y azul); la etiqueta de fase se combina
    // verticalmente para que se lea como un bloque.
    const fase = (etiqueta, redFid, blueFid, winner, phRed, phBlue) => {
      const inicio = rows.length;
      [[redFid, "Rojo", phRed], [blueFid, "Azul", phBlue]].forEach(([fid, lado, ph], i) => {
        const p = f(fid);
        rows.push([
          i === 0 ? { v: etiqueta, s: S.fase } : { v: "", s: S.fase },
          { v: lado, s: { bold: true, color: lado === "Rojo" ? "C0392B" : "2980B9", align: "center", border: true } },
          { v: p ? p.fullName : (ph || "Por definir"), s: lado === "Rojo" ? S.atletaRojo : S.atletaAzul },
          { v: p ? (p.gym || "").toUpperCase() : "", s: S.escuela },
          p ? { v: Number(p.weightKg), s: S.celda } : { v: "", s: S.celda },
          p ? { v: Number(p.age), s: S.celda } : { v: "", s: S.celda },
          { v: (winner && fid && winner === fid) ? "✓" : "", s: { bold: true, color: "1A7A2E", align: "center", border: true } },
        ]);
      });
      merges.push([inicio, 0, inicio + 1, 0]);
    };
    // Las llaves entran al estado ya reparadas por normalizeSuper4, pero la
    // planilla no da por hecho que semis traiga sus dos elementos: si viniera
    // truncada, mejor una llave con cupos vacíos que ninguna descarga.
    const s0 = b.semis?.[0] || {}, s1 = b.semis?.[1] || {};
    fase(`${EVENT_LABELS.semiAbbr} · Semifinal 1`, s0.red, s0.blue, s0.winner);
    fase(`${EVENT_LABELS.semiAbbr} · Semifinal 2`, s1.red, s1.blue, s1.winner);
    fase(`${EVENT_LABELS.finalAbbr} · FINAL`, s0.winner, s1.winner, b.finalWinner, "Ganador Semifinal 1", "Ganador Semifinal 2");
    if (b.finalWinner) {
      merges.push([rows.length, 0, rows.length, NCOL - 1]);
      rows.push([{ v: `🏆 Campeón: ${nombre(b.finalWinner)}`, s: S.campeon }]);
    }
    rows.push([]); // una fila en blanco entre llaves
  });

  merges.push([rows.length, 0, rows.length, NCOL - 1]);
  rows.push([{ v: `Llaves sujetas a modificaciones.${fecha ? " Generado el " + fecha : ""}`, s: S.pie }]);

  return buildXlsx([{
    name: "Super 4",
    cols: [24, 10, 26, 22, 8, 8, 10],
    rows,
    merges,
    freeze: filaJefe + 1,
    rowHeights: { 0: 30 },
    landscape: false,
  }]);
}

// ============================================
// 3) PELEADORES
// ============================================
// La lista tal como se está viendo en pantalla (respeta los filtros activos,
// igual que la impresión). Peso, edad y peleas van como NÚMERO de verdad para
// poder ordenar y filtrar en Excel; la columna "Rival propuesto" va vacía con
// borde, para anotar a mano.
export function buildFightersXlsx(fighters, subtitulo = "Todos los peleadores") {
  const NCOL = 11;
  const rows = [];
  const merges = [];
  rows.push([{ v: "Sangre Nueva — La Velada · Peleadores", s: S.titulo }]);
  merges.push([0, 0, 0, NCOL - 1]);
  rows.push([{ v: subtitulo, s: S.subtitulo }]);
  merges.push([1, 0, 1, NCOL - 1]);
  rows.push([
    { v: "N°", s: S.jefe }, { v: "Nombre", s: S.jefe }, { v: "Sexo", s: S.jefe },
    { v: "Peso (kg)", s: S.jefe }, { v: "División", s: S.jefe }, { v: "Edad", s: S.jefe },
    { v: "Categoría", s: S.jefe }, { v: "Peleas", s: S.jefe }, { v: "Nivel", s: S.jefe },
    { v: "Escuela", s: S.jefe }, { v: "Rival propuesto", s: S.jefe },
  ]);
  (fighters || []).forEach((f, i) => {
    const cat = getCategoryInfo(f.weightCategory);
    const ac = getAgeCategory(f.age);
    const exp = getExperienceInfo(f.experienceLevel);
    rows.push([
      { v: i + 1, s: S.celda },
      { v: f.fullName, s: { bold: true, align: "left", border: true, wrap: true } },
      { v: (f.sexo || "M") === "F" ? "F" : "M", s: S.celda },
      { v: Number(f.weightKg), s: S.celda },
      { v: cat ? `${cat.label} (${weightRangeLabel(cat)})` : "", s: S.celda },
      { v: Number(f.age), s: S.celda },
      { v: ac.label, s: S.celda },
      { v: Number(f.fightCount), s: S.celda },
      { v: exp ? exp.label : "", s: S.celda },
      { v: (f.gym || "").toUpperCase(), s: S.celdaIzq },
      { v: "", s: S.nota },
    ]);
  });
  return buildXlsx([{
    name: "Peleadores",
    cols: [5, 26, 6, 10, 22, 7, 12, 8, 18, 22, 24],
    rows,
    merges,
    freeze: 3,
    autoFilter: 2,      // los menús de filtro quedan en la fila de encabezados
    rowHeights: { 0: 30 },
    landscape: true,
  }]);
}
