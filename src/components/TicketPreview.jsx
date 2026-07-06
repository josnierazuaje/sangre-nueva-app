import { useState, useRef } from "react";
import { TICKET_TYPES_V2, fmt$ } from "../constants.js";
import Badge from "./Badge.jsx";
import QRDisplay from "./QRDisplay.jsx";

export default function TicketPreview({ ticket }) {
  const ticketTypeInfo = TICKET_TYPES_V2.find(t => t.key === ticket.ticketType) || TICKET_TYPES_V2[0];
  const qrData = location.origin + location.pathname + "?ticket=" + encodeURIComponent(ticket.id);
  const qrWrapRef = useRef(null);
  const busyRef = useRef(false);
  const [sharing, setSharing] = useState(false);
  const shareText = "Sangre Nueva - La Velada\nEntrada: " + ticketTypeInfo.label + "\nBoleta: #" + ticket.id + "\nA nombre de: " + ticket.attendeeName + "\n\nPresenta este codigo QR en la entrada.";

  async function buildTicketCanvas() {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const scale = 2, W = 960, H = 440;
    const canvas = document.createElement("canvas");
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0a0000"); grad.addColorStop(1, "#180505");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = ticketTypeInfo.color + "80"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.strokeStyle = ticketTypeInfo.color + "30"; ctx.beginPath(); ctx.moveTo(28, 96); ctx.lineTo(W - 28, 96); ctx.stroke();
    ctx.strokeStyle = ticketTypeInfo.color + "20"; ctx.beginPath(); ctx.moveTo(28, H - 56); ctx.lineTo(W - 28, H - 56); ctx.stroke();

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ticketTypeInfo.color; ctx.font = "700 15px 'Barlow Condensed', sans-serif";
    ctx.fillText("🥊 SANGRE NUEVA · LA VELADA", 32, 38);
    ctx.fillStyle = "#e8ddd0"; ctx.font = "400 46px 'Bebas Neue', sans-serif";
    ctx.fillText(ticket.attendeeName.toUpperCase(), 32, 78);

    ctx.textAlign = "right"; ctx.font = "400 32px sans-serif";
    ctx.fillText(ticketTypeInfo.icon, W - 32, 44);
    ctx.fillStyle = ticketTypeInfo.color; ctx.font = "700 15px 'Barlow Condensed', sans-serif";
    ctx.fillText(ticketTypeInfo.label.toUpperCase(), W - 32, 76);
    ctx.textAlign = "left";

    const qrCanvas = qrWrapRef.current?.querySelector("canvas");
    const qrSize = 220, qrX = 32, qrY = 126;
    ctx.fillStyle = "#fff"; ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 12) : ctx.rect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
    ctx.fill();
    if (qrCanvas) ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    const rows = [["Boleta", "#" + ticket.id], ["Precio", fmt$(ticket.price)], ["Pago", ticket.paymentMethod], ["Estado", ticket.status === "ingresado" ? "✓ Ingresado" : "● Activo"]];
    let ry = 150;
    rows.forEach(([label, value]) => {
      ctx.fillStyle = "#9CA3AF"; ctx.font = "400 15px 'Barlow Condensed', sans-serif";
      ctx.fillText(label, qrX + qrSize + 40, ry);
      ctx.fillStyle = label === "Boleta" ? "#e8ddd0" : (label === "Precio" ? ticketTypeInfo.color : (label === "Estado" ? (ticket.status === "ingresado" ? "#4ADE80" : "#FCD34D") : "#e8ddd0"));
      ctx.font = label === "Boleta" ? "400 26px 'Bebas Neue', sans-serif" : "700 17px 'Barlow Condensed', sans-serif";
      ctx.fillText(value, qrX + qrSize + 40, ry + 26);
      ry += 62;
    });

    ctx.fillStyle = "#6B7280"; ctx.font = "700 12px 'Barlow Condensed', sans-serif";
    ctx.fillText("SANGRE NUEVA", 32, H - 24);
    ctx.textAlign = "right"; ctx.fillText("#" + ticket.id, W - 32, H - 24); ctx.textAlign = "left";
    return canvas;
  }

  async function shareTicket() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSharing(true);
    try {
      const canvas = await buildTicketCanvas();
      // Prioridad 1: compartir la imagen vía el menú nativo del dispositivo.
      // Si el usuario elige WhatsApp ahí, la imagen llega adjunta automáticamente
      // (solo tiene que elegir el contacto dentro de WhatsApp).
      if (navigator.canShare && navigator.share) {
        const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
        const file = new File([blob], "entrada-" + ticket.id + ".png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Entrada Sangre Nueva", text: shareText });
          return;
        }
      }
      // Sin soporte para compartir archivos (ej. computadora de escritorio): se
      // descarga la imagen y, si hay teléfono del comprador, se abre directo su
      // chat para pegar el texto (ahí sí hay que adjuntar la imagen a mano).
      const buyerPhone = (ticket.phone || "").replace(/\D/g, "");
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "entrada-" + ticket.id + ".png";
      a.click();
      if (buyerPhone) {
        window.open("https://wa.me/" + buyerPhone + "?text=" + encodeURIComponent(shareText + "\n\n(Adjunta la imagen que se acaba de descargar antes de enviar)"), "_blank");
      } else {
        window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank");
      }
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
      window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank");
      return;
    } finally {
      setSharing(false);
      busyRef.current = false;
    }
  }
  return (
    <div className="space-y-3">
      <div className="rounded-2xl overflow-hidden scale-in" style={{ border: "1px solid " + ticketTypeInfo.color + "50", background: "linear-gradient(135deg,#0a0000,#180505)" }}>
        <div className="px-4 pt-3 pb-2 flex items-center justify-between" style={{ borderBottom: "1px solid " + ticketTypeInfo.color + "25" }}>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: ticketTypeInfo.color }}>🥊 Sangre Nueva · La Velada</p>
            <p className="text-white font-black text-lg leading-tight" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", letterSpacing: "2px" }}>{ticket.attendeeName}</p>
          </div>
          <div className="text-right"><span className="text-2xl">{ticketTypeInfo.icon}</span><p className="text-[10px] font-bold" style={{ color: ticketTypeInfo.color }}>{ticketTypeInfo.label}</p></div>
        </div>
        <div className="flex items-center gap-4 px-4 py-3">
          <div ref={qrWrapRef} className="bg-white rounded-xl p-1.5 flex-shrink-0"><QRDisplay data={qrData} size={96} /></div>
          <div className="flex-1 space-y-2">
            <div className="flex justify-between"><span className="text-gray-400 text-xs">Boleta</span><span className="font-black text-white text-base" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", letterSpacing: "1px" }}>#{ticket.id}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 text-xs">Precio</span><span className="font-bold text-sm" style={{ color: ticketTypeInfo.color }}>{fmt$(ticket.price)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 text-xs">Pago</span><span className="text-white text-xs">{ticket.paymentMethod}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 text-xs">Estado</span>
              <Badge variant="filled" color={ticket.status === "ingresado" ? "#4ADE80" : "#FCD34D"}>{ticket.status === "ingresado" ? "✓ Ingresado" : "● Activo"}</Badge>
            </div>
          </div>
        </div>
        <div className="px-4 pb-2 flex justify-between" style={{ borderTop: "1px solid " + ticketTypeInfo.color + "15" }}>
          <span className="text-[9px] text-gray-600 uppercase tracking-widest">Sangre Nueva</span>
          <span className="text-[9px] text-gray-600">#{ticket.id}</span>
        </div>
      </div>
      <button onClick={shareTicket} type="button" disabled={sharing} className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)" }}>{sharing ? "Preparando imagen..." : "📤 Compartir voucher"}</button>
    </div>
  );
}
