import { getCategoryInfo, getExperienceInfo } from "../constants.js";

// ============================================
// VS CARD
// ============================================
export default function VSCard({ matchup, fighters, index, onRemove, onNotaChange }) {
  const r = fighters.find(f => f.id === matchup.fighterRedId); const b = fighters.find(f => f.id === matchup.fighterBlueId);
  if (!r || !b) return null;
  const rc = getCategoryInfo(r.weightCategory); const re = getExperienceInfo(r.experienceLevel); const be = getExperienceInfo(b.experienceLevel);
  const wd = Math.abs(r.weightKg - b.weightKg).toFixed(1);
  const warnings = matchup.warnings || [];
  const hh = warnings.some(w => w.severity === "high"); const hm = warnings.some(w => w.severity === "medium");
  return (
    <div className={"bg-boxing-panel overflow-hidden scale-in relative border " + (hh ? "border-red-500/50" : hm ? "border-boxing-goldDim/50" : "border-boxing-line")}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg,transparent,#9b1a2a,transparent)" }} />
      <div className="flex items-center justify-between px-4 py-2 bg-black/30 border-b border-boxing-line">
        <div className="flex items-center gap-2.5">
          <span className="text-boxing-muted" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "13px", letterSpacing: "0.2em" }}>PELEA {matchup.roundNumber}</span>
          <span className="text-[9px] font-bold px-2 py-0.5 border border-boxing-goldDim/40 text-boxing-goldFight tracking-widest uppercase">{rc?.label} · Δ{wd}kg</span>
        </div>
        {onRemove && <button onClick={() => onRemove(matchup.id)} className="text-boxing-muted hover:text-red-400 p-0.5"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-5 gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[9px] font-bold tracking-widest uppercase text-red-400/80">Rojo</span>
          <div className="text-boxing-cream font-bold leading-none truncate" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.03em" }}>{r.fullName}</div>
          <div className="text-[11px] text-boxing-muted truncate">{r.gym} · {r.weightKg}kg · {r.age}a</div>
          <div className="text-[10px] font-semibold tracking-widest uppercase mt-0.5" style={{ color: re?.color }}>{r.fightCount}p · {re?.label}</div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div style={{ width: "1px", height: "22px", background: "linear-gradient(180deg,transparent,#9b1a2a)" }} />
          <span className="font-bold vs-pulse" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.1em", color: "#c42438", textShadow: "0 0 16px rgba(155,26,42,0.4)" }}>VS</span>
          <div style={{ width: "1px", height: "22px", background: "linear-gradient(180deg,#9b1a2a,transparent)" }} />
        </div>
        <div className="flex flex-col gap-1 items-end text-right min-w-0">
          <span className="text-[9px] font-bold tracking-widest uppercase text-blue-400/80">Azul</span>
          <div className="text-boxing-cream font-bold leading-none truncate" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.03em" }}>{b.fullName}</div>
          <div className="text-[11px] text-boxing-muted truncate">{b.weightKg}kg · {b.age}a · {b.gym}</div>
          <div className="text-[10px] font-semibold tracking-widest uppercase mt-0.5" style={{ color: be?.color }}>{b.fightCount}p · {be?.label}</div>
        </div>
      </div>
      {warnings.length > 0 && <div className="border-t border-boxing-line px-4 py-2 space-y-1 bg-black/20">{warnings.map((w, i) => <div key={i} className="flex items-center gap-1.5 text-[11px]"><span>{w.severity === "high" ? "\u{1F534}" : w.severity === "medium" ? "\u{1F7E1}" : "\u{1F7E2}"}</span><span className={w.severity === "high" ? "text-red-400" : w.severity === "medium" ? "text-boxing-goldFight" : "text-boxing-muted"}>{w.message}</span></div>)}</div>}
      {onNotaChange && <div className="border-t border-boxing-line px-4 py-2">
        <input type="text" value={matchup.nota || ""} onChange={e => onNotaChange(matchup.id, e.target.value)} placeholder="Nota (ej: Super 4, 5 peleas, exhibición...)" maxLength={40} className="w-full bg-transparent text-boxing-cream placeholder-boxing-muted text-xs focus:outline-none" />
      </div>}
    </div>
  );
}
