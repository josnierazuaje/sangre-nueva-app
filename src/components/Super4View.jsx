import { useMemo } from "react";
import { save, patchSuper4Bracket } from "../lib/storage.js";
import { SUPER4_CATEGORIES, buildSuper4Brackets, setSemiWinner, setFinalWinner } from "../lib/super4.js";

// ============================================
// SUPER 4 — llaves de campeonato por cinturón
// Semifinales el sábado 01, final el domingo 02.
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
  function detalle(fid) { const f = byId[fid]; return f ? `${f.gym} · ${f.weightKg}kg · ${f.age}a` : "peleador eliminado"; }

  function FilaPeleador({ fid, winner, onPick, lado }) {
    const esGanador = winner === fid;
    const perdio = winner && winner !== fid;
    const inexistente = !byId[fid]; // eliminado o aún no sincronizado
    return (
      <button type="button" disabled={inexistente} onClick={() => onPick(fid)} className={"w-full text-left px-3 py-2 border transition-colors " + (esGanador ? "border-boxing-goldFight bg-boxing-goldDim/15" : "border-boxing-line bg-black/30 hover:border-boxing-lineBright") + (inexistente ? " opacity-50 cursor-not-allowed" : "")}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className={"text-[9px] font-bold tracking-widest uppercase " + (lado === "rojo" ? "text-red-400/80" : "text-blue-400/80")}>{lado}</span>
            <p className={"font-bold leading-tight truncate " + (perdio ? "text-boxing-muted line-through" : "text-boxing-cream")} style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.03em" }}>{nombre(fid)}</p>
            <p className="text-[10px] text-boxing-muted truncate">{detalle(fid)}</p>
          </div>
          {esGanador && <span className="text-boxing-goldFight text-lg flex-shrink-0">✓</span>}
        </div>
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

      <button onClick={generar} className="w-full py-4 font-black tracking-widest bg-boxing-crimson hover:bg-boxing-crimsonLight text-boxing-cream border border-red-500/30 active:scale-95 transition-all" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "22px", letterSpacing: "4px" }}>
        GENERAR LLAVES
      </button>
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
        const finalLista = finalistas[0] && finalistas[1];
        const campeon = b.finalWinner;
        return (
          <div key={b.id} className="bg-boxing-panel border border-boxing-goldDim/40 overflow-hidden scale-in relative">
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg,transparent,#c8a04a,transparent)" }} />
            <div className="px-4 py-2.5 bg-black/40 border-b border-boxing-line flex items-center justify-between">
              <div>
                <p className="text-boxing-goldFight font-bold" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.08em" }}>{"🏆"} {b.catLabel}</p>
                <p className="text-[10px] text-boxing-muted">{b.regla}</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-bold tracking-widest uppercase text-boxing-muted">Sábado 01 · Semifinales <span className="normal-case font-normal">(toca al ganador)</span></p>
              {b.semis.map((s, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[9px] text-boxing-muted tracking-widest uppercase">Semifinal {i + 1}</p>
                  <FilaPeleador fid={s.red} winner={s.winner} lado="rojo" onPick={fid => marcarSemi(b.id, i, fid)} />
                  <FilaPeleador fid={s.blue} winner={s.winner} lado="azul" onPick={fid => marcarSemi(b.id, i, fid)} />
                </div>
              ))}
              <p className="text-[10px] font-bold tracking-widest uppercase text-boxing-goldFight pt-1">Domingo 02 · Final por el cinturón</p>
              {finalLista ? (
                <div className="space-y-1">
                  <FilaPeleador fid={finalistas[0]} winner={campeon} lado="rojo" onPick={fid => marcarFinal(b.id, fid)} />
                  <FilaPeleador fid={finalistas[1]} winner={campeon} lado="azul" onPick={fid => marcarFinal(b.id, fid)} />
                </div>
              ) : (
                <p className="text-boxing-muted text-xs border border-dashed border-boxing-lineBright px-3 py-2.5">Por definir — avanzan los ganadores de las semifinales del sábado.</p>
              )}
              {campeon && <div className="border border-boxing-goldFight/50 bg-boxing-goldDim/10 px-3 py-2.5 text-center fade-in">
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
