// Registro de ENTRADAS del evento, en dos salidas:
//   · CSV editable (Google Sheets / Numbers), como las otras planillas.
//   · Hoja imprimible (HTML → diálogo de impresión del navegador → papel o PDF),
//     pensada como la "hoja final" del cierre de boletería de La Velada.
//
// Ambas comparten el mismo resumen (totales) y las mismas columnas, para que la
// planilla y la impresión digan siempre lo mismo. Una boleta puede cubrir varias
// entradas (grupo/familia): por eso se distingue BOLETAS de PERSONAS (suma de
// cantidades), igual que en los KPIs de la pestaña Entradas.

import { TICKET_TYPES_V2, fmtDinero, ticketQty } from "../constants.js";
import { csvDocument } from "./csv.js";
import { escapeHtml } from "./html.js";
import { localeDelEventoActivo } from "./moneda.js";

// Totales del registro (sobre la lista que se le pase, ya filtrada).
export function entradasResumen(tickets) {
  const list = tickets || [];
  let personas = 0, ingresos = 0, personasDentro = 0, boletasDentro = 0;
  const byPayment = {};
  list.forEach(t => {
    const q = ticketQty(t);
    personas += q;
    ingresos += t.price || 0;
    byPayment[t.paymentMethod || "—"] = (byPayment[t.paymentMethod || "—"] || 0) + (t.price || 0);
    if (t.status === "ingresado") { personasDentro += q; boletasDentro += 1; }
  });
  return { boletas: list.length, personas, ingresos, byPayment, personasDentro, boletasDentro };
}

function tipoLabel(key) { const t = TICKET_TYPES_V2.find(x => x.key === key); return t ? t.label : (key || ""); }
function estadoLabel(s) { return s === "ingresado" ? "Ingresado" : "Activo"; }
// Fecha y hora del ingreso (check-in). Vacío si la boleta aún no entró.
function horaIngreso(t) {
  if (!t || !t.checkedInAt) return "";
  try {
    return new Date(t.checkedInAt).toLocaleString(localeDelEventoActivo(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

const COLS = ["N°", "Boleta", "Asistente", "Tipo", "Cant.", "Precio", "Pago", "Estado", "Ingreso"];

// "Efectivo: $70.000 · Transferencia: $168.000"
function resumenPago(r) {
  return Object.entries(r.byPayment).filter(([, v]) => v > 0).map(([m, v]) => `${m}: ${fmtDinero(v)}`).join(" · ");
}

// ============================================
// CSV (Google Sheets / Numbers)
// ============================================
export function buildEntradasCsv(tickets, subtitulo = "") {
  const r = entradasResumen(tickets);
  const rows = [];
  rows.push(["Sangre Nueva — La Velada · Registro de entradas"]);
  if (subtitulo) rows.push([subtitulo]);
  rows.push([`${r.boletas} boletas · ${r.personas} personas · Ingresos ${fmtDinero(r.ingresos)}`]);
  const pago = resumenPago(r);
  if (pago) rows.push([pago]);
  rows.push([`Check-in: ${r.personasDentro} de ${r.personas} personas dentro (${r.boletasDentro} de ${r.boletas} boletas)`]);
  rows.push([]);
  rows.push(COLS);
  (tickets || []).forEach((t, i) => {
    rows.push([
      i + 1,
      t.id,
      t.attendeeName || "",
      tipoLabel(t.ticketType),
      ticketQty(t),
      t.price || 0,          // número de verdad: se puede sumar/ordenar en la hoja
      t.paymentMethod || "",
      estadoLabel(t.status),
      horaIngreso(t),
    ]);
  });
  return csvDocument(rows);
}

// ============================================
// HOJA IMPRIMIBLE (HTML)
// ============================================
export function buildEntradasHtml(tickets, subtitulo = "") {
  const r = entradasResumen(tickets);
  const filas = (tickets || []).map((t, i) => {
    const ingresado = t.status === "ingresado";
    return `<tr class="${ingresado ? "in" : ""}">
      <td>${i + 1}</td>
      <td class="mono">${escapeHtml(t.id || "")}</td>
      <td class="izq">${escapeHtml(t.attendeeName || "")}</td>
      <td>${escapeHtml(tipoLabel(t.ticketType))}</td>
      <td>${ticketQty(t)}</td>
      <td class="der">${escapeHtml(fmtDinero(t.price || 0))}</td>
      <td>${escapeHtml(t.paymentMethod || "")}</td>
      <td>${ingresado ? "✓ Ingresado" : "● Activo"}</td>
      <td>${escapeHtml(horaIngreso(t))}</td>
    </tr>`;
  }).join("");
  const pago = resumenPago(r);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Entradas — Sangre Nueva</title>
<meta name="color-scheme" content="light">
<style>
  /* Forzar impresión de los colores de fondo (sin esto el PDF sale sin color). */
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  /* Fondo blanco declarado: la hoja se MIRA en pantalla antes de imprimir, y
     con el navegador en modo oscuro un fondo sin declarar sale negro. Esto es
     papel, siempre (mismo criterio en las otras hojas imprimibles). */
  body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#000;background:#fff;}
  .header{background:#000;color:#FDE047;text-align:center;padding:14px 0;font-size:22px;font-weight:bold;}
  .subtitulo{background:#FED7AA;text-align:center;padding:8px;font-size:14px;font-weight:bold;border:1px solid #000;border-top:none;}
  .resumen{text-align:center;padding:9px;font-size:13px;border:1px solid #000;border-top:none;background:#F3F4F6;}
  .resumen b{font-size:15px;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th,td{border:1px solid #000;padding:5px 7px;text-align:center;}
  thead th{background:#BFDBFE;}
  td.izq{text-align:left;font-weight:bold;}
  td.der{text-align:right;}
  td.mono{font-family:'Courier New',monospace;}
  tr.in{background:#DCFCE7;}
  tfoot td{font-weight:bold;background:#E5E7EB;font-size:13px;}
  @page{size:landscape;margin:12mm;}
</style></head>
<body>
<div class="header">Sangre Nueva — La Velada · Registro de Entradas</div>
${subtitulo ? `<div class="subtitulo">${escapeHtml(subtitulo)}</div>` : ""}
<div class="resumen"><b>${r.boletas} boletas · ${r.personas} personas · ${escapeHtml(fmtDinero(r.ingresos))}</b>${pago ? " — " + escapeHtml(pago) : ""} — Check-in: ${r.personasDentro}/${r.personas} personas dentro</div>
<table>
<thead><tr>${COLS.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
<tbody>${filas}</tbody>
<tfoot><tr><td colspan="4">TOTAL</td><td>${r.personas}</td><td class="der">${escapeHtml(fmtDinero(r.ingresos))}</td><td colspan="3"></td></tr></tfoot>
</table>
</body></html>`;
}
