import { useState, useMemo } from "react";
import { TICKET_TYPES_V2, fmtDinero, ticketQty } from "../constants.js";
import Badge from "./Badge.jsx";
import { normName } from "../lib/dedup.js";
import { buildEntradasCsv, buildEntradasHtml } from "../lib/entradasReporte.js";
import { printHtml } from "../lib/printHtml.js";
import { downloadBytes, csvFilename, CSV_MIME } from "../lib/download.js";
import TicketPreview from "./TicketPreview.jsx";
import { localeDelEventoActivo } from "../lib/fichaEvento.js";

export default function HistoryView({ tickets, onDelete }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Boleta cuyo voucher se está reenviando. Hasta ahora el voucher solo existía
  // mientras la venta recién hecha siguiera en pantalla, y la siguiente venta lo
  // reemplazaba: si el navegador bloqueaba la ventana de WhatsApp, el vendedor
  // olvidaba pegar la imagen o atendía al siguiente cliente, el comprador
  // quedaba pagado y SIN entrada, sin ninguna vía para mandársela después (la
  // única salida era anular y re-vender, duplicando correlativo y recaudación).
  const [compartir, setCompartir] = useState(null);
  function del(id) { if (confirmDeleteId === id) { onDelete(id); setConfirmDeleteId(null); } else { setConfirmDeleteId(id); setTimeout(() => setConfirmDeleteId(null), 3000); } }
  const filtered = useMemo(() => {
    let r = [...tickets].reverse();
    // Búsqueda de asistentes insensible a acentos/mayúsculas/espacios (normName),
    // igual que en la lista de peleadores: "jose" encuentra a "José".
    if (searchQuery.trim()) { const s = normName(searchQuery); r = r.filter(t => normName(t.attendeeName).includes(s) || (t.id || "").toLowerCase().includes(s)); }
    if (typeFilter !== "all") r = r.filter(t => t.ticketType === typeFilter);
    if (statusFilter !== "all") r = r.filter(t => t.status === statusFilter);
    return r;
  }, [tickets, searchQuery, typeFilter, statusFilter]);
  // Registro para imprimir/exportar: el MISMO conjunto que se ve (con los
  // filtros activos) pero en orden cronológico (de la 1ª boleta a la última),
  // como se lee una hoja de cierre. `filtered` viene al revés (la más nueva
  // arriba), así que se invierte.
  const paraReporte = useMemo(() => [...filtered].reverse(), [filtered]);
  function subtituloReporte() {
    const partes = [];
    if (typeFilter !== "all") { const t = TICKET_TYPES_V2.find(x => x.key === typeFilter); if (t) partes.push(t.label); }
    if (statusFilter !== "all") partes.push(statusFilter === "ingresado" ? "Solo ingresados" : "Solo activas");
    if (searchQuery.trim()) partes.push(`Búsqueda: "${searchQuery.trim()}"`);
    const base = partes.length ? partes.join(" · ") : "Todas las entradas";
    return `${base} — impreso ${new Date().toLocaleDateString(localeDelEventoActivo())}`;
  }
  function imprimirRegistro() { printHtml(buildEntradasHtml(paraReporte, subtituloReporte())); }
  function descargarRegistro() {
    const fecha = new Date().toLocaleDateString(localeDelEventoActivo()).replace(/\//g, "-");
    downloadBytes(buildEntradasCsv(paraReporte, subtituloReporte()), csvFilename("Entradas Sangre Nueva", fecha), CSV_MIME);
  }
  if (!tickets.length) return <div className="text-center py-12"><div className="text-5xl mb-3">🎫</div><p className="text-gray-400 text-sm">No hay entradas emitidas aún</p></div>;
  return (
    <div className="space-y-3">
      <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar nombre o #boleta..." className="input-ink w-full px-3 py-2.5 text-sm" />
      <div className="flex gap-2">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-ink flex-1 px-2.5 py-2 text-sm">
          <option value="all">Todos los tipos</option>
          {TICKET_TYPES_V2.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-ink flex-1 px-2.5 py-2 text-sm">
          <option value="all">Todos los estados</option>
          <option value="activo">● Activo</option>
          <option value="ingresado">✓ Ingresado</option>
        </select>
      </div>
      {/* Imprimir la hoja final del registro y bajar el CSV para Google Sheets,
          igual que en Cartelera. Se exporta lo que se ve (con los filtros). */}
      <div className="flex gap-2">
        <button onClick={imprimirRegistro} title="Imprimir la hoja final del registro de entradas (o guardar como PDF)" className="btn-gold flex-1 font-bold py-2.5 text-sm flex items-center justify-center gap-2 tracking-[0.14em] uppercase">🖨️ Imprimir</button>
        <button onClick={descargarRegistro} title="Descargar el registro para abrir y editar en Google Sheets o Numbers (archivo CSV)" className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-2xl text-sm flex items-center justify-center gap-2 tracking-[0.14em] uppercase transition-colors">📊 Google Sheets</button>
      </div>
      <p className="text-[14px] text-gray-500">{filtered.length} entrada{filtered.length !== 1 ? "s" : ""}</p>
      {/* Móvil: lista vertical. Escritorio: 2 columnas de boletas. */}
      <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-2">
        {filtered.map(t => {
          const ticketTypeInfo = TICKET_TYPES_V2.find(x => x.key === t.ticketType) || TICKET_TYPES_V2[0];
          return (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-white/5" style={{ background: "linear-gradient(165deg, #16111a, #0b090c)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: ticketTypeInfo.color + "18" }}>{ticketTypeInfo.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{t.attendeeName}</p>
                <p className="text-gray-500 text-[14px]">#{t.id} · {t.paymentMethod}{ticketQty(t) > 1 ? " · ×" + ticketQty(t) : ""}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold" style={{ color: ticketTypeInfo.color }}>{fmtDinero(t.price)}</p>
                {/* `_pending`: la venta está guardada en este dispositivo y en
                    cola, pero la nube todavía no la confirmó (se re-sube sola).
                    Se avisa para que nadie borre los datos locales creyendo que
                    ya está a salvo. */}
                {t._pending
                  ? <Badge variant="filled" size="xs" color="#FB923C">⏳ Subiendo</Badge>
                  : <Badge variant="filled" size="xs" color={t.status === "ingresado" ? "#4ADE80" : "#FCD34D"}>{t.status === "ingresado" ? "✓ In" : "● Act"}</Badge>}
              </div>
              <button onClick={() => setCompartir(compartir && compartir.id === t.id ? null : t)} className={"p-1.5 rounded-[10px] flex-shrink-0 transition-colors " + (compartir && compartir.id === t.id ? "text-boxing-goldFight bg-boxing-goldFight/10" : "text-gray-500 hover:text-boxing-goldFight")} title="Volver a mostrar el voucher para enviarlo">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342a3 3 0 100-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684zm0-12.632a3 3 0 105.368-2.684 3 3 0 00-5.368 2.684z" /></svg>
              </button>
              <button onClick={() => del(t.id)} className={"p-1.5 rounded-[10px] flex-shrink-0 transition-colors " + (confirmDeleteId === t.id ? "text-red-400 bg-red-500/10" : "text-gray-500 hover:text-red-400")} title="Eliminar entrada">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          );
        })}
      </div>
      {/* Reenvío del voucher: se muestra en una capa encima para no romper la
          rejilla de dos columnas del escritorio. Reusa TicketPreview tal cual
          —ya recibe la boleta como dato—, así que el botón de WhatsApp, el QR y
          el aviso de pegar la imagen funcionan igual que al vender. */}
      {compartir && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.72)" }} onClick={() => setCompartir(null)}>
        <div className="w-full max-w-md max-h-full overflow-y-auto space-y-2 scale-in" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] text-boxing-goldFight font-bold uppercase tracking-widest">Reenviar entrada #{compartir.id}</p>
            <button onClick={() => setCompartir(null)} title="Cerrar" className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-boxing-muted hover:text-boxing-cream transition-colors" style={{ background: "rgba(255,255,255,0.06)" }}>✕</button>
          </div>
          <TicketPreview key={compartir.id} ticket={compartir} />
        </div>
      </div>}
    </div>
  );
}
