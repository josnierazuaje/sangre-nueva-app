// Las planillas de LISTA del evento como CSV editable (cartelera, peleadores y
// faltantes), para abrir/editar en Google Sheets o Numbers en una Mac sin Excel
// de pago. Reemplazan a las de .xlsx (xlsxPlanillas.js), que daban líos al
// editar y descargar.
//
// Cada planilla replica la impresa: mismas columnas, mismo orden y agrupación.
// La lógica de agrupar/ordenar/emparejar NO se duplica: se importa de los
// módulos de impresión y de emparejamiento (carteleraGroups, carteleraPeso,
// forcedPairingReasons), así las tres salidas —pantalla, impresa y CSV— dicen
// siempre lo mismo.
//
// El Super 4 NO está acá a propósito: una llave es un dibujo, no una tabla; su
// salida sigue siendo el PDF (pdfSuper4.js).
//
// Sin color ni celdas combinadas (el CSV no los tiene): los dos atletas se
// distinguen por el rótulo de la columna ("Atleta (rojo)" / "Atleta (azul)"),
// y los cruces de peso se marcan con "⚠" en la propia celda de Peso.

import { csvDocument } from "./csv.js";
import { carteleraGroups, carteleraPeso } from "./printCartelera.js";
import { forcedPairingReasons } from "./matchmaking.js";
import { getAgeCategory, getCategoryInfo, getExperienceInfo, weightRangeLabel, EVENT_LABELS } from "../constants.js";

// Encabezados reutilizados.
const COLS_PELEADORES = ["N°", "Nombre", "Sexo", "Peso (kg)", "División", "Edad", "Categoría", "Peleas", "Nivel", "Escuela", "Rival propuesto"];

// Una fila de la planilla de peleadores (peso, edad y peleas como NÚMERO de
// verdad, para poder ordenar y filtrar en la hoja de cálculo).
function filaPeleador(f, i) {
  const cat = getCategoryInfo(f.weightCategory);
  const ac = getAgeCategory(f.age);
  const exp = getExperienceInfo(f.experienceLevel);
  return [
    i + 1,
    f.fullName,
    (f.sexo || "M") === "F" ? "F" : "M",
    Number(f.weightKg),
    cat ? `${cat.label} (${weightRangeLabel(cat)})` : "",
    Number(f.age),
    ac.label,
    Number(f.fightCount),
    exp ? exp.label : "",
    (f.gym || "").toUpperCase(),
    "", // Rival propuesto: vacío, para anotar a mano.
  ];
}

// ============================================
// 1) CARTELERA
// ============================================
export function buildCarteleraCsv(matchups, fighters, subtitulo = EVENT_LABELS.rango) {
  const rows = [];
  rows.push(["Sangre Nueva — La Velada"]);
  rows.push([subtitulo]);
  rows.push([]);
  rows.push(["N°", "Escuela", "Atleta (rojo)", "VS", "Atleta (azul)", "Escuela", "Peso", "Categoría", "Nota"]);

  carteleraGroups(matchups, fighters).forEach(g => {
    rows.push([g.headerText]); // fila de grupo (categoría de edad)
    g.list.forEach(({ m, r, b }, i) => {
      // Columna Peso: la división oficial World Boxing. Si los dos atletas no
      // caen en la misma división, la celda lleva "⚠" y los kilos, para corregir.
      const { division, detalle, cruce, pesos } = carteleraPeso(r, b);
      rows.push([
        i + 1,
        (r.gym || "").toUpperCase(),
        r.fullName,
        "-",
        b.fullName,
        (b.gym || "").toUpperCase(),
        cruce ? `${division} ⚠ ${pesos}` : division,
        detalle,
        m.nota || "",
      ]);
    });
  });

  rows.push([]);
  rows.push(["La grilla está sujeta a modificaciones."]);
  return csvDocument(rows);
}

// ============================================
// 2) PELEADORES
// ============================================
export function buildFightersCsv(fighters, subtitulo = "Todos los peleadores") {
  const rows = [];
  rows.push(["Sangre Nueva — La Velada · Peleadores"]);
  rows.push([subtitulo]);
  rows.push([]);
  rows.push(COLS_PELEADORES);
  (fighters || []).forEach((f, i) => rows.push(filaPeleador(f, i)));
  return csvDocument(rows);
}

// ============================================
// 3) FALTANTES / EMPAREJAMIENTO FORZADO
// ============================================
// Todo en UN solo CSV, en dos secciones apiladas (una hoja de cálculo no las
// separa como el .xlsx en pestañas, pero quedan claras con sus títulos):
//   · "Forzadas": una fila por pelea armada a la fuerza, con "Qué falta para
//     cumplir la norma" y una columna "Corrección" en blanco para anotar.
//   · "Sin rival": los que quedaron sueltos, con la forma de la planilla de
//     Peleadores y su "Rival propuesto" en blanco.
export function buildFaltantesCsv(forzadas, sinRival, fighters, subtitulo = EVENT_LABELS.rango) {
  const byId = {};
  (fighters || []).forEach(f => { byId[f.id] = f; });
  const rows = [];
  rows.push(["Sangre Nueva — La Velada · Emparejamiento forzado"]);
  rows.push([subtitulo]);
  rows.push([]);
  rows.push(["N°", "Escuela", "Atleta (rojo)", "VS", "Atleta (azul)", "Escuela", "Peso", "Categoría", "Qué falta para cumplir la norma", "Corrección"]);

  (forzadas || []).forEach((m, i) => {
    const r = byId[m.fighterRedId], b = byId[m.fighterBlueId];
    if (!r || !b) return; // pelea con un atleta ya eliminado: no sale (igual que en la impresa)
    const { division, detalle, cruce, pesos } = carteleraPeso(r, b);
    const razones = forcedPairingReasons(r, b);
    rows.push([
      i + 1,
      (r.gym || "").toUpperCase(),
      r.fullName,
      "-",
      b.fullName,
      (b.gym || "").toUpperCase(),
      cruce ? `${division} ⚠ ${pesos}` : division,
      detalle,
      razones.length ? razones.map(x => `(${x})`).join("; ") : "✓ Este cruce sí cumple la norma",
      m.nota || "",
    ]);
  });

  rows.push([]);
  rows.push(["Peleas armadas A LA FUERZA: rompen la norma a propósito para que nadie quede sin pelear. Corrige en la última columna."]);

  if (sinRival && sinRival.length) {
    rows.push([]);
    rows.push([]);
    rows.push(["Sin rival — hay que emparejarlos a mano"]);
    rows.push([`${sinRival.length} atleta${sinRival.length === 1 ? "" : "s"} sin pelea`]);
    rows.push([]);
    rows.push(COLS_PELEADORES);
    sinRival.forEach((f, i) => rows.push(filaPeleador(f, i)));
  }

  return csvDocument(rows);
}
