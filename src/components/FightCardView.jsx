import { getCategoryInfo, EVENT_LABELS } from "../constants.js";
import { buildCarteleraHtml, carteleraGroups } from "../lib/printCartelera.js";
import { printHtml } from "../lib/printHtml.js";
import { buildCarteleraXlsx } from "../lib/xlsxPlanillas.js";
import { downloadBytes, xlsxFilename, XLSX_MIME } from "../lib/download.js";
import { matchupConflicts } from "../lib/conflicts.js";
import { super4FighterIds } from "../lib/super4.js";
import PageHeader from "./PageHeader.jsx";

// ============================================
// FIGHT CARD VIEW
// ============================================
export default function FightCardView({ matchups, fighters, super4 = [] }) {
  if (!matchups.length) return <div className="text-center py-16 border border-dashed border-boxing-lineBright rounded-3xl"><div className="text-5xl mb-4 opacity-40">{"\u{1F4CB}"}</div><p className="text-boxing-muted">Primero crea los VS</p></div>;
  // Fecha REAL del evento (dos días), no la de hoy. Fuente única: EVENT_DATES.
  const eventDate = EVENT_LABELS.rango;
  // Misma revisión en vivo que la pestaña VS: avisa AQUÍ (donde se imprime)
  // si alguna pelea guardada quedó inválida (atleta ya en el Super 4, rival
  // eliminado, misma escuela, experiencia o edad).
  const conflicts = matchupConflicts(matchups, fighters, super4FighterIds(super4));
  const conflictLines = [...conflicts.huerfanas, ...conflicts.super4, ...conflicts.edadMixta, ...conflicts.mismaEscuela, ...conflicts.experiencia];
  // (Se quitó el botón de WhatsApp: mandaba la cartelera como texto plano, que
  // se desarma en el chat y no se puede corregir. La descarga en Excel cumple
  // mejor esa función —se adjunta al chat, se ve como planilla y el que la
  // recibe puede editarla— así que la cabecera queda con Imprimir y Excel.)
  // Abre una ventana con una tabla imprimible (N°/Escuela/Atleta/VS/Atleta/
  // Escuela/Peso/Nota) y dispara el diálogo de impresión del navegador —
  // desde ahí se puede imprimir directo o guardar como PDF. Las peleas se
  // agrupan por categoría de edad World Boxing (con su formato de rounds en el
  // encabezado de cada bloque) y dentro de cada bloque van de más liviano
  // a más pesado. La numeración se reinicia por bloque, como en la planilla
  // de Excel que usan los jueces.
  function printSheet() {
    printHtml(buildCarteleraHtml(matchups, fighters));
  }
  // Descarga la MISMA planilla como archivo de Excel editable. En la mesa de
  // control siempre hay cambios de último minuto (un atleta que no llega, un
  // peso que cambia en la balanza): así se corrige en Numbers/Excel/Google
  // Sheets y se imprime desde ahí, sin volver a entrar a la app. El PDF no se
  // puede editar sin programas de pago.
  function downloadExcel() {
    // Cuenta las peleas que REALMENTE salen en la planilla: las que tienen
    // rival eliminado se filtran, así que matchups.length mentiría.
    const n = carteleraGroups(matchups, fighters).reduce((s, g) => s + g.list.length, 0);
    downloadBytes(
      buildCarteleraXlsx(matchups, fighters, `${eventDate} · ${n} pelea${n === 1 ? "" : "s"}`),
      xlsxFilename("Cartelera Sangre Nueva", new Date().toLocaleDateString("es-CL").replace(/\//g, "-")),
      XLSX_MIME,
    );
  }
  return (
    // En escritorio la cartelera es un "póster" secuencial: se centra con un
    // ancho cómodo de lectura en vez de estirarse a todo el ancho.
    <div className="space-y-4 lg:max-w-3xl lg:mx-auto">
      <PageHeader kicker="Planilla oficial del evento" title="Cartelera" count={matchups.length} />
      <div className="rounded-3xl border border-white/10 overflow-hidden" style={{ background: "linear-gradient(180deg, #120e14, #0b090c)" }}>
        {/* Cabecera de cartel: la marca en serif sobre tinta, con los humos de
            las dos esquinas — el póster del evento, no una franja de color. */}
        <div className="p-5 text-center relative" style={{ background: "radial-gradient(300px 130px at 12% 0%, rgba(155,26,42,0.28), transparent 65%), radial-gradient(300px 130px at 88% 0%, rgba(37,99,235,0.18), transparent 65%), rgba(0,0,0,0.35)" }}>
          <h3 className="titulo-cartel" style={{ fontSize: "26px", letterSpacing: "0.04em" }}>SANGRE NUEVA</h3>
          <p className="titulo-oro" style={{ fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontSize: "17px", marginTop: "2px" }}>La Velada</p>
          <p className="text-boxing-muted text-xs mt-2 capitalize tracking-[0.08em]">{eventDate} · {matchups.length} peleas</p>
        </div>
        {/* Acciones arriba, justo bajo el título del evento, para no tener que bajar hasta el final. */}
        {/* Dos acciones a mitad y mitad: imprimir (o guardar en PDF) y bajar la
            planilla editable en Excel, que es la que se comparte por chat. */}
        <div className="flex gap-2 p-3 border-b border-white/5">
          <button onClick={printSheet} title="Imprimir o guardar como PDF" className="btn-gold flex-1 font-bold py-3 text-sm flex items-center justify-center gap-2 tracking-[0.14em] uppercase">{"🖨️"} Imprimir</button>
          <button onClick={downloadExcel} title="Descargar la cartelera en Excel para editarla (Numbers, Excel o Google Sheets)" className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 tracking-[0.14em] uppercase transition-colors">{"📊"} Excel</button>
        </div>
        {/* Aviso de peleas con problemas, visible donde se imprime la planilla */}
        {conflictLines.length > 0 && <div className="bg-red-900/30 border-b border-red-500/40 p-3 space-y-1">
          <p className="text-red-300 text-xs font-bold">{"⚠️"} {conflictLines.length} problema{conflictLines.length !== 1 ? "s" : ""} en la cartelera — corrígelo{conflictLines.length !== 1 ? "s" : ""} en la pestaña VS</p>
          {conflictLines.map((v, i) => <p key={v.id + "-" + i} className="text-[11px] text-red-200/80">{v.texto}</p>)}
          {conflicts.huerfanas.length > 0 && <p className="text-[10px] text-red-200/60">Las peleas con rival eliminado no salen en la planilla impresa.</p>}
        </div>}
        <div className="divide-y divide-white/5">{matchups.map((m, i) => { const r = fighters.find(f => f.id === m.fighterRedId); const b = fighters.find(f => f.id === m.fighterBlueId); if (!r || !b) return null; const c = getCategoryInfo(r.weightCategory); const main = i === matchups.length - 1;
          return <div key={m.id} className={"px-4 py-3 " + (main ? "bg-[rgba(200,160,74,0.08)]" : "")}>
            {main ? <div className="text-center mb-1"><span className="text-[10px] text-boxing-goldBright font-bold uppercase tracking-widest bg-[rgba(200,160,74,0.12)] border border-[rgba(200,160,74,0.4)] px-2.5 py-0.5 rounded-full">{"⭐"} Estelar</span></div> : <div className="text-center mb-1"><span className="text-[10px] text-boxing-muted tracking-[0.18em] uppercase">Pelea {m.roundNumber}</span></div>}
            <div className="flex items-center"><div className="flex-1 text-left"><p className={"font-bold truncate " + (main ? "text-base text-boxing-cream" : "text-sm text-boxing-cream/85")}>{r.fullName}</p><p className="text-[11px] text-boxing-muted">{r.gym} · {r.weightKg}kg</p></div><div className="mx-2 flex flex-col items-center"><span className="vsx-vs" style={{ fontSize: "16px" }}>VS</span><span className="text-[10px] text-boxing-muted">{c?.label}</span></div><div className="flex-1 text-right"><p className={"font-bold truncate " + (main ? "text-base text-boxing-cream" : "text-sm text-boxing-cream/85")}>{b.fullName}</p><p className="text-[11px] text-boxing-muted">{b.weightKg}kg · {b.gym}</p></div></div></div>; })}</div>
        <div className="bg-black/30 px-4 py-2 text-center"><p className="text-boxing-muted text-[10px] tracking-[0.22em] uppercase">Sangre Nueva · La Velada</p></div>
      </div>
    </div>
  );
}
