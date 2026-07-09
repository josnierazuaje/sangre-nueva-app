import { useState, useMemo } from "react";
import { getCategoryInfo, getExperienceInfo, getAgeCategory } from "../constants.js";
import { save } from "../lib/storage.js";
import { autoMatchAll, sorteoMatch } from "../lib/matchmaking.js";
import Badge from "./Badge.jsx";
import VSCard from "./VSCard.jsx";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ============================================
// MATCHMAKING VIEW
// ============================================
export default function MatchmakingView({ fighters, matchups, setMatchups }) {
  const [showUn, setShowUn] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [sortCount, setSortCount] = useState(0);
  const matched = useMemo(() => { const s = new Set(); matchups.forEach(m => { s.add(m.fighterRedId); s.add(m.fighterBlueId); }); return s; }, [matchups]);
  const unmatched = fighters.filter(f => !matched.has(f.id));
  // Los emparejamientos guardados traen sus advertencias congeladas al
  // momento de crearse; esta verificación se calcula en vivo para detectar
  // cruces de categorías de edad FECHIBOX en VS armados antes de la regla
  // (o si a un peleador le editaron la edad después de emparejarlo).
  const fechiboxViolations = useMemo(() => matchups.map(m => {
    const r = fighters.find(f => f.id === m.fighterRedId);
    const b = fighters.find(f => f.id === m.fighterBlueId);
    if (!r || !b) return null;
    const c1 = getAgeCategory(r.age), c2 = getAgeCategory(b.age);
    if (c1.key === c2.key) return null;
    return { n: m.roundNumber, texto: `Pelea ${m.roundNumber}: ${r.fullName} (${c1.label}, ${r.age}a) vs ${b.fullName} (${c2.label}, ${b.age}a)` };
  }).filter(Boolean), [matchups, fighters]);
  function autoM() { const m = autoMatchAll(fighters); setMatchups(m); save("bm_matchups_v3", m); }
  function rmM(id) { const u = matchups.filter(m => m.id !== id).map((m, i) => ({ ...m, roundNumber: i + 1 })); setMatchups(u); save("bm_matchups_v3", u); }
  function clearAll() { setMatchups([]); save("bm_matchups_v3", []); }
  function notaChange(id, nota) { const u = matchups.map(m => m.id === id ? { ...m, nota } : m); setMatchups(u); save("bm_matchups_v3", u); }
  // Abre una ventana con una tabla imprimible (N°/Escuela/Atleta/VS/Atleta/
  // Escuela/Peso/Nota) y dispara el diálogo de impresión del navegador —
  // desde ahí se puede imprimir directo o guardar como PDF. Las peleas se
  // agrupan por categoría de edad FECHIBOX (con su formato de rounds en el
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
      // Un cruce de categorías distintas (prohibido por FECHIBOX) se agrupa
      // aparte y bien visible para que los jueces lo detecten de inmediato.
      const key = c1.key === c2.key ? c1.key : "mixta";
      if (!groups[key]) groups[key] = [];
      groups[key].push(x);
    });
    const rows = AGE_GROUP_ORDER.filter(k => groups[k]).map(k => {
      const list = groups[k].sort((x1, x2) => (x1.r.weightKg + x1.b.weightKg) - (x2.r.weightKg + x2.b.weightKg));
      const cat = k === "mixta" ? null : getAgeCategory(list[0].r.age);
      const headerText = cat
        ? `${cat.label} · ${cat.formato}`.toUpperCase()
        : "⚠ CATEGORÍAS DE EDAD MEZCLADAS — REVISAR (FECHIBOX NO PERMITE ESTE CRUCE)";
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
  td.esc{font-weight:bold;}
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
  function runSorteo() {
    setSorting(true);
    setMatchups([]);
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setSortCount(count);
      if (count >= 12) {
        clearInterval(interval);
        const m = sorteoMatch(fighters);
        setMatchups(m);
        save("bm_matchups_v3", m);
        setSorting(false);
        setSortCount(0);
      }
    }, 120);
  }
  if (fighters.length < 2) return <div className="text-center py-16 border border-dashed border-boxing-lineBright"><div className="text-5xl mb-4 opacity-30">{"\u{1F94A}"}</div><p className="text-boxing-muted" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.08em" }}>Necesitas al menos 2 peleadores</p></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-3 text-boxing-cream" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "26px", letterSpacing: "0.05em" }}>
          <span style={{ width: "4px", height: "26px", background: "#c42438", display: "block", flexShrink: 0 }} />
          Emparejamientos
        </h2>
        <span className="text-[10px] text-boxing-muted tracking-widest uppercase">{matchups.length} peleas</span>
      </div>

      {/* Aviso de cruces de categoría de edad FECHIBOX en VS ya guardados */}
      {fechiboxViolations.length > 0 && <div className="bg-red-900/20 border border-red-500/50 p-4 space-y-2 fade-in">
        <p className="text-red-400 font-bold text-sm flex items-center gap-2">{"⚠️"} {fechiboxViolations.length} pelea{fechiboxViolations.length !== 1 ? "s" : ""} mezcla{fechiboxViolations.length !== 1 ? "n" : ""} categorías de edad — FECHIBOX no lo permite</p>
        <div className="space-y-1">{fechiboxViolations.map(v => <p key={v.n} className="text-red-300/90 text-xs">{v.texto}</p>)}</div>
        <p className="text-boxing-muted text-xs">Elimina esas peleas (✕) y empareja de nuevo, o vuelve a generar todo con Sorteo / Auto VS.</p>
      </div>}

      {/* Botón Sorteo destacado */}
      <button onClick={runSorteo} disabled={sorting} className={"w-full py-4 font-black text-lg tracking-widest flex items-center justify-center gap-3 transition-all " + (sorting ? "bg-boxing-crimson/60 border border-red-500/50 text-red-300 cursor-not-allowed" : "bg-boxing-crimson hover:bg-boxing-crimsonLight text-boxing-cream border border-red-500/30 active:scale-95")} style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "22px", letterSpacing: "4px" }}>
        {sorting
          ? <><span className="text-3xl" style={{ animation: "spin 0.3s linear infinite", display: "inline-block" }}>🎲</span> SORTEANDO...</>
          : <><span className="text-2xl">🎲</span> SORTEO</>
        }
      </button>

      {/* Overlay animado durante sorteo */}
      {sorting && <div className="bg-black/60 border border-red-500/30 p-6 text-center scale-in">
        <div className="text-4xl mb-3" style={{ animation: "vsFlash 0.3s ease-in-out infinite" }}>🥊</div>
        <p className="text-red-400 font-bold text-lg" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", letterSpacing: "3px" }}>MEZCLANDO PELEADORES...</p>
        <div className="flex justify-center gap-1 mt-3">{[...Array(5)].map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-red-500" style={{ animation: `vsFlash 0.6s ease-in-out ${i * 0.1}s infinite` }}></div>)}</div>
      </div>}

      {/* Botón Auto VS (secundario) */}
      <div className="flex gap-2">
        <button onClick={autoM} disabled={sorting} className="flex-1 bg-transparent hover:bg-boxing-goldDim/10 border border-boxing-goldDim text-boxing-goldFight text-sm font-semibold py-2.5 flex items-center justify-center gap-2 tracking-widest uppercase transition-colors" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "16px" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          Auto VS
        </button>
        {matchups.length > 0 && <button onClick={printSheet} disabled={sorting} className="px-4 py-2.5 bg-black border border-boxing-goldDim text-boxing-goldFight text-sm tracking-widest uppercase">🖨️ Imprimir</button>}
        {matchups.length > 0 && <button onClick={clearAll} disabled={sorting} className="px-4 py-2.5 bg-black border border-boxing-lineBright text-boxing-muted text-sm tracking-widest uppercase">Limpiar</button>}
      </div>

      {!matchups.length && !sorting && <div className="border border-dashed border-boxing-lineBright p-4 text-center"><p className="text-boxing-muted text-sm">Usa <span className="text-red-400 font-bold">SORTEO</span> para emparejamientos aleatorios<br />o <span className="text-boxing-cream font-semibold">Auto VS</span> para emparejamiento inteligente</p><p className="text-boxing-muted text-xs mt-1 opacity-60">Respeta categoría · nivel · escuela</p></div>}
      <div className="space-y-3">{matchups.map((m, i) => <VSCard key={m.id} matchup={m} fighters={fighters} index={i} onRemove={rmM} onNotaChange={notaChange} />)}</div>
      {unmatched.length > 0 && matchups.length > 0 && <div><button onClick={() => setShowUn(!showUn)} className="text-sm text-boxing-muted hover:text-boxing-goldFight flex items-center gap-1 tracking-wide"><svg className={"w-4 h-4 transition-transform " + (showUn ? "rotate-90" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>Sin pelea ({unmatched.length})</button>
        {showUn && <div className="mt-2 space-y-1.5">{unmatched.map(f => { const c = getCategoryInfo(f.weightCategory); const e = getExperienceInfo(f.experienceLevel); return <div key={f.id} className="bg-boxing-panel border border-boxing-line px-3 py-2 flex items-center justify-between fade-in"><div><span className="text-boxing-cream text-sm">{f.fullName}</span><span className="text-boxing-muted text-xs ml-2">{c?.label} · {f.weightKg}kg</span></div><Badge color={e?.color}>{e?.label}</Badge></div>; })}</div>}</div>}
    </div>
  );
}
