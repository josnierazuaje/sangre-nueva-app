import { useEffect } from "react";
import Badge from "./Badge.jsx";

// ============================================
// PANTALLA DE BIENVENIDA AL VALIDAR UNA ENTRADA
// ============================================
export default function CheckInWelcome({ ticket, ticketTypeInfo, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "linear-gradient(160deg,#000000 0%,#0a0703 45%,#1a1206 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", textAlign: "center" }} className="scale-in">
      <img src="/assets/logo-sangre-nueva.png" alt="Sangre Nueva" style={{ height: "110px", width: "auto", objectFit: "contain", filter: "drop-shadow(0 0 20px rgba(200,160,74,0.4))", marginBottom: "22px" }} />
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "14px", fontWeight: 700, letterSpacing: "0.35em", color: "#c8a04a" }}>✓ ENTRADA VÁLIDA</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(28px,7vw,40px)", letterSpacing: "0.04em", color: "#e8ddd0", lineHeight: 1.1, marginTop: "6px" }}>¡BIENVENIDO A<br />LA VELADA!</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontSize: "22px", color: "#e8ddd0", marginTop: "16px" }}>{ticket.attendeeName}</div>
      <div style={{ marginTop: "12px" }}><Badge color={ticketTypeInfo.color}>{ticketTypeInfo.icon} {ticketTypeInfo.label} · #{ticket.id}</Badge></div>
      {/* Único protagonista de la pantalla: el CTA carmesí del sistema */}
      <button onClick={onClose} type="button" className="btn-primary active:scale-95 transition-transform" style={{ marginTop: "36px", padding: "14px 40px", fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.1em", cursor: "pointer" }}>Escanear siguiente</button>
    </div>
  );
}
