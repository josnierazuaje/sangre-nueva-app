// ============================================
// PDF DE LAS LLAVES DEL SUPER 4
// ============================================
// El torneo por cinturones no es una tabla: es un DIBUJO. Semifinales a la
// izquierda, la final a la derecha y las líneas que las unen — igual que en la
// pestaña Super 4 de la app. Metido en una planilla de Excel ese dibujo se
// pierde (queda una lista de filas "Fase / Esquina / Peleador"), y editable no
// aporta nada: las llaves se corrigen EN LA APP, que es donde están las reglas.
//
// Por eso esta salida es un PDF cerrado y cuidado: se manda por WhatsApp, se
// ve idéntico en cualquier teléfono y se puede imprimir tal cual para la mesa
// de control. Se dibuja con el generador propio (pdf.js), sin librerías.
//
// DECISIÓN DE DISEÑO: la app es oscura (el "Foso de Luz"), pero un PDF negro a
// página completa es ilegible impreso y se come la tinta. Se traslada la MISMA
// identidad a papel: negro y oro solo en las franjas, tarjetas claras, esquinas
// roja y azul, y el oro reservado —como en la app— para la final y el campeón.

import { createPdf, A4, F, textWidth, ellipsize, mixColor, cubicSegments } from "./pdf.js";
import { bracketPrintTitle, bracketMaxFights, bracketConditions } from "./super4.js";
import { EVENT_LABELS, weightRangeLabel } from "../constants.js";

// ---------- Paleta ----------
// Los mismos tonos de la app, ajustados al papel (los grises de la app son
// luces sobre negro; acá son tintas sobre blanco).
const NEGRO = "#0B0A0C";
const ORO = "#C8A04A";        // oro de la app (boxing-goldFight)
const ORO_CLARO = "#E5C76B";  // oro brillante (títulos sobre negro)
const ORO_TENUE = "#F7EFD8";  // fondo de la final y del ganador
const ORO_PAPEL = "#FBF3DF";  // fondo de la cinta del campeón
const ORO_TEXTO = "#7A5B0A";  // texto sobre fondo dorado
const CREMA = "#EFE7D6";
const ROJO = "#C42438";       // esquina roja
const AZUL = "#2563EB";       // esquina azul
const VERDE = "#1A7A2E";      // ✓ del que avanza
const TINTA = "#141210";      // texto principal
const TINTA_SUAVE = "#4A443B";
const GRIS_TEXTO = "#8C8578";
const GRIS_APAGADO = "#A9A296"; // perdedores y cupos libres
const LINEA = "#CFC8BA";
const LINEA_SUAVE = "#E3DDD0";
const CINTA = "#F4F1E9";      // encabezado de cada tarjeta

// ---------- Medidas (en puntos: 1 pt = 1/72") ----------
const MARGEN = 36;
const ANCHO = A4.width - MARGEN * 2;          // 523.28
const CARD_SEMI = 230;                        // ancho de las tarjetas de semifinal
const CONECTOR = 56;                          // pasillo donde van las venas
const CARD_FINAL = ANCHO - CARD_SEMI - CONECTOR;
const CARD_ALTO = 60;                         // cinta (15) + dos filas (22,5)
const FILA_ALTO = 22.5;
const CINTA_ALTO = 15;
const SEMI_SEP = 28;                          // aire entre semifinal 1 y 2
const BRACKET_ALTO = CARD_ALTO * 2 + SEMI_SEP;// 148
const TITULO_ALTO = 26;                       // título del cinturón + regla
const BLOQUE_ALTO = TITULO_ALTO + BRACKET_ALTO;
const BLOQUE_SEP = 26;                        // aire entre cinturones
const PIE_Y = A4.height - 48;                 // línea del pie
const FONDO_LIBRE = A4.height - 60;           // hasta acá puede llegar un bloque

// ============================================
// API
// ============================================
// Devuelve los bytes del .pdf. Función pura y testeable: recibe las llaves, el
// índice de peleadores y la fecha ya formateada (no llama a new Date()).
export function buildSuper4Pdf(super4, byId, fecha = "") {
  const llaves = Array.isArray(super4) ? super4 : [];
  const doc = createPdf({ title: "Torneo Super 4 — Sangre Nueva", author: "Sangre Nueva — La Velada" });

  // Tope de peleas: cada llave guarda el suyo y se pueden generar por tandas
  // con topes distintos. Solo se anuncia arriba si TODAS coinciden; si no, el
  // tope viaja como píldora en la cabecera de cada llave (misma regla que la
  // planilla de Excel, para no afirmar algo falso).
  const topes = new Set(llaves.map(b => bracketMaxFights(b)));
  const topeComun = topes.size === 1 ? [...topes][0] : null;

  // Reparto en páginas: los bloques miden todos igual, así que entran los que
  // quepan bajo la cabecera (la primera página lleva la grande).
  const paginas = [];
  let actual = null;
  llaves.forEach(b => {
    const inicio = actual ? actual.y : alturaCabecera(true, topeComun);
    if (!actual || inicio + BLOQUE_ALTO > FONDO_LIBRE) {
      actual = { primera: paginas.length === 0, bloques: [], y: alturaCabecera(paginas.length === 0, topeComun) };
      paginas.push(actual);
    }
    actual.bloques.push({ b, y: actual.y });
    actual.y += BLOQUE_ALTO + BLOQUE_SEP;
  });
  if (!paginas.length) paginas.push({ primera: true, bloques: [], y: 0 });

  paginas.forEach((p, i) => {
    if (i > 0) doc.addPage();
    dibujarCabecera(doc, p.primera, topeComun);
    p.bloques.forEach(({ b, y }) => dibujarLlave(doc, b, byId, MARGEN, y, topeComun));
    if (!p.bloques.length) {
      doc.text("No hay llaves generadas todavía.", A4.width / 2, 260,
        { font: F.serifItalic, size: 13, color: GRIS_APAGADO, align: "center" });
    }
    dibujarPie(doc, fecha, i + 1, paginas.length);
  });

  return doc.build();
}

// Dónde empieza el primer bloque de una página (bajo su cabecera).
function alturaCabecera(primera, topeComun) {
  if (!primera) return 70;
  return topeComun != null ? 152 : 130;
}

// ============================================
// Cabecera y pie
// ============================================
function dibujarCabecera(doc, primera, topeComun) {
  if (!primera) {
    // Páginas siguientes: una franja fina, para que el papel respire y se siga
    // sabiendo de qué documento es cada hoja suelta.
    doc.rect(0, 0, A4.width, 46, { fill: NEGRO });
    doc.rect(0, 46, A4.width, 1.5, { fill: ORO });
    doc.text("TORNEO SUPER 4 — SANGRE NUEVA", A4.width / 2, 29,
      { font: F.sansBold, size: 12.5, color: ORO_CLARO, align: "center", tracking: 3 });
    return;
  }
  doc.rect(0, 0, A4.width, 86, { fill: NEGRO });
  doc.rect(0, 86, A4.width, 2.2, { fill: ORO });
  doc.text("TORNEO SUPER 4", A4.width / 2, 45,
    { font: F.sansBold, size: 25, color: ORO_CLARO, align: "center", tracking: 6.5 });
  // Filetes a los lados del subtítulo: el aire de un programa de velada.
  const sub = "SANGRE NUEVA · LA VELADA · DISPUTA DE CINTURONES";
  const wSub = textWidth(sub, F.sans, 8, 3.1);
  doc.text(sub, A4.width / 2, 67, { font: F.sans, size: 8, color: CREMA, align: "center", tracking: 3.1 });
  doc.line(A4.width / 2 - wSub / 2 - 26, 64.4, A4.width / 2 - wSub / 2 - 10, 64.4, { stroke: ORO, lineWidth: 0.7 });
  doc.line(A4.width / 2 + wSub / 2 + 10, 64.4, A4.width / 2 + wSub / 2 + 26, 64.4, { stroke: ORO, lineWidth: 0.7 });

  doc.text(`Semifinales: ${EVENT_LABELS.semiLong}  ·  Finales por el cinturón: ${EVENT_LABELS.finalLong}`,
    A4.width / 2, 109, { font: F.sansBold, size: 10, color: TINTA_SUAVE, align: "center" });

  if (topeComun != null) {
    const t = `Torneo limitado a peleadores con hasta ${topeComun} pelea${topeComun === 1 ? "" : "s"}`;
    const w = textWidth(t, F.sansBold, 8.6, 0.4) + 30;
    doc.roundRect(A4.width / 2 - w / 2, 120, w, 19, 9.5, { fill: ORO_PAPEL, stroke: ORO, lineWidth: 0.8 });
    doc.text(t, A4.width / 2, 129.5, { font: F.sansBold, size: 8.6, color: ORO_TEXTO, align: "center", tracking: 0.4, valign: "middle" });
  }
}

function dibujarPie(doc, fecha, pagina, total) {
  doc.line(MARGEN, PIE_Y, MARGEN + ANCHO, PIE_Y, { stroke: LINEA_SUAVE, lineWidth: 0.6 });
  doc.text("Llaves sujetas a modificaciones.", MARGEN, PIE_Y + 14,
    { font: F.sansItalic, size: 7.5, color: GRIS_TEXTO });
  const der = `${fecha ? "Generado el " + fecha + "  ·  " : ""}Página ${pagina} de ${total}`;
  doc.text(der, MARGEN + ANCHO, PIE_Y + 14, { font: F.sans, size: 7.5, color: GRIS_TEXTO, align: "right" });
}

// ============================================
// Una llave (un cinturón)
// ============================================
function dibujarLlave(doc, b, byId, x, top, topeComun) {
  // --- Título del cinturón ---
  iconoCinturon(doc, x, top + 2.5);
  const cond = bracketConditions(b);
  const chips = [];
  if (cond) {
    chips.push({ t: `${cond.ageInfo.label} · ${cond.ageInfo.minAge}-${cond.ageInfo.maxAge} años`, c: cond.ageInfo.color });
    chips.push({ t: weightRangeLabel(cond.div), c: "#6366F1" });
    chips.push({ t: cond.div.genero === "F" ? "Femenino" : "Masculino", c: cond.div.genero === "F" ? "#EC4899" : "#3B82F6" });
  }
  // Si las llaves NO comparten tope, cada una anuncia el suyo acá.
  const topePropio = topeComun == null ? bracketMaxFights(b) : null;
  if (topePropio != null) chips.push({ t: `hasta ${topePropio} pelea${topePropio === 1 ? "" : "s"}`, c: ORO_TEXTO });

  const anchoChips = chips.reduce((s, c) => s + anchoChip(c.t) + 5, 0);
  const titulo = bracketPrintTitle(b) || b.catLabel || "";
  doc.text(titulo, x + 21, top + 12, {
    font: F.serifBold, size: 14.5, color: TINTA, maxWidth: ANCHO - 21 - anchoChips - 12,
  });
  let cx = x + ANCHO;
  [...chips].reverse().forEach(c => { cx -= anchoChip(c.t); dibujarChip(doc, cx, top + 1.5, c.t, c.c); cx -= 5; });
  // Sin condiciones (cinturón legacy): se muestra la regla guardada, que es la
  // única descripción que tienen esas llaves viejas.
  if (!cond && b.regla) {
    doc.text(b.regla, x + ANCHO, top + 12, { font: F.sans, size: 7.6, color: GRIS_TEXTO, align: "right", maxWidth: 220 });
  }
  // Filete bajo el título: gris fino de lado a lado y un tramo de oro al
  // principio (el mismo gesto que la cabecera dorada de la app).
  doc.line(x, top + 19.5, x + ANCHO, top + 19.5, { stroke: LINEA_SUAVE, lineWidth: 0.7 });
  doc.line(x, top + 19.5, x + 62, top + 19.5, { stroke: ORO, lineWidth: 1.7 });

  // --- La llave ---
  const bt = top + TITULO_ALTO;
  const s0 = b.semis?.[0] || {}, s1 = b.semis?.[1] || {};
  const finalX = x + CARD_SEMI + CONECTOR;
  const finalY = bt + (BRACKET_ALTO - CARD_ALTO) / 2;

  // Venas primero: las tarjetas se dibujan encima y tapan los extremos.
  vena(doc, x + CARD_SEMI, bt + CARD_ALTO / 2, finalX, finalY + CINTA_ALTO + FILA_ALTO / 2, ROJO);
  vena(doc, x + CARD_SEMI, bt + CARD_ALTO + SEMI_SEP + CARD_ALTO / 2, finalX, finalY + CINTA_ALTO + FILA_ALTO * 1.5, AZUL);

  tarjeta(doc, byId, x, bt, CARD_SEMI, {
    etiqueta: `${EVENT_LABELS.semiAbbr} · Semifinal 1`,
    filas: [{ fid: s0.red, lado: "rojo" }, { fid: s0.blue, lado: "azul" }],
    winner: s0.winner,
  });
  tarjeta(doc, byId, x, bt + CARD_ALTO + SEMI_SEP, CARD_SEMI, {
    etiqueta: `${EVENT_LABELS.semiAbbr} · Semifinal 2`,
    filas: [{ fid: s1.red, lado: "rojo" }, { fid: s1.blue, lado: "azul" }],
    winner: s1.winner,
  });
  tarjeta(doc, byId, finalX, finalY, CARD_FINAL, {
    etiqueta: `${EVENT_LABELS.finalAbbr} · FINAL`,
    filas: [
      { fid: s0.winner, lado: "rojo", vacio: "Ganador Semifinal 1" },
      { fid: s1.winner, lado: "azul", vacio: "Ganador Semifinal 2" },
    ],
    winner: b.finalWinner,
    final: true,
  });

  if (b.finalWinner) cintaCampeon(doc, finalX, bt + BRACKET_ALTO - 34, CARD_FINAL, byId[b.finalWinner]?.fullName || "—");
}

// ============================================
// Piezas
// ============================================

// Tarjeta de una fase (semifinal o final): cinta con el día arriba y dos filas
// de peleador. La final va con borde y aura de oro — el mismo privilegio que
// tiene en la app.
function tarjeta(doc, byId, x, y, w, { etiqueta, filas, winner, final = false }) {
  if (final) {
    // Aura contenida: dos halos muy tenues, que en papel se leen como un
    // resplandor y no como un marco doble.
    doc.save().alpha(0.09);
    doc.roundRect(x - 4.5, y - 4.5, w + 9, CARD_ALTO + 9, 11, { fill: ORO });
    doc.restore();
    doc.save().alpha(0.13);
    doc.roundRect(x - 2, y - 2, w + 4, CARD_ALTO + 4, 9, { fill: ORO });
    doc.restore();
  }
  doc.roundRect(x, y, w, CARD_ALTO, 7, { fill: "#FFFFFF" });
  // Cinta del encabezado: redondeada solo arriba, para que calce con la tarjeta.
  doc.roundRect(x, y, w, CINTA_ALTO, [7, 7, 0, 0], { fill: final ? ORO_TENUE : CINTA });
  doc.line(x, y + CINTA_ALTO, x + w, y + CINTA_ALTO, { stroke: final ? "#E2CE9A" : LINEA_SUAVE, lineWidth: 0.6 });
  doc.text(etiqueta, x + 9, y + CINTA_ALTO / 2, {
    font: F.sansBold, size: 6.7, color: final ? "#8A6D2F" : "#7C7466",
    tracking: 1.5, upper: true, valign: "middle", maxWidth: w - 18,
  });

  filas.forEach((f, i) => fila(doc, byId, x, y + CINTA_ALTO + i * FILA_ALTO, w, {
    ...f, winner, ultima: i === filas.length - 1, final,
  }));

  // El borde va al final para que quede por encima de los rellenos.
  doc.roundRect(x, y, w, CARD_ALTO, 7, { stroke: final ? ORO : LINEA, lineWidth: final ? 1.2 : 0.9 });
}

// Una fila = un peleador del cupo.
function fila(doc, byId, x, y, w, { fid, lado, vacio, winner, ultima, final }) {
  const f = fid ? byId[fid] : null;
  const gana = !!winner && winner === fid && !!f;
  const pierde = !!winner && !!f && winner !== fid;
  const rojo = lado === "rojo";

  if (gana) {
    // Resaltado del que avanza. En la última fila se redondea abajo para no
    // asomar fuera del borde de la tarjeta.
    doc.roundRect(x + 1, y, w - 2, ultima ? FILA_ALTO - 1 : FILA_ALTO,
      ultima ? [0, 0, 6, 6] : 0, { fill: ORO_TENUE });
  }
  // Venda de esquina: la barrita roja o azul del rincón, dorada si ganó y
  // pálida si el cupo está libre (igual que en la pestaña Super 4).
  const base = rojo ? ROJO : AZUL;
  const color = gana ? ORO : f ? base : mixColor(base, "#FFFFFF", 0.68);
  doc.roundRect(x + 1.6, y + 3.4, 3.2, FILA_ALTO - 6.8, 1.6, { fill: color });

  if (!f) {
    // Cupo sin peleador: en la final es la promesa del ganador que vendrá; en
    // una semifinal es un cupo por llenar en la app.
    doc.text(vacio || "Cupo libre", x + 13, y + FILA_ALTO / 2, {
      font: F.serifItalic, size: 9.2, color: GRIS_APAGADO, valign: "middle", maxWidth: w - 24,
    });
    return;
  }

  const anchoNombre = w - 13 - (gana ? 24 : 10);
  const colorNombre = gana ? ORO_TEXTO : pierde ? GRIS_APAGADO : TINTA;
  const nombre = ellipsize(f.fullName || "—", anchoNombre, F.sansBold, 9.6);
  const wNombre = doc.text(nombre, x + 13, y + 11.6, { font: F.sansBold, size: 9.6, color: colorNombre });
  // Al perdedor se le tacha el nombre, como en la app.
  if (pierde) doc.line(x + 13, y + 8.9, x + 13 + wNombre, y + 8.9, { stroke: GRIS_APAGADO, lineWidth: 0.7 });

  const detalle = [(f.gym || "").toUpperCase(), f.weightKg != null ? `${f.weightKg}kg` : "", f.age != null ? `${f.age}a` : ""]
    .filter(Boolean).join(" · ");
  doc.text(detalle, x + 13, y + 19.2, {
    font: F.sans, size: 6.7, color: pierde ? "#BCB6AA" : GRIS_TEXTO, maxWidth: anchoNombre, tracking: 0.2,
  });

  if (gana) check(doc, x + w - 15, y + FILA_ALTO / 2, final ? ORO_TEXTO : VERDE);
}

// Vena de luz entre una semifinal y la final: curva que nace del color del
// rincón y funde a oro. El PDF no sabe degradar un trazo, así que la curva se
// parte en tramos y cada uno se pinta con su color interpolado; debajo va un
// trazo grueso y translúcido que hace de resplandor.
function vena(doc, x1, y1, x2, y2, colorRincon) {
  const p = [x1, y1, x1 + 32, y1, x2 - 32, y2, x2, y2];
  doc.save().alpha(0.12);
  doc.curve(p, { stroke: ORO, lineWidth: 5.5 });
  doc.restore();
  const tramos = cubicSegments(p, 7);
  tramos.forEach((seg, i) => {
    doc.curve(seg, { stroke: mixColor(colorRincon, ORO, (i + 0.5) / tramos.length), lineWidth: 1.5 });
  });
  doc.circle(x2, y2, 1.9, { fill: ORO });
}

// Cinta del campeón, bajo la final: fondo de oro pálido, dos estrellas y el
// nombre. Solo aparece cuando la final ya tiene ganador.
function cintaCampeon(doc, x, y, w, nombre) {
  doc.roundRect(x, y, w, 34, 9, { fill: ORO_PAPEL, stroke: ORO, lineWidth: 1 });
  estrella(doc, x + 15, y + 17, 5.4, ORO);
  estrella(doc, x + w - 15, y + 17, 5.4, ORO);
  doc.text("CAMPEÓN", x + w / 2, y + 12, { font: F.sansBold, size: 6.4, color: "#A98A3E", align: "center", tracking: 2.4 });
  doc.text(nombre, x + w / 2, y + 25.5, { font: F.serifBold, size: 12, color: TINTA, align: "center", maxWidth: w - 44 });
}

// ---------- Ornamentos vectoriales ----------
// (El 🏆 y el ✓ de la app son emojis: las fuentes base del PDF no los tienen,
// así que acá se dibujan como figuras.)

// Cinturón de campeón en miniatura, al lado del título de cada llave: la
// correa, la hebilla y su piedra. Es lo que está en disputa, así que encabeza
// cada llave (en la app ese lugar lo ocupa el 🏆).
function iconoCinturon(doc, x, y) {
  doc.roundRect(x, y + 3.4, 17, 4.6, 2.3, { fill: mixColor(ORO, "#FFFFFF", 0.5) });
  doc.roundRect(x + 5, y, 7.4, 11, 2.2, { fill: ORO_TENUE, stroke: ORO, lineWidth: 0.9 });
  doc.circle(x + 8.7, y + 5.5, 1.5, { fill: ORO });
}

// ✓ del que avanza.
function check(doc, cx, cy, color) {
  doc.stroke([[cx - 4, cy + 0.2], [cx - 1.3, cy + 3.2], [cx + 4.2, cy - 3.4]], { stroke: color, lineWidth: 1.7 });
}

// Estrella de cinco puntas (cinta del campeón).
function estrella(doc, cx, cy, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  doc.polygon(pts, { fill: color });
}

// ---------- Píldoras de condición ----------
const CHIP_TXT = 6.6, CHIP_TRACK = 1.1, CHIP_PAD = 7;
function anchoChip(t) { return textWidth(t.toUpperCase(), F.sansBold, CHIP_TXT, CHIP_TRACK) + CHIP_PAD * 2; }
function dibujarChip(doc, x, y, t, color) {
  const w = anchoChip(t);
  // El tinte se calcula mezclando con blanco en vez de usar transparencia: en
  // papel se imprime igual y no depende de que el lector respete el alfa.
  doc.roundRect(x, y, w, 13, 6.5, { fill: mixColor(color, "#FFFFFF", 0.9), stroke: mixColor(color, "#FFFFFF", 0.5), lineWidth: 0.7 });
  doc.text(t, x + w / 2, y + 6.5, {
    font: F.sansBold, size: CHIP_TXT, color: mixColor(color, "#000000", 0.22),
    align: "center", tracking: CHIP_TRACK, upper: true, valign: "middle",
  });
}
