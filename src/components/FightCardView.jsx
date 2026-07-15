import { getCategoryInfo, getAgeCategory, FECHIBOX_LABEL } from "../constants.js";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ============================================
// FIGHT CARD VIEW
// ============================================
export default function FightCardView({ matchups, fighters }) {
  if (!matchups.length) return <div className="text-center py-16"><div className="text-5xl mb-4">{"\u{1F4CB}"}</div><p className="text-gray-400">Primero crea los VS</p></div>;
  const eventDate = new Date().toLocaleDateString("es-CL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  function shareWA() {
    const text = "*CARTELERA DE BOXEO*\n" + eventDate + "\n\n" + matchups.map(m => { const r = fighters.find(f => f.id === m.fighterRedId); const b = fighters.find(f => f.id === m.fighterBlueId); const c = getCategoryInfo(r?.weightCategory); return `*Pelea ${m.roundNumber}* (${c?.label})\n${r?.fullName} _(${r?.weightKg}kg, ${r?.gym})_\nVS\n${b?.fullName} _(${b?.weightKg}kg, ${b?.gym})_`; }).join("\n\n");
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }
  // Abre una ventana con una tabla imprimible (N°/Escuela/Atleta/VS/Atleta/
  // Escuela/Peso/Nota) y dispara el diálogo de impresión del navegador —
  // desde ahí se puede imprimir directo o guardar como PDF. Las peleas se
  // agrupan por categoría de edad World Boxing (con su formato de rounds en el
  // encabezado de cada bloque) y dentro de cada bloque van de más liviano
  // a más pesado. La numeración se reinicia por bloque, como en la planilla
  // de Excel que usan los jueces.
  function printSheet() {
    const AGE_GROUP_ORDER = ["escolar", "cadete", "juvenil", "adulto", "infantil", "veterano", "mixta"];
    const withData = matchups
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
    const rows = AGE_GROUP_ORDER.filter(k => groups[k]).map(k => {
      const list = groups[k].sort((x1, x2) => (x1.r.weightKg + x1.b.weightKg) - (x2.r.weightKg + x2.b.weightKg));
      const cat = k === "mixta" ? null : getAgeCategory(list[0].r.age);
      const fechibox = cat ? FECHIBOX_LABEL[cat.key] : null;
      const headerText = cat
        ? `${cat.label}${fechibox ? " · " + fechibox : ""} · ${cat.formato}`.toUpperCase()
        : "⚠ CATEGORÍAS DE EDAD MEZCLADAS — REVISAR (WORLD BOXING NO PERMITE ESTE CRUCE)";
      const headerRow = `<tr><td colspan="8" class="${k === "mixta" ? "grupo grupo-alerta" : "grupo"}">${headerText}</td></tr>`;
      const groupRows = list.map((x, i) => {
        const { m, r, b } = x;
        const c1 = getAgeCategory(r.age), c2 = getAgeCategory(b.age);
        const pesoDetalle = c1.key === c2.key
          ? `${c1.label} · ${c1.formato}`
          : `${c1.label} vs ${c2.label}`;
        return `<tr>
          <td>${i + 1}</td>
          <td class="esc esc-roja">${escapeHtml(r.gym)}</td>
          <td class="atleta atleta-rojo">${escapeHtml(r.fullName)}</td>
          <td class="vs">-</td>
          <td class="atleta atleta-azul">${escapeHtml(b.fullName)}</td>
          <td class="esc esc-azul">${escapeHtml(b.gym)}</td>
          <td>${r.weightKg}kg / ${b.weightKg}kg<div class="peso-detalle">${escapeHtml(pesoDetalle)}</div></td>
          <td>${escapeHtml(m.nota || "")}</td>
        </tr>`;
      }).join("");
      return headerRow + groupRows;
    }).join("");
    const win = window.open("", "_blank");
    if (!win) { alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo."); return; }
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Planilla de peleadores — Sangre Nueva</title>
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
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Cartelera</h2>
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl border border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-red-800 via-yellow-700 to-red-800 p-4 text-center"><h3 className="text-2xl font-black text-white uppercase tracking-wider">{"\u{1F94A}"} Sangre Nueva — La Velada</h3><p className="text-yellow-200 text-sm mt-1 capitalize">{eventDate}</p><p className="text-white/60 text-xs">{matchups.length} Peleas</p></div>
        <div className="divide-y divide-gray-800">{matchups.map((m, i) => { const r = fighters.find(f => f.id === m.fighterRedId); const b = fighters.find(f => f.id === m.fighterBlueId); if (!r || !b) return null; const c = getCategoryInfo(r.weightCategory); const main = i === matchups.length - 1;
          return <div key={m.id} className={"px-4 py-3 " + (main ? "bg-yellow-900/20" : "")}>
            {main ? <div className="text-center mb-1"><span className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest bg-yellow-500/10 px-2 py-0.5 rounded">{"⭐"} Estelar</span></div> : <div className="text-center mb-1"><span className="text-[10px] text-gray-500">Pelea {m.roundNumber}</span></div>}
            <div className="flex items-center"><div className="flex-1 text-left"><p className={"font-bold truncate " + (main ? "text-base text-white" : "text-sm text-gray-200")}>{r.fullName}</p><p className="text-[11px] text-gray-500">{r.gym} · {r.weightKg}kg</p></div><div className="mx-2 flex flex-col items-center"><span className="text-yellow-500 font-black text-sm">VS</span><span className="text-[10px] text-gray-500">{c?.label}</span></div><div className="flex-1 text-right"><p className={"font-bold truncate " + (main ? "text-base text-white" : "text-sm text-gray-200")}>{b.fullName}</p><p className="text-[11px] text-gray-500">{b.weightKg}kg · {b.gym}</p></div></div></div>; })}</div>
        <div className="bg-gray-800/50 px-4 py-2 text-center"><p className="text-gray-500 text-[10px]">Sangre Nueva · La Velada</p></div>
      </div>
      <div className="flex gap-2"><button onClick={printSheet} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2">{"🖨️"} Imprimir</button><button onClick={shareWA} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{"\u{1F4E4}"} WhatsApp</button></div>
    </div>
  );
}
