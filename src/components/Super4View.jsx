import { useMemo } from "react";
import { save, patchSuper4Bracket } from "../lib/storage.js";
import { SUPER4_CATEGORIES, buildSuper4Brackets, setSemiWinner, setFinalWinner } from "../lib/super4.js";

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================
// SUPER 4 — llaves de campeonato por cinturón
// Formato bracket de eliminación directa: las dos semifinales del sábado a
// la izquierda, conectadas con líneas a la final del domingo a la derecha.
// `ready` viene de App: mientras la sincronización no haya recibido el
// primer valor de las llaves desde la nube, escribir podría pisar llaves
// armadas en otro dispositivo.
// ============================================
export default function Super4View({ fighters, super4, setSuper4, ready = true }) {
  const byId = useMemo(() => { const m = {}; fighters.forEach(f => { m[f.id] = f; }); return m; }, [fighters]);
  const resultado = useMemo(() => buildSuper4Brackets(fighters), [fighters]);

  function checkReady() {
    if (ready) return true;
    alert("Sincronizando las llaves con la nube… intenta de nuevo en unos segundos.");
    return false;
  }
  function persist(brackets) { setSuper4(brackets); save("bm_super4_v1", brackets); }
  function generar() {
    if (!checkReady()) return;
    if (super4.length && !confirm("Ya hay llaves armadas. ¿Generarlas de nuevo?\n\nSe reemplazan las llaves actuales y se pierden los ganadores marcados.")) return;
    const { brackets, faltantes } = buildSuper4Brackets(fighters);
    if (!brackets.length) { alert("No hay suficientes peleadores elegibles para armar ninguna llave todavía."); return; }
    persist(brackets);
    if (faltantes.length) alert("Se armaron " + brackets.length + " llave(s). Quedaron sin armar por falta de atletas elegibles:\n\n" + faltantes.map(f => `• ${f.catLabel}: hay ${f.elegibles}, faltan ${f.faltan}`).join("\n"));
  }
  function limpiar() {
    if (!checkReady()) return;
    if (!confirm("¿Eliminar todas las llaves del Super 4?\n\nLos peleadores no se tocan; solo se borran las llaves y sus resultados.")) return;
    persist([]);
  }
  // Los ganadores se escriben con un update dirigido a la llave tocada (no
  // se reescribe el arreglo completo): dos personas marcando llaves
  // distintas al mismo tiempo no se pisan entre sí.
  function marcarResultado(updated, bId) {
    const idx = updated.findIndex(b => b.id === bId);
    if (idx === -1) return;
    setSuper4(updated);
    const b = updated[idx];
    patchSuper4Bracket(updated, idx, { semis: b.semis, finalWinner: b.finalWinner ?? null });
  }
  function marcarSemi(bId, i, fid) { if (checkReady()) marcarResultado(setSemiWinner(super4, bId, i, fid), bId); }
  function marcarFinal(bId, fid) { if (checkReady()) marcarResultado(setFinalWinner(super4, bId, fid), bId); }

  function nombre(fid) { return byId[fid]?.fullName || "—"; }

  // ---------- Impresión de las llaves ----------
  function printSuper4() {
    if (!super4.length) { alert("No hay llaves para imprimir. Toca GENERAR LLAVES primero."); return; }
    const det = fid => { const f = byId[fid]; return f ? escapeHtml(`${f.gym} · ${f.weightKg}kg · ${f.age}a`) : ""; };
    const fila = (fid, lado, winner, placeholder) => {
      if (!fid) return `<div class="r ph"><span class="sq ${lado}"></span><span class="rn"><i>${escapeHtml(placeholder)}</i></span></div>`;
      const ganador = winner === fid;
      const perdio = winner && winner !== fid;
      return `<div class="r ${ganador ? "g" : ""} ${perdio ? "p" : ""}">
        <span class="sq ${lado}"></span>
        <span class="rtx"><span class="rn">${escapeHtml(nombre(fid))}</span><span class="rd">${det(fid)}</span></span>
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
        <div class="cat">🏆 ${escapeHtml(b.catLabel)} <span class="regla">${escapeHtml(b.regla)}</span></div>
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
    // Se distingue el motivo real: si con los peleadores ACTUALES la
    // categoría ya se podría armar, el problema no es falta de atletas sino
    // que las llaves no se han regenerado desde que se registraron.
    const sinLlave = SUPER4_CATEGORIES.filter(c => !super4.some(b => b.catKey === c.key));
    const faltanAtletas = sinLlave.filter(c => resultado.faltantes.some(f => f.catKey === c.key));
    const armables = sinLlave.filter(c => !resultado.faltantes.some(f => f.catKey === c.key));
    const pendientes =
      (faltanAtletas.length ? `<p class="pend">Sin llave armada por falta de atletas elegibles: ${faltanAtletas.map(c => escapeHtml(c.label)).join(" · ")}.</p>` : "") +
      (armables.length ? `<p class="pend">Sin llave armada (ya hay atletas elegibles — vuelve a generar las llaves en la app): ${armables.map(c => escapeHtml(c.label)).join(" · ")}.</p>` : "");
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Torneo Super 4 — Sangre Nueva</title>
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
      ${llaves}
      ${pendientes}
      <div class="foot"><span>* Llaves sujetas a modificaciones.</span><span>Generado el ${new Date().toLocaleDateString("es-CL")}</span></div>
    </body></html>`;
    const win = window.open("", "_blank");
    if (!win) { alert("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e intenta de nuevo."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  // ---------- Presentación en formato bracket ----------
  const LINEA = "#4a4050";
  function Conector() {
    return (
      <div className="relative">
        <div style={{ position: "absolute", left: 0, width: "50%", top: "25%", borderTop: `1.5px solid ${LINEA}` }} />
        <div style={{ position: "absolute", left: 0, width: "50%", top: "75%", borderTop: `1.5px solid ${LINEA}` }} />
        <div style={{ position: "absolute", left: "50%", top: "25%", height: "50%", borderLeft: `1.5px solid ${LINEA}` }} />
        <div style={{ position: "absolute", left: "50%", width: "50%", top: "50%", borderTop: `1.5px solid ${LINEA}` }} />
      </div>
    );
  }

  function Tarjeta({ dia, decidido, destacada, children }) {
    return (
      <div className={"rounded-xl border overflow-hidden bg-black/40 " + (destacada ? "border-boxing-goldDim/60" : "border-boxing-lineBright")}>
        <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1">
          <span className="text-[9px] text-boxing-muted font-semibold tracking-wide">{dia}</span>
          {decidido && <span className="text-[8px] rounded-full bg-white/10 text-boxing-cream px-2 py-0.5">Fin</span>}
        </div>
        <div>{children}</div>
      </div>
    );
  }

  function Fila({ fid, winner, onPick, lado, placeholder, bloqueada }) {
    const cuadro = <span className="rounded-sm flex-shrink-0" style={{ width: 11, height: 11, background: lado === "rojo" ? "#c0392b" : "#2980b9" }} />;
    if (!fid) return (
      <div className="flex items-center gap-2 px-2.5 py-2 opacity-50">
        {cuadro}
        <span className="text-[11px] text-boxing-muted italic truncate">{placeholder}</span>
      </div>
    );
    const f = byId[fid];
    const esGanador = winner === fid;
    const perdio = winner && winner !== fid;
    // Deshabilitada si el peleador ya no existe (eliminado o aún no
    // sincronizado) o si la final todavía no tiene a sus dos finalistas
    // (no se puede coronar campeón con una sola semifinal decidida).
    const deshabilitada = !f || bloqueada;
    return (
      <button type="button" disabled={deshabilitada} onClick={() => onPick(fid)} className={"w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors " + (esGanador ? "bg-boxing-goldDim/15" : "hover:bg-white/5") + (deshabilitada ? " opacity-40 cursor-not-allowed" : "")}>
        {cuadro}
        <span className="flex flex-col min-w-0 flex-1">
          <span className={"text-[12.5px] leading-tight truncate " + (perdio ? "text-boxing-muted" : "text-boxing-cream font-bold")}>{f ? f.fullName : "—"}</span>
          <span className="text-[8.5px] text-boxing-muted truncate">{f ? `${f.gym} · ${f.weightKg}kg · ${f.age}a` : "peleador eliminado"}</span>
        </span>
        {esGanador && <span className="text-boxing-goldFight text-[11px] flex-shrink-0">◀</span>}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-3 text-boxing-cream" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "26px", letterSpacing: "0.05em" }}>
          <span style={{ width: "4px", height: "26px", background: "#c42438", display: "block", flexShrink: 0 }} />
          Super 4 {"🏆"}
        </h2>
        <span className="text-[10px] text-boxing-muted tracking-widest uppercase">{super4.length} llave{super4.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="flex gap-2">
        <button onClick={generar} className="flex-1 py-4 font-black tracking-widest bg-boxing-crimson hover:bg-boxing-crimsonLight text-boxing-cream border border-red-500/30 active:scale-95 transition-all" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "22px", letterSpacing: "4px" }}>
          GENERAR LLAVES
        </button>
        <button onClick={printSuper4} title="Imprimir las llaves del Super 4" className="px-4 bg-black border border-boxing-goldDim text-boxing-goldFight text-xl transition-colors hover:bg-boxing-goldDim/10">🖨️</button>
      </div>
      {super4.length > 0 && <button onClick={limpiar} className="w-full py-2.5 bg-black border border-boxing-lineBright text-boxing-muted text-sm tracking-widest uppercase">Limpiar llaves</button>}

      {!super4.length && <div className="border border-dashed border-boxing-lineBright p-4 text-center space-y-2">
        <p className="text-boxing-muted text-sm">Arma automáticamente las llaves de 4 atletas por cinturón:<br />semifinales el <span className="text-boxing-cream font-semibold">sábado 01</span> y la final el <span className="text-boxing-goldFight font-semibold">domingo 02</span>.</p>
        <div className="text-left text-xs text-boxing-muted space-y-1 pt-2">
          {SUPER4_CATEGORIES.map(c => {
            const n = resultado.brackets.some(b => b.catKey === c.key) ? 4 : (resultado.faltantes.find(f => f.catKey === c.key)?.elegibles ?? 0);
            const listo = n >= 4;
            return <p key={c.key}>{listo ? "✅" : "⚠️"} <span className={listo ? "text-boxing-cream" : ""}>{c.label}</span> — {c.regla} · elegibles: {listo ? "4+" : n}</p>;
          })}
        </div>
      </div>}

      {super4.map(b => {
        const finalistas = [b.semis[0].winner, b.semis[1].winner];
        const campeon = b.finalWinner;
        return (
          <div key={b.id} className="bg-boxing-panel border border-boxing-goldDim/40 overflow-hidden scale-in relative">
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg,transparent,#c8a04a,transparent)" }} />
            <div className="px-4 py-2.5 bg-black/40 border-b border-boxing-line flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-boxing-goldFight font-bold truncate" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.08em" }}>{"🏆"} {b.catLabel}</p>
                <p className="text-[10px] text-boxing-muted truncate">{b.regla}</p>
              </div>
              <span className="text-[8.5px] text-boxing-muted flex-shrink-0">toca al ganador</span>
            </div>
            <div className="p-3">
              <div className="grid items-stretch" style={{ gridTemplateColumns: "1fr 18px 1fr" }}>
                <div className="flex flex-col justify-between gap-3">
                  {b.semis.map((s, i) => (
                    <Tarjeta key={i} dia={`Sáb 01 · Semi ${i + 1}`} decidido={!!s.winner}>
                      <Fila fid={s.red} winner={s.winner} lado="rojo" onPick={fid => marcarSemi(b.id, i, fid)} />
                      <Fila fid={s.blue} winner={s.winner} lado="azul" onPick={fid => marcarSemi(b.id, i, fid)} />
                    </Tarjeta>
                  ))}
                </div>
                <Conector />
                <div className="flex flex-col justify-center">
                  <Tarjeta dia="Dom 02 · Final" decidido={!!campeon} destacada>
                    <Fila fid={finalistas[0]} winner={campeon} lado="rojo" onPick={fid => marcarFinal(b.id, fid)} placeholder="Ganador Semi 1" bloqueada={!(finalistas[0] && finalistas[1])} />
                    <Fila fid={finalistas[1]} winner={campeon} lado="azul" onPick={fid => marcarFinal(b.id, fid)} placeholder="Ganador Semi 2" bloqueada={!(finalistas[0] && finalistas[1])} />
                  </Tarjeta>
                </div>
              </div>
              {campeon && <div className="mt-3 border border-boxing-goldFight/50 bg-boxing-goldDim/10 px-3 py-2.5 text-center fade-in">
                <p className="text-[10px] tracking-widest uppercase text-boxing-goldFight">Campeón {b.catLabel}</p>
                <p className="text-boxing-cream font-black" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.05em" }}>{"🏆"} {nombre(campeon)}</p>
              </div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
