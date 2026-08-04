import { useState, useRef, useEffect, useMemo } from "react";
import { TICKET_TYPES_V2, extractTicketData, verifyTicketToken, ticketQty, findTicketByCode } from "../constants.js";
import { fetchTicket } from "../lib/storage.js";
import CheckInWelcome from "./CheckInWelcome.jsx";

export default function CheckInView({ tickets, onCheckIn, initialCode, initialToken, ticketsEstado = "listo" }) {
  const [input, setInput] = useState(initialCode ? initialCode.toUpperCase() : "");
  const [result, setResult] = useState(null);
  const [verify, setVerify] = useState("ok"); // "ok" | "warn" | "bad" (ver verifyTicketToken)
  const [checking, setChecking] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [already, setAlready] = useState(false); // otra puerta ya marcó este ingreso
  const [justCheckedIn, setJustCheckedIn] = useState(null);
  // El ingreso se aplicó aquí pero el servidor aún no lo confirmó (sin señal).
  // Se dice en la pantalla de bienvenida para que el portero no crea que ya
  // está a salvo en la nube — el reintento es automático.
  const [pendiente, setPendiente] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  // Consultando esa boleta en la nube (no está en la copia de este aparato).
  const [buscando, setBuscando] = useState(false);
  // Varias boletas comparten el número tecleado (p. ej. PRE-0001 y PUE-0001):
  // se listan para que el staff elija, en vez de que la app adivine.
  const [ambiguas, setAmbiguas] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  // Identifica cada intento de startScan(); si stopScan() se llama mientras
  // getUserMedia todavía está pidiendo permiso, este valor cambia y así
  // evitamos activar una cámara que el usuario ya canceló (o que quedó
  // esperando en un componente ya desmontado).
  const scanRequestRef = useRef(null);
  // ¿Se usó el escáner en esta sesión? Decide si tras marcar un ingreso la
  // cámara se reabre sola (ver closeWelcome).
  const usoEscanerRef = useRef(false);
  // Contexto del canvas y marca de la última decodificación: evitan pedir el
  // contexto y decodificar en cada cuadro (ver tick).
  const ctxRef = useRef(null);
  const ultimaLecturaRef = useRef(0);
  // jsQR (≈130 KB) se carga bajo demanda al escanear, no en el bundle inicial:
  // un organizador que solo registra peleadores nunca lo descarga.
  const jsQRRef = useRef(null);

  // manual=true cuando el operador tecleó el id (no escaneó): vía de confianza
  // del staff. En un escaneo (manual=false) el token del QR debe coincidir.
  async function lookup(code, token, manual) {
    setActionErr(""); setAlready(false); setAmbiguas(null);
    const buscado = String(code == null ? "" : code).trim().toUpperCase();
    const { ticket: f, ambiguas } = findTicketByCode(tickets, buscado);
    if (ambiguas) { setAmbiguas(ambiguas); setResult(null); return; }
    if (f) { setResult(f); setVerify(verifyTicketToken(f, token, manual)); return; }
    // No está en la copia local. Antes se declaraba "no encontrada" aquí mismo,
    // sin distinguir tres situaciones muy distintas para el portero:
    if (ticketsEstado === "sin-permiso") { setResult("sin-permiso"); setVerify("ok"); return; }
    // Puede que las boletas aún estén bajando (o que esta se vendiera en otro
    // teléfono hace un segundo): se pregunta por ella directamente a la nube.
    setBuscando(true);
    const remota = await fetchTicket(buscado);
    setBuscando(false);
    if (remota) { setResult(remota); setVerify(verifyTicketToken(remota, token, manual)); return; }
    setResult(ticketsEstado === "cargando" ? "cargando" : "notfound");
    setVerify("ok");
  }
  function search(e) { e.preventDefault(); lookup(input, null, true); }
  async function doIn() {
    if (checking) return;
    if (!(result && typeof result === "object" && result.status === "activo" && verify !== "bad")) return;
    // Sin verificación por QR (id tecleado a mano, o boleta vieja sin token) el
    // ingreso se acepta por CRITERIO del staff, no por el sistema: quien vio el
    // voucher de otra persona podía decir un correlativo cercano y entrar gratis
    // a costa de una entrada pagada. Se pide una confirmación aparte que nombra
    // al titular, y el ingreso queda marcado como manual en el registro.
    const sinQR = verify === "warn";
    if (sinQR && !confirm(`Esta entrada NO se verificó con el QR.\n\nA nombre de: ${result.attendeeName}\nBoleta: #${result.id}\n\nCotéjalo con la persona antes de dejarla pasar (pídele su boleta o un documento).\n\n¿Confirmar el ingreso igual?`)) return;
    setChecking(true); setActionErr("");
    const res = await onCheckIn(result.id, { manual: sinQR });
    setChecking(false);
    if (res && res.already) {
      // Otra puerta marcó el ingreso mientras tanto: no cuenta como nuevo.
      setResult({ ...result, status: "ingresado", checkedInAt: res.ticket?.checkedInAt || null });
      setAlready(true);
      return;
    }
    if (!res || res.error) { setActionErr("No se pudo marcar el ingreso. Revisa la conexión y reintenta."); return; }
    // res.ok (confirmado en el servidor), res.pendiente (sin señal: quedó en
    // cola y se reintenta solo) o res.offline (este aparato no usa la nube).
    const updated = { ...result, status: "ingresado", checkedInAt: res.ticket?.checkedInAt || new Date().toISOString() };
    setResult(updated); setJustCheckedIn(updated); setPendiente(!!(res.pendiente || res.offline));
  }
  // Al despachar a un asistente se vuelve a abrir la cámara sola: "Escanear
  // siguiente" antes solo cerraba la pantalla y había que tocar de nuevo
  // "📷 Escanear QR" y esperar a que arrancara la cámara — cuatro toques por
  // persona y cientos de arranques a lo largo de la noche.
  // Solo se reabre si en esta sesión ya se usó el escáner: a quien valida
  // siempre a mano no se le debe saltar el permiso de cámara sin pedirlo.
  function closeWelcome() {
    setJustCheckedIn(null); setResult(null); setInput(""); setVerify("ok");
    setAlready(false); setActionErr(""); setPendiente(false); setAmbiguas(null);
    if (usoEscanerRef.current) startScan();
  }

  function stopScan() {
    scanRequestRef.current = null;
    setScanning(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(tr => tr.stop()); streamRef.current = null; }
  }
  // Ancho máximo al que se decodifica. Un QR de pantalla de celular se lee de
  // sobra a 640 px; procesar el cuadro completo solo gasta batería y calienta el
  // teléfono, que pasa la noche entera en la puerta.
  const ANCHO_LECTURA = 640;
  // Intentos de decodificación por segundo. Sin tope, jsQR corría en CADA
  // cuadro (hasta 60/s) bloqueando el hilo principal, así que la interfaz —y el
  // propio escaneo— iban a tirones. A 10/s la lectura se siente igual de
  // inmediata y cuesta una fracción.
  const MS_ENTRE_LECTURAS = 100;
  function tick(ahora) {
    rafRef.current = requestAnimationFrame(tick);
    const v = videoRef.current;
    if (!v || v.readyState !== v.HAVE_ENOUGH_DATA) return;
    if (ahora && ultimaLecturaRef.current && ahora - ultimaLecturaRef.current < MS_ENTRE_LECTURAS) return;
    ultimaLecturaRef.current = ahora || 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Se dibuja reducido conservando la proporción.
    const escala = Math.min(1, ANCHO_LECTURA / (v.videoWidth || ANCHO_LECTURA));
    const w = Math.round(v.videoWidth * escala), h = Math.round(v.videoHeight * escala);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; ctxRef.current = null; }
    // El contexto se pide UNA vez y con willReadFrequently: sin esa pista, cada
    // getImageData fuerza una lectura lenta de la GPU a la CPU.
    if (!ctxRef.current) ctxRef.current = canvas.getContext("2d", { willReadFrequently: true });
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const jsQR = jsQRRef.current;
    const code = jsQR ? jsQR(imageData.data, imageData.width, imageData.height) : null;
    if (code && code.data) {
      // Vibración corta al leer: a pleno sol y con ruido de cola, el portero no
      // debería tener que mirar la pantalla para saber que el QR entró.
      try { navigator.vibrate?.(60); } catch (e) {}
      const { id, token } = extractTicketData(code.data);
      setInput(id.toUpperCase());
      lookup(id, token, false);
      stopScan();
    }
  }
  function startScan() {
    setScanErr(""); setResult(null);
    usoEscanerRef.current = true;
    // Carga el lector de QR bajo demanda, en paralelo mientras el usuario
    // concede el permiso de cámara. Si falla, queda "Validar manualmente".
    // Si se publicó una versión nueva mientras esta pestaña estaba abierta, el
    // service worker borra los archivos viejos y este trozo ya no existe en el
    // servidor: la carga falla. Se ofrece recargar de un toque, porque el staff
    // de la puerta no tiene por qué saber que "recargar" es la solución.
    if (!jsQRRef.current) import("jsqr").then(m => { jsQRRef.current = m.default; }).catch(() => setScanErr("actualizar"));
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

  // TODO en un solo useMemo sobre `tickets`. Antes `checked` se recalculaba en
  // cada dibujado, así que el useMemo del registro dependía de una referencia
  // siempre nueva y re-ordenaba en TODOS los renders: con 200-500 ingresados,
  // cada tecla del campo manual reordenaba y repintaba cientos de filas.
  const { checked, peopleIn, peoplePending, pendingCount, checkedInLog } = useMemo(() => {
    const dentro = tickets.filter(t => t.status === "ingresado");
    const porEntrar = tickets.filter(t => t.status === "activo");
    return {
      checked: dentro,
      // Personas (no boletas): una boleta de grupo mete/deja pendientes a varias.
      peopleIn: dentro.reduce((s, t) => s + ticketQty(t), 0),
      peoplePending: porEntrar.reduce((s, t) => s + ticketQty(t), 0),
      pendingCount: porEntrar.length,
      checkedInLog: [...dentro].sort((a, b) => new Date(b.checkedInAt || 0) - new Date(a.checkedInAt || 0)),
    };
  }, [tickets]);
  // El registro completo se pinta en Historial; aquí basta lo reciente. Sin
  // tope, la puerta repintaba cientos de filas en cada cambio.
  const MAX_REGISTRO = 25;
  const registroVisible = checkedInLog.slice(0, MAX_REGISTRO);
  if (justCheckedIn) {
    const ticketTypeInfo = TICKET_TYPES_V2.find(t => t.key === justCheckedIn.ticketType) || TICKET_TYPES_V2[0];
    return <CheckInWelcome ticket={justCheckedIn} ticketTypeInfo={ticketTypeInfo} onClose={closeWelcome} pendiente={pendiente} />;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl p-3 text-center border" style={{ background: "linear-gradient(158deg, rgba(34,197,94,0.08), transparent 48%), linear-gradient(168deg, #14101a, #0b090c)", borderColor: "rgba(34,197,94,0.25)" }}>
          <p className="text-2xl font-black text-green-400" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif" }}>{peopleIn}</p>
          <p className="text-[14px] text-boxing-muted uppercase tracking-[0.18em]">Personas dentro</p>
          <p className="text-[12px] text-boxing-muted mt-0.5" style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{checked.length} boleta{checked.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl p-3 text-center border" style={{ background: "linear-gradient(158deg, rgba(245,158,11,0.08), transparent 48%), linear-gradient(168deg, #14101a, #0b090c)", borderColor: "rgba(245,158,11,0.25)" }}>
          <p className="text-2xl font-black text-yellow-400" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif" }}>{peoplePending}</p>
          <p className="text-[14px] text-boxing-muted uppercase tracking-[0.18em]">Por entrar</p>
          <p className="text-[12px] text-boxing-muted mt-0.5" style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{pendingCount} boleta{pendingCount !== 1 ? "s" : ""}</p>
        </div>
      </div>
      {scanning && <div className="rounded-2xl overflow-hidden relative scale-in" style={{ border: "1px solid rgba(220,38,38,0.4)" }}>
        <video ref={videoRef} playsInline muted className="w-full" style={{ maxHeight: "260px", objectFit: "cover", background: "#000" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div style={{ position: "absolute", inset: 0, border: "2px solid rgba(220,38,38,0.6)", pointerEvents: "none", margin: "14%" }} />
        <button onClick={stopScan} type="button" className="absolute top-2 right-2 px-3 py-1.5 rounded-full text-sm font-bold text-white" style={{ background: "rgba(0,0,0,0.6)" }}>Cancelar</button>
        <p className="absolute bottom-2 left-0 right-0 text-center text-[14px] text-white/80">Apunta al código QR de la entrada</p>
      </div>}
      {!scanning && <button onClick={startScan} type="button" className="btn-primary w-full py-3.5 font-black flex items-center justify-center gap-2" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "18px", letterSpacing: "2px" }}>📷 Escanear QR</button>}
      {scanErr === "actualizar"
        ? <div className="text-center py-3 rounded-2xl space-y-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
            <p className="text-yellow-300 text-sm">Hay una versión nueva de la app. Actualízala para volver a escanear.</p>
            <button type="button" onClick={() => location.reload()} className="btn-gold px-4 py-2 text-sm font-bold tracking-[0.14em] uppercase">Actualizar la app</button>
            <p className="text-gray-500 text-[14px]">Mientras tanto puedes usar "Validar manualmente".</p>
          </div>
        : scanErr && <p className="text-red-400 text-sm text-center">{scanErr}</p>}
      <form onSubmit={search} className="rounded-3xl p-4 space-y-3 border border-white/5" style={{ background: "linear-gradient(170deg, #131016, #0c0a0e)" }}>
        <h3 className="text-boxing-cream" style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: "17px" }}>Validar manualmente</h3>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="PRE-0001 / PUE-0003..." className="input-ink flex-1 px-3 py-2.5 text-sm" />
          <button type="submit" className="btn-gold px-4 py-2.5 text-sm font-bold tracking-[0.14em] uppercase">Buscar</button>
        </div>
      </form>
      {/* `result` puede ser la boleta (objeto) o un estado ("notfound",
          "cargando", "sin-permiso"): solo el objeto pinta la tarjeta. */}
      {result && typeof result === "object" && (() => {
        const ticketTypeInfo = TICKET_TYPES_V2.find(t => t.key === result.ticketType) || TICKET_TYPES_V2[0];
        const cantidad = ticketQty(result);
        const inAt = result.checkedInAt ? new Date(result.checkedInAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : null;
        // QR falsificado: el token no coincide con la boleta. Se bloquea el
        // ingreso; si de verdad es el dueño, el staff puede validar a mano.
        if (verify === "bad") {
          return (
            <div className="rounded-2xl p-4 space-y-2 scale-in text-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.45)" }}>
              <p className="text-red-400 font-black text-lg">⚠️ Código QR inválido</p>
              <p className="text-gray-300 text-sm">El QR no coincide con la boleta <span className="font-bold text-white">#{result.id}</span>. Puede ser una entrada falsificada o duplicada.</p>
              <p className="text-gray-500 text-sm">Si la persona insiste, pide su boleta original y valida el número a mano.</p>
            </div>
          );
        }
        return (
          <div className="rounded-2xl p-4 space-y-3 scale-in" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid " + (result.status === "ingresado" ? "rgba(34,197,94,0.4)" : "rgba(245,158,11,0.35)") }}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{result.status === "ingresado" ? "✅" : "🎫"}</span>
              <div><p className="text-white font-bold">{result.attendeeName}</p><p className="text-sm text-gray-400">#{result.id} · <span style={{ color: ticketTypeInfo.color }}>{ticketTypeInfo.label}</span></p></div>
            </div>
            {cantidad > 1 &&
              <p className="text-center font-black py-2 rounded-lg" style={{ background: "rgba(200,160,74,0.14)", color: "#e3c07a", letterSpacing: "0.04em" }}>👥 Admite {cantidad} personas</p>}
            {verify === "warn" && result.status === "activo" &&
              <p className="text-yellow-300/90 text-sm text-center py-1.5 rounded-lg" style={{ background: "rgba(245,158,11,0.1)" }}>⚠️ Sin verificación por QR — coteja la identidad antes de marcar</p>}
            {result.status === "ingresado"
              ? (already
                  ? <p className="text-yellow-300 text-sm font-bold text-center py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.12)" }}>⚠️ Otra puerta ya marcó este ingreso{inAt ? " (" + inAt + ")" : ""}</p>
                  : <p className="text-green-400 text-sm font-bold text-center py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.1)" }}>✓ Ya registrado como ingresado{inAt ? " (" + inAt + ")" : ""}</p>)
              : <button onClick={doIn} disabled={checking} className="w-full py-3 rounded-2xl font-black text-white transition-all active:scale-95 disabled:opacity-60" style={{ background: verify === "warn" ? "linear-gradient(135deg,#B45309,#92400E)" : "linear-gradient(135deg,#16A34A,#15803D)", fontFamily: "'Bebas Neue',Impact,sans-serif", fontSize: "18px", letterSpacing: "3px" }}>{checking ? "MARCANDO..." : verify === "warn" ? "⚠️ INGRESO SIN QR" : "✅ MARCAR INGRESO"}</button>
            }
            {actionErr && <p className="text-red-400 text-sm text-center">{actionErr}</p>}
          </div>
        );
      })()}
      {buscando && <div className="text-center py-4 rounded-2xl scale-in" style={{ background: "rgba(200,160,74,0.07)", border: "1px solid rgba(200,160,74,0.22)" }}><p className="text-boxing-cream font-bold">Consultando la boleta…</p></div>}
      {/* Tres avisos distintos donde antes había uno solo. "No encontrada" ahora
          significa de verdad que no existe: las otras dos causas (todavía
          cargando, o esta cuenta sin permiso para leer las boletas) se dicen
          aparte para que nadie rechace en la puerta una entrada legítima. */}
      {ambiguas && <div className="rounded-2xl p-3 space-y-2 scale-in" style={{ background: "rgba(200,160,74,0.07)", border: "1px solid rgba(200,160,74,0.28)" }}>
        <p className="text-boxing-cream text-sm text-center">Ese número lo tienen {ambiguas.length} entradas de distinto tipo. ¿Cuál es?</p>
        <div className="flex flex-col gap-1.5">{ambiguas.map(t => {
          const tt = TICKET_TYPES_V2.find(x => x.key === t.ticketType) || TICKET_TYPES_V2[0];
          return <button key={t.id} type="button" onClick={() => { setInput(t.id.toUpperCase()); lookup(t.id, null, true); }} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-colors" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="text-white text-sm truncate">{t.attendeeName}</span>
            <span className="text-[14px] flex-shrink-0" style={{ color: tt.color }}>#{t.id}</span>
          </button>;
        })}</div>
      </div>}
      {result === "cargando" && <div className="text-center py-4 rounded-2xl scale-in" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
        <p className="text-yellow-300 font-bold">⏳ Todavía cargando las entradas</p>
        <p className="text-gray-400 text-sm mt-1">No la rechaces: espera unos segundos con señal y vuelve a escanear.</p></div>}
      {result === "sin-permiso" && <div className="text-center py-4 rounded-2xl scale-in" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.45)" }}>
        <p className="text-red-400 font-bold">⚠️ Esta cuenta no puede leer las entradas</p>
        <p className="text-gray-300 text-sm mt-1">No es culpa de la boleta. Avísale al organizador para que dé permiso a esta cuenta.</p></div>}
      {result === "notfound" && <div className="text-center py-4 rounded-2xl scale-in" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}><p className="text-red-400 font-bold">❌ Boleta no encontrada</p><p className="text-gray-500 text-sm mt-1">Verifica el número ingresado</p></div>}
      {checkedInLog.length > 0 && <div><p className="text-[14px] text-boxing-muted uppercase tracking-[0.22em] mb-2">Registro de ingresos ({checkedInLog.length})</p>
        <div className="space-y-1.5">{registroVisible.map(t => {
          const ticketTypeInfo = TICKET_TYPES_V2.find(x => x.key === t.ticketType) || TICKET_TYPES_V2[0];
          const time = t.checkedInAt ? new Date(t.checkedInAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--:--";
          return <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.12)" }}><div className="flex items-center gap-2 min-w-0"><span style={{ color: ticketTypeInfo.color }}>{ticketTypeInfo.icon}</span><span className="text-white text-sm truncate">{t.attendeeName}</span>{ticketQty(t) > 1 && <span className="text-[13px] font-semibold flex-shrink-0" style={{ color: "#e3c07a" }}>×{ticketQty(t)}</span>}</div><div className="flex items-center gap-2 flex-shrink-0"><span className="text-[14px] text-gray-500">{time}</span><span className="text-[14px] text-green-400">#{t.id}</span></div></div>;
        })}</div>
      </div>}
    </div>
  );
}
