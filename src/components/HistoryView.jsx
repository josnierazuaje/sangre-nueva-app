import { useState, useMemo } from "react";
import { TICKET_TYPES_V2, fmt$ } from "../constants.js";
import Badge from "./Badge.jsx";
import { normName } from "../lib/dedup.js";

export default function HistoryView({ tickets, onDelete }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
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
  if (!tickets.length) return <div className="text-center py-12"><div className="text-5xl mb-3">🎫</div><p className="text-gray-400 text-sm">No hay entradas emitidas aún</p></div>;
  return (
    <div className="space-y-3">
      <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar nombre o #boleta..." className="input-ink w-full px-3 py-2.5 text-sm" />
      <div className="flex gap-2">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-ink flex-1 px-2.5 py-2 text-xs">
          <option value="all">Todos los tipos</option>
          {TICKET_TYPES_V2.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-ink flex-1 px-2.5 py-2 text-xs">
          <option value="all">Todos los estados</option>
          <option value="activo">● Activo</option>
          <option value="ingresado">✓ Ingresado</option>
        </select>
      </div>
      <p className="text-[11px] text-gray-500">{filtered.length} entrada{filtered.length !== 1 ? "s" : ""}</p>
      {/* Móvil: lista vertical. Escritorio: 2 columnas de boletas. */}
      <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-2">
        {filtered.map(t => {
          const ticketTypeInfo = TICKET_TYPES_V2.find(x => x.key === t.ticketType) || TICKET_TYPES_V2[0];
          return (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-white/5" style={{ background: "linear-gradient(165deg, #16111a, #0b090c)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: ticketTypeInfo.color + "18" }}>{ticketTypeInfo.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{t.attendeeName}</p>
                <p className="text-gray-500 text-[10px]">#{t.id} · {t.paymentMethod}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-bold" style={{ color: ticketTypeInfo.color }}>{fmt$(t.price)}</p>
                <Badge variant="filled" size="xs" color={t.status === "ingresado" ? "#4ADE80" : "#FCD34D"}>{t.status === "ingresado" ? "✓ In" : "● Act"}</Badge>
              </div>
              <button onClick={() => del(t.id)} className={"p-1.5 rounded-[10px] flex-shrink-0 transition-colors " + (confirmDeleteId === t.id ? "text-red-400 bg-red-500/10" : "text-gray-500 hover:text-red-400")} title="Eliminar entrada">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
