import { useState, useRef, useEffect, useMemo } from "react";
import { TICKET_TYPES_V2, extractTicketData, verifyTicketToken } from "../constants.js";
import CheckInWelcome from "./CheckInWelcome.jsx";

export default function CheckInView({ tickets, onCheckIn, initialCode, initialToken }) {
  const [input, setInput] = useState(initialCode ? initialCode.toUpperCase() : "");
  const [result, setResult] = useState(null);
  const [verify, setVerify] = useState("ok"); // "ok" | "warn" | "bad" (ver verifyTicketToken)
  const [checking, setChecking] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [already, setAlready] = useState(false); // otra puerta ya marcó este ingreso
  const [justCheckedIn, setJustCheckedIn] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  // Identifica cada intento de startScan(); si stopScan() se llama mientras
  // getUserMedia todavía está pidiendo permiso, este valor cambia y así
  // evitamos activar una cámara que el usuario ya canceló (o que quedó
  // esperando en un componente ya desmontado).
  const scanRequestRef = useRef(null);
  // jsQR (≈130 KB) se carga bajo demanda al escanear, no en el bundle inicial:
  // un organizador que solo registra peleadores nunca lo descarga.
  const jsQRRef = useRef(null);

  // manual=true cuando el operador tecleó el id (no escaneó): vía de confianza
  // del staff. En un escaneo (manual=false) el token del QR debe coincidir.
  function lookup(code, token, manual) {
    setActionErr(""); setAlready(false);
    const f = tickets.find(t => t.id.toUpperCase() === String(code).trim().toUpperCase());
    if (!f) { setResult("notfound"); setVerify("ok"); return; }
    setResult(f); setVerify(verifyTicketToken(f, token, manual));
  }
  function search(e) { e.preventDefault(); lookup(input, null, true); }
  async function doIn() {
    if (checking) return;
    if (!(result && result !== "notfound" && result.status === "activo" && verify !== "bad")) return;
    setChecking(true); setActionErr("");
    const res = await onCheckIn(result.id);
    setChecking(false);
    if (res && res.already) {
      // Otra puerta marcó el ingreso mientras tanto: no cuenta como nuevo.
      setResult({ ...result, status: "ingresado", checkedInAt: res.ticket?.checkedInAt || null });
      setAlready(true);
      return;
    }
    if (!res || res.error) { setActionErr("No se pudo marcar el ingreso. Revisa la conexión y reintenta."); return; }
    // res.ok (confirmado en el servidor) o res.offline (optimista, sin red)
    const updated = { ...result, status: "ingresado", checkedInAt: res.ticket?.checkedInAt || new Date().toISOString() };
    setResult(updated); setJustCheckedIn(updated);
  }
  function closeWelcome() { setJustCheckedIn(null); setResult(null); setInput(""); setVerify("ok"); setAlready(false); setActionErr(""); }

  function stopScan() {
    scanRequestRef.current = null;
    setScanning(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(tr => tr.stop()); streamRef.current = null; }
  }
  function tick() {
    const v = videoRef.current;
    if (!v || v.readyState !== v.HAVE_ENOUGH_DATA) { rafRef.current = requestAnimationFrame(tick); return; }
    const canvas = canvasRef.current;
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const jsQR = jsQRRef.current;
    const code = jsQR ? jsQR(imageData.data, imageData.width, imageData.height) : null;
    if (code && code.data) {
      const { id, token } = extractTicketData(code.data);
      setInput(id.toUpperCase());
      lookup(id, token, false);
      stopScan();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }
  function startScan() {
    setScanErr(""); setResult(null);
    // Carga el lector de QR bajo demanda, en paralelo mientras el usuario
    // concede el permiso de cámara. Si falla, queda "Validar manualmente".
    if (!jsQRRef.current) import("jsqr").then(m => { jsQRRef.current = m.default; }).catch(e => setScanErr("No se pudo cargar el lector de QR. Usa 'Validar manualmente'. " + e.message));
    const requestId = {};
    scanRequestRef.current = requestId;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
      if (scanRequestRef.current !== requestId) {
        // Se canceló o se desmontó mientras el navegador pedía permiso: no dejar la cámara prendida.
        stream.getTracks().forEach(tr => tr.stop());
        return;
      }
      streamRef.current = stream;
      setScanning(true);
    }).catch(e => { if (scanRequestRef.current === requestId) setScanErr("No se pudo acceder a la cámara: " + e.message); });
  }
  // Espera a que React realmente monte el <video> (cuando scanning pasa a true)
  // antes de asignarle la cámara — hacerlo antes causaba pantalla negra en
  // algunos celulares porque el elemento todavía no existía en el DOM.
  useEffect(() => {
    if (scanning && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => console.error("No se pudo reproducir el video de la cámara:", e));
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [scanning]);
  useEffect(() => () => stopScan(), []);
  // Arranque desde la URL (?ticket=&t=): un QR abierto con la cámara del
  // teléfono. Trae token, así que se valida como un escaneo (manual=false).
  useEffect(() => { if (initialCode) lookup(initialCode, initialToken, false); }, []);

  const checked = tickets.filter(t => t.status === "ingresado");
  const pending = tickets.filter(t => t.status === "activo");
  const checkedInLog = useMemo(() => [...checked].sort((a, b) => new Date(b.checkedInAt || 0) - new Date(a.checkedInAt || 0)), [checked]);
  if (justCheckedIn) {
    const ticketTypeInfo = TICKET_TYPES_V2.find(t => t.key === justCheckedIn.ticketType) || TICKET_TYPES_V2[0];
    return <CheckInWelcome ticket={justCheckedIn} ticketTypeInfo={ticketTypeInfo} onClose={closeWelcome} />;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl p-3 text-center border" style={{ background: "linear-gradient(158deg, rgba(34,197,94,0.08), transparent 48%), linear-gradient(168deg, #14101a, #0b090c)", borderColor: "rgba(34,197,94,0.25)" }}>
          <p className="text-2xl font-black text-green-400" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif" }}>{checked.length}</p>
          <p className="text-[10px] text-boxing-muted uppercase tracking-[0.18em]">Ingresados</p>
        </div>
        <div className="rounded-2xl p-3 text-center border" style={{ background: "linear-gradient(158deg, rgba(245,158,11,0.08), transparent 48%), linear-gradient(168deg, #14101a, #0b090c)", borderColor: "rgba(245,158,11,0.25)" }}>
          <p className="text-2xl font-black text-yellow-400" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif" }}>{pending.length}</p>
          <p className="text-[10px] text-boxing-muted uppercase tracking-[0.18em]">Pendientes</p>
        </div>
      </div>
      {scanning && <div className="rounded-2xl overflow-hidden relative scale-in" style={{ border: "1px solid rgba(220,38,38,0.4)" }}>
        <video ref={videoRef} playsInline muted className="w-full" style={{ maxHeight: "260px", objectFit: "cover", background: "#000" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div style={{ position: "absolute", inset: 0, border: "2px solid rgba(220,38,38,0.6)", pointerEvents: "none", margin: "14%" }} />
        <button onClick={stopScan} type="button" className="absolute top-2 right-2 px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: "rgba(0,0,0,0.6)" }}>Cancelar</button>
        <p className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-white/80">Apunta al código QR de la entrada</p>
      </div>}
      {!scanning && <button onClick={startScan} type="button" className="btn-primary w-full py-3.5 font-black flex items-center justify-center gap-2" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "18px", letterSpacing: "2px" }}>📷 Escanear QR</button>}
      {scanErr && <p className="text-red-400 text-xs text-center">{scanErr}</p>}
      <form onSubmit={search} className="rounded-3xl p-4 space-y-3 border border-white/5" style={{ background: "linear-gradient(170deg, #131016, #0c0a0e)" }}>
        <h3 className="text-boxing-cream" style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: "17px" }}>Validar manualmente</h3>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="PRE-0001 / PUE-0003..." className="input-ink flex-1 px-3 py-2.5 text-sm" />
          <button type="submit" className="btn-gold px-4 py-2.5 text-sm font-bold tracking-[0.14em] uppercase">Buscar</button>
        </div>
      </form>
      {result && result !== "notfound" && (() => {
        const ticketTypeInfo = TICKET_TYPES_V2.find(t => t.key === result.ticketType) || TICKET_TYPES_V2[0];
        const inAt = result.checkedInAt ? new Date(result.checkedInAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : null;
        // QR falsificado: el token no coincide con la boleta. Se bloquea el
        // ingreso; si de verdad es el dueño, el staff puede validar a mano.
        if (verify === "bad") {
          return (
            <div className="rounded-2xl p-4 space-y-2 scale-in text-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.45)" }}>
              <p className="text-red-400 font-black text-lg">⚠️ Código QR inválido</p>
              <p className="text-gray-300 text-sm">El QR no coincide con la boleta <span className="font-bold text-white">#{result.id}</span>. Puede ser una entrada falsificada o duplicada.</p>
              <p className="text-gray-500 text-xs">Si la persona insiste, pide su boleta original y valida el número a mano.</p>
            </div>
          );
        }
        return (
          <div className="rounded-2xl p-4 space-y-3 scale-in" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid " + (result.status === "ingresado" ? "rgba(34,197,94,0.4)" : "rgba(245,158,11,0.35)") }}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{result.status === "ingresado" ? "✅" : "🎫"}</span>
              <div><p className="text-white font-bold">{result.attendeeName}</p><p className="text-xs text-gray-400">#{result.id} · <span style={{ color: ticketTypeInfo.color }}>{ticketTypeInfo.label}</span></p></div>
            </div>
            {verify === "warn" && result.status === "activo" &&
              <p className="text-yellow-300/90 text-xs text-center py-1.5 rounded-lg" style={{ background: "rgba(245,158,11,0.1)" }}>⚠️ Sin verificación por QR — coteja la identidad antes de marcar</p>}
            {result.status === "ingresado"
              ? (already
                  ? <p className="text-yellow-300 text-sm font-bold text-center py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.12)" }}>⚠️ Otra puerta ya marcó este ingreso{inAt ? " (" + inAt + ")" : ""}</p>
                  : <p className="text-green-400 text-sm font-bold text-center py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.1)" }}>✓ Ya registrado como ingresado{inAt ? " (" + inAt + ")" : ""}</p>)
              : <button onClick={doIn} disabled={checking} className="w-full py-3 rounded-2xl font-black text-white transition-all active:scale-95 disabled:opacity-60" style={{ background: "linear-gradient(135deg,#16A34A,#15803D)", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "18px", letterSpacing: "3px" }}>{checking ? "MARCANDO..." : "✅ MARCAR INGRESO"}</button>
            }
            {actionErr && <p className="text-red-400 text-xs text-center">{actionErr}</p>}
          </div>
        );
      })()}
      {result === "notfound" && <div className="text-center py-4 rounded-2xl scale-in" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}><p className="text-red-400 font-bold">❌ Boleta no encontrada</p><p className="text-gray-500 text-xs mt-1">Verifica el número ingresado</p></div>}
      {checkedInLog.length > 0 && <div><p className="text-[10px] text-boxing-muted uppercase tracking-[0.22em] mb-2">Registro de ingresos ({checkedInLog.length})</p>
        <div className="space-y-1.5">{checkedInLog.map(t => {
          const ticketTypeInfo = TICKET_TYPES_V2.find(x => x.key === t.ticketType) || TICKET_TYPES_V2[0];
          const time = t.checkedInAt ? new Date(t.checkedInAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--:--";
          return <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.12)" }}><div className="flex items-center gap-2 min-w-0"><span style={{ color: ticketTypeInfo.color }}>{ticketTypeInfo.icon}</span><span className="text-white text-sm truncate">{t.attendeeName}</span></div><div className="flex items-center gap-2 flex-shrink-0"><span className="text-[10px] text-gray-500">{time}</span><span className="text-[10px] text-green-400">#{t.id}</span></div></div>;
        })}</div>
      </div>}
    </div>
  );
}
