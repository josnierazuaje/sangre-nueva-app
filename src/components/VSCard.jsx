import { getCategoryInfo, getExperienceInfo } from "../constants.js";
import { forcedPairingReasons } from "../lib/matchmaking.js";

// ============================================
// VS CARD — cartel de combate (rediseño "Foso de Luz")
// Mitad roja / mitad azul que sangran desde los bordes (.vsx-body),
// unidas por una costura de oro con el VS en itálica serif (.vsx-vs).
// Los nombres se enfrentan hacia la costura, nunca centrados.
// Misma lógica de siempre: advertencias por severidad, nota editable
// y botón de eliminar.
// ============================================
export default function VSCard({ matchup, fighters, index, onRemove, onNotaChange }) {
  const r = fighters.find(f => f.id === matchup.fighterRedId); const b = fighters.find(f => f.id === matchup.fighterBlueId);
  if (!r || !b) return null;
  const rc = getCategoryInfo(r.weightCategory); const re = getExperienceInfo(r.experienceLevel); const be = getExperienceInfo(b.experienceLevel);
  // Diferencia de peso con coma decimal (formato chileno legible por el staff).
  const wd = Math.abs(r.weightKg - b.weightKg).toFixed(1).replace(".", ",");
  // Pelea FORZADA (emparejamiento obligatorio de faltantes): sus incumplimientos
  // se recalculan EN VIVO desde los atletas actuales (no se confía en un texto
  // congelado, por si luego se corrige un peso o una edad) y se muestran como
  // una sola nota roja "para cumplir la norma faltaría: …". En ese caso se ocultan
  // los warnings genéricos para no repetir la misma información dos veces.
  const forced = !!matchup.forced;
  const forcedReasons = forced ? forcedPairingReasons(r, b) : [];
  const warnings = forced ? [] : (matchup.warnings || []);
  const hh = forced ? forcedReasons.length > 0 : warnings.some(w => w.severity === "high"); const hm = warnings.some(w => w.severity === "medium");
  return (
    <div className={"rounded-3xl overflow-hidden scale-in relative border " + (hh ? "border-red-500/50" : hm ? "border-boxing-goldDim/50" : "border-white/10")} style={{ background: "linear-gradient(180deg,#120e14,#0b090c)" }}>
      <div className="flex items-center justify-between px-4 py-2 bg-black/30 border-b border-white/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-boxing-muted flex-shrink-0" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "13px", letterSpacing: "0.2em" }}>PELEA {matchup.roundNumber}</span>
          {forced && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-900/50 border border-red-500/60 text-red-300 tracking-widest uppercase flex-shrink-0">Forzada</span>}
          <span className="text-[9px] font-bold px-2.5 py-0.5 rounded-full border border-boxing-goldDim/40 text-boxing-goldFight tracking-widest uppercase truncate" style={{ boxShadow: "inset 0 0 10px rgba(200,160,74,0.12)" }}>{rc?.label} · dif. {wd}kg</span>
        </div>
        {onRemove && <button onClick={() => onRemove(matchup.id)} className="text-boxing-muted hover:text-red-400 p-0.5 flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
      </div>
      {/* Cuerpo del cartel: los sangrados rojo/azul los ponen los pseudo-
          elementos de .vsx-body; el contenido va encima (relative + z). */}
      <div className="vsx-body grid grid-cols-[1fr_auto_1fr] items-center px-4 py-5 gap-3">
        <div className="relative z-10 flex flex-col gap-1 min-w-0 text-right">
          <span className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: "rgba(232,80,95,0.85)" }}>Esquina roja</span>
          <div className="text-boxing-cream font-bold leading-none truncate" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.03em" }}>{r.fullName}</div>
          <div className="text-[11px] text-boxing-muted truncate">{r.gym} · {r.weightKg}kg · {r.age}a</div>
          <div className="text-[10px] font-semibold tracking-widest uppercase mt-0.5" style={{ color: re?.color }}>{r.fightCount}p · {re?.label}</div>
        </div>
        <div className="relative z-10 flex flex-col items-center self-stretch px-1">
          <div className="vsx-seam flex-1" />
          <span className="vsx-vs my-1" style={{ fontSize: "24px" }}>VS</span>
          <div className="vsx-seam flex-1" />
        </div>
        <div className="relative z-10 flex flex-col gap-1 min-w-0 text-left">
          <span className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: "rgba(96,145,246,0.9)" }}>Esquina azul</span>
          <div className="text-boxing-cream font-bold leading-none truncate" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.03em" }}>{b.fullName}</div>
          <div className="text-[11px] text-boxing-muted truncate">{b.weightKg}kg · {b.age}a · {b.gym}</div>
          <div className="text-[10px] font-semibold tracking-widest uppercase mt-0.5" style={{ color: be?.color }}>{b.fightCount}p · {be?.label}</div>
        </div>
      </div>
      {/* Nota roja de la pelea FORZADA: qué condiciones faltarían para que
          cumpla la norma, cada una entre paréntesis. Si no falta ninguna (el
          cruce resultó válido) se avisa que sí cumple, para que el organizador
          no la trate como problemática. */}
      {forced && <div className="border-t border-red-500/30 px-4 py-2.5 bg-red-900/15">
        {forcedReasons.length > 0
          ? <p className="text-[11px] leading-snug"><span className="text-red-400 font-bold uppercase tracking-wide">🔴 Forzada — para cumplir la norma faltaría: </span><span className="text-red-300/90">{forcedReasons.map(r => `(${r})`).join("; ")}.</span></p>
          : <p className="text-[11px] leading-snug text-green-400">✓ Forzada, pero este cruce sí cumple la norma (no le falta ninguna condición).</p>}
      </div>}
      {warnings.length > 0 && <div className="border-t border-white/5 px-4 py-2 space-y-1 bg-black/20">{warnings.map((w, i) => <div key={i} className="flex items-center gap-1.5 text-[11px]"><span>{w.severity === "high" ? "\u{1F534}" : w.severity === "medium" ? "\u{1F7E1}" : "\u{1F7E2}"}</span><span className={w.severity === "high" ? "text-red-400" : w.severity === "medium" ? "text-boxing-goldFight" : "text-boxing-muted"}>{w.message}</span></div>)}</div>}
      {onNotaChange && <div className="border-t border-white/5 px-4 py-2">
        <input type="text" value={matchup.nota || ""} onChange={e => onNotaChange(matchup.id, e.target.value)} placeholder="Nota (ej: Super 4, 5 peleas, exhibición...)" maxLength={40} className="w-full bg-transparent text-boxing-cream placeholder-boxing-muted text-xs rounded-lg focus:outline-none focus:shadow-[0_0_0_1px_rgba(37,99,235,0.55),0_0_14px_rgba(37,99,235,0.3)] px-1 py-0.5 transition-shadow" />
      </div>}
    </div>
  );
}
