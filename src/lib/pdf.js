// ============================================
// GENERADOR DE PDF (a mano, sin librerías)
// ============================================
// POR QUÉ EXISTE: la app ya sabía "imprimir" (abrir el diálogo del navegador
// con un HTML) y "descargar Excel". Ninguna de las dos sirve para lo que pide
// la mesa de control del Super 4: un ARCHIVO listo, que se manda por WhatsApp
// y se ve/imprime igual en cualquier teléfono, sin que nadie lo pueda mover de
// lugar sin querer. Eso es un PDF.
//
// Se escribe a mano —igual que el .xlsx (zip.js + xlsx.js)— para no sumar una
// dependencia de varios cientos de KB a una PWA que tiene que cargar rápido en
// el celular del organizador dentro del gimnasio.
//
// ALCANCE deliberadamente chico: solo lo que la planilla de llaves necesita.
//   · páginas de tamaño fijo,
//   · rectángulos (rectos y redondeados), líneas, curvas bézier y círculos,
//   · texto con las fuentes BASE-14 (van dentro de todo lector de PDF: no hay
//     que incrustar ni un byte de tipografía),
//   · transparencia (para los halos dorados).
// No hay imágenes, ni compresión, ni saltos de línea automáticos: el archivo
// de un evento entero pesa ~40 KB sin comprimir, y eso está bien.
//
// SISTEMA DE COORDENADAS: el PDF mide desde ABAJO a la izquierda y con la Y
// hacia arriba, que es incomodísimo para maquetar. Toda esta API recibe las
// coordenadas como en la web (origen ARRIBA a la izquierda, Y hacia abajo) y
// las da vuelta internamente. Quien dibuja nunca ve la Y invertida.

// ---------- Fuentes base-14 ----------
// Los 14 tipos que todo lector de PDF tiene incorporados. Se usan cinco:
// Helvetica para los datos, Times para los títulos (el aire "de programa de
// velada" que en la app dan Bebas Neue y Playfair Display, que aquí no se
// pueden incrustar).
export const F = {
  sans: "helv",
  sansBold: "helvBold",
  sansItalic: "helvOblique",
  serifBold: "timesBold",
  serifItalic: "timesItalic",
};
const BASE_FONTS = {
  helv: "Helvetica",
  helvBold: "Helvetica-Bold",
  helvOblique: "Helvetica-Oblique",
  timesBold: "Times-Bold",
  timesItalic: "Times-Italic",
};

// Anchos oficiales (AFM de Adobe) de los caracteres 32..126 de cada fuente, en
// milésimas de em. Hacen falta en JavaScript —aunque el PDF no los lleve, el
// lector ya los sabe— para poder CENTRAR y RECORTAR texto: sin medir, un
// nombre largo se sale de la tarjeta y un título centrado queda torcido.
const W_ASCII = {
  helv: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  helvBold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
  timesBold: [250,333,555,500,500,1000,833,333,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520],
  timesItalic: [250,333,420,500,500,833,778,333,333,333,500,675,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,675,675,675,500,920,611,611,667,722,611,611,722,722,333,444,667,556,833,667,722,611,722,611,500,556,722,611,833,611,556,556,389,278,389,422,500,333,500,500,444,500,444,278,500,500,278,278,444,278,722,500,500,500,500,389,389,278,500,444,667,444,444,389,400,275,400,541],
};
W_ASCII.helvOblique = W_ASCII.helv; // la oblicua es la misma letra inclinada: mismos anchos

// Puntuación fuera del ASCII que sí se usa en las planillas (el punto medio
// del "U17 · Cadete", la raya del título, los puntos suspensivos del recorte).
const W_EXTRA = {
  "·": { helv: 278, helvBold: 278, timesBold: 250, timesItalic: 250 },   // ·
  "—": { helv: 1000, helvBold: 1000, timesBold: 1000, timesItalic: 889 }, // —
  "–": { helv: 556, helvBold: 556, timesBold: 500, timesItalic: 500 },    // –
  "…": { helv: 1000, helvBold: 1000, timesBold: 1000, timesItalic: 889 }, // …
  "’": { helv: 222, helvBold: 278, timesBold: 333, timesItalic: 333 },    // ’
  "°": { helv: 400, helvBold: 400, timesBold: 400, timesItalic: 400 },    // °
  "¡": { helv: 333, helvBold: 333, timesBold: 333, timesItalic: 389 },    // ¡
  "¿": { helv: 611, helvBold: 611, timesBold: 500, timesItalic: 500 },    // ¿
  "«": { helv: 556, helvBold: 556, timesBold: 500, timesItalic: 500 },    // «
  "»": { helv: 556, helvBold: 556, timesBold: 500, timesItalic: 500 },    // »
  "ß": { helv: 611, helvBold: 556, timesBold: 556, timesItalic: 500 },    // ß
  "Æ": { helv: 1000, helvBold: 1000, timesBold: 1000, timesItalic: 944 }, // Æ
  "æ": { helv: 889, helvBold: 889, timesBold: 722, timesItalic: 667 },    // æ
};

// Letra base de cada acentuada: en las fuentes base-14 "á" mide exactamente lo
// mismo que "a" (el acento no ensancha la letra), así que una sola tabla de
// equivalencias cubre todo el español sin repetir 60 anchos.
const SIN_ACENTO = {
  "À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A","Ç":"C",
  "È":"E","É":"E","Ê":"E","Ë":"E","Ì":"I","Í":"I","Î":"I","Ï":"I",
  "Ñ":"N","Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O",
  "Ù":"U","Ú":"U","Û":"U","Ü":"U","Ý":"Y",
  "à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","ç":"c",
  "è":"e","é":"e","ê":"e","ë":"e","ì":"i","í":"i","î":"i","ï":"i",
  "ñ":"n","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o",
  "ù":"u","ú":"u","û":"u","ü":"u","ý":"y","ÿ":"y",
  "ª":"a","º":"o",
};

// Ancho de UN carácter, en milésimas de em.
function charWidth(ch, font) {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return W_ASCII[font][code - 32];
  const extra = W_EXTRA[ch];
  if (extra) return extra[font] ?? extra.helv;
  const base = SIN_ACENTO[ch];
  if (base) return W_ASCII[font][base.charCodeAt(0) - 32];
  return W_ASCII[font][("n").charCodeAt(0) - 32]; // desconocido: ancho de una "n"
}

// Ancho de un texto en puntos. `tracking` es el espaciado extra entre letras
// (el "letter-spacing" de la app): el PDF lo suma DESPUÉS de cada letra, pero
// para medir el bloque visible el de la última no cuenta.
export function textWidth(text, font = F.sans, size = 10, tracking = 0) {
  const s = String(text ?? "");
  if (!s) return 0;
  let mil = 0;
  for (const ch of s) mil += charWidth(ch, font);
  return (mil / 1000) * size + tracking * Math.max(0, s.length - 1);
}

// Recorta un texto para que quepa en `maxWidth`, agregando "…" (así un nombre
// larguísimo nunca se desborda de su tarjeta ni pisa la columna de al lado).
export function ellipsize(text, maxWidth, font = F.sans, size = 10, tracking = 0) {
  const s = String(text ?? "");
  if (textWidth(s, font, size, tracking) <= maxWidth) return s;
  const chars = [...s];
  while (chars.length > 1) {
    chars.pop();
    const probe = chars.join("").replace(/[\s·-]+$/, "") + "…";
    if (textWidth(probe, font, size, tracking) <= maxWidth) return probe;
  }
  return "…";
}

// ---------- Codificación de texto (WinAnsi) ----------
// El PDF guarda el texto en bytes, no en Unicode. Con /WinAnsiEncoding los
// acentos del español entran directos (son los mismos bytes que Latin-1); solo
// hay que traducir a mano el tramo 0x80-0x9F, donde Windows metió la raya, las
// comillas tipográficas y los puntos suspensivos.
const WIN_ANSI_ALTO = {
  "€":0x80,"‚":0x82,"ƒ":0x83,"„":0x84,"…":0x85,"†":0x86,"‡":0x87,
  "ˆ":0x88,"‰":0x89,"Š":0x8A,"‹":0x8B,"Œ":0x8C,"Ž":0x8E,
  "‘":0x91,"’":0x92,"“":0x93,"”":0x94,"•":0x95,"–":0x96,"—":0x97,
  "˜":0x98,"™":0x99,"š":0x9A,"›":0x9B,"œ":0x9C,"ž":0x9E,"Ÿ":0x9F,
};
// Convierte un texto a la cadena de bytes que va dentro del PDF, escapando los
// tres caracteres que el formato reserva: ( ) y \.
// Lo que no existe en WinAnsi (emojis, ✓, alfabetos no latinos) se DESCARTA:
// el 🏆 de la app se dibuja acá como vector, y un nombre con emoji vale más
// impreso sin el emoji que rompiendo el archivo entero.
export function encodeText(text) {
  let out = "";
  for (const ch of String(text ?? "")) {
    const cp = ch.codePointAt(0);
    let code;
    if (cp < 32) code = cp === 10 || cp === 9 ? 32 : null;   // saltos y tabs → espacio
    else if (cp <= 126 || (cp >= 0xA0 && cp <= 0xFF)) code = cp;
    else code = WIN_ANSI_ALTO[ch] ?? null;
    if (code == null) continue;
    if (code === 0x28 || code === 0x29 || code === 0x5C) out += "\\"; // ( ) \
    out += String.fromCharCode(code);
  }
  return out;
}

// ---------- Utilidades de color ----------
// "#RRGGBB" → los tres componentes 0..1 que entiende el PDF.
function rgb(hex) {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
// Mezcla dos colores (t=0 → a, t=1 → b). Sirve para los tintes claros de las
// píldoras y para el degradado rojo→oro de las venas de la llave, que el PDF
// no sabe hacer solo en un trazo.
export function mixColor(a, b, t) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const to = v => Math.round(v * 255).toString(16).padStart(2, "0");
  return "#" + to(r1 + (r2 - r1) * t) + to(g1 + (g2 - g1) * t) + to(b1 + (b2 - b1) * t);
}

// Número corto para el contenido del PDF (3 decimales bastan y el archivo
// queda la mitad de grande que con la notación por defecto de JS).
function num(v) {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

const KAPPA = 0.5523; // constante para aproximar un cuarto de círculo con una bézier

// Tamaños de página en puntos (1 pt = 1/72 pulgada).
export const A4 = { width: 595.28, height: 841.89 };

// ============================================
// Documento
// ============================================
export function createPdf({ width = A4.width, height = A4.height, title = "", author = "" } = {}) {
  const pages = [];
  let ops = null;          // operadores de la página en curso
  let pageH = height;      // alto de la página en curso (para invertir la Y)
  const alphas = new Set();

  const y = v => pageH - v; // web (Y hacia abajo) → PDF (Y hacia arriba)
  const put = (...s) => { if (ops) ops.push(...s); };

  const doc = {
    width, height,
    // Nueva página. Devuelve el documento para poder encadenar.
    addPage(size = {}) {
      const w = size.width || width, h = size.height || height;
      ops = [];
      pageH = h;
      pages.push({ width: w, height: h, ops });
      return doc;
    },
    get pageCount() { return pages.length; },

    // --- estado ---
    save() { put("q"); return doc; },
    restore() { put("Q"); return doc; },
    // Transparencia (0..1). Se usa para los halos: un trazo grueso al 12% bajo
    // la línea nítida es lo que en la app hace el `filter: blur` del neón.
    alpha(a) {
      const key = Math.round(Math.max(0, Math.min(1, a)) * 100);
      alphas.add(key);
      put(`/GA${key} gs`);
      return doc;
    },

    // --- formas ---
    rect(x, yTop, w, h, { fill, stroke, lineWidth = 1 } = {}) {
      if (fill) put(`${rgb(fill).map(num).join(" ")} rg`);
      if (stroke) put(`${rgb(stroke).map(num).join(" ")} RG`, `${num(lineWidth)} w`);
      put(`${num(x)} ${num(y(yTop + h))} ${num(w)} ${num(h)} re`);
      put(fill && stroke ? "B" : stroke ? "S" : "f");
      return doc;
    },
    // Rectángulo redondeado: la superficie de todas las tarjetas de la llave.
    // `r` puede ser un número (las cuatro esquinas) o [arriba-izq, arriba-der,
    // abajo-der, abajo-izq]: con radios por esquina se dibujan la cinta de
    // encabezado (redondeada solo arriba) y el resaltado del ganador
    // (redondeado solo abajo, en la última fila) sin que asomen puntas fuera
    // del borde de la tarjeta.
    roundRect(x, yTop, w, h, r, { fill, stroke, lineWidth = 1 } = {}) {
      const lim = v => Math.max(0, Math.min(v, w / 2, h / 2));
      const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map(lim);
      const x0 = x, x1 = x + w, yb = y(yTop + h), yt = y(yTop); // yb = borde inferior
      if (fill) put(`${rgb(fill).map(num).join(" ")} rg`);
      if (stroke) put(`${rgb(stroke).map(num).join(" ")} RG`, `${num(lineWidth)} w`);
      put(`${num(x0 + bl)} ${num(yb)} m`);
      put(`${num(x1 - br)} ${num(yb)} l`);
      if (br) put(`${num(x1 - br + br * KAPPA)} ${num(yb)} ${num(x1)} ${num(yb + br - br * KAPPA)} ${num(x1)} ${num(yb + br)} c`);
      put(`${num(x1)} ${num(yt - tr)} l`);
      if (tr) put(`${num(x1)} ${num(yt - tr + tr * KAPPA)} ${num(x1 - tr + tr * KAPPA)} ${num(yt)} ${num(x1 - tr)} ${num(yt)} c`);
      put(`${num(x0 + tl)} ${num(yt)} l`);
      if (tl) put(`${num(x0 + tl - tl * KAPPA)} ${num(yt)} ${num(x0)} ${num(yt - tl + tl * KAPPA)} ${num(x0)} ${num(yt - tl)} c`);
      put(`${num(x0)} ${num(yb + bl)} l`);
      if (bl) put(`${num(x0)} ${num(yb + bl - bl * KAPPA)} ${num(x0 + bl - bl * KAPPA)} ${num(yb)} ${num(x0 + bl)} ${num(yb)} c`);
      put("h", fill && stroke ? "B" : stroke ? "S" : "f");
      return doc;
    },
    line(x1, y1, x2, y2, { stroke = "#000000", lineWidth = 1, cap = 0, dash = null } = {}) {
      put(`${rgb(stroke).map(num).join(" ")} RG`, `${num(lineWidth)} w`, `${cap} J`);
      if (dash) put(`[${dash.map(num).join(" ")}] 0 d`);
      put(`${num(x1)} ${num(y(y1))} m ${num(x2)} ${num(y(y2))} l S`);
      if (dash) put("[] 0 d");
      return doc;
    },
    // Curva bézier cúbica (las "venas de luz" que unen semifinal y final).
    curve(p, { stroke = "#000000", lineWidth = 1, cap = 1 } = {}) {
      put(`${rgb(stroke).map(num).join(" ")} RG`, `${num(lineWidth)} w`, `${cap} J`);
      put(`${num(p[0])} ${num(y(p[1]))} m ${num(p[2])} ${num(y(p[3]))} ${num(p[4])} ${num(y(p[5]))} ${num(p[6])} ${num(y(p[7]))} c S`);
      return doc;
    },
    circle(cx, cy, r, { fill, stroke, lineWidth = 1 } = {}) {
      const k = r * KAPPA, cyp = y(cy);
      if (fill) put(`${rgb(fill).map(num).join(" ")} rg`);
      if (stroke) put(`${rgb(stroke).map(num).join(" ")} RG`, `${num(lineWidth)} w`);
      put(`${num(cx + r)} ${num(cyp)} m`);
      put(`${num(cx + r)} ${num(cyp + k)} ${num(cx + k)} ${num(cyp + r)} ${num(cx)} ${num(cyp + r)} c`);
      put(`${num(cx - k)} ${num(cyp + r)} ${num(cx - r)} ${num(cyp + k)} ${num(cx - r)} ${num(cyp)} c`);
      put(`${num(cx - r)} ${num(cyp - k)} ${num(cx - k)} ${num(cyp - r)} ${num(cx)} ${num(cyp - r)} c`);
      put(`${num(cx + k)} ${num(cyp - r)} ${num(cx + r)} ${num(cyp - k)} ${num(cx + r)} ${num(cyp)} c`);
      put("h", fill && stroke ? "B" : stroke ? "S" : "f");
      return doc;
    },
    // Polígono cerrado a partir de puntos [x,y,...] (la estrella del campeón).
    polygon(pts, { fill, stroke, lineWidth = 1 } = {}) {
      if (fill) put(`${rgb(fill).map(num).join(" ")} rg`);
      if (stroke) put(`${rgb(stroke).map(num).join(" ")} RG`, `${num(lineWidth)} w`);
      pts.forEach(([px, py], i) => put(`${num(px)} ${num(y(py))} ${i === 0 ? "m" : "l"}`));
      put("h", fill && stroke ? "B" : stroke ? "S" : "f");
      return doc;
    },
    // Trazo abierto de varios puntos (el ✓ del ganador).
    stroke(pts, { stroke: color = "#000000", lineWidth = 1, cap = 1, join = 1 } = {}) {
      put(`${rgb(color).map(num).join(" ")} RG`, `${num(lineWidth)} w`, `${cap} J`, `${join} j`);
      pts.forEach(([px, py], i) => put(`${num(px)} ${num(y(py))} ${i === 0 ? "m" : "l"}`));
      put("S");
      return doc;
    },

    // --- texto ---
    // `yPos` es la LÍNEA BASE del texto (o su centro vertical con
    // valign:"middle", que es lo cómodo para centrarlo dentro de una fila).
    // Devuelve el ancho dibujado, para poder tachar al perdedor o encadenar.
    text(str, x, yPos, {
      font = F.sans, size = 10, color = "#000000", align = "left",
      tracking = 0, maxWidth = null, valign = "baseline", upper = false,
    } = {}) {
      let s = String(str ?? "");
      if (upper) s = s.toUpperCase();
      if (maxWidth != null) s = ellipsize(s, maxWidth, font, size, tracking);
      if (!s) return 0;
      const w = textWidth(s, font, size, tracking);
      const tx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
      // 0.36em bajo la línea base centra ópticamente una línea de texto en
      // mayúsculas y minúsculas dentro de su fila.
      const ty = valign === "middle" ? yPos + size * 0.355 : valign === "top" ? yPos + size * 0.8 : yPos;
      put(`${rgb(color).map(num).join(" ")} rg`, "BT", `/${font} ${num(size)} Tf`);
      if (tracking) put(`${num(tracking)} Tc`);
      put(`1 0 0 1 ${num(tx)} ${num(y(ty))} Tm (${encodeText(s)}) Tj`);
      if (tracking) put("0 Tc");
      put("ET");
      return w;
    },

    // Bytes finales del archivo .pdf.
    build() { return serialize(pages, alphas, { title, author }); },
  };
  doc.addPage();
  return doc;
}

// Corta una bézier cúbica en dos por el parámetro t (algoritmo de De
// Casteljau). Se usa para pintar una misma curva por tramos de distinto color
// y simular el degradado rojo→oro / azul→oro de las venas de la app, que el
// PDF no puede hacer en un solo trazo.
export function splitCubic(p, t) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
  const lerp = (a, b) => a + (b - a) * t;
  const ax = lerp(x0, x1), ay = lerp(y0, y1);
  const bx = lerp(x1, x2), by = lerp(y1, y2);
  const cx = lerp(x2, x3), cy = lerp(y2, y3);
  const dx = lerp(ax, bx), dy = lerp(ay, by);
  const ex = lerp(bx, cx), ey = lerp(by, cy);
  const fx = lerp(dx, ex), fy = lerp(dy, ey);
  return [[x0, y0, ax, ay, dx, dy, fx, fy], [fx, fy, ex, ey, cx, cy, x3, y3]];
}

// Trocea una bézier en `steps` tramos y devuelve cada uno: dibujando cada tramo
// con su propio color se obtiene una curva degradada.
export function cubicSegments(p, steps) {
  const out = [];
  let rest = p;
  for (let i = 0; i < steps; i++) {
    if (i === steps - 1) { out.push(rest); break; }
    // t relativo sobre lo que queda de curva, para que los tramos salgan parejos.
    const [head, tail] = splitCubic(rest, 1 / (steps - i));
    out.push(head);
    rest = tail;
  }
  return out;
}

// ---------- Serialización ----------
// Arma el archivo: cabecera, objetos numerados, tabla xref y trailer. Todo el
// contenido es Latin-1, así que se construye como string (1 carácter = 1 byte)
// y recién al final se pasa a bytes.
function serialize(pages, alphas, info) {
  const objs = [];              // objs[i] = cuerpo del objeto i+1
  const ref = i => `${i} 0 R`;
  const add = body => { objs.push(body); return objs.length; };

  const catalogId = add("");    // 1 — se rellena al final (necesita el id de Pages)
  const pagesId = add("");      // 2 — idem (necesita los ids de las páginas)
  const infoId = add(`<< /Producer (Sangre Nueva - La Velada) /Creator (Sangre Nueva - La Velada)${
    info.title ? ` /Title ${utf16(info.title)}` : ""}${info.author ? ` /Author ${utf16(info.author)}` : ""} >>`);

  const fontIds = {};
  Object.entries(BASE_FONTS).forEach(([alias, base]) => {
    fontIds[alias] = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
  });

  const fontRes = Object.entries(fontIds).map(([alias, id]) => `/${alias} ${ref(id)}`).join(" ");
  const gsRes = [...alphas].sort((a, b) => a - b)
    .map(a => `/GA${a} << /Type /ExtGState /ca ${a / 100} /CA ${a / 100} >>`).join(" ");
  const resources = `<< /ProcSet [/PDF /Text] /Font << ${fontRes} >>${gsRes ? ` /ExtGState << ${gsRes} >>` : ""} >>`;

  const pageIds = [];
  pages.forEach(p => {
    const content = p.ops.join("\n");
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${ref(pagesId)} /MediaBox [0 0 ${num(p.width)} ${num(p.height)}] /Resources ${resources} /Contents ${ref(contentId)} >>`));
  });

  objs[catalogId - 1] = `<< /Type /Catalog /Pages ${ref(pagesId)} >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(ref).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n%âãÏÓ\n"; // los bytes altos marcan el archivo como binario
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { out += `${String(o).padStart(10, "0")} 00000 n \n`; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${ref(catalogId)} /Info ${ref(infoId)} >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return bytes;
}

// Texto de metadatos (título del documento) en UTF-16BE hexadecimal: es la
// forma que el formato acepta con acentos y rayas sin ambigüedad.
function utf16(s) {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  return `<${hex}>`;
}
