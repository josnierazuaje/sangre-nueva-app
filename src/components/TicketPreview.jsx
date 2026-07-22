import { useState, useRef, useEffect } from "react";
import QRCode from "qrcode";
import { TICKET_TYPES_V2, fmt$ } from "../constants.js";
import { waUrl } from "../lib/whatsapp.js";
import Badge from "./Badge.jsx";
import QRDisplay from "./QRDisplay.jsx";

// Verde oficial de WhatsApp.
const WA_VERDE = "#25D366";
// Glifo de WhatsApp (viewBox 24×24), para que el botón se reconozca de un vistazo.
const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z";

// Dibuja un rectángulo redondeado (roundRect no existe en navegadores viejos).
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function TicketPreview({ ticket }) {
  const ticketTypeInfo = TICKET_TYPES_V2.find(t => t.key === ticket.ticketType) || TICKET_TYPES_V2[0];
  const qrData = location.origin + location.pathname + "?ticket=" + encodeURIComponent(ticket.id) + (ticket.token ? "&t=" + encodeURIComponent(ticket.token) : "");
  const busyRef = useRef(false);
  const listoRef = useRef(null);   // voucher ya dibujado, listo para compartir al instante
  const [sharing, setSharing] = useState(false);
  const [aviso, setAviso] = useState(null);
  const shareText = "Sangre Nueva - La Velada\nEntrada: " + ticketTypeInfo.label + "\nBoleta: #" + ticket.id + "\nA nombre de: " + ticket.attendeeName + "\n\nPresenta este codigo QR en la entrada.";
  // Mismo símbolo que la píldora de la tarjeta en pantalla (✓ / ●).
  const estadoTexto = ticket.status === "ingresado" ? "✓ INGRESADO" : "● ACTIVO";
  const estadoColor = ticket.status === "ingresado" ? "#4ADE80" : "#FCD34D";

  // QR NUEVO y grande solo para la imagen que se comparte. Antes se reutilizaba
  // el <canvas> de 96px de la tarjeta en pantalla y se estiraba a 3-4 veces su
  // tamaño: por eso el voucher compartido salía pixelado. Aquí se genera a
  // 720px y se DIBUJA MÁS CHICO, que es lo que deja el código nítido.
  function buildQrCanvas(px) {
    return new Promise((resolve, reject) => {
      const c = document.createElement("canvas");
      QRCode.toCanvas(c, qrData || " ", { width: px, margin: 0, color: { dark: "#000000", light: "#ffffff" } }, e => e ? reject(e) : resolve(c));
    });
  }

  // Reproduce EXACTAMENTE la tarjeta que se ve en pantalla (mismos datos, mismo
  // orden, mismos colores: etiqueta a la izquierda y valor alineado a la
  // derecha, con el Estado como píldora). Se dibuja a mano en un canvas —en vez
  // de rasterizar el DOM— para poder exportarla a la resolución que haga falta
  // sin depender de librerías.
  async function buildTicketCanvas() {
    // Las tipografías propias son @font-face: si nadie las pidió todavía, el
    // canvas caería a una fuente genérica y la imagen no se parecería a la
    // tarjeta. Se piden explícitamente antes de dibujar.
    if (document.fonts) {
      try {
        await Promise.all([
          document.fonts.load("400 30px 'Bebas Neue'"),
          document.fonts.load("700 13px 'Barlow Condensed'"),
          document.fonts.load("400 13px 'Barlow Condensed'"),
        ]);
        await document.fonts.ready;
      } catch { /* si falla, se dibuja con lo que haya */ }
    }
    // Alto suficiente para que la línea del pie NO cruce el QR ni la píldora de
    // Estado: QR 90→202, píldora 189→210, línea del pie en 222.
    const W = 920, H = 250, ESC = 3;          // 2760×750 px reales: nítido en WhatsApp
    const PAD = 26;
    const col = ticketTypeInfo.color;
    const canvas = document.createElement("canvas");
    canvas.width = W * ESC; canvas.height = H * ESC;
    const ctx = canvas.getContext("2d");
    ctx.scale(ESC, ESC);

    // Fondo y marco, como la tarjeta.
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0a0000"); grad.addColorStop(1, "#180505");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = col + "50"; ctx.lineWidth = 1.5;
    roundRect(ctx, 1, 1, W - 2, H - 2, 14); ctx.stroke();

    ctx.textBaseline = "alphabetic";

    // ---- Encabezado ----
    ctx.fillStyle = col; ctx.font = "700 13px 'Barlow Condensed', sans-serif";
    ctx.fillText("🥊 SANGRE NUEVA · LA VELADA", PAD, 32);

    // El nombre se achica (y como último recurso se recorta) para no chocar
    // NUNCA con el tipo de entrada de la esquina derecha: hay asistentes con
    // nombre y dos apellidos largos.
    ctx.font = "700 13px 'Barlow Condensed', sans-serif";
    const anchoTipo = Math.max(ctx.measureText(ticketTypeInfo.label).width, 44);
    const anchoNombre = W - PAD * 2 - anchoTipo - 24;
    let nombre = String(ticket.attendeeName || "").toUpperCase();
    let tam = 34;
    ctx.font = "400 " + tam + "px 'Bebas Neue', sans-serif";
    while (ctx.measureText(nombre).width > anchoNombre && tam > 20) {
      tam -= 2;
      ctx.font = "400 " + tam + "px 'Bebas Neue', sans-serif";
    }
    if (ctx.measureText(nombre).width > anchoNombre) {
      while (nombre.length > 4 && ctx.measureText(nombre + "…").width > anchoNombre) nombre = nombre.slice(0, -1);
      nombre = nombre.trimEnd() + "…";
    }
    ctx.fillStyle = "#f2edf4";
    ctx.fillText(nombre, PAD, 66);

    ctx.textAlign = "right";
    ctx.font = "400 22px sans-serif";
    ctx.fillText(ticketTypeInfo.icon, W - PAD, 34);
    ctx.fillStyle = col; ctx.font = "700 13px 'Barlow Condensed', sans-serif";
    ctx.fillText(ticketTypeInfo.label, W - PAD, 60);
    ctx.textAlign = "left";

    ctx.strokeStyle = col + "25"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 78); ctx.lineTo(W - PAD, 78); ctx.stroke();

    // ---- QR (nítido: se genera grande y se dibuja chico) ----
    const qrBox = 112, qrX = PAD, qrY = 90, qrPad = 7;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qrX, qrY, qrBox, qrBox, 10); ctx.fill();
    const qrCanvas = await buildQrCanvas(720);
    ctx.drawImage(qrCanvas, qrX + qrPad, qrY + qrPad, qrBox - qrPad * 2, qrBox - qrPad * 2);

    // ---- Filas: etiqueta a la izquierda, valor a la derecha ----
    const filas = [
      ["Boleta", "#" + ticket.id, "#f2edf4", "400 24px 'Bebas Neue', sans-serif"],
      ["Precio", fmt$(ticket.price), col, "700 16px 'Barlow Condensed', sans-serif"],
      ["Pago", ticket.paymentMethod || "", "#f2edf4", "700 16px 'Barlow Condensed', sans-serif"],
    ];
    const labelX = qrX + qrBox + 26;
    const valueX = W - PAD;
    let y = 114;
    filas.forEach(([label, value, color, font]) => {
      ctx.fillStyle = "#9CA3AF"; ctx.font = "400 14px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "left"; ctx.fillText(label, labelX, y);
      ctx.fillStyle = color; ctx.font = font;
      ctx.textAlign = "right"; ctx.fillText(value, valueX, y);
      y += 30;
    });

    // Estado como píldora (igual que el Badge de la tarjeta).
    ctx.fillStyle = "#9CA3AF"; ctx.font = "400 14px 'Barlow Condensed', sans-serif";
    ctx.textAlign = "left"; ctx.fillText("Estado", labelX, y);
    ctx.font = "700 13px 'Barlow Condensed', sans-serif";
    const tw = ctx.measureText(estadoTexto).width;
    const pw = tw + 22, ph = 21, px = valueX - pw, py = y - 15;
    ctx.fillStyle = estadoColor + "26";
    roundRect(ctx, px, py, pw, ph, ph / 2); ctx.fill();
    ctx.strokeStyle = estadoColor + "66"; ctx.lineWidth = 1;
    roundRect(ctx, px, py, pw, ph, ph / 2); ctx.stroke();
    ctx.fillStyle = estadoColor;
    ctx.textAlign = "center"; ctx.fillText(estadoTexto, px + pw / 2, y);
    ctx.textAlign = "left";

    // ---- Pie ----
    ctx.strokeStyle = col + "15";
    ctx.beginPath(); ctx.moveTo(PAD, H - 34); ctx.lineTo(W - PAD, H - 34); ctx.stroke();
    ctx.fillStyle = "#6B7280"; ctx.font = "700 11px 'Barlow Condensed', sans-serif";
    ctx.fillText("SANGRE NUEVA", PAD, H - 14);
    ctx.textAlign = "right"; ctx.fillText("#" + ticket.id, W - PAD, H - 14); ctx.textAlign = "left";
    return canvas;
  }

  const canvasToBlob = canvas => new Promise(res => canvas.toBlob(res, "image/png"));

  // El voucher se prepara EN CUANTO se muestra la boleta, no al pulsar el
  // botón. En el celular —donde se vende en la puerta— eso es lo que hace que
  // la hoja de WhatsApp se abra al instante y sin perder el permiso del toque.
  // Si aún no está listo al pulsar, el botón lo construye igual (camino lento).
  useEffect(() => {
    let vivo = true;
    listoRef.current = null;
    buildTicketCanvas()
      .then(canvasToBlob)
      .then(blob => { if (vivo && blob) listoRef.current = new File([blob], "entrada-" + ticket.id + ".png", { type: "image/png" }); })
      .catch(() => { /* se construirá al pulsar */ });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, ticket.status]);

  // Descarga con URL de blob (no toDataURL): un PNG de 2760×750 en base64 son
  // varios MB metidos en una sola cadena dentro del href.
  function descargar(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "entrada-" + ticket.id + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // Un solo botón: mandar el voucher por WhatsApp.
  //
  // WhatsApp NO acepta imágenes por enlace (wa.me solo lleva texto), así que la
  // imagen se entrega por el único camino que cada dispositivo permite:
  //  · Pantalla táctil (celular/iPad) → hoja del sistema, donde WhatsApp adjunta
  //    la imagen solo. Es la ÚNICA vía en iPhone/Android para que llegue como
  //    foto. Se detecta por puntero grueso y no por user-agent, porque el iPad
  //    se anuncia como Mac desde iPadOS 13.
  //  · Computadora → se COPIA la imagen al portapapeles y se abre el chat: se
  //    pega con ⌘V / Ctrl+V y se envía con la calidad original. (La hoja de
  //    compartir del Mac no ofrece WhatsApp, que era justo el problema.)
  // Si algo de eso falla, se descarga el PNG para adjuntarlo a mano. En todos
  // los casos se termina con el chat abierto y un aviso de qué hacer.
  async function compartirWhatsApp() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSharing(true);
    setAviso(null);
    const url = waUrl(ticket.phone, shareText);
    const tactil = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

    // CAMINO RÁPIDO (celular): la imagen ya está lista desde que se mostró la
    // boleta, así que se llama a navigator.share SIN NINGUNA espera delante.
    // Es lo que evita el fallo de iOS: Safari retira el permiso del toque si
    // entre el dedo y la llamada se cuela un await largo (dibujar el PNG de
    // 2760×750 tarda lo suficiente como para perderlo).
    const listo = listoRef.current;
    if (tactil && listo && navigator.canShare && navigator.share && navigator.canShare({ files: [listo] })) {
      try {
        await navigator.share({ files: [listo], text: shareText });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") { setSharing(false); busyRef.current = false; return; }
        // cualquier otro fallo cae al respaldo de abajo, nunca sin salida
      }
    }

    try {
      // El lienzo se construye UNA sola vez y se reutiliza en todos los caminos.
      const blob = listo ? await listo.arrayBuffer().then(b => new Blob([b], { type: "image/png" })) : await canvasToBlob(await buildTicketCanvas());

      if (tactil && navigator.canShare && navigator.share) {
        const file = new File([blob], "entrada-" + ticket.id + ".png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text: shareText });
            return;
          } catch (e) {
            if (e && e.name === "AbortError") return;   // el usuario cerró la hoja: no es un error
            // cualquier otro fallo (iOS puede rechazar por activación perdida)
            // cae al respaldo de abajo en vez de dejar al vendedor sin salida.
          }
        }
      }

      // Copiar SIEMPRE antes de abrir WhatsApp: al abrir la pestaña nueva el
      // documento pierde el foco y Chrome rechaza la escritura al portapapeles
      // con NotAllowedError. Este orden es la diferencia entre que funcione o no.
      let copiada = false;
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          copiada = true;
        } catch { /* sin permiso de portapapeles: se descarga abajo */ }
      }
      if (!copiada) descargar(blob);
      const win = window.open(url, "_blank");
      setAviso({
        ok: copiada,
        texto: copiada
          ? (tactil ? "Imagen copiada. En el chat mantén pulsado y elige Pegar." : "Imagen copiada. En WhatsApp pégala con ⌘V (Ctrl+V) y envía.")
          : "Se descargó la imagen: adjúntala en el chat de WhatsApp.",
        url: win ? null : url,   // si el navegador bloqueó la ventana, se ofrece el enlace
      });
    } catch {
      setAviso({ ok: false, texto: "No se pudo preparar el voucher. Intenta de nuevo.", url });
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
          <div className="bg-white rounded-xl p-1.5 flex-shrink-0"><QRDisplay data={qrData} size={96} /></div>
          <div className="flex-1 space-y-2">
            <div className="flex justify-between"><span className="text-gray-400 text-xs">Boleta</span><span className="font-black text-white text-base" style={{ fontFamily: "'Bebas Neue',Impact,sans-serif", letterSpacing: "1px" }}>#{ticket.id}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 text-xs">Precio</span><span className="font-bold text-sm" style={{ color: ticketTypeInfo.color }}>{fmt$(ticket.price)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 text-xs">Pago</span><span className="text-white text-xs">{ticket.paymentMethod}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 text-xs">Estado</span>
              <Badge variant="filled" color={estadoColor}>{ticket.status === "ingresado" ? "✓ Ingresado" : "● Activo"}</Badge>
            </div>
          </div>
        </div>
        <div className="px-4 pb-2 flex justify-between" style={{ borderTop: "1px solid " + ticketTypeInfo.color + "15" }}>
          <span className="text-[9px] text-gray-600 uppercase tracking-widest">Sangre Nueva</span>
          <span className="text-[9px] text-gray-600">#{ticket.id}</span>
        </div>
      </div>
      <button onClick={compartirWhatsApp} type="button" disabled={sharing} className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 hover:brightness-110" style={{ background: WA_VERDE }}>
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true"><path d={WA_PATH} /></svg>
        {sharing ? "Preparando voucher..." : "Compartir al WhatsApp"}
      </button>
      {aviso && <p className={"text-[11px] text-center leading-snug " + (aviso.ok ? "text-green-400" : "text-yellow-400")}>
        {aviso.texto}
        {aviso.url && <> <a href={aviso.url} target="_blank" rel="noopener noreferrer" className="underline text-green-400">Abrir WhatsApp</a>.</>}
      </p>}
    </div>
  );
}
