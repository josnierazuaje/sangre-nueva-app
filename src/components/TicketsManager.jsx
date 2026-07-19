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
  const tabs = [{ k: "sell", label: "Vender" }, { k: "history", label: "Historial" }, { k: "checkin", label: "Check-in" }];
  return (
    // En escritorio se centra con un ancho controlado: los KPIs y las
    // sub-vistas (vender/historial/check-in) no se estiran de más.
    <div className="space-y-4 lg:max-w-4xl lg:mx-auto">
      <PageHeader kicker="Boletería" title="Entradas" />
      {/* KPIs con jerarquía asimétrica: la recaudación es LA cifra de la
          pantalla (héroe dorado); Capacidad y Check-in susurran al lado.
          En móvil se conserva el orden de siempre (Capacidad arriba a lo
          ancho, luego Ingresos y Check-in en dos columnas); en escritorio
          el héroe ocupa la columna izquierda completa vía order + row-span. */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-[1.55fr_1fr] lg:gap-3.5">
        <div className="kpi-tile col-span-2 order-1 p-4 lg:col-span-1 lg:order-2" style={{ "--c": "#6b5f6e" }}>
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-semibold text-boxing-muted uppercase tracking-[0.26em]">Capacidad</span>
            <span className="text-boxing-cream text-xl font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{kpis.total}<span className="font-normal" style={{ opacity: 0.35 }}> / {MAX_CAP}</span></span>
          </div>
          {/* Cinturón de capacidad: carril hundido con un tramo redondeado por
              tipo de entrada vendido (ocupación real vs. aforo). */}
          <div className="belt-bar mt-2.5">
            {TICKET_TYPES_V2.map(tt => { const n = kpis.byType[tt.key] || 0; return n > 0 ? <span key={tt.key} className="belt-seg transition-all duration-700" style={{ width: (n / MAX_CAP * 100) + "%", background: tt.color }} /> : null; })}
          </div>
          {/* Leyenda etiquetada: da la identidad del color (necesaria porque los
              colores de tipo no se distinguen bien bajo daltonismo). */}
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2.5">
            {TICKET_TYPES_V2.map(tt => <span key={tt.key} className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-boxing-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tt.color }} />{tt.label} <b className="text-boxing-cream font-semibold">{kpis.byType[tt.key] || 0}</b>
            </span>)}
          </div>
        </div>
        <div className="kpi-oro order-2 p-4 lg:order-1 lg:row-span-2 lg:p-7 flex flex-col justify-center min-w-0">
          <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-[0.32em]" style={{ color: "rgba(200,160,74,0.85)" }}>Ingresos</p>
          <p className="titulo-oro italic leading-[1.06] mt-1 truncate" style={{ fontSize: "clamp(30px,7vw,64px)", fontVariantNumeric: "tabular-nums", filter: "drop-shadow(0 0 18px rgba(200,160,74,0.35))" }}>{fmt$(kpis.revenue)}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tracking-[0.08em] text-boxing-muted">
            {Object.entries(kpis.byPayment).filter(([, v]) => v > 0).map(([m, v]) => <span key={m}>{m}: <b className="text-boxing-cream font-semibold">{fmt$(v)}</b></span>)}
            <span>{kpis.total} entrada{kpis.total !== 1 ? "s" : ""} emitida{kpis.total !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="kpi-tile order-3 p-4" style={{ "--c": "#22C55E" }}>
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-semibold uppercase tracking-[0.26em]" style={{ color: "rgba(34,197,94,0.8)" }}>Check-in</span>
            <span className="text-boxing-cream text-xl font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{kpis.checkedIn}<span className="font-normal" style={{ opacity: 0.35 }}> / {kpis.total}</span></span>
          </div>
          <div className="belt-bar mt-2.5">
            {kpis.checkedIn > 0 && <span className="belt-seg transition-all duration-700" style={{ width: (kpis.total ? kpis.checkedIn / kpis.total * 100 : 0) + "%", background: "linear-gradient(90deg,#16a34a,#4ade80)" }} />}
          </div>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-boxing-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#22C55E" }} />Ingresados <b className="text-boxing-cream font-semibold">{kpis.checkedIn}</b>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-boxing-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#6b5f6e" }} />Pendientes <b className="text-boxing-cream font-semibold">{kpis.total - kpis.checkedIn}</b>
            </span>
          </div>
        </div>
      </div>
      {/* Pestañas segmentadas: píldora con frost, la activa con filo dorado. */}
      <div className="tab-pill">
        {tabs.map(s => <button key={s.k} type="button" onClick={() => setSubView(s.k)} className={subView === s.k ? "on" : ""}>{s.label}</button>)}
      </div>
      {subView === "sell" && <SellView onAdd={addTicket} />}
      {subView === "history" && <HistoryView tickets={tickets} onDelete={deleteTicket} />}
      {subView === "checkin" && <CheckInView tickets={tickets} onCheckIn={checkIn} initialCode={initialTicketCode} initialToken={initialTicketToken} />}
    </div>
  );
}
