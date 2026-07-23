import { useState, useEffect, useRef } from "react";
import { TICKET_TYPES_V2, PAYMENT_METHODS_V2, fmt$ } from "../constants.js";
import { PREFIJO_CL, telefonoIngresado } from "../lib/whatsapp.js";
import TicketPreview from "./TicketPreview.jsx";

// Terna RGB del color de cada tipo de entrada, para graduar alphas en la
// tarjeta-radio (.type-card usa rgba(var(--c), …)).
const TYPE_RGB = { inscripcion: "59,130,246", preventa: "168,85,247", puerta: "249,115,22" };

export default function SellView({ onAdd }) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [phone, setPhone] = useState(PREFIJO_CL);
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
      const t = await onAdd({ attendeeName: trimmedName, phone: telefonoIngresado(phone), ticketType: type, paymentMethod: method });
      setLast(t); setName(""); setPhone(PREFIJO_CL);
    } finally {
      setSubmitting(false);
    }
  }
  // Al emitir, la boleta aparece DEBAJO del formulario: en el computador queda
  // fuera de la pantalla y el vendedor no ve el botón de WhatsApp —parece que no
  // pasó nada—. La página baja sola hasta ahí en cuanto la venta se confirma.
  // Dos decisiones, las dos medidas y no por gusto:
  //  · El salto es INSTANTÁNEO. El desplazamiento suave lo anima el navegador
  //    cuadro a cuadro, y si esos cuadros no corren no se baja NADA (medido:
  //    se quedaba en 0 de 328 mientras el salto directo llegaba al fondo).
  //  · Se aplaza con setTimeout y NO con requestAnimationFrame. Los navegadores
  //    congelan rAF cuando la ventana no está visible; si el vendedor cambia de
  //    pestaña mientras la venta se guarda en la nube, con rAF el scroll no
  //    ocurriría jamás. setTimeout sigue corriendo igual. El aplazamiento existe
  //    para que la boleta —que entra animada— tenga su alto definitivo antes de
  //    calcular a dónde bajar.
  const voucherRef = useRef(null);
  useEffect(() => {
    if (!last) return;
    const id = setTimeout(() => {
      if (voucherRef.current) voucherRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }, 0);
    return () => clearTimeout(id);
  }, [last]);

  // El prefijo ya está escrito, así que el cursor tiene que caer DETRÁS de él:
  // si no, el primer dígito se cuela donde se tocó la pantalla. Se hace en el
  // cuadro siguiente porque el navegador coloca el cursor después del foco.
  function cursorAlFinal(e) {
    const campo = e.target;
    if (campo.value !== PREFIJO_CL) return;
    requestAnimationFrame(() => campo.setSelectionRange(campo.value.length, campo.value.length));
  }

  // Kicker de campo del rediseño: condensada pequeña en oro apagado.
  const lbl = "text-[14px] font-semibold mb-1.5 block tracking-[0.22em] uppercase text-[rgba(200,160,74,0.55)]";
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-3xl p-4 lg:p-5 space-y-3.5 border border-white/5" style={{ background: "linear-gradient(170deg, #131016, #0c0a0e)" }}>
        <h3 className="text-boxing-cream" style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: "20px" }}>Nueva entrada</h3>
        <div><label className={lbl}>Nombre del asistente</label>
          <input value={name} onChange={e => { setName(e.target.value); if (nameError) setNameError(""); }} placeholder="Nombre completo" required maxLength={60} className="input-ink w-full px-3 py-2.5 text-sm" />
          {nameError && <p className="text-red-400 text-sm mt-1">{nameError}</p>}</div>
        <div><label className={lbl}>Teléfono (opcional)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} onFocus={cursorAlFinal} type="tel" inputMode="tel" autoComplete="tel" placeholder={PREFIJO_CL} className="input-ink w-full px-3 py-2.5 text-sm" /></div>
        <div><label className={lbl}>Tipo de entrada</label>
          {/* Tarjetas-radio: cada tipo se enciende con el neón de SU color al
              elegirlo (azul inscripción, púrpura preventa, naranja puerta) y
              solo una brilla a la vez. */}
          <div className="grid grid-cols-3 gap-2.5">
            {TICKET_TYPES_V2.map(t => (
              <button key={t.key} type="button" onClick={() => setType(t.key)}
                className={"type-card py-3 px-1 text-sm font-bold active:scale-95" + (type === t.key ? " sel" : "")}
                style={{ "--c": TYPE_RGB[t.key] || "168,85,247", color: type === t.key ? t.color : "#6B7280" }}>
                <div className="text-lg">{t.icon}</div>
                <div className="tracking-[0.12em] uppercase mt-0.5 text-boxing-cream">{t.label}</div>
                <div className="text-[14px] mt-0.5" style={{ color: type === t.key ? t.color : "#6b5f6e", fontVariantNumeric: "tabular-nums" }}>{fmt$(t.price)}</div>
              </button>
            ))}
          </div>
        </div>
        <div><label className={lbl}>Método de pago</label>
          <div className="flex gap-2">
            {PAYMENT_METHODS_V2.map(m => (
              <button key={m} type="button" onClick={() => setMethod(m)} className="flex-1 py-2 rounded-full text-sm font-bold tracking-[0.14em] uppercase transition-all border"
                style={method === m ? { background: "#1c1620", borderColor: "rgba(255,255,255,0.2)", color: "#e8ddd0" } : { background: "transparent", borderColor: "rgba(255,255,255,0.08)", color: "#6b5f6e" }}>{m}</button>
            ))}
          </div>
        </div>
        {/* La campana de la venta: único glow permanente del panel. */}
        <button type="submit" disabled={submitting} className="btn-primary w-full py-3.5 font-black"
          style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "17px", letterSpacing: "3px", fontVariantNumeric: "tabular-nums" }}>
          {submitting ? "Emitiendo..." : "🎫 EMITIR — " + fmt$(ticketTypeInfo.price)}
        </button>
      </form>
      {last && <div ref={voucherRef} className="space-y-2 fade-in"><p className="text-[14px] text-green-400 font-bold uppercase tracking-widest text-center">✓ Entrada emitida exitosamente</p><TicketPreview key={last.id} ticket={last} /></div>}
    </div>
  );
}
