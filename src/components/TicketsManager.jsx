import { useState, useMemo } from "react";
import { TICKET_TYPES_V2, MAX_CAP, fmt$, genTicketToken } from "../constants.js";
import { nextTicketId, addTicketNode, checkInTicketTx, removeTicketNode } from "../lib/storage.js";
import SellView from "./SellView.jsx";
import HistoryView from "./HistoryView.jsx";
import CheckInView from "./CheckInView.jsx";

export default function TicketsManager({ tickets, setTickets, initialTicketCode, initialTicketToken }) {
  const [subView, setSubView] = useState(initialTicketCode ? "checkin" : "sell");
  const kpis = useMemo(() => {
    const byType = {}, byPayment = {};
    tickets.forEach(t => { byType[t.ticketType] = (byType[t.ticketType] || 0) + 1; byPayment[t.paymentMethod] = (byPayment[t.paymentMethod] || 0) + t.price; });
    return { total: tickets.length, revenue: tickets.reduce((s, t) => s + t.price, 0), byType, byPayment, checkedIn: tickets.filter(t => t.status === "ingresado").length };
  }, [tickets]);

  // El id se genera con un contador transaccional en Firebase (atómico entre
  // dispositivos) para que dos celulares vendiendo al mismo tiempo nunca
  // generen el mismo correlativo; cada boleta se guarda en su propio nodo
  // en vez de reescribir el arreglo completo (ver src/lib/storage.js).
  async function addTicket(data) {
    const ticketTypeInfo = TICKET_TYPES_V2.find(x => x.key === data.ticketType);
    const prefix = ticketTypeInfo.label.substring(0, 3).toUpperCase();
    const id = await nextTicketId(data.ticketType, prefix, tickets);
    // token: acompaña al id en el QR para que el check-in pueda distinguir una
    // boleta legítima de un correlativo adivinado (ver verifyTicketToken).
    const newT = { ...data, id, token: genTicketToken(), price: ticketTypeInfo.price, status: "activo", createdAt: new Date().toISOString(), checkedInAt: null };
    setTickets([...tickets, newT]);
    addTicketNode(newT);
    return newT;
  }
  // Ingreso atómico: la transacción en el servidor decide si esta boleta cuenta
  // como ingreso (only activo→ingresado). Actualiza el estado local con el
  // resultado y devuelve el veredicto a la vista para avisar dobles ingresos.
  async function checkIn(id) {
    const res = await checkInTicketTx(id);
    if (res.ok || res.already || res.offline) {
      const checkedInAt = res.ticket?.checkedInAt || new Date().toISOString();
      setTickets(tickets.map(t => t.id === id ? { ...t, status: "ingresado", checkedInAt } : t));
    }
    return res;
  }
  function deleteTicket(id) {
    setTickets(tickets.filter(t => t.id !== id));
    removeTicketNode(id);
  }
  const tabs = [{ k: "sell", label: "Vender", e: "🎫" }, { k: "history", label: "Historial", e: "📋" }, { k: "checkin", label: "Check-in", e: "✅" }];
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black text-white" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", letterSpacing: "3px" }}>🎫 ENTRADAS</h2>
      <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-gray-400 uppercase tracking-wider">Capacidad</span>
          <span className="text-sm font-bold text-white">{kpis.total} <span className="text-gray-500 font-normal">/ {MAX_CAP}</span></span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-2 rounded-full transition-all duration-700" style={{ width: Math.min(100, kpis.total / MAX_CAP * 100) + "%", background: "linear-gradient(90deg,#DC2626,#F59E0B)" }} />
        </div>
        <div className="flex gap-3">{TICKET_TYPES_V2.map(tt => <span key={tt.key} className="text-[10px] font-semibold" style={{ color: tt.color }}>{tt.icon} {tt.label}: {kpis.byType[tt.key] || 0}</span>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Ingresos</p>
          <p className="text-xl font-black text-yellow-500" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif" }}>{fmt$(kpis.revenue)}</p>
          <div className="mt-1 space-y-0.5">{Object.entries(kpis.byPayment).filter(([, v]) => v > 0).map(([m, v]) => <p key={m} className="text-[10px] text-gray-500">{m}: {fmt$(v)}</p>)}</div>
        </div>
        <div className="rounded-xl p-3" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Check-in</p>
          <p className="text-xl font-black text-green-400" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif" }}>{kpis.checkedIn} <span className="text-sm text-gray-600 font-normal">/ {kpis.total}</span></p>
          <p className="text-[10px] text-gray-500 mt-1">Pendientes: {kpis.total - kpis.checkedIn}</p>
        </div>
      </div>
      <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {tabs.map(s => <button key={s.k} onClick={() => setSubView(s.k)} className="flex-1 py-2.5 text-xs font-bold transition-all"
          style={subView === s.k ? { background: "rgba(220,38,38,0.25)", color: "white", borderBottom: "2px solid #DC2626" } : { color: "#4B5563" }}>{s.e} {s.label}</button>)}
      </div>
      {subView === "sell" && <SellView onAdd={addTicket} />}
      {subView === "history" && <HistoryView tickets={tickets} onDelete={deleteTicket} />}
      {subView === "checkin" && <CheckInView tickets={tickets} onCheckIn={checkIn} initialCode={initialTicketCode} initialToken={initialTicketToken} />}
    </div>
  );
}
