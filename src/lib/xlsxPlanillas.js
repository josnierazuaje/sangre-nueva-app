// Las planillas de LISTA del evento en formato Excel editable (.xlsx):
// cartelera, faltantes y peleadores.
//
// POR QUÉ: hasta ahora la app solo sabía IMPRIMIR (PDF). Un PDF no se puede
// corregir sin programas de pago, y en la mesa de control siempre hay cambios
// de último minuto (un atleta que no llega, un peso que cambia en la balanza).
// Con estas planillas se baja el archivo, se edita en Numbers / Excel / Google
// Sheets y se imprime desde ahí, sin volver a entrar a la app.
//
// El Super 4 NO está acá a propósito: una llave es un dibujo (semifinales,
// final y las líneas que las unen), y metida en filas de planilla deja de ser
// una llave. Su salida es el PDF de pdfSuper4.js, y se corrige en la app.
//
// Cada planilla replica la impresa: mismas columnas, mismos colores, mismo
// orden y agrupación. La lógica de agrupar y ordenar NO se duplica: se importa
// de los módulos de impresión (carteleraGroups) para que las dos salidas digan
// siempre lo mismo.

import { buildXlsx } from "./xlsx.js";
import { carteleraGroups, carteleraPeso } from "./printCartelera.js";
import { forcedPairingReasons } from "./matchmaking.js";
import { getAgeCategory, getCategoryInfo, getExperienceInfo, weightRangeLabel, EVENT_LABELS } from "../constants.js";

// Paleta: los MISMOS hex del CSS de las planillas impresas, para que el Excel
// y el PDF se vean iguales.
const NEGRO = "000000", ORO = "FDE047";
const AZUL_TITULO = "BFDBFE", ROJO_JEFE = "EF4444", AZUL_JEFE = "2563EB";
const ROJO_CELDA = "FCA5A5", AZUL_CELDA = "93C5FD";
const GRIS_GRUPO = "E5E7EB", ALERTA_FONDO = "FEE2E2", ALERTA_TEXTO = "B91C1C";
const NARANJA_SUB = "FED7AA";

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
  peso: { bold: true, align: "center", border: true, wrap: true },
  pesoCruce: { bold: true, color: ALERTA_TEXTO, fill: ALERTA_FONDO, align: "center", border: true, wrap: true },
  celdaIzq: { align: "left", border: true },
  escuela: { bold: true, align: "center", border: true, wrap: true },
  atletaRojo: { bold: true, fill: ROJO_CELDA, align: "center", border: true, wrap: true },
  atletaAzul: { bold: true, fill: AZUL_CELDA, align: "center", border: true, wrap: true },
  nota: { align: "left", border: true, wrap: true },
  // Lo que le falta a una pelea FORZADA para ser reglamentaria: en rojo sobre
  // fondo de alerta, igual que la nota roja de la app.
  faltaria: { color: ALERTA_TEXTO, fill: ALERTA_FONDO, align: "left", border: true, wrap: true },
  pie: { italic: true, bold: true, color: ALERTA_TEXTO, align: "center" },
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
      // Columna Peso: la división oficial World Boxing, no los kilos sueltos.
      // Si los dos atletas no caen en la misma división, la celda va en rojo y
      // lleva los kilos entre paréntesis para poder corregirlo.
      const { division, detalle, cruce, pesos } = carteleraPeso(r, b);
      rows.push([
        { v: i + 1, s: S.celda },
        { v: (r.gym || "").toUpperCase(), s: S.escuela },
        { v: r.fullName, s: S.atletaRojo },
        { v: "-", s: S.celda },
        { v: b.fullName, s: S.atletaAzul },
        { v: (b.gym || "").toUpperCase(), s: S.escuela },
        { v: cruce ? `${division} ⚠ ${pesos}` : division, s: cruce ? S.pesoCruce : S.peso },
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
    cols: [5, 22, 24, 4, 24, 22, 22, 20, 22],
    rows,
    merges,
    freeze: 3,          // el título y los encabezados quedan fijos al bajar
    rowHeights: { 0: 30 },
    landscape: true,
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

// ============================================
// 4) FALTANTES / EMPAREJAMIENTO FORZADO
// ============================================
// Las peleas armadas A LA FUERZA, para corregirlas a mano. Va en DOS hojas:
//   "Forzadas" — una fila por pelea, con la columna "Qué falta para cumplir la
//     norma" (en rojo) y una columna "Corrección" en blanco para anotar el
//     cambio (otro rival, kilos pactados, exhibición…).
//   "Sin rival" — los que quedaron sin pelea (p.ej. el impar), con la misma
//     forma que la planilla de Peleadores y su "Rival propuesto" vacío.
// Las razones se recalculan con forcedPairingReasons —la MISMA función que
// pinta la nota roja en la app y en la planilla impresa—, así que las tres
// salidas dicen siempre exactamente lo mismo.
export function buildFaltantesXlsx(forzadas, sinRival, fighters, subtitulo = EVENT_LABELS.rango) {
  const byId = {};
  (fighters || []).forEach(f => { byId[f.id] = f; });
  const NCOL = 10;
  const rows = [];
  const merges = [];
  rows.push([{ v: "Sangre Nueva — La Velada · Emparejamiento forzado", s: S.titulo }]);
  merges.push([0, 0, 0, NCOL - 1]);
  rows.push([{ v: subtitulo, s: S.subtitulo }]);
  merges.push([1, 0, 1, NCOL - 1]);
  rows.push([
    { v: "N°", s: S.jefe }, { v: "Escuela", s: S.jefe }, { v: "Atleta", s: S.jefeRojo },
    { v: "VS", s: S.jefe }, { v: "Atleta", s: S.jefeAzul }, { v: "Escuela", s: S.jefe },
    { v: "Peso", s: S.jefe }, { v: "Categoría", s: S.jefe },
    { v: "Qué falta para cumplir la norma", s: S.jefe }, { v: "Corrección", s: S.jefe },
  ]);

  (forzadas || []).forEach((m, i) => {
    const r = byId[m.fighterRedId], b = byId[m.fighterBlueId];
    if (!r || !b) return;   // pelea con un atleta ya eliminado: no sale (igual que en la impresa)
    const { division, detalle, cruce, pesos } = carteleraPeso(r, b);
    const razones = forcedPairingReasons(r, b);
    rows.push([
      { v: i + 1, s: S.celda },
      { v: (r.gym || "").toUpperCase(), s: S.escuela },
      { v: r.fullName, s: S.atletaRojo },
      { v: "-", s: S.celda },
      { v: b.fullName, s: S.atletaAzul },
      { v: (b.gym || "").toUpperCase(), s: S.escuela },
      { v: cruce ? `${division} ⚠ ${pesos}` : division, s: cruce ? S.pesoCruce : S.peso },
      { v: detalle, s: S.celda },
      razones.length
        ? { v: razones.map(x => `(${x})`).join("; "), s: S.faltaria }
        : { v: "✓ Este cruce sí cumple la norma", s: S.nota },
      // En blanco con borde: es la columna que se rellena a mano.
      { v: m.nota || "", s: S.nota },
    ]);
  });

  rows.push([]);
  merges.push([rows.length, 0, rows.length, NCOL - 1]);
  rows.push([{ v: "Peleas armadas A LA FUERZA: rompen la norma a propósito para que nadie quede sin pelear. Corrige en la última columna.", s: S.pie }]);

  const hojas = [{
    name: "Forzadas",
    cols: [5, 22, 24, 4, 24, 22, 22, 20, 52, 26],
    rows,
    merges,
    freeze: 3,
    rowHeights: { 0: 30 },
    landscape: true,
  }];

  if (sinRival && sinRival.length) {
    const N2 = 11;
    const r2 = [];
    const m2 = [];
    r2.push([{ v: "Sin rival — hay que emparejarlos a mano", s: S.titulo }]);
    m2.push([0, 0, 0, N2 - 1]);
    r2.push([{ v: `${sinRival.length} atleta${sinRival.length === 1 ? "" : "s"} sin pelea`, s: S.subtitulo }]);
    m2.push([1, 0, 1, N2 - 1]);
    r2.push([
      { v: "N°", s: S.jefe }, { v: "Nombre", s: S.jefe }, { v: "Sexo", s: S.jefe },
      { v: "Peso (kg)", s: S.jefe }, { v: "División", s: S.jefe }, { v: "Edad", s: S.jefe },
      { v: "Categoría", s: S.jefe }, { v: "Peleas", s: S.jefe }, { v: "Nivel", s: S.jefe },
      { v: "Escuela", s: S.jefe }, { v: "Rival propuesto", s: S.jefe },
    ]);
    sinRival.forEach((f, i) => {
      const cat = getCategoryInfo(f.weightCategory);
      const ac = getAgeCategory(f.age);
      const exp = getExperienceInfo(f.experienceLevel);
      r2.push([
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
    hojas.push({
      name: "Sin rival",
      cols: [5, 26, 6, 10, 22, 7, 12, 8, 18, 22, 24],
      rows: r2,
      merges: m2,
      freeze: 3,
      autoFilter: 2,
      rowHeights: { 0: 30 },
      landscape: true,
    });
  }

  return buildXlsx(hojas);
}
