import { useState, useMemo } from "react";
import { getCategoryInfo, getExperienceInfo } from "../constants.js";
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
  function autoM() { const m = autoMatchAll(fighters); setMatchups(m); save("bm_matchups_v3", m); }
  function rmM(id) { const u = matchups.filter(m => m.id !== id).map((m, i) => ({ ...m, roundNumber: i + 1 })); setMatchups(u); save("bm_matchups_v3", u); }
  function clearAll() { setMatchups([]); save("bm_matchups_v3", []); }
  function notaChange(id, nota) { const u = matchups.map(m => m.id === id ? { ...m, nota } : m); setMatchups(u); save("bm_matchups_v3", u); }
  // Abre una ventana con una tabla imprimible (N°/Escuela/Atleta/VS/Atleta/
  // Escuela/Peso/Nota) y dispara el diálogo de impresión del navegador —
  // desde ahí se puede imprimir directo o guardar como PDF. Se ordena de
  // más liviano a más pesado (independiente del orden "Pelea N" en pantalla).
  function printSheet() {
    const sorted = [...matchups].sort((m1, m2) => {
      const r1 = fighters.find(f => f.id === m1.fighterRedId), b1 = fighters.find(f => f.id === m1.fighterBlueId);
      const r2 = fighters.find(f => f.id === m2.fighterRedId), b2 = fighters.find(f => f.id === m2.fighterBlueId);
      const avg1 = r1 && b1 ? (r1.weightKg + b1.weightKg) / 2 : 0;
      const avg2 = r2 && b2 ? (r2.weightKg + b2.weightKg) / 2 : 0;
      return avg1 - avg2;
    });
    const rows = sorted.map((m, i) => {
      const r = fighters.find(f => f.id === m.fighterRedId);
      const b = fighters.find(f => f.id === m.fighterBlueId);
      if (!r || !b) return "";
      return `<tr>
        <td>${i + 1}</td>
        <td class="esc esc-roja">${escapeHtml(r.gym)}</td>
        <td class="atleta atleta-rojo">${escapeHtml(r.fullName)}</td>
        <td class="vs">-</td>
        <td class="atleta atleta-azul">${escapeHtml(b.fullName)}</td>
        <td class="esc esc-azul">${escapeHtml(b.gym)}</td>
        <td>${r.weightKg}kg / ${b.weightKg}kg</td>
        <td>${escapeHtml(m.nota || "")}</td>
      </tr>`;
    }).join("");
    const win = window.open("", "_blank");
    if (!win) { alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo."); return; }
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Planilla de peleadores — Sangre Nueva</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#000;}
  .header{background:#000;color:#FDE047;text-align:center;padding:16px 0;font-size:24px;font-weight:bold;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{border:1px solid #000;padding:6px 8px;text-align:center;}
  thead th{background:#BFDBFE;}
  th.roja{background:#FCA5A5;}
  th.azul{background:#60A5FA;}
  td.atleta-rojo{background:#FCA5A5;font-weight:bold;}
  td.atleta-azul{background:#60A5FA;font-weight:bold;}
  td.esc{font-weight:bold;}
  @page{size:landscape;margin:12mm;}
</style></head>
<body>
<div class="header">Sangre Nueva — La Velada</div>
<table>
<thead><tr><th>N°</th><th>Escuela</th><th class="roja">Atleta</th><th>VS</th><th class="azul">Atleta</th><th>Escuela</th><th>Peso</th><th>Nota</th></tr></thead>
<tbody>${rows}</tbody>
</table>
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
