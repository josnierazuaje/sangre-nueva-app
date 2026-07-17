import { useState, useMemo } from "react";
import { getCategoryInfo, getExperienceInfo, getAgeCategory, genId } from "../constants.js";
import { save } from "../lib/storage.js";
import { autoMatchAll, sorteoMatch, experienceOk, analyzeMatch } from "../lib/matchmaking.js";
import { super4FighterIds } from "../lib/super4.js";
import { matchupConflicts } from "../lib/conflicts.js";
import Badge from "./Badge.jsx";
import VSCard from "./VSCard.jsx";

// ============================================
// MATCHMAKING VIEW
// ============================================
export default function MatchmakingView({ fighters, matchups, setMatchups, super4, ready, super4Ready }) {
  const [showUn, setShowUn] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [sortCount, setSortCount] = useState(0);
  const [pairPick, setPairPick] = useState(null); // 1er atleta elegido para emparejar a mano
  // Los atletas que ya están en una llave del Super 4 no pueden estar también
  // en la cartelera VS: se excluyen del universo de emparejamiento.
  const super4Ids = useMemo(() => super4FighterIds(super4), [super4]);
  const elegibles = useMemo(() => fighters.filter(f => !super4Ids.has(f.id)), [fighters, super4Ids]);
  const byId = useMemo(() => { const m = {}; fighters.forEach(f => { m[f.id] = f; }); return m; }, [fighters]);
  const matched = useMemo(() => { const s = new Set(); matchups.forEach(m => { s.add(m.fighterRedId); s.add(m.fighterBlueId); }); return s; }, [matchups]);
  const unmatched = elegibles.filter(f => !matched.has(f.id));
  // Revisión en vivo de todas las reglas duras sobre las peleas YA guardadas
  // (detecta las que quedaron inválidas después de armarse). Vive en
  // lib/conflicts.js para compartirla con la pestaña Cartelera y testearla.
  const conflicts = useMemo(() => matchupConflicts(matchups, fighters, super4Ids), [matchups, fighters, super4Ids]);
  // Igual que el Super 4: no escribir la cartelera antes de recibir su primer
  // valor de la nube, o se pisan peleas armadas en otro dispositivo.
  function checkReady() {
    if (ready) return true;
    alert("Sincronizando la cartelera con la nube… intenta de nuevo en unos segundos.");
    return false;
  }
  function autoM() { if (!checkReady()) return; const m = autoMatchAll(elegibles); setMatchups(m); save("bm_matchups_v3", m); }
  // Quita de un toque SOLO las peleas imposibles (rival eliminado o atleta ya
  // en el Super 4) y renumera; las demás alertas (escuela/experiencia/edad)
  // se resuelven a criterio del organizador pelea por pelea. Exige que el
  // Super 4 también esté hidratado desde la nube: con una copia local vieja
  // de las llaves, "imposible" podría marcar peleas que ya son válidas y el
  // borrado se propagaría a todos los dispositivos.
  function quitarImposibles() {
    if (!checkReady()) return;
    if (!super4Ready) { alert("Sincronizando el Super 4 con la nube… intenta de nuevo en unos segundos."); return; }
    const ids = new Set(conflicts.removibles);
    const nums = matchups.filter(m => ids.has(m.id)).map(m => m.roundNumber);
    if (!confirm(`Se quitará${ids.size === 1 ? "" : "n"} ${ids.size} pelea${ids.size === 1 ? "" : "s"} de la cartelera (pelea${ids.size === 1 ? "" : "s"} ${nums.join(", ")}) y se renumerará el resto.\n\n¿Continuar?`)) return;
    const u = matchups.filter(m => !ids.has(m.id)).map((m, i) => ({ ...m, roundNumber: i + 1 }));
    setMatchups(u); save("bm_matchups_v3", u);
  }
  function rmM(id) { if (!checkReady()) return; const u = matchups.filter(m => m.id !== id).map((m, i) => ({ ...m, roundNumber: i + 1 })); setMatchups(u); save("bm_matchups_v3", u); }
  function clearAll() { if (!checkReady()) return; setMatchups([]); save("bm_matchups_v3", []); }
  function notaChange(id, nota) { if (!checkReady()) return; const u = matchups.map(m => m.id === id ? { ...m, nota } : m); setMatchups(u); save("bm_matchups_v3", u); }
  // Emparejamiento MANUAL desde "Sin pelea": el operador elige dos atletas. Si
  // el cruce rompe una regla dura, se avisa exactamente cuál y se pide
  // confirmación (el criterio humano puede aceptar, p.ej., un par de kg de más).
  function hardRuleIssues(a, b) {
    const issues = [];
    if (getAgeCategory(a.age).key !== getAgeCategory(b.age).key) issues.push("categorías de edad distintas (World Boxing no lo permite)");
    if ((a.sexo || "M") !== (b.sexo || "M")) issues.push("sexos distintos");
    if ((a.gym || "").trim().toLowerCase() === (b.gym || "").trim().toLowerCase()) issues.push("misma escuela");
    if (!experienceOk(a, b)) issues.push("más de 3 peleas de diferencia (sin ser ambos 15+)");
    return issues;
  }
  function pickForPair(id) {
    if (!checkReady()) return;
    if (pairPick === id) { setPairPick(null); return; }   // tocar de nuevo = deseleccionar
    if (!pairPick) { setPairPick(id); return; }             // primer atleta elegido
    const a = byId[pairPick], b = byId[id];
    if (!a || !b) { setPairPick(null); return; }
    const issues = hardRuleIssues(a, b);
    if (issues.length && !confirm(`⚠️ Esta pelea rompe: ${issues.join("; ")}.\n\n${a.fullName} (esquina roja) vs ${b.fullName} (esquina azul)\n\n¿Crear la pelea igual?`)) return;
    const nueva = { id: genId(), fighterRedId: pairPick, fighterBlueId: id, roundNumber: matchups.length + 1, warnings: analyzeMatch(a, b), createdAt: new Date().toISOString() };
    const u = [...matchups, nueva];
    setPairPick(null);
    setMatchups(u); save("bm_matchups_v3", u);
  }
  // La planilla imprimible vive ahora en la pestaña Cartelera (FightCardView).
  function runSorteo() {
    if (!checkReady()) return;
    setSorting(true);
    setMatchups([]);
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setSortCount(count);
      if (count >= 12) {
        clearInterval(interval);
        const m = sorteoMatch(elegibles);
        setMatchups(m);
        save("bm_matchups_v3", m);
        setSorting(false);
        setSortCount(0);
      }
    }, 120);
  }
  if (elegibles.length < 2) return <div className="text-center py-16 border border-dashed border-boxing-lineBright"><div className="text-5xl mb-4 opacity-30">{"\u{1F94A}"}</div><p className="text-boxing-muted" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.08em" }}>Necesitas al menos 2 peleadores fuera del Super 4</p></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-3 text-boxing-cream" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "26px", letterSpacing: "0.05em" }}>
          <span style={{ width: "4px", height: "26px", background: "#c42438", display: "block", flexShrink: 0 }} />
          Emparejamientos
        </h2>
        <span className="text-[10px] text-boxing-muted tracking-widest uppercase">{matchups.length} peleas</span>
      </div>

      {/* Peleas IMPOSIBLES (rival eliminado / atleta en el Super 4): sin criterio humano posible, se quitan de un toque */}
      {conflicts.huerfanas.length > 0 && <div className="bg-red-900/20 border border-red-500/50 p-4 space-y-1 fade-in">
        <p className="text-red-400 font-bold text-sm">{"⚠️"} {conflicts.huerfanas.length} pelea{conflicts.huerfanas.length !== 1 ? "s" : ""} con un rival que ya no existe</p>
        <div className="space-y-0.5">{conflicts.huerfanas.map(v => <p key={v.id} className="text-red-300/90 text-xs">{v.texto}</p>)}</div>
        <p className="text-boxing-muted text-xs">Su rival fue eliminado de la lista de peleadores; estas peleas no salen en la planilla impresa.</p>
      </div>}

      {/* Peleas con atletas que ya están en el Super 4 (no pueden estar en ambas planillas) */}
      {conflicts.super4.length > 0 && <div className="bg-red-900/20 border border-red-500/50 p-4 space-y-1 fade-in">
        <p className="text-red-400 font-bold text-sm">{"⚠️"} {conflicts.super4.length} pelea{conflicts.super4.length !== 1 ? "s" : ""} incluye{conflicts.super4.length !== 1 ? "n" : ""} atletas que ya están en el Super 4</p>
        <div className="space-y-0.5">{conflicts.super4.map(v => <p key={v.id} className="text-red-300/90 text-xs">{v.texto}</p>)}</div>
        <p className="text-boxing-muted text-xs">Un atleta no puede estar en la cartelera y en el Super 4 a la vez.</p>
      </div>}

      {/* Botón de limpieza de las peleas imposibles (huérfanas + Super 4). Solo
          aparece con el Super 4 ya hidratado desde la nube (ver quitarImposibles). */}
      {conflicts.removibles.length > 0 && super4Ready && <button onClick={quitarImposibles} disabled={sorting} className="w-full py-3 bg-red-900/40 hover:bg-red-900/60 border border-red-500/60 text-red-200 font-bold text-sm tracking-widest uppercase transition-colors">
        {"🧹"} Quitar {conflicts.removibles.length === 1 ? "la pelea imposible" : `las ${conflicts.removibles.length} peleas imposibles`} (Super 4 / rival eliminado)
      </button>}

      {/* Aviso de cruces de categoría de edad World Boxing en VS ya guardados */}
      {conflicts.edadMixta.length > 0 && <div className="bg-red-900/20 border border-red-500/50 p-4 space-y-2 fade-in">
        <p className="text-red-400 font-bold text-sm flex items-center gap-2">{"⚠️"} {conflicts.edadMixta.length} pelea{conflicts.edadMixta.length !== 1 ? "s" : ""} mezcla{conflicts.edadMixta.length !== 1 ? "n" : ""} categorías de edad — World Boxing no lo permite</p>
        <div className="space-y-1">{conflicts.edadMixta.map(v => <p key={v.id} className="text-red-300/90 text-xs">{v.texto}</p>)}</div>
        <p className="text-boxing-muted text-xs">Elimina esas peleas (✕) y empareja de nuevo, o vuelve a generar todo con Sorteo / Auto VS.</p>
      </div>}

      {/* Peleas entre atletas de la misma escuela (entrenan juntos) */}
      {conflicts.mismaEscuela.length > 0 && <div className="bg-yellow-900/20 border border-yellow-600/50 p-4 space-y-1 fade-in">
        <p className="text-yellow-400 font-bold text-sm">{"⚠️"} {conflicts.mismaEscuela.length} pelea{conflicts.mismaEscuela.length !== 1 ? "s" : ""} entre atletas de la misma escuela</p>
        <div className="space-y-0.5">{conflicts.mismaEscuela.map(v => <p key={v.id} className="text-yellow-300/90 text-xs">{v.texto}</p>)}</div>
        <p className="text-boxing-muted text-xs">Dos que entrenan juntos no deberían pelear — vuelve a generar (Sorteo / Auto VS) o elimina esas peleas.</p>
      </div>}

      {/* Peleas con demasiada diferencia de experiencia (regla dura: máx 3 peleas, salvo ambos pro 15+) */}
      {conflicts.experiencia.length > 0 && <div className="bg-red-900/20 border border-red-500/50 p-4 space-y-1 fade-in">
        <p className="text-red-400 font-bold text-sm">{"⚠️"} {conflicts.experiencia.length} pelea{conflicts.experiencia.length !== 1 ? "s" : ""} con demasiada diferencia de experiencia</p>
        <div className="space-y-0.5">{conflicts.experiencia.map(v => <p key={v.id} className="text-red-300/90 text-xs">{v.texto}</p>)}</div>
        <p className="text-boxing-muted text-xs">Máximo 3 peleas de diferencia (salvo que ambos tengan 15+). Vuelve a generar (Sorteo / Auto VS) o elimina esas peleas.</p>
      </div>}

      {/* Botón Sorteo destacado */}
      <button onClick={runSorteo} disabled={sorting} className={"w-full lg:max-w-xl lg:mx-auto py-4 font-black text-lg tracking-widest flex items-center justify-center gap-3 transition-all " + (sorting ? "bg-boxing-crimson/60 border border-red-500/50 text-red-300 cursor-not-allowed" : "bg-boxing-crimson hover:bg-boxing-crimsonLight text-boxing-cream border border-red-500/30 active:scale-95")} style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "22px", letterSpacing: "4px" }}>
        {sorting
          ? <>EMPAREJANDO...</>
          : <>EMPAREJAMIENTO</>
        }
      </button>

      {/* Overlay animado durante sorteo */}
      {sorting && <div className="bg-black/60 border border-red-500/30 p-6 text-center scale-in lg:max-w-xl lg:mx-auto">
        <div className="text-4xl mb-3" style={{ animation: "vsFlash 0.3s ease-in-out infinite" }}>🥊</div>
        <p className="text-red-400 font-bold text-lg" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", letterSpacing: "3px" }}>MEZCLANDO PELEADORES...</p>
        <div className="flex justify-center gap-1 mt-3">{[...Array(5)].map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-red-500" style={{ animation: `vsFlash 0.6s ease-in-out ${i * 0.1}s infinite` }}></div>)}</div>
      </div>}

      {/* Botón Auto VS (secundario) */}
      <div className="flex gap-2 lg:max-w-xl lg:mx-auto">
        <button onClick={autoM} disabled={sorting} className="flex-1 bg-transparent hover:bg-boxing-goldDim/10 border border-boxing-goldDim text-boxing-goldFight text-sm font-semibold py-2.5 flex items-center justify-center gap-2 tracking-widest uppercase transition-colors" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "16px" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          Auto VS
        </button>
        {matchups.length > 0 && <button onClick={clearAll} disabled={sorting} className="px-4 py-2.5 bg-black border border-boxing-lineBright text-boxing-muted text-sm tracking-widest uppercase">Limpiar</button>}
      </div>

      {!matchups.length && !sorting && <div className="border border-dashed border-boxing-lineBright p-4 text-center lg:max-w-xl lg:mx-auto"><p className="text-boxing-muted text-sm">Usa <span className="text-red-400 font-bold">EMPAREJAMIENTO</span> para emparejamientos aleatorios<br />o <span className="text-boxing-cream font-semibold">Auto VS</span> para emparejamiento inteligente</p><p className="text-boxing-muted text-xs mt-1 opacity-60">Respeta categoría · nivel · escuela</p></div>}
      {/* Móvil: lista vertical. Escritorio: cuadrícula de 2 columnas. */}
      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">{matchups.map((m, i) => <VSCard key={m.id} matchup={m} fighters={fighters} index={i} onRemove={rmM} onNotaChange={notaChange} />)}</div>
      {unmatched.length > 0 && <div><button onClick={() => setShowUn(!showUn)} className="text-sm text-boxing-muted hover:text-boxing-goldFight flex items-center gap-1 tracking-wide"><svg className={"w-4 h-4 transition-transform " + (showUn ? "rotate-90" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>Sin pelea ({unmatched.length})</button>
        {showUn && <div className="mt-2 space-y-1.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-1.5">
          <p className="text-[11px] text-boxing-muted leading-snug lg:col-span-full">Toca dos atletas para emparejarlos a mano.{pairPick && byId[pairPick] ? <> Elegido: <b className="text-boxing-cream">{byId[pairPick].fullName}</b> — toca su rival o <button type="button" onClick={() => setPairPick(null)} className="text-red-400 underline">cancela</button>.</> : ""}</p>
          {unmatched.map(f => { const c = getCategoryInfo(f.weightCategory); const e = getExperienceInfo(f.experienceLevel); const sel = pairPick === f.id;
            return <button key={f.id} type="button" onClick={() => pickForPair(f.id)} className={"w-full text-left px-3 py-2 flex items-center justify-between fade-in border transition-colors " + (sel ? "bg-boxing-crimson/25 border-red-500/60" : "bg-boxing-panel border-boxing-line hover:border-boxing-goldDim")}>
              <div className="flex items-center gap-2 min-w-0"><span className={"text-[9px] w-4 h-4 flex items-center justify-center rounded-sm flex-shrink-0 " + (sel ? "bg-boxing-crimson text-white" : "border border-boxing-lineBright text-boxing-muted")}>{sel ? "1" : "+"}</span><span className="text-boxing-cream text-sm truncate">{f.fullName}</span><span className="text-boxing-muted text-xs whitespace-nowrap">{c?.label} · {f.weightKg}kg · {f.fightCount || 0}p</span></div>
              <Badge color={e?.color}>{e?.label}</Badge>
            </button>; })}
        </div>}</div>}
    </div>
  );
}
