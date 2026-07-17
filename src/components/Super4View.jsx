import { useMemo, useState } from "react";
import { save, load, patchSuper4Bracket, mergeSuper4Tx } from "../lib/storage.js";
import { AGE_CATEGORIES, WEIGHT_CATEGORIES, FECHIBOX_LABEL, EVENT_LABELS, weightRangeLabel } from "../constants.js";
import { dupKey, normName } from "../lib/dedup.js";
import { SUPER4_AGE_KEYS, ALL_DIVISION_KEYS, buildSuper4Brackets, setSemiWinner, setFinalWinner, replaceFighter, availableReplacements, bracketMaxFights } from "../lib/super4.js";
import { buildSuper4Html } from "../lib/printSuper4.js";

// Categorías de edad (World Boxing) que el Super 4 puede armar, con su etiqueta.
const AGE_OPTIONS = SUPER4_AGE_KEYS.map(k => AGE_CATEGORIES.find(a => a.key === k)).filter(Boolean);
// Divisiones de peso oficiales (World Boxing), masculinas y femeninas.
const DIVISION_OPTIONS = WEIGHT_CATEGORIES;

// Opciones del selector "peleadores hasta con:" — tope por número de peleas.
// "all" = sin tope (todas las experiencias); 0 a 20 = máximo de peleas.
const MAX_FIGHTS_OPTIONS = ["all", ...Array.from({ length: 21 }, (_, i) => String(i))];
function fightsOptionLabel(v) {
  if (v === "all") return "Todas las experiencias";
  return `${v} pelea${v === "1" ? "" : "s"}`;
}
// Migración del selector anterior (por nivel) al nuevo (por número de peleas).
const LEGACY_TIER_TO_FIGHTS = { debutante: "0", principiante: "3", amateur: "10" };

// Opciones del selector "cantidad de llaves": cuántas llaves arma como máximo
// GENERAR LLAVES. "all" = todas las combinaciones listas (comportamiento
// anterior); 1 a 5 = tope de llaves a generar.
const CANTIDAD_OPTIONS = ["all", "1", "2", "3", "4", "5"];
function cantidadLabel(v) { return v === "all" ? "Todas las posibles" : `${v} llave${v === "1" ? "" : "s"}`; }

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
  // Tope de peleas elegido en el selector (se recuerda localmente). Si no hay
  // preferencia guardada pero existe la del selector anterior (por nivel), se
  // migra a su número de peleas equivalente.
  const [maxFightsSel, setMaxFightsSel] = useState(() => {
    const saved = load("bm_super4_maxfights", null);
    if (saved != null) return String(saved);
    const oldTier = load("bm_super4_maxexp", null);
    return (oldTier && LEGACY_TIER_TO_FIGHTS[oldTier]) || "all";
  });
  const fightsCeil = maxFightsSel === "all" ? null : Number(maxFightsSel);
  // Cantidad máxima de llaves a generar (se recuerda localmente). "all" = sin
  // tope (todas las combinaciones listas); 1 a 5 = se arman como mucho esas.
  const [cantidadLlaves, setCantidadLlaves] = useState(() => load("bm_super4_cantidad", "all"));
  const llavesCap = cantidadLlaves === "all" ? null : Number(cantidadLlaves);
  // Armar llaves aunque falten peleadores (llaves incompletas con cupos vacíos
  // que se rellenan con "＋ Elegir"). Sirve para dejar visibles todas las
  // categorías del evento (p.ej. los 5 cinturones) e irlas completando.
  const [incompletas, setIncompletas] = useState(() => load("bm_super4_incompletas", false));
  // Categorías de edad que participan (se recuerdan localmente). Por defecto,
  // todas las que el Super 4 cubre — así el comportamiento no cambia.
  const [selectedAges, setSelectedAges] = useState(() => {
    const saved = load("bm_super4_ages", null);
    return Array.isArray(saved) && saved.length ? saved : SUPER4_AGE_KEYS.slice();
  });
  // Divisiones de peso que participan (se recuerdan localmente). Por defecto,
  // todas las oficiales (masculinas y femeninas).
  const [selectedDivs, setSelectedDivs] = useState(() => {
    const saved = load("bm_super4_divisions", null);
    return Array.isArray(saved) && saved.length ? saved : ALL_DIVISION_KEYS.slice();
  });
  // El preview usa la selección REAL (si el usuario dejó algo vacío, se ve
  // vacío — no cae a "todas" por error).
  const resultado = useMemo(() => buildSuper4Brackets(fighters, fightsCeil, selectedAges, selectedDivs), [fighters, fightsCeil, selectedAges.join(","), selectedDivs.join(",")]);
  // "Posibles llaves": TODAS las combinaciones (edad × división) que se pueden
  // armar con los peleadores que aún NO están en ninguna llave (respeta el
  // tope de peleas, pero ignora los filtros de edad/peso para revelar todo lo
  // que falta). El usuario agrega la que le sirva, una por una.
  const [showPosibles, setShowPosibles] = useState(false);
  const posibles = useMemo(() => {
    const reserved = new Set();
    super4.forEach(b => (b.semis || []).forEach(s => ["red", "blue"].forEach(l => { const f = byId[s[l]]; if (f) reserved.add(dupKey(f)); })));
    const yaHay = new Set(super4.map(b => b.catKey));
    return buildSuper4Brackets(fighters, fightsCeil, null, null, reserved).brackets.filter(b => !yaHay.has(b.catKey));
  }, [fighters, super4, fightsCeil, byId]);
  // Cupo que se está reemplazando vía el botón ✕ (null = ningún modal abierto).
  const [reemplazo, setReemplazo] = useState(null);
  // Colapso de los bloques de filtros (para llegar antes al fondo sin scroll).
  const [agesOpen, setAgesOpen] = useState(true);
  const [divsOpen, setDivsOpen] = useState(true);
  function cambiarMaxFights(v) { setMaxFightsSel(v); save("bm_super4_maxfights", v); }
  function cambiarCantidad(v) { setCantidadLlaves(v); save("bm_super4_cantidad", v); }
  function cambiarIncompletas(v) { setIncompletas(v); save("bm_super4_incompletas", v); }
  function toggleAge(k) {
    setSelectedAges(prev => {
      const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k];
      save("bm_super4_ages", next);
      return next;
    });
  }
  function toggleDiv(k) {
    setSelectedDivs(prev => {
      const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k];
      save("bm_super4_divisions", next);
      return next;
    });
  }
  function setDivsAll(all) {
    const next = all ? ALL_DIVISION_KEYS.slice() : [];
    setSelectedDivs(next); save("bm_super4_divisions", next);
  }

  function checkReady() {
    if (ready) return true;
    alert("Sincronizando las llaves con la nube… intenta de nuevo en unos segundos.");
    return false;
  }
  function persist(brackets) { setSuper4(brackets); save("bm_super4_v1", brackets); }
  // Agrega una sola llave sugerida (de "Posibles llaves"). Sus 4 atletas ya
  // fueron elegidos entre los libres, así que no pisa ninguna llave existente.
  // Fusiona contra el estado real del servidor (transacción) para no borrar
  // llaves/resultados de otro dispositivo.
  function agregarPosible(b) {
    if (!checkReady()) return;
    mergeSuper4Tx(super4, [b], setSuper4);
  }
  function generar() {
    if (!checkReady()) return;
    if (!selectedAges.length) { alert("Elige al menos una categoría de edad para el Super 4."); return; }
    if (!selectedDivs.length) { alert("Elige al menos un peso (división) para el Super 4."); return; }
    if (super4.length && !confirm("¿Generar de nuevo las categorías elegidas?\n\nSe rearman solo esas (se pierden sus ganadores marcados); las demás categorías se conservan tal cual. Para quitar categorías usa \"Limpiar llaves\".")) return;
    // Reserva a quienes ya están en llaves que se CONSERVARÁN (cinturones
    // viejos u otras combinaciones no seleccionadas), para que las llaves
    // nuevas no los re-elijan y quede el mismo peleador en dos llaves a la vez.
    const regenKeys = new Set(selectedAges.flatMap(a => selectedDivs.map(d => a + "__" + d)));
    const reserved = new Set();
    super4.forEach(b => {
      if (regenKeys.has(b.catKey)) return; // esta combinación se va a rearmar
      (b.semis || []).forEach(s => ["red", "blue"].forEach(l => {
        const fr = byId[s[l]];
        if (fr) reserved.add(dupKey(fr));
      }));
    });
    const { brackets: listas, faltantes } = buildSuper4Brackets(fighters, fightsCeil, selectedAges, selectedDivs, reserved, incompletas);
    const tope = fightsCeil != null ? ` con el tope de ${fightsCeil} pelea${fightsCeil === 1 ? "" : "s"}` : "";
    if (!listas.length) { alert(incompletas
      ? "Ninguna categoría elegida tiene atletas" + tope + " para armar una llave (ni siquiera incompleta). Registra al menos uno en la pestaña Agregar."
      : "No hay 4 peleadores libres en ninguna combinación de edad y peso elegida" + tope + " para armar una llave. Activa \"Armar aunque falten peleadores\" para armarlas incompletas."); return; }
    // Tope de cantidad de llaves: se arman las primeras N en orden (menor edad
    // y peso primero). Cada peleador es elegible para una sola combinación
    // edad×división, así que recortar no deja a nadie en dos llaves.
    const brackets = llavesCap != null ? listas.slice(0, llavesCap) : listas;
    // Las categorías ELEGIDAS (regenKeys) se reemplazan por su resultado: las
    // que quedan fuera del tope se limpian (no se conservan llaves viejas), así
    // el tope realmente topa y no queda un peleador que cambió de división en
    // dos llaves. Las categorías NO elegidas y los cinturones legacy (catKey sin
    // "__") se conservan intactos. Transacción para no pisar otro dispositivo.
    mergeSuper4Tx(super4, brackets, setSuper4, regenKeys);
    const incompletasArmadas = brackets.filter(b => [b.semis[0].red, b.semis[0].blue, b.semis[1].red, b.semis[1].blue].some(id => id == null)).length;
    const notas = [];
    if (llavesCap != null && listas.length > llavesCap) notas.push(`Se armaron ${brackets.length} de ${listas.length} llaves posibles con las categorías elegidas (tope: ${llavesCap}). Sube "Cantidad de llaves" para armar más.`);
    if (incompletasArmadas > 0) notas.push(`${incompletasArmadas} llave(s) quedaron INCOMPLETAS: usa el botón "＋ Elegir" en los cupos libres para completarlas.`);
    if (faltantes.length) notas.push("Con atletas pero sin completar 4" + tope + ":\n" + faltantes.slice(0, 12).map(f => `• ${f.catLabel}: hay ${f.elegibles}, faltan ${f.faltan}`).join("\n") + (faltantes.length > 12 ? `\n…y ${faltantes.length - 12} más.` : ""));
    if (notas.length) alert("Se armaron " + brackets.length + " llave(s).\n\n" + notas.join("\n\n"));
  }
  function limpiar() {
    if (!checkReady()) return;
    if (!confirm("¿Eliminar todas las llaves del Super 4?\n\nLos peleadores no se tocan; solo se borran las llaves y sus resultados.")) return;
    persist([]);
  }
  // Los resultados se escriben con un update dirigido: solo la semifinal
  // tocada (semis/0 o semis/1) y el campeón. Así, dos personas editando
  // semifinales DISTINTAS de la misma llave a la vez no se pisan entre sí
  // (antes se reescribía todo el arreglo `semis` y la última escritura
  // borraba el resultado de la otra semifinal). semiIndex null = solo la
  // final cambió (no se toca ninguna semifinal).
  function marcarResultado(updated, bId, semiIndex) {
    const idx = updated.findIndex(b => b.id === bId);
    if (idx === -1) return;
    setSuper4(updated);
    const b = updated[idx];
    const fields = { finalWinner: b.finalWinner ?? null };
    if (semiIndex != null) fields["semis/" + semiIndex] = b.semis[semiIndex];
    // Se ubica la llave por su ID (estable) dentro de la transacción, no por
    // índice: al agregar/generar llaves el arreglo se reordena.
    patchSuper4Bracket(updated, bId, fields);
  }
  function marcarSemi(bId, i, fid) { if (checkReady()) marcarResultado(setSemiWinner(super4, bId, i, fid), bId, i); }
  function marcarFinal(bId, fid) { if (checkReady()) marcarResultado(setFinalWinner(super4, bId, fid), bId, null); }

  // Botón ✕: abre el selector de reemplazo para ese cupo de semifinal.
  function pedirReemplazo(bId, semiIndex, lado, saliente) {
    if (!checkReady()) return;
    setReemplazo({ bId, semiIndex, lado, saliente });
  }
  function hacerReemplazo(newFid) {
    if (!reemplazo) return;
    const { bId, semiIndex, lado } = reemplazo;
    marcarResultado(replaceFighter(super4, bId, semiIndex, lado, newFid), bId, semiIndex);
    setReemplazo(null);
  }

  function nombre(fid) { return byId[fid]?.fullName || "—"; }

  // ---------- Impresión de las llaves ----------
  function printSuper4() {
    if (!super4.length) { alert("No hay llaves para imprimir. Toca GENERAR LLAVES primero."); return; }
    const html = buildSuper4Html(super4, byId, new Date().toLocaleDateString("es-CL"));
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

  // Una fila = un peleador del cupo, con dos acciones:
  //   ✓ marca (o desmarca) que ganó y avanza a la siguiente ronda.
  //   ✕ lo elimina de la llave y abre el selector para poner a otro.
  // La final no lleva ✕ (sus atletas salen de las semifinales, no se
  // reemplazan a mano), así que onRemove llega sólo en las semifinales.
  function Fila({ fid, winner, onWin, onRemove, lado, placeholder, bloqueada }) {
    const cuadro = <span className="rounded-sm flex-shrink-0" style={{ width: 11, height: 11, background: lado === "rojo" ? "#c0392b" : "#2980b9" }} />;
    const f = fid ? byId[fid] : null;
    const inexistente = !!fid && !f; // el id apunta a un peleador borrado / no sincronizado
    // Cupo LIBRE (vacío o con peleador eliminado) de una SEMIFINAL: se puede
    // rellenar sin regenerar toda la llave. Se ofrece un botón claro "Elegir"
    // que abre el selector de peleadores elegibles para la categoría. onRemove
    // solo llega en las semifinales; la final toma a sus atletas de las semis,
    // así que ahí este botón no aparece (se conserva el placeholder).
    if ((!fid || inexistente) && onRemove) return (
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {cuadro}
        <span className="flex flex-col min-w-0 flex-1">
          <span className="text-[11.5px] text-boxing-muted italic truncate">Cupo libre</span>
          {inexistente && <span className="text-[8.5px] text-boxing-muted/70 truncate">peleador eliminado</span>}
        </span>
        <button type="button" onClick={onRemove} title="Elegir un peleador para este cupo" className="px-2.5 h-7 flex items-center justify-center gap-1 rounded border border-green-500/60 text-green-300 hover:bg-green-600/25 text-[11px] font-bold tracking-wide flex-shrink-0 transition-colors">{"＋"} Elegir</button>
      </div>
    );
    // Cupo vacío que NO se rellena aquí (placeholder de la final): solo texto.
    if (!fid) return (
      <div className="flex items-center gap-2 px-2.5 py-2 opacity-50">
        {cuadro}
        <span className="text-[11px] text-boxing-muted italic truncate">{placeholder}</span>
      </div>
    );
    const esGanador = winner === fid;
    const perdio = winner && winner !== fid;
    // El ✓ se bloquea si el atleta ya no existe o si la final aún no tiene a
    // sus dos finalistas (no se puede coronar con una sola semi decidida).
    const winBloqueado = inexistente || bloqueada;
    return (
      <div className={"flex items-center gap-2 px-2.5 py-1.5 " + (esGanador ? "bg-boxing-goldDim/15" : "")}>
        {cuadro}
        <span className="flex flex-col min-w-0 flex-1">
          <span className={"text-[12.5px] leading-tight truncate " + (perdio ? "text-boxing-muted line-through" : "text-boxing-cream font-bold")}>{f ? f.fullName : "—"}</span>
          <span className="text-[8.5px] text-boxing-muted truncate">{f ? `${f.gym} · ${f.weightKg}kg · ${f.age}a` : "peleador eliminado"}</span>
        </span>
        {onWin && <button type="button" disabled={winBloqueado} onClick={onWin} title={esGanador ? "Quitar como ganador" : "Marcó ganador — avanza"} className={"w-7 h-7 flex items-center justify-center rounded border text-sm flex-shrink-0 transition-colors " + (esGanador ? "bg-green-600 border-green-500 text-white" : "border-boxing-lineBright text-green-400 hover:bg-green-600/20") + (winBloqueado ? " opacity-30 cursor-not-allowed" : "")}>✓</button>}
        {onRemove && <button type="button" onClick={onRemove} title="Eliminar y elegir otro" className="w-7 h-7 flex items-center justify-center rounded border border-boxing-lineBright text-red-400 hover:bg-red-600/20 text-sm flex-shrink-0 transition-colors">✕</button>}
      </div>
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

      <button onClick={() => setShowPosibles(o => !o)} className="w-full py-2.5 bg-blue-600/10 border border-blue-500/50 text-blue-300 text-sm font-bold tracking-widest uppercase transition-colors hover:bg-blue-600/20 flex items-center justify-center gap-2">
        Posibles llaves{posibles.length ? ` (${posibles.length})` : ""} <span className="text-xs">{showPosibles ? "▾" : "▸"}</span>
      </button>
      {showPosibles && <div className="border border-blue-500/30 bg-blue-950/10 p-3 space-y-2 fade-in">
        <p className="text-[10px] text-boxing-muted">Combinaciones que se pueden armar con los peleadores que aún NO están en una llave{fightsCeil != null ? ` (hasta ${fightsCeil} pelea${fightsCeil === 1 ? "" : "s"})` : ""}. Toca "Agregar" en la que quieras.</p>
        {posibles.length === 0
          ? <p className="text-boxing-muted text-sm text-center py-2">No hay más llaves posibles con los peleadores libres.</p>
          : posibles.map(b => (
            <div key={b.catKey} className="border border-boxing-line bg-black/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-boxing-goldFight font-bold text-sm min-w-0 truncate" style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.05em" }}>{"🏆"} {b.catLabel}</p>
                <button onClick={() => agregarPosible(b)} className="flex-shrink-0 px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold tracking-widest uppercase transition-colors">Agregar</button>
              </div>
              <p className="text-[9px] text-boxing-muted mb-1">{b.regla}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {[b.semis[0].red, b.semis[0].blue, b.semis[1].red, b.semis[1].blue].map(id => {
                  const f = byId[id];
                  return <p key={id} className="text-[11px] text-boxing-cream truncate">• {f ? f.fullName : "—"} <span className="text-boxing-muted">{f ? `${f.weightKg}kg` : ""}</span></p>;
                })}
              </div>
            </div>
          ))}
      </div>}

      <div className="bg-black/40 border border-boxing-lineBright px-3 py-2 space-y-1.5">
        <p className="text-[11px] text-boxing-muted tracking-wide uppercase">Experiencia de peleadores en el Super 4</p>
        <label className="flex items-center gap-2">
          <span className="text-[12px] text-boxing-cream whitespace-nowrap">Peleadores hasta con:</span>
          <select value={maxFightsSel} onChange={e => cambiarMaxFights(e.target.value)} className="flex-1 bg-black border border-boxing-lineBright text-boxing-cream text-sm px-2 py-1.5 focus:border-boxing-goldDim outline-none">
            {MAX_FIGHTS_OPTIONS.map(v => <option key={v} value={v}>{fightsOptionLabel(v)}</option>)}
          </select>
        </label>
      </div>
      {fightsCeil != null && <p className="text-[10px] text-boxing-goldFight -mt-2">Solo entran a la llave los peleadores con {fightsCeil} pelea{fightsCeil === 1 ? "" : "s"} como máximo. Toca GENERAR LLAVES para aplicarlo.</p>}

      <div className="bg-black/40 border border-boxing-lineBright px-3 py-2 space-y-1.5">
        <p className="text-[11px] text-boxing-muted tracking-wide uppercase">Cantidad de llaves del Super 4</p>
        <label className="flex items-center gap-2">
          <span className="text-[12px] text-boxing-cream whitespace-nowrap">Cantidad de llaves:</span>
          <select value={cantidadLlaves} onChange={e => cambiarCantidad(e.target.value)} className="flex-1 bg-black border border-boxing-lineBright text-boxing-cream text-sm px-2 py-1.5 focus:border-boxing-goldDim outline-none">
            {CANTIDAD_OPTIONS.map(v => <option key={v} value={v}>{cantidadLabel(v)}</option>)}
          </select>
        </label>
      </div>
      {llavesCap != null && <p className="text-[10px] text-boxing-goldFight -mt-2">Se arman como máximo {llavesCap} llave{llavesCap === 1 ? "" : "s"} de las categorías elegidas (menor edad y peso primero). Toca GENERAR LLAVES para aplicarlo.</p>}

      <button type="button" onClick={() => cambiarIncompletas(!incompletas)} className="w-full bg-black/40 border border-boxing-lineBright px-3 py-2.5 flex items-center justify-between gap-3 transition-colors hover:bg-white/5">
        <span className="text-left min-w-0">
          <span className="text-[12px] text-boxing-cream block">Armar aunque falten peleadores</span>
          <span className="text-[10px] text-boxing-muted block">Crea llaves incompletas (cupos "＋ Elegir") para ver todas las categorías e irlas completando.</span>
        </span>
        <span className={"flex-shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors " + (incompletas ? "bg-green-600" : "bg-boxing-lineBright")}>
          <span className={"block w-5 h-5 rounded-full bg-white transition-transform " + (incompletas ? "translate-x-5" : "")} />
        </span>
      </button>
      {incompletas && <p className="text-[10px] text-boxing-goldFight -mt-2">Se armarán las categorías elegidas con al menos 1 atleta, aunque no lleguen a 4. Los cupos vacíos se llenan con "＋ Elegir".</p>}

      <div className="bg-black/40 border border-boxing-lineBright px-3 py-2 space-y-1.5">
        <button type="button" onClick={() => setAgesOpen(o => !o)} className="w-full flex items-center justify-between gap-2">
          <span className="text-[11px] text-boxing-muted tracking-wide uppercase">Categoría de peleadores en el Super 4</span>
          <span className="flex items-center gap-2">
            {!agesOpen && <span className="text-[9px] text-boxing-goldFight">{selectedAges.length} elegida{selectedAges.length !== 1 ? "s" : ""}</span>}
            <span className="text-boxing-muted text-sm leading-none">{agesOpen ? "▾" : "▸"}</span>
          </span>
        </button>
        {agesOpen && <div className="flex flex-wrap gap-1.5">
          {AGE_OPTIONS.map(a => {
            const on = selectedAges.includes(a.key);
            return (
              <button key={a.key} type="button" onClick={() => toggleAge(a.key)} className={"flex items-center gap-1.5 px-2.5 py-1.5 border text-sm transition-colors " + (on ? "border-boxing-goldDim bg-boxing-goldDim/15 text-boxing-cream" : "border-boxing-lineBright text-boxing-muted hover:border-boxing-lineBright/80")}>
                <span className={"w-3.5 h-3.5 flex items-center justify-center text-[10px] border rounded-sm flex-shrink-0 " + (on ? "bg-boxing-goldFight border-boxing-goldFight text-black" : "border-boxing-lineBright")}>{on ? "✓" : ""}</span>
                <span className="flex flex-col leading-tight text-left">
                  <span>{a.label} <span className="text-[9px] text-boxing-muted">({a.minAge}-{a.maxAge})</span></span>
                  <span className="text-[9px] text-boxing-muted">FECHIBOX: {FECHIBOX_LABEL[a.key] || a.label}</span>
                </span>
              </button>
            );
          })}
        </div>}
      </div>
      {!selectedAges.length && <p className="text-[10px] text-boxing-crimsonLight -mt-2">Elige al menos una categoría de edad.</p>}

      <div className="bg-black/40 border border-boxing-lineBright px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setDivsOpen(o => !o)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            <span className="text-[11px] text-boxing-muted tracking-wide uppercase truncate">Peso oficial de peleadores en el Super 4</span>
            <span className="text-boxing-muted text-sm leading-none flex-shrink-0">{divsOpen ? "▾" : "▸"}</span>
          </button>
          {divsOpen
            ? <span className="text-[9px] flex-shrink-0">
                <button type="button" onClick={() => setDivsAll(true)} className="text-boxing-goldFight hover:underline">Todos</button>
                <span className="text-boxing-muted"> · </span>
                <button type="button" onClick={() => setDivsAll(false)} className="text-boxing-muted hover:underline">Ninguno</button>
              </span>
            : <span className="text-[9px] text-boxing-goldFight flex-shrink-0">{selectedDivs.length} elegido{selectedDivs.length !== 1 ? "s" : ""}</span>}
        </div>
        {divsOpen && <div className="grid grid-cols-3 gap-1.5">
          {DIVISION_OPTIONS.map(d => {
            const on = selectedDivs.includes(d.key);
            return (
              <button key={d.key} type="button" onClick={() => toggleDiv(d.key)} className={"flex items-center gap-1.5 px-2 py-1.5 border text-left transition-colors " + (on ? "border-boxing-goldDim bg-boxing-goldDim/15" : "border-boxing-lineBright hover:border-boxing-lineBright/80")}>
                <span className={"w-3.5 h-3.5 flex items-center justify-center text-[9px] border rounded-sm flex-shrink-0 " + (on ? "bg-boxing-goldFight border-boxing-goldFight text-black" : "border-boxing-lineBright")}>{on ? "✓" : ""}</span>
                <span className="flex flex-col min-w-0 leading-tight">
                  <span className={"font-bold text-[13px] whitespace-nowrap " + (on ? "text-boxing-cream" : "text-boxing-muted")}>{weightRangeLabel(d)}</span>
                  <span className="text-[9px] text-boxing-muted truncate">{d.genero === "F" ? "F" : "M"} · {d.label}</span>
                </span>
              </button>
            );
          })}
        </div>}
      </div>
      {!selectedDivs.length && <p className="text-[10px] text-boxing-crimsonLight -mt-2">Elige al menos un peso.</p>}

      {super4.length > 0 && <button onClick={limpiar} className="w-full py-2.5 bg-black border border-boxing-lineBright text-boxing-muted text-sm tracking-widest uppercase">Limpiar llaves</button>}

      {!super4.length && <div className="border border-dashed border-boxing-lineBright p-4 text-center space-y-2">
        <p className="text-boxing-muted text-sm">Arma automáticamente las llaves de 4 atletas por edad y peso:<br />semifinales el <span className="text-boxing-cream font-semibold">{EVENT_LABELS.semiWd}</span> y la final el <span className="text-boxing-goldFight font-semibold">{EVENT_LABELS.finalWd}</span>.</p>
        <div className="text-left text-xs text-boxing-muted space-y-1 pt-2">
          {resultado.brackets.length === 0 && resultado.faltantes.length === 0 && <p>Con los filtros actuales no hay atletas para armar llaves. Ajusta la experiencia, la edad o los pesos.</p>}
          {(llavesCap != null ? resultado.brackets.slice(0, llavesCap) : resultado.brackets).map(b => <p key={b.catKey}>✅ <span className="text-boxing-cream">{b.catLabel}</span> — listo (4+)</p>)}
          {llavesCap != null && resultado.brackets.length > llavesCap && <p>…y {resultado.brackets.length - llavesCap} llave(s) lista(s) que el tope de cantidad deja fuera.</p>}
          {resultado.faltantes.slice(0, 10).map(f => <p key={f.catKey}>⚠️ {f.catLabel} — hay {f.elegibles}, faltan {f.faltan}</p>)}
          {resultado.faltantes.length > 10 && <p>…y {resultado.faltantes.length - 10} combinación(es) más con 1-3 atletas.</p>}
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
              <span className="text-[8.5px] text-boxing-muted flex-shrink-0 text-right leading-tight"><span className="text-green-400">✓</span> gana · <span className="text-red-400">✕</span> cambia</span>
            </div>
            <div className="p-3">
              <div className="grid items-stretch" style={{ gridTemplateColumns: "1fr 18px 1fr" }}>
                <div className="flex flex-col justify-between gap-3">
                  {b.semis.map((s, i) => {
                    // El ✓ se bloquea hasta que la semifinal tenga sus DOS
                    // peleadores reales (en llaves incompletas un lado puede ser
                    // un cupo vacío o un peleador eliminado): no se marca ganador
                    // por walkover; primero se llena el cupo con "＋ Elegir".
                    const semiLista = !!byId[s.red] && !!byId[s.blue];
                    return (
                      <Tarjeta key={i} dia={`${EVENT_LABELS.semiAbbr} · Semi ${i + 1}`} decidido={!!s.winner}>
                        <Fila fid={s.red} winner={s.winner} lado="rojo" bloqueada={!semiLista} onWin={() => marcarSemi(b.id, i, s.red)} onRemove={() => pedirReemplazo(b.id, i, "red", s.red)} />
                        <Fila fid={s.blue} winner={s.winner} lado="azul" bloqueada={!semiLista} onWin={() => marcarSemi(b.id, i, s.blue)} onRemove={() => pedirReemplazo(b.id, i, "blue", s.blue)} />
                      </Tarjeta>
                    );
                  })}
                </div>
                <Conector />
                <div className="flex flex-col justify-center">
                  <Tarjeta dia={`${EVENT_LABELS.finalAbbr} · Final`} decidido={!!campeon} destacada>
                    <Fila fid={finalistas[0]} winner={campeon} lado="rojo" onWin={() => marcarFinal(b.id, finalistas[0])} placeholder="Ganador Semi 1" bloqueada={!(finalistas[0] && finalistas[1])} />
                    <Fila fid={finalistas[1]} winner={campeon} lado="azul" onWin={() => marcarFinal(b.id, finalistas[1])} placeholder="Ganador Semi 2" bloqueada={!(finalistas[0] && finalistas[1])} />
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

      {reemplazo && (() => {
        const b = super4.find(x => x.id === reemplazo.bId);
        if (!b) return null;
        // Regla: no dos peleadores de la misma escuela en la misma llave. Se
        // ocultan los candidatos cuya escuela ya está en OTRO cupo de esta llave
        // (se excluye el cupo que se está llenando, cuyo ocupante sale).
        const gymsEnLlave = new Set();
        (b.semis || []).forEach((s, si) => ["red", "blue"].forEach(l => {
          if (si === reemplazo.semiIndex && l === reemplazo.lado) return;
          const g = byId[s[l]] && normName(byId[s[l]].gym);
          if (g) gymsEnLlave.add(g);
        }));
        const opciones = availableReplacements(b.catKey, fighters, super4, bracketMaxFights(b))
          .filter(f => { const g = normName(f.gym); return !g || !gymsEnLlave.has(g); });
        const saleF = byId[reemplazo.saliente]; // el que sale, o undefined si el cupo ya estaba libre
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => setReemplazo(null)}>
            <div className="w-full max-w-md bg-boxing-panel border border-boxing-goldDim/50 rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-boxing-line">
                <p className="text-boxing-cream font-bold" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.05em" }}>{saleF ? "Reemplazar peleador" : "Elegir peleador"}</p>
                <p className="text-[11px] text-boxing-muted">{b.catLabel}{saleF ? <> · sale <span className="text-boxing-cream font-semibold">{saleF.fullName}</span></> : " · cupo libre"}</p>
              </div>
              <div className="max-h-[50vh] overflow-y-auto">
                {opciones.length === 0
                  ? <p className="p-4 text-sm text-boxing-muted text-center">No existen peleadores con estas características.<br />Regístralos en la pestaña Agregar o libera un cupo de otra llave.</p>
                  : opciones.map(f => (
                    <button key={f.id} onClick={() => hacerReemplazo(f.id)} className="w-full text-left px-4 py-2.5 border-b border-boxing-line/50 hover:bg-white/5 transition-colors">
                      <span className="text-boxing-cream font-semibold text-sm block truncate">{f.fullName}</span>
                      <span className="text-[10px] text-boxing-muted">{f.gym} · {f.weightKg}kg · {f.age}a</span>
                    </button>
                  ))}
              </div>
              <button onClick={() => setReemplazo(null)} className="w-full py-3 bg-black/40 text-boxing-muted text-sm tracking-widest uppercase border-t border-boxing-line">Cancelar</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
