import { getCategoryInfo } from "../constants.js";
import { buildCarteleraHtml } from "../lib/printCartelera.js";

// ============================================
// FIGHT CARD VIEW
// ============================================
export default function FightCardView({ matchups, fighters }) {
  if (!matchups.length) return <div className="text-center py-16"><div className="text-5xl mb-4">{"\u{1F4CB}"}</div><p className="text-gray-400">Primero crea los VS</p></div>;
  const eventDate = new Date().toLocaleDateString("es-CL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  function shareWA() {
    const text = "*CARTELERA DE BOXEO*\n" + eventDate + "\n\n" + matchups.map(m => { const r = fighters.find(f => f.id === m.fighterRedId); const b = fighters.find(f => f.id === m.fighterBlueId); const c = getCategoryInfo(r?.weightCategory); return `*Pelea ${m.roundNumber}* (${c?.label})\n${r?.fullName} _(${r?.weightKg}kg, ${r?.gym})_\nVS\n${b?.fullName} _(${b?.weightKg}kg, ${b?.gym})_`; }).join("\n\n");
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }
  // Abre una ventana con una tabla imprimible (N°/Escuela/Atleta/VS/Atleta/
  // Escuela/Peso/Nota) y dispara el diálogo de impresión del navegador —
  // desde ahí se puede imprimir directo o guardar como PDF. Las peleas se
  // agrupan por categoría de edad World Boxing (con su formato de rounds en el
  // encabezado de cada bloque) y dentro de cada bloque van de más liviano
  // a más pesado. La numeración se reinicia por bloque, como en la planilla
  // de Excel que usan los jueces.
  function printSheet() {
    const html = buildCarteleraHtml(matchups, fighters);
    const win = window.open("", "_blank");
    if (!win) { alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Cartelera</h2>
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl border border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-red-800 via-yellow-700 to-red-800 p-4 text-center"><h3 className="text-2xl font-black text-white uppercase tracking-wider">{"\u{1F94A}"} Sangre Nueva — La Velada</h3><p className="text-yellow-200 text-sm mt-1 capitalize">{eventDate}</p><p className="text-white/60 text-xs">{matchups.length} Peleas</p></div>
        {/* Acciones arriba, justo bajo el título del evento, para no tener que bajar hasta el final. */}
        <div className="flex gap-2 p-3 border-b border-gray-800"><button onClick={printSheet} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2">{"🖨️"} Imprimir</button><button onClick={shareWA} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">{"\u{1F4E4}"} WhatsApp</button></div>
        <div className="divide-y divide-gray-800">{matchups.map((m, i) => { const r = fighters.find(f => f.id === m.fighterRedId); const b = fighters.find(f => f.id === m.fighterBlueId); if (!r || !b) return null; const c = getCategoryInfo(r.weightCategory); const main = i === matchups.length - 1;
          return <div key={m.id} className={"px-4 py-3 " + (main ? "bg-yellow-900/20" : "")}>
            {main ? <div className="text-center mb-1"><span className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest bg-yellow-500/10 px-2 py-0.5 rounded">{"⭐"} Estelar</span></div> : <div className="text-center mb-1"><span className="text-[10px] text-gray-500">Pelea {m.roundNumber}</span></div>}
            <div className="flex items-center"><div className="flex-1 text-left"><p className={"font-bold truncate " + (main ? "text-base text-white" : "text-sm text-gray-200")}>{r.fullName}</p><p className="text-[11px] text-gray-500">{r.gym} · {r.weightKg}kg</p></div><div className="mx-2 flex flex-col items-center"><span className="text-yellow-500 font-black text-sm">VS</span><span className="text-[10px] text-gray-500">{c?.label}</span></div><div className="flex-1 text-right"><p className={"font-bold truncate " + (main ? "text-base text-white" : "text-sm text-gray-200")}>{b.fullName}</p><p className="text-[11px] text-gray-500">{b.weightKg}kg · {b.gym}</p></div></div></div>; })}</div>
        <div className="bg-gray-800/50 px-4 py-2 text-center"><p className="text-gray-500 text-[10px]">Sangre Nueva · La Velada</p></div>
      </div>
    </div>
  );
}
