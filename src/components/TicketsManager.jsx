import { useState, useMemo } from "react";
import { TICKET_TYPES_V2, MAX_CAP, fmt$, genTicketToken } from "../constants.js";
import { nextTicketId, addTicketNode, checkInTicketTx, removeTicketNode } from "../lib/storage.js";
import SellView from "./SellView.jsx";
import HistoryView from "./HistoryView.jsx";
import CheckInView from "./CheckInView.jsx";
import PageHeader from "./PageHeader.jsx";

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
    // En escritorio se centra con un ancho controlado: los KPIs y las
    // sub-vistas (vender/historial/check-in) no se estiran de más.
    <div className="space-y-4 lg:max-w-4xl lg:mx-auto">
      <PageHeader kicker="Boletería" title="Entradas" />
      <div className="kpi-tile p-4 space-y-2.5" style={{ "--c": "#c42438" }}>
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] text-boxing-muted uppercase tracking-[0.22em]">Capacidad</span>
          <span className="text-boxing-cream"><span style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "20px", letterSpacing: "0.03em" }}>{kpis.total}</span> <span className="text-boxing-muted text-xs">/ {MAX_CAP}</span></span>
        </div>
        {/* Medidor segmentado por tipo de entrada (ocupación vs. aforo). La pista
            clara es el aforo restante; cada tramo, un tipo. Bordes redondeados y
            separación de 2px entre tramos. */}
        <div className="w-full h-2.5 rounded-full overflow-hidden flex gap-[2px]" style={{ background: "rgba(255,255,255,0.06)" }}>
          {TICKET_TYPES_V2.map(tt => { const w = (kpis.byType[tt.key] || 0) / MAX_CAP * 100; return w > 0 ? <div key={tt.key} className="transition-all duration-700" style={{ width: w + "%", background: tt.color }} /> : null; })}
        </div>
        {/* Leyenda etiquetada: da la identidad del color (necesaria porque los
            colores de tipo no se distinguen bien bajo daltonismo). */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {TICKET_TYPES_V2.map(tt => <span key={tt.key} className="inline-flex items-center gap-1.5 text-[10px]">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: tt.color }} />
            <span className="text-boxing-muted uppercase tracking-wide">{tt.label}</span>
            <span className="font-bold" style={{ color: tt.color }}>{kpis.byType[tt.key] || 0}</span>
          </span>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="kpi-tile p-4" style={{ "--c": "#c8a04a" }}>
          <p className="text-[10px] text-boxing-muted uppercase tracking-[0.22em] mb-1.5">Ingresos</p>
          <p className="leading-none truncate" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "27px", letterSpacing: "0.02em", color: "#e5c76b" }}>{fmt$(kpis.revenue)}</p>
          <div className="mt-2 space-y-0.5">{Object.entries(kpis.byPayment).filter(([, v]) => v > 0).map(([m, v]) => <p key={m} className="text-[10px] text-boxing-muted">{m}: <span className="text-boxing-cream/80 font-semibold">{fmt$(v)}</span></p>)}</div>
        </div>
        <div className="kpi-tile p-4" style={{ "--c": "#22c55e" }}>
          <p className="text-[10px] text-boxing-muted uppercase tracking-[0.22em] mb-1.5">Check-in</p>
          <p className="leading-none" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "27px", letterSpacing: "0.02em", color: "#4ade80" }}>{kpis.checkedIn}<span className="text-boxing-muted" style={{ fontSize: "16px" }}> / {kpis.total}</span></p>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: (kpis.total ? kpis.checkedIn / kpis.total * 100 : 0) + "%", background: "linear-gradient(90deg,#16a34a,#4ade80)" }} />
          </div>
          <p className="text-[10px] text-boxing-muted mt-1.5">Pendientes: {kpis.total - kpis.checkedIn}</p>
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
