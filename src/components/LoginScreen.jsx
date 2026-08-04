import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { FB } from "../lib/firebase.js";

// PANTALLA DE INICIO DE SESIÓN
// ============================================
export default function LoginScreen({ scanMode = false, initialEmail = "" }) {
  const [email, setEmail] = useState(initialEmail);
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Red de seguridad: si este dispositivo quedó con la nube desconectada, no hay
  // con qué autenticar y el login fallaría con un error incomprensible, dejando
  // el aparato inservible sin forma de volver desde la app. Se ofrece reconectar
  // de un toque.
  const sinNube = !FB.auth;
  function reconectar() {
    try { localStorage.removeItem("bm_fb_disabled"); } catch (e) {}
    location.reload();
  }
  function submit(e) {
    e.preventDefault();
    if (sinNube) { reconectar(); return; }
    setErr(""); setResetSent(false); setLoading(true);
    signInWithEmailAndPassword(FB.auth, email.trim(), pass).catch(e => {
      // Sin traducir, un fallo de red en la puerta mostraba el código técnico de
      // Firebase en inglés: el staff no distinguía "no hay internet, busca
      // señal" de "clave mala" y gastaba intentos hasta que la cuenta se
      // bloqueaba por demasiados reintentos.
      const msg = (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found") ? "Correo o contraseña incorrectos."
        : e.code === "auth/network-request-failed" ? "Sin conexión a internet. Acércate a donde haya señal y reintenta."
        : e.code === "auth/too-many-requests" ? "Demasiados intentos. Espera un minuto y vuelve a probar."
        : e.code === "auth/invalid-email" ? "El correo no está bien escrito."
        : "Error: " + e.message;
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
          <div className="mt-3 text-[14px] font-semibold text-boxing-muted tracking-[0.3em] uppercase">{scanMode ? "Escáner de entradas" : "Acceso privado"}</div>
          {scanMode && <p className="mt-2 text-[13px] text-boxing-muted/90 leading-snug">Ingresa la clave del escáner para validar entradas en la puerta.</p>}
        </div>
        <div><label className="block text-[14px] font-semibold text-boxing-muted mb-1.5 tracking-[0.3em] uppercase">Correo</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required readOnly={scanMode} autoComplete="username" className={"input-ink w-full px-3 py-2.5 text-base" + (scanMode ? " opacity-70" : "")} /></div>
        <div><label className="block text-[14px] font-semibold text-boxing-muted mb-1.5 tracking-[0.3em] uppercase">{scanMode ? "Clave del escáner" : "Contraseña"}</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} required autoFocus={scanMode} autoComplete="current-password" className="input-ink w-full px-3 py-2.5 text-base" /></div>
        {sinNube && <p className="text-yellow-300/90 text-sm text-center py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.1)" }}>
          Este dispositivo tiene la nube desconectada, así que no puede iniciar sesión. Toca el botón para reconectarlo.
        </p>}
        {err && <p className="text-red-400 text-sm">{err}</p>}
        {resetSent && <p className="text-green-400 text-sm">Te enviamos un correo para restablecer tu contraseña.</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3.5" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "20px", letterSpacing: "0.1em" }}>
          {sinNube ? "Reconectar" : loading ? "Entrando..." : (scanMode ? "Entrar a escanear" : "Iniciar Sesión")}
        </button>
        {!scanMode && <button type="button" onClick={resetPw} className="w-full text-center text-boxing-muted text-sm tracking-wide hover:text-boxing-goldFight transition-colors">¿Olvidaste tu contraseña?</button>}
        {/* Salida del modo escáner desde el login: olvida el modo en este
            dispositivo y vuelve al acceso normal. Es la vía para el dueño que
            abrió "?scan=1" por error y no tiene la clave del escáner. */}
        {scanMode && <button type="button" onClick={() => { try { localStorage.removeItem("bm_scan_mode"); } catch (e) {} location.href = location.pathname; }} className="w-full text-center text-boxing-muted text-sm tracking-wide hover:text-boxing-goldFight transition-colors">Acceso normal (no soy del staff)</button>}
      </form>
    </div>
  );
}
