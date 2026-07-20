import { getAgeCategory, getCategoryInfo, getWeightCategory, weightRangeLabel, FECHIBOX_LABEL } from "../constants.js";
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

// Lo que va en la columna "Peso" de una pelea.
//
// Se imprime la DIVISIÓN OFICIAL World Boxing ("Gallo · 50-55kg"), no los kilos
// de cada atleta: la planilla se comparte con las otras escuelas y los kilos
// sueltos se prestan a confusión — lo que vale para la federación es la
// categoría. (Los kilos exactos siguen en la planilla de Peleadores.)
//
// La pelea se disputa al límite del MÁS PESADO, así que esa es la división que
// se imprime. Si los dos atletas no caen en la misma división (ej. 88kg es
// Pesado y 92kg Superpesado), se devuelve `cruce: true`: la celda se marca en
// rojo y ahí SÍ se muestran los dos kilos, que es lo que hace falta para
// corregirlo. Compartida con la descarga en Excel.
export function carteleraPeso(r, b) {
  const c1 = getAgeCategory(r.age), c2 = getAgeCategory(b.age);
  const detalle = c1.key === c2.key ? `${c1.label} · ${c1.formato}` : `${c1.label} vs ${c2.label}`;
  // Number() porque un JSON importado puede traer weightKg como string
  // (comparación lexicográfica: "100" <= "60" daría el orden al revés).
  const kgR = Number(r.weightKg), kgB = Number(b.weightKg);
  const [wLo, wHi] = kgR <= kgB ? [r.weightKg, b.weightKg] : [b.weightKg, r.weightKg];
  const pesos = `${wLo}kg / ${wHi}kg`;
  // La división se recalcula desde el peso y el sexo (no se confía en el campo
  // guardado, que en registros antiguos puede traer una clave que ya no existe).
  const div = (kg, sexo) => (Number.isFinite(kg) ? getCategoryInfo(getWeightCategory(kg, sexo)) : null);
  const dR = div(kgR, r.sexo), dB = div(kgB, b.sexo);
  const mayor = kgR >= kgB ? dR : dB;
  const cruce = !!(dR && dB) && dR.key !== dB.key;
  return {
    division: mayor ? `${mayor.label} · ${weightRangeLabel(mayor)}` : "",
    detalle,
    cruce,
    pesos,
  };
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
      const { division, detalle: pesoDetalle, cruce, pesos } = carteleraPeso(r, b);
      return `<tr>
          <td>${i + 1}</td>
          <td class="esc esc-roja">${escapeHtml(r.gym)}</td>
          <td class="atleta atleta-rojo">${escapeHtml(r.fullName)}</td>
          <td class="vs">-</td>
          <td class="atleta atleta-azul">${escapeHtml(b.fullName)}</td>
          <td class="esc esc-azul">${escapeHtml(b.gym)}</td>
          <td class="${cruce ? "peso peso-cruce" : "peso"}">${escapeHtml(division)}<div class="peso-detalle">${escapeHtml(pesoDetalle)}</div>${cruce ? `<div class="peso-detalle peso-aviso">⚠ ${pesos}</div>` : ""}</td>
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
  td.peso{font-weight:bold;font-size:14px;}
  /* Cruce de divisiones: la pelea va al límite del más pesado, pero se marca
     en rojo con los dos kilos para que se revise antes de compartirla. */
  td.peso-cruce{background:#FEE2E2;color:#B91C1C;}
  .peso-detalle{font-size:10px;color:#374151;font-weight:normal;margin-top:2px;}
  .peso-aviso{color:#B91C1C;font-weight:bold;}
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
