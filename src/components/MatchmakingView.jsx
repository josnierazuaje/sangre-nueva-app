import { useState, useMemo } from "react";
import { getCategoryInfo, getExperienceInfo } from "../constants.js";
import { save } from "../lib/storage.js";
import { autoMatchAll, sorteoMatch } from "../lib/matchmaking.js";
import Badge from "./Badge.jsx";
import VSCard from "./VSCard.jsx";

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
        {matchups.length > 0 && <button onClick={clearAll} disabled={sorting} className="px-4 py-2.5 bg-black border border-boxing-lineBright text-boxing-muted text-sm tracking-widest uppercase">Limpiar</button>}
      </div>

      {!matchups.length && !sorting && <div className="border border-dashed border-boxing-lineBright p-4 text-center"><p className="text-boxing-muted text-sm">Usa <span className="text-red-400 font-bold">SORTEO</span> para emparejamientos aleatorios<br />o <span className="text-boxing-cream font-semibold">Auto VS</span> para emparejamiento inteligente</p><p className="text-boxing-muted text-xs mt-1 opacity-60">Respeta categoría · nivel · escuela</p></div>}
      <div className="space-y-3">{matchups.map((m, i) => <VSCard key={m.id} matchup={m} fighters={fighters} index={i} onRemove={rmM} />)}</div>
      {unmatched.length > 0 && matchups.length > 0 && <div><button onClick={() => setShowUn(!showUn)} className="text-sm text-boxing-muted hover:text-boxing-goldFight flex items-center gap-1 tracking-wide"><svg className={"w-4 h-4 transition-transform " + (showUn ? "rotate-90" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>Sin pelea ({unmatched.length})</button>
        {showUn && <div className="mt-2 space-y-1.5">{unmatched.map(f => { const c = getCategoryInfo(f.weightCategory); const e = getExperienceInfo(f.experienceLevel); return <div key={f.id} className="bg-boxing-panel border border-boxing-line px-3 py-2 flex items-center justify-between fade-in"><div><span className="text-boxing-cream text-sm">{f.fullName}</span><span className="text-boxing-muted text-xs ml-2">{c?.label} · {f.weightKg}kg</span></div><Badge color={e?.color}>{e?.label}</Badge></div>; })}</div>}</div>}
    </div>
  );
}
