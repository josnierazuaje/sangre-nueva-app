import { getAgeCategory, FECHIBOX_LABEL } from "../constants.js";
import { escapeHtml } from "./html.js";

// Orden de bloques en la planilla: categorías World Boxing de menor a mayor
// edad, y al final "mixta" (cruce prohibido, va resaltado en rojo).
const AGE_GROUP_ORDER = ["escolar", "cadete", "juvenil", "adulto", "infantil", "veterano", "mixta"];

// Agrupa las peleas tal como salen en la planilla: por categoría de edad World
// Boxing (orden de menor a mayor edad, y "mixta" al final), y dentro de cada
// bloque de más liviano a más pesado. Fuente ÚNICA de la agrupación: la usan
// tanto la planilla impresa (abajo) como la descarga en Excel
// (xlsxPlanillas.js), para que las dos salidas nunca se desincronicen.
// Devuelve [{ key, headerText, mixta, list: [{ m, r, b }] }].
export function carteleraGroups(matchups, fighters) {
  const withData = (matchups || [])
    .map(m => ({ m, r: fighters.find(f => f.id === m.fighterRedId), b: fighters.find(f => f.id === m.fighterBlueId) }))
    .filter(x => x.r && x.b);
  const groups = {};
  withData.forEach(x => {
    const c1 = getAgeCategory(x.r.age), c2 = getAgeCategory(x.b.age);
    // Un cruce de categorías distintas (prohibido por World Boxing) se agrupa
    // aparte y bien visible para que los jueces lo detecten de inmediato.
    const key = c1.key === c2.key ? c1.key : "mixta";
    if (!groups[key]) groups[key] = [];
    groups[key].push(x);
  });
  return AGE_GROUP_ORDER.filter(k => groups[k]).map(k => {
    // Number() en cada peso: un JSON importado puede traer weightKg como
    // string y "55" + "60" concatena ("5560") en vez de sumar, dejando el
    // bloque desordenado (ni en la planilla impresa ni en la de Excel).
    const peso = x => Number(x.r.weightKg) + Number(x.b.weightKg);
    const list = groups[k].sort((x1, x2) => peso(x1) - peso(x2));
    const cat = k === "mixta" ? null : getAgeCategory(list[0].r.age);
    const fechibox = cat ? FECHIBOX_LABEL[cat.key] : null;
    const headerText = cat
      ? `${cat.label}${fechibox ? " · " + fechibox : ""} · ${cat.formato}`.toUpperCase()
      : "⚠ CATEGORÍAS DE EDAD MEZCLADAS — REVISAR (WORLD BOXING NO PERMITE ESTE CRUCE)";
    return { key: k, headerText, mixta: k === "mixta", list };
  });
}

// Las dos etiquetas de la columna "Peso" de una pelea: el rango ("55kg / 60kg")
// y el detalle de categoría ("U15 · 3R × 1,5min", o "U15 vs U17" si el cruce es
// de categorías distintas). También compartida con la descarga en Excel.
export function carteleraPeso(r, b) {
  const c1 = getAgeCategory(r.age), c2 = getAgeCategory(b.age);
  const detalle = c1.key === c2.key ? `${c1.label} · ${c1.formato}` : `${c1.label} vs ${c2.label}`;
  // El peso se muestra de menor a mayor (es el rango de la pelea, no
  // "rojo / azul"), pedido del organizador. Number() porque un JSON
  // importado puede traer weightKg como string (comparación lexicográfica:
  // "100" <= "60" daría orden descendente).
  const [wLo, wHi] = Number(r.weightKg) <= Number(b.weightKg) ? [r.weightKg, b.weightKg] : [b.weightKg, r.weightKg];
  return { rango: `${wLo}kg / ${wHi}kg`, detalle };
}

// Genera el HTML imprimible de la cartelera (tabla N°/Escuela/Atleta/VS/Atleta/
// Escuela/Peso/Nota). Función pura y testeable: recibe los matchups y el arreglo
// de peleadores y devuelve el documento HTML completo como string. Las peleas se
// agrupan por categoría de edad World Boxing (con su formato de rounds en el
// encabezado de cada bloque) y dentro de cada bloque van de más liviano a más
// pesado; la numeración se reinicia por bloque, como en la planilla de Excel.
export function buildCarteleraHtml(matchups, fighters) {
  const rows = carteleraGroups(matchups, fighters).map(({ headerText, mixta, list }) => {
    const headerRow = `<tr><td colspan="8" class="${mixta ? "grupo grupo-alerta" : "grupo"}">${headerText}</td></tr>`;
    const groupRows = list.map((x, i) => {
      const { m, r, b } = x;
      const { rango, detalle: pesoDetalle } = carteleraPeso(r, b);
      return `<tr>
          <td>${i + 1}</td>
          <td class="esc esc-roja">${escapeHtml(r.gym)}</td>
          <td class="atleta atleta-rojo">${escapeHtml(r.fullName)}</td>
          <td class="vs">-</td>
          <td class="atleta atleta-azul">${escapeHtml(b.fullName)}</td>
          <td class="esc esc-azul">${escapeHtml(b.gym)}</td>
          <td>${rango}<div class="peso-detalle">${escapeHtml(pesoDetalle)}</div></td>
          <td>${escapeHtml(m.nota || "")}</td>
        </tr>`;
    }).join("");
    return headerRow + groupRows;
  }).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Planilla de peleadores — Sangre Nueva</title>
<style>
  /* Forzar impresión de los colores de fondo — sin esto, el navegador los
     quita al "Guardar como PDF" y la planilla sale en blanco y negro. */
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#000;}
  .header{background:#000;color:#FDE047;text-align:center;padding:16px 0;font-size:24px;font-weight:bold;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{border:1px solid #000;padding:6px 8px;text-align:center;}
  thead th{background:#BFDBFE;}
  th.roja{background:#EF4444;color:#fff;}
  th.azul{background:#2563EB;color:#fff;}
  td.atleta-rojo{background:#FCA5A5;font-weight:bold;}
  td.atleta-azul{background:#93C5FD;font-weight:bold;}
  td.esc{font-weight:bold;text-transform:uppercase;}
  td.grupo{background:#E5E7EB;font-weight:bold;font-size:14px;padding:8px;letter-spacing:1px;}
  td.grupo-alerta{background:#FEE2E2;color:#B91C1C;}
  .peso-detalle{font-size:10px;color:#374151;font-weight:normal;margin-top:2px;}
  .nota-final{margin-top:14px;text-align:center;font-size:13px;font-weight:bold;font-style:italic;color:#B91C1C;}
  @page{size:landscape;margin:12mm;}
</style></head>
<body>
<div class="header">Sangre Nueva — La Velada</div>
<table>
<thead><tr><th>N°</th><th>Escuela</th><th class="roja">Atleta</th><th>VS</th><th class="azul">Atleta</th><th>Escuela</th><th>Peso</th><th>Nota</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p class="nota-final">La grilla está sujeta a modificaciones.</p>
</body></html>`;
}
