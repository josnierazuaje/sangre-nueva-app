import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { FB } from "../lib/firebase.js";

// PANTALLA DE INICIO DE SESIÓN
// ============================================
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function submit(e) {
    e.preventDefault();
    setErr(""); setResetSent(false); setLoading(true);
    signInWithEmailAndPassword(FB.auth, email.trim(), pass).catch(e => {
      const msg = (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found") ? "Correo o contraseña incorrectos." : "Error: " + e.message;
      setErr(msg);
    }).finally(() => setLoading(false));
  }
  function resetPw() {
    setErr(""); setResetSent(false);
    if (!email.trim()) { setErr("Escribe tu correo arriba y toca de nuevo este enlace."); return; }
    sendPasswordResetEmail(FB.auth, email.trim()).then(() => setResetSent(true)).catch(e => setErr("Error: " + e.message));
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      {/* Panel de tinta: mismo degradado y borde tenue que los paneles del
          rediseño — la marca preside como en el sidebar de escritorio. */}
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl p-6 space-y-4" style={{ background: "linear-gradient(170deg,#131016,#0c0a0e)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-center mb-2">
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, fontSize: "14px", letterSpacing: "0.35em", textTransform: "uppercase", color: "rgba(138,132,148,0.85)", marginBottom: "12px" }}>Azuaje Team &amp; HH Arias</div>
          <img src="/assets/logo-sangre-nueva.png" alt="Sangre Nueva" style={{ width: "86px", height: "auto", display: "block", margin: "0 auto 10px", filter: "drop-shadow(0 10px 28px rgba(155,26,42,0.4))" }} />
          <div className="marca-oro" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "28px", letterSpacing: "0.14em", lineHeight: 1 }}>SANGRE NUEVA</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontSize: "14.5px", color: "rgba(200,160,74,0.9)", marginTop: "3px" }}>La Velada</div>
          <div className="mt-3 text-[14px] font-semibold text-boxing-muted tracking-[0.3em] uppercase">Acceso privado</div>
        </div>
        <div><label className="block text-[14px] font-semibold text-boxing-muted mb-1.5 tracking-[0.3em] uppercase">Correo</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" className="input-ink w-full px-3 py-2.5 text-base" /></div>
        <div><label className="block text-[14px] font-semibold text-boxing-muted mb-1.5 tracking-[0.3em] uppercase">Contraseña</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} required autoComplete="current-password" className="input-ink w-full px-3 py-2.5 text-base" /></div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        {resetSent && <p className="text-green-400 text-sm">Te enviamos un correo para restablecer tu contraseña.</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3.5" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "20px", letterSpacing: "0.1em" }}>
          {loading ? "Entrando..." : "Iniciar Sesión"}
        </button>
        <button type="button" onClick={resetPw} className="w-full text-center text-boxing-muted text-sm tracking-wide hover:text-boxing-goldFight transition-colors">¿Olvidaste tu contraseña?</button>
      </form>
    </div>
  );
}
