import { useState } from "react";
import { TICKET_TYPES_V2, PAYMENT_METHODS_V2, fmt$ } from "../constants.js";
import TicketPreview from "./TicketPreview.jsx";

export default function SellView({ onAdd }) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("preventa");
  const [method, setMethod] = useState("Efectivo");
  const [last, setLast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const ticketTypeInfo = TICKET_TYPES_V2.find(t => t.key === type);
  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim().replace(/\s+/g, " ");
    if (!trimmedName) { setNameError("Escribe el nombre del asistente"); return; }
    if (trimmedName.length < 2) { setNameError("El nombre es muy corto"); return; }
    if (trimmedName.length > 60) { setNameError("Máximo 60 caracteres"); return; }
    setNameError("");
    setSubmitting(true);
    try {
      const t = await onAdd({ attendeeName: trimmedName, phone: phone.trim(), ticketType: type, paymentMethod: method });
      setLast(t); setName(""); setPhone("");
    } finally {
      setSubmitting(false);
    }
  }
  const iS = { background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px" };
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl p-4 space-y-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 className="text-xs font-bold text-white uppercase tracking-widest">Nueva Entrada</h3>
        <div><label className="text-[11px] text-gray-400 mb-1 block">Nombre del asistente</label>
          <input value={name} onChange={e => { setName(e.target.value); if (nameError) setNameError(""); }} placeholder="Nombre completo" required maxLength={60} className="w-full px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none" style={iS} />
          {nameError && <p className="text-red-400 text-xs mt-1">{nameError}</p>}</div>
        <div><label className="text-[11px] text-gray-400 mb-1 block">Teléfono (opcional)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+56 9..." className="w-full px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none" style={iS} /></div>
        <div><label className="text-[11px] text-gray-400 mb-2 block">Tipo de Entrada</label>
          <div className="grid grid-cols-3 gap-2">
            {TICKET_TYPES_V2.map(t => (
              <button key={t.key} type="button" onClick={() => setType(t.key)} className="py-3 rounded-xl text-xs font-bold transition-all active:scale-95"
                style={type === t.key ? { background: t.color + "22", border: "1px solid " + t.color, color: t.color } : { background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)", color: "#6B7280" }}>
                <div className="text-lg">{t.icon}</div>
                <div>{t.label}</div>
                <div className="text-[10px] opacity-75">{fmt$(t.price)}</div>
              </button>
            ))}
          </div>
        </div>
        <div><label className="text-[11px] text-gray-400 mb-2 block">Método de Pago</label>
          <div className="flex gap-2">
            {PAYMENT_METHODS_V2.map(m => (
              <button key={m} type="button" onClick={() => setMethod(m)} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                style={method === m ? { background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.5)", color: "#FCA5A5" } : { background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)", color: "#6B7280" }}>{m}</button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={submitting} className="w-full py-3.5 rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#DC2626,#991B1B)", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "17px", letterSpacing: "3px" }}>
          {submitting ? "Emitiendo..." : "🎫 EMITIR — " + fmt$(ticketTypeInfo.price)}
        </button>
      </form>
      {last && <div className="space-y-2 fade-in"><p className="text-[11px] text-green-400 font-bold uppercase tracking-widest text-center">✓ Entrada emitida exitosamente</p><TicketPreview ticket={last} /></div>}
    </div>
  );
}
