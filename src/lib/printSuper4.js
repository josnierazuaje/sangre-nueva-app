import { escapeHtml } from "./html.js";
import { bracketPrintTitle, bracketMaxFights } from "./super4.js";

// Genera el HTML imprimible del torneo Super 4 (llaves con semifinales y final).
// Función pura y testeable: recibe las llaves (super4), el índice de peleadores
// (byId) y la fecha ya formateada (para no depender de new Date() aquí dentro).
export function buildSuper4Html(super4, byId, fecha = "") {
  const nombre = fid => byId[fid]?.fullName || "—";
  const det = fid => { const f = byId[fid]; return f ? escapeHtml(`${(f.gym || "").toUpperCase()} · ${f.weightKg}kg · ${f.age}a`) : ""; };
  const fila = (fid, lado, winner, placeholder) => {
    if (!fid) return `<div class="r ph"><span class="sq ${lado}"></span><span class="rn ${lado}"><i>${escapeHtml(placeholder)}</i></span></div>`;
    const ganador = winner === fid;
    const perdio = winner && winner !== fid;
    return `<div class="r ${ganador ? "g" : ""} ${perdio ? "p" : ""}">
        <span class="sq ${lado}"></span>
        <span class="rtx"><span class="rn ${lado}">${escapeHtml(nombre(fid))}</span><span class="rd">${det(fid)}</span></span>
        ${ganador ? '<span class="wk">✓</span>' : ""}
      </div>`;
  };
  const match = (dia, redFid, blueFid, winner, phRed, phBlue) => `
      <div class="match">
        <div class="mh"><span>${escapeHtml(dia)}</span>${winner ? '<span class="chip">Fin</span>' : ""}</div>
        ${fila(redFid, "rojo", winner, phRed)}
        ${fila(blueFid, "azul", winner, phBlue)}
      </div>`;
  const llaves = super4.map(b => {
    const finalistas = [b.semis[0].winner, b.semis[1].winner];
    return `
      <div class="llave">
        <div class="cat">🏆 ${escapeHtml(bracketPrintTitle(b))} <span class="regla">${escapeHtml(b.regla)}</span></div>
        <div class="bracket">
          <div class="col semis">
            ${match("Sáb 01 · Semifinal 1", b.semis[0].red, b.semis[0].blue, b.semis[0].winner)}
            ${match("Sáb 01 · Semifinal 2", b.semis[1].red, b.semis[1].blue, b.semis[1].winner)}
          </div>
          <div class="conn"><i class="lt"></i><i class="lb"></i><i class="lv"></i><i class="lm"></i></div>
          <div class="col colfinal">
            ${match("Dom 02 · FINAL", finalistas[0], finalistas[1], b.finalWinner, "Ganador Semifinal 1", "Ganador Semifinal 2")}
            ${b.finalWinner ? `<div class="camp">🏆 Campeón: ${escapeHtml(nombre(b.finalWinner))}</div>` : ""}
          </div>
        </div>
      </div>`;
  }).join("");
  // Nota del tope de peleas con que se armaron las llaves (guardado en cada
  // bracket, no el del selector, que puede haber cambiado sin regenerar).
  const topeFights = super4.length ? bracketMaxFights(super4[0]) : null;
  const pendientes = "";
  const topeNota = topeFights != null ? `<div class="sub" style="background:#e7f0e0;border-color:#8ab06a">Torneo limitado a peleadores con hasta <b>${topeFights} pelea${topeFights === 1 ? "" : "s"}</b></div>` : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Torneo Super 4 — Sangre Nueva</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111; }
      .doc-header { background:#000; color:#fff; text-align:center; padding:14px 10px; }
      .doc-header h1 { font-size:20px; letter-spacing:2px; }
      .doc-header p { font-size:11px; color:#e5c76b; margin-top:4px; }
      .sub { background:#f5e6c4; border:1px solid #caa64b; text-align:center; font-size:11px; font-weight:bold; padding:6px; margin-bottom:14px; }
      .llave { margin-bottom:18px; page-break-inside:avoid; }
      .cat { font-size:14px; font-weight:bold; margin-bottom:6px; }
      .cat .regla { font-size:10px; font-weight:normal; color:#666; margin-left:6px; }
      .bracket { display:flex; align-items:stretch; }
      .col { display:flex; flex-direction:column; flex:1; }
      .semis { justify-content:space-between; gap:10px; }
      .colfinal { justify-content:center; }
      .conn { width:26px; position:relative; flex-shrink:0; }
      .conn i { position:absolute; display:block; }
      .conn .lt { left:0; width:50%; top:25%; border-top:1.5px solid #999; }
      .conn .lb { left:0; width:50%; top:75%; border-top:1.5px solid #999; }
      .conn .lv { left:50%; top:25%; height:50%; border-left:1.5px solid #999; }
      .conn .lm { left:50%; width:50%; top:50%; border-top:1.5px solid #999; }
      .match { border:1.5px solid #444; border-radius:8px; overflow:hidden; }
      .mh { display:flex; justify-content:space-between; align-items:center; background:#eee; font-size:9px; color:#555; padding:3px 8px; font-weight:bold; }
      .chip { background:#444; color:#fff; border-radius:8px; padding:1px 7px; font-size:8px; }
      .r { display:flex; align-items:center; gap:7px; padding:5px 8px; border-top:1px solid #ddd; min-height:30px; }
      .sq { width:11px; height:11px; border-radius:2px; flex-shrink:0; }
      .sq.rojo { background:#c0392b; }
      .sq.azul { background:#2980b9; }
      .rtx { display:flex; flex-direction:column; min-width:0; }
      .rn { font-size:12px; font-weight:bold; }
      .rn.rojo { color:#c0392b; text-transform:uppercase; }
      .rn.azul { color:#2980b9; text-transform:uppercase; }
      .rd { font-size:8.5px; color:#777; }
      .r.p .rn { color:#999; font-weight:normal; }
      .r.p .rd { color:#bbb; }
      .r.ph .rn { color:#999; font-weight:normal; font-size:11px; }
      .wk { margin-left:auto; color:#1a7a2e; font-weight:bold; font-size:14px; }
      .camp { margin-top:8px; border:1.5px solid #caa64b; background:#faf3df; text-align:center; font-size:12px; font-weight:bold; padding:6px; border-radius:8px; }
      .pend { font-size:10px; color:#777; margin-top:10px; }
      .foot { margin-top:14px; border-top:1px solid #ccc; padding-top:6px; font-size:9px; color:#888; display:flex; justify-content:space-between; }
      @media print { body { padding:8px; } }
    </style></head><body>
      <div class="doc-header"><h1>TORNEO SUPER 4 — SANGRE NUEVA</h1><p>La Velada · Disputa de cinturones</p></div>
      <div class="sub">Semifinales: sábado 01 de agosto · Finales por el cinturón: domingo 02 de agosto</div>
      ${topeNota}
      ${llaves}
      ${pendientes}
      <div class="foot"><span>* Llaves sujetas a modificaciones.</span><span>Generado el ${fecha}</span></div>
    </body></html>`;
}
