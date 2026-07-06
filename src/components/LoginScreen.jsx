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
      <form onSubmit={submit} className="w-full max-w-sm bg-boxing-panel border border-boxing-line p-6 space-y-4">
        <div className="text-center mb-2">
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "30px", letterSpacing: "0.05em", color: "#e8ddd0" }}>SANGRE NUEVA</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontSize: "14px", color: "#c8a04a", letterSpacing: "0.1em" }}>La Velada</div>
          <div className="mt-3 text-[10px] font-semibold text-boxing-muted tracking-[0.3em] uppercase">Acceso privado</div>
        </div>
        <div><label className="block text-[10px] font-semibold text-boxing-muted mb-1.5 tracking-[0.3em] uppercase">Correo</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" className="w-full px-3 py-2.5 bg-black border border-boxing-lineBright rounded-none text-boxing-cream placeholder-boxing-muted focus:outline-none focus:border-boxing-goldDim text-base" /></div>
        <div><label className="block text-[10px] font-semibold text-boxing-muted mb-1.5 tracking-[0.3em] uppercase">Contraseña</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} required autoComplete="current-password" className="w-full px-3 py-2.5 bg-black border border-boxing-lineBright rounded-none text-boxing-cream placeholder-boxing-muted focus:outline-none focus:border-boxing-goldDim text-base" /></div>
        {err && <p className="text-red-400 text-xs">{err}</p>}
        {resetSent && <p className="text-green-400 text-xs">Te enviamos un correo para restablecer tu contraseña.</p>}
        <button type="submit" disabled={loading} className="w-full bg-boxing-crimson hover:bg-boxing-crimsonLight text-boxing-cream py-3.5 transition-colors active:scale-[0.98] disabled:opacity-60" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "20px", letterSpacing: "0.1em" }}>
          {loading ? "Entrando..." : "Iniciar Sesión"}
        </button>
        <button type="button" onClick={resetPw} className="w-full text-center text-boxing-muted text-xs tracking-wide hover:text-boxing-goldFight transition-colors">¿Olvidaste tu contraseña?</button>
      </form>
    </div>
  );
}
