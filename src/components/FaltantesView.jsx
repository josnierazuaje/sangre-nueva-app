import { useState, useMemo } from "react";
import { getCategoryInfo, getExperienceInfo, getAgeCategory } from "../constants.js";
import { save } from "../lib/storage.js";
import { forcedMatchAll } from "../lib/matchmaking.js";
import { committedFighterIds } from "../lib/super4.js";
import VSCard from "./VSCard.jsx";
import PageHeader from "./PageHeader.jsx";

// ============================================
// FALTANTES — emparejamiento FORZADO
// ============================================
// Los "faltantes" son los atletas registrados que no tienen compromiso: ni un
// cruce en el VS ni un puesto en el Super 4 (misma verdad que la lista de
// Peleadores, vía committedFighterIds). Aquí el organizador puede EMPAREJARLOS
// A LA FUERZA para que nadie se quede sin subir al ring, aunque el cruce rompa
// las reglas World Boxing / FECHIBOX: cada pelea forzada queda marcada en rojo
// con exactamente lo que le falta para ser reglamentaria. Las forzadas se
// AGREGAN a la cartelera (no reemplazan lo ya armado en el VS).
export default function FaltantesView({ fighters, matchups, setMatchups, super4 = [], ready, super4Ready }) {
  const [forcing, setForcing] = useState(false);
  const committed = useMemo(() => committedFighterIds(matchups, super4), [matchups, super4]);
  const faltantes = useMemo(() => fighters.filter(f => !committed.has(f.id)), [fighters, committed]);
  // Las peleas forzadas ya creadas (se muestran aquí para gestionarlas: nota,
  // eliminar) además de en el VS y la cartelera impresa. Solo se listan las que
  // conservan a sus DOS atletas: si a una le eliminaron un peleador, VSCard no
  // la pinta, así que contarla haría que el encabezado dijera más peleas de las
  // que se ven. (Esa pelea rota sí se avisa como "imposible" en el VS.)
  const forced = useMemo(() => {
    const vivo = id => fighters.some(f => f.id === id);
    return matchups.filter(m => m.forced && vivo(m.fighterRedId) && vivo(m.fighterBlueId));
  }, [matchups, fighters]);

  function checkReady() {
    if (!ready) { alert("Sincronizando la cartelera con la nube… intenta de nuevo en unos segundos."); return false; }
    // El Super 4 debe estar hidratado, o un atleta que ya está en una llave
    // podría contarse como faltante y emparejarse por error.
    if (!super4Ready) { alert("Sincronizando el Super 4 con la nube… intenta de nuevo en unos segundos."); return false; }
    return true;
  }

  function forzar() {
    if (!checkReady()) return;
    if (faltantes.length < 2) return;
    const impar = faltantes.length % 2 === 1;
    const msg = `Se emparejará OBLIGATORIAMENTE a ${impar ? `${faltantes.length - 1} de los ${faltantes.length}` : `los ${faltantes.length}`} atletas faltantes` +
      `, aunque el cruce rompa las reglas World Boxing / FECHIBOX.\n\n` +
      `Cada pelea forzada queda marcada en rojo con lo que le faltaría para ser reglamentaria, y se AGREGA a la cartelera (no reemplaza las peleas ya armadas).` +
      (impar ? `\n\nComo el número es impar, 1 atleta quedará sin rival.` : "") +
      `\n\n¿Continuar?`;
    if (!confirm(msg)) return;
    setForcing(true);
    // Pequeña pausa para que el botón dé feedback (el cálculo es instantáneo).
    setTimeout(() => {
      const { matchups: nuevas, leftover } = forcedMatchAll(faltantes, matchups.length + 1);
      const u = [...matchups, ...nuevas];
      setMatchups(u); save("bm_matchups_v3", u);
      setForcing(false);
      if (leftover.length) alert(`Quedó 1 atleta sin rival porque el número de faltantes era impar:\n\n• ${leftover[0].fullName}\n\nRegístrale un rival, agrégalo a mano en el VS, o inclúyelo en el Super 4.`);
    }, 500);
  }

  function rmM(id) {
    if (!checkReady()) return;
    const u = matchups.filter(m => m.id !== id).map((m, i) => ({ ...m, roundNumber: i + 1 }));
    setMatchups(u); save("bm_matchups_v3", u);
  }
  function quitarForzadas() {
    if (!checkReady()) return;
    if (!confirm(`Se quitarán las ${forced.length} pelea${forced.length === 1 ? "" : "s"} forzada${forced.length === 1 ? "" : "s"} de la cartelera y se renumerará el resto.\n\nLos atletas volverán a aparecer como faltantes. ¿Continuar?`)) return;
    const u = matchups.filter(m => !m.forced).map((m, i) => ({ ...m, roundNumber: i + 1 }));
    setMatchups(u); save("bm_matchups_v3", u);
  }
  function notaChange(id, nota) {
    if (!checkReady()) return;
    const u = matchups.map(m => m.id === id ? { ...m, nota } : m);
    setMatchups(u); save("bm_matchups_v3", u);
  }

  // Mientras la cartelera o el Super 4 no lleguen de la nube, TODOS parecerían
  // faltantes (aún no se sabe quién tiene compromiso). Mostrar ahí la lista y el
  // botón rojo gigante sería alarmante y engañoso, así que se espera.
  if (!ready || !super4Ready) return (
    <div className="space-y-4">
      <PageHeader kicker="Los que quedaron sin pelea" title="Faltantes" />
      <div className="text-center py-16 border border-dashed border-boxing-lineBright rounded-3xl">
        <p className="text-boxing-muted text-sm">Sincronizando con la nube…</p>
        <p className="text-boxing-muted text-xs opacity-60 mt-1">Un momento: hay que saber quién ya tiene pelea o está en el Super 4.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader kicker="Los que quedaron sin pelea" title="Faltantes" right={<span className="text-[10px] text-boxing-muted tracking-widest uppercase">{faltantes.length} sin pelea</span>} />

      <div className="border border-orange-500/30 bg-orange-900/10 rounded-2xl px-3 py-2">
        <p className="text-orange-300 text-xs leading-snug">Atletas registrados <b>sin compromiso</b>: ni un cruce en el VS ni un puesto en el Super 4. El <b>emparejamiento forzado</b> los sube al ring aunque el cruce rompa las reglas, dejando cada incumplimiento escrito en rojo para negociarlo o corregirlo.</p>
      </div>

      {/* Botón de emparejamiento forzado (gemelo del "Emparejar" del VS, pero en
          rojo de peligro: obliga cruces que rompen reglas). */}
      {faltantes.length >= 2 && <button onClick={forzar} disabled={forcing} className={"btn-primary w-full lg:max-w-xl lg:mx-auto py-4 flex flex-col items-center justify-center gap-1" + (forcing ? " cursor-not-allowed" : "")}>
        <span className="flex items-center gap-3 font-black tracking-widest" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "22px", letterSpacing: "3px" }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          {forcing ? "EMPAREJANDO..." : "EMPAREJAMIENTO FORZADO"}
        </span>
        {!forcing && <span className="text-[10px] tracking-[0.2em] uppercase opacity-80">Obliga a todos · rompe reglas · nota en rojo</span>}
      </button>}

      {forcing && <div className="bg-black/60 border border-red-500/30 rounded-3xl p-6 text-center scale-in lg:max-w-xl lg:mx-auto">
        <div className="text-4xl mb-3" style={{ animation: "vsFlash 0.3s ease-in-out infinite" }}>🥊</div>
        <p className="text-red-400 font-bold text-lg" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", letterSpacing: "3px" }}>FORZANDO LOS EMPAREJAMIENTOS...</p>
      </div>}

      {/* Peleas forzadas ya creadas (también viven en el VS y la cartelera) */}
      {forced.length > 0 && !forcing && <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-boxing-cream font-semibold tracking-wide">{forced.length} pelea{forced.length === 1 ? "" : "s"} forzada{forced.length === 1 ? "" : "s"} en la cartelera</p>
          <button onClick={quitarForzadas} className="text-xs text-red-400 hover:text-red-300 underline">Quitar todas</button>
        </div>
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">{forced.map((m, i) => <VSCard key={m.id} matchup={m} fighters={fighters} index={i} onRemove={rmM} onNotaChange={notaChange} />)}</div>
      </div>}

      {/* Lista de faltantes actuales */}
      {faltantes.length === 0
        ? <div className="text-center py-12 border border-dashed border-boxing-lineBright rounded-3xl"><div className="text-4xl mb-3 opacity-40">{"\u{1F94A}"}</div><p className="text-boxing-muted text-sm">No hay atletas sin pelea. Todos tienen un cruce en el VS o un puesto en el Super 4.</p></div>
        : <div>
          <p className="text-[11px] text-boxing-muted mb-2 tracking-wide uppercase">Faltantes ({faltantes.length}){faltantes.length % 2 === 1 ? " · número impar: uno quedará sin rival" : ""}</p>
          <div className="space-y-1.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-1.5">
            {faltantes.map(f => { const c = getCategoryInfo(f.weightCategory); const e = getExperienceInfo(f.experienceLevel); const ac = getAgeCategory(f.age);
              return <div key={f.id} className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between fade-in border bg-boxing-panel border-boxing-line">
                <div className="min-w-0"><span className="text-boxing-cream text-sm truncate block">{f.fullName}</span><span className="text-boxing-muted text-[11px]">{c?.label} · {f.weightKg}kg · {ac.label.split(" ")[0]} · {(f.sexo || "M") === "F" ? "F" : "M"}</span></div>
                <span className="text-[10px] font-semibold tracking-widest uppercase whitespace-nowrap ml-2" style={{ color: e?.color }}>{f.fightCount || 0}p</span>
              </div>; })}
          </div>
        </div>}
    </div>
  );
}
