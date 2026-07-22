// El voucher que se manda por WhatsApp: la misma tarjeta que se ve en pantalla,
// pero dibujada a mano en un <canvas> para poder exportarla como PNG.
//
// Se dibuja punto por punto en vez de rasterizar el DOM (html2canvas y
// parecidos) por tres razones concretas de esta app:
//  · Nitidez: aquí se elige la resolución (2760×750). Rasterizar el DOM copia
//    los 96px del QR de pantalla y el código sale borroso en el celular del
//    comprador, que es lo que va a leer el lector en la puerta.
//  · Las tipografías propias (Bebas Neue / Barlow Condensed) y los degradados
//    son justo lo que peor copian esas librerías.
//  · Cero dependencias nuevas: en la puerta del recinto la app carga con red
//    mala, y ya son 700 KB de firebase + react.
import QRCode from "qrcode";
import { fmt$ } from "../constants.js";

// Dibuja un rectángulo redondeado (roundRect no existe en navegadores viejos).
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// QR NUEVO y grande solo para la imagen que se comparte. Antes se reutilizaba
// el <canvas> de 96px de la tarjeta en pantalla y se estiraba a 3-4 veces su
// tamaño: por eso el voucher compartido salía pixelado. Aquí se genera a 720px
// y se DIBUJA MÁS CHICO, que es lo que deja el código nítido.
function buildQrCanvas(datos, px) {
  return new Promise((resolve, reject) => {
    const c = document.createElement("canvas");
    QRCode.toCanvas(c, datos || " ", { width: px, margin: 0, color: { dark: "#000000", light: "#ffffff" } }, e => e ? reject(e) : resolve(c));
  });
}

// Nombre del archivo que ve el comprador en su celular y el vendedor en su
// carpeta de descargas: "entrada-PRE-0014.png".
export function voucherFileName(ticket) {
  return "entrada-" + (ticket?.id || "sangre-nueva") + ".png";
}

// Reproduce EXACTAMENTE la tarjeta de pantalla: mismos datos, mismo orden,
// mismos colores. Etiqueta a la izquierda y valor alineado a la derecha, con el
// Estado como píldora.
export async function buildVoucherCanvas({ ticket, tipo, qrData, estadoTexto, estadoColor }) {
  // Las tipografías propias son @font-face: si nadie las pidió todavía, el
  // canvas caería a una fuente genérica y la imagen no se parecería a la
  // tarjeta. Se piden explícitamente antes de dibujar.
  if (document.fonts) {
    try {
      await Promise.all([
        document.fonts.load("400 30px 'Bebas Neue'"),
        document.fonts.load("700 13px 'Barlow Condensed'"),
        document.fonts.load("400 13px 'Barlow Condensed'"),
      ]);
      await document.fonts.ready;
    } catch { /* si falla, se dibuja con lo que haya */ }
  }
  // Alto suficiente para que la línea del pie NO cruce el QR ni la píldora de
  // Estado: QR 90→202, píldora 189→210, línea del pie en 222.
  const W = 920, H = 250, ESC = 3;          // 2760×750 px reales: nítido en WhatsApp
  const PAD = 26;
  const col = tipo.color;
  const canvas = document.createElement("canvas");
  canvas.width = W * ESC; canvas.height = H * ESC;
  const ctx = canvas.getContext("2d");
  ctx.scale(ESC, ESC);

  // Fondo y marco, como la tarjeta.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0a0000"); grad.addColorStop(1, "#180505");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = col + "50"; ctx.lineWidth = 1.5;
  roundRect(ctx, 1, 1, W - 2, H - 2, 14); ctx.stroke();

  ctx.textBaseline = "alphabetic";

  // ---- Encabezado ----
  ctx.fillStyle = col; ctx.font = "700 13px 'Barlow Condensed', sans-serif";
  ctx.fillText("🥊 SANGRE NUEVA · LA VELADA", PAD, 32);

  // El nombre se achica (y como último recurso se recorta) para no chocar NUNCA
  // con el tipo de entrada de la esquina derecha: hay asistentes con nombre y
  // dos apellidos largos.
  ctx.font = "700 13px 'Barlow Condensed', sans-serif";
  const anchoTipo = Math.max(ctx.measureText(tipo.label).width, 44);
  const anchoNombre = W - PAD * 2 - anchoTipo - 24;
  let nombre = String(ticket.attendeeName || "").toUpperCase();
  let tam = 34;
  ctx.font = "400 " + tam + "px 'Bebas Neue', sans-serif";
  while (ctx.measureText(nombre).width > anchoNombre && tam > 20) {
    tam -= 2;
    ctx.font = "400 " + tam + "px 'Bebas Neue', sans-serif";
  }
  if (ctx.measureText(nombre).width > anchoNombre) {
    while (nombre.length > 4 && ctx.measureText(nombre + "…").width > anchoNombre) nombre = nombre.slice(0, -1);
    nombre = nombre.trimEnd() + "…";
  }
  ctx.fillStyle = "#f2edf4";
  ctx.fillText(nombre, PAD, 66);

  ctx.textAlign = "right";
  ctx.font = "400 22px sans-serif";
  ctx.fillText(tipo.icon, W - PAD, 34);
  ctx.fillStyle = col; ctx.font = "700 13px 'Barlow Condensed', sans-serif";
  ctx.fillText(tipo.label, W - PAD, 60);
  ctx.textAlign = "left";

  ctx.strokeStyle = col + "25"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 78); ctx.lineTo(W - PAD, 78); ctx.stroke();

  // ---- QR (nítido: se genera grande y se dibuja chico) ----
  const qrBox = 112, qrX = PAD, qrY = 90, qrPad = 7;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qrX, qrY, qrBox, qrBox, 10); ctx.fill();
  const qrCanvas = await buildQrCanvas(qrData, 720);
  ctx.drawImage(qrCanvas, qrX + qrPad, qrY + qrPad, qrBox - qrPad * 2, qrBox - qrPad * 2);

  // ---- Filas: etiqueta a la izquierda, valor a la derecha ----
  const filas = [
    ["Boleta", "#" + ticket.id, "#f2edf4", "400 24px 'Bebas Neue', sans-serif"],
    ["Precio", fmt$(ticket.price), col, "700 16px 'Barlow Condensed', sans-serif"],
    ["Pago", ticket.paymentMethod || "", "#f2edf4", "700 16px 'Barlow Condensed', sans-serif"],
  ];
  const labelX = qrX + qrBox + 26;
  const valueX = W - PAD;
  let y = 114;
  filas.forEach(([label, value, color, font]) => {
    ctx.fillStyle = "#9CA3AF"; ctx.font = "400 14px 'Barlow Condensed', sans-serif";
    ctx.textAlign = "left"; ctx.fillText(label, labelX, y);
    ctx.fillStyle = color; ctx.font = font;
    ctx.textAlign = "right"; ctx.fillText(value, valueX, y);
    y += 30;
  });

  // Estado como píldora (igual que el Badge de la tarjeta).
  ctx.fillStyle = "#9CA3AF"; ctx.font = "400 14px 'Barlow Condensed', sans-serif";
  ctx.textAlign = "left"; ctx.fillText("Estado", labelX, y);
  ctx.font = "700 13px 'Barlow Condensed', sans-serif";
  const tw = ctx.measureText(estadoTexto).width;
  const pw = tw + 22, ph = 21, px = valueX - pw, py = y - 15;
  ctx.fillStyle = estadoColor + "26";
  roundRect(ctx, px, py, pw, ph, ph / 2); ctx.fill();
  ctx.strokeStyle = estadoColor + "66"; ctx.lineWidth = 1;
  roundRect(ctx, px, py, pw, ph, ph / 2); ctx.stroke();
  ctx.fillStyle = estadoColor;
  ctx.textAlign = "center"; ctx.fillText(estadoTexto, px + pw / 2, y);
  ctx.textAlign = "left";

  // ---- Pie ----
  ctx.strokeStyle = col + "15";
  ctx.beginPath(); ctx.moveTo(PAD, H - 34); ctx.lineTo(W - PAD, H - 34); ctx.stroke();
  ctx.fillStyle = "#6B7280"; ctx.font = "700 11px 'Barlow Condensed', sans-serif";
  ctx.fillText("SANGRE NUEVA", PAD, H - 14);
  ctx.textAlign = "right"; ctx.fillText("#" + ticket.id, W - PAD, H - 14); ctx.textAlign = "left";
  return canvas;
}

// El PNG ya empaquetado como archivo, que es lo que pide navigator.share.
export async function buildVoucherFile(datos) {
  const canvas = await buildVoucherCanvas(datos);
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("El navegador no pudo exportar el voucher a PNG");
  return new File([blob], voucherFileName(datos.ticket), { type: "image/png" });
}
