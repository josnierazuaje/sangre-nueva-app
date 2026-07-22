import { useState, useRef, useEffect } from "react";
import { TICKET_TYPES_V2, fmt$ } from "../constants.js";
import { waChatUrl } from "../lib/whatsapp.js";
import { buildVoucherFile, voucherFileName } from "../lib/voucher.js";
import Badge from "./Badge.jsx";
import QRDisplay from "./QRDisplay.jsx";

// Verde oficial de WhatsApp.
const WA_VERDE = "#25D366";
// Glifo de WhatsApp (viewBox 24×24), para que el botón se reconozca de un vistazo.
const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z";

export default function TicketPreview({ ticket }) {
  const ticketTypeInfo = TICKET_TYPES_V2.find(t => t.key === ticket.ticketType) || TICKET_TYPES_V2[0];
  const qrData = location.origin + location.pathname + "?ticket=" + encodeURIComponent(ticket.id) + (ticket.token ? "&t=" + encodeURIComponent(ticket.token) : "");
  const busyRef = useRef(false);
  const listoRef = useRef(null);   // voucher ya dibujado, listo para compartir al instante
  const [sharing, setSharing] = useState(false);
  const [aviso, setAviso] = useState(null);
  const archivo = voucherFileName(ticket);
  // Pie de foto que acompaña a la imagen en la hoja de compartir del celular.
  // Viaja PEGADO al archivo, no en el enlace: o llegan los dos o no llega nada.
  const shareText = "Sangre Nueva - La Velada\nEntrada: " + ticketTypeInfo.label + "\nBoleta: #" + ticket.id + "\nA nombre de: " + ticket.attendeeName + "\n\nPresenta este codigo QR en la entrada.";
  // Mismo símbolo que la píldora de la tarjeta en pantalla (✓ / ●).
  const estadoTexto = ticket.status === "ingresado" ? "✓ INGRESADO" : "● ACTIVO";
  const estadoColor = ticket.status === "ingresado" ? "#4ADE80" : "#FCD34D";

  const datosVoucher = { ticket, tipo: ticketTypeInfo, qrData, estadoTexto, estadoColor };

  // El voucher se prepara EN CUANTO se muestra la boleta, no al pulsar el
  // botón. En el celular —donde se vende en la puerta— eso es lo que hace que
  // la hoja de WhatsApp se abra al instante y sin perder el permiso del toque.
  // Si aún no está listo al pulsar, el botón lo construye igual (camino lento).
  useEffect(() => {
    let vivo = true;
    listoRef.current = null;
    buildVoucherFile(datosVoucher)
      .then(file => { if (vivo) listoRef.current = file; })
      .catch(() => { /* se construirá al pulsar */ });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, ticket.status]);

  // Descarga con URL de blob (no toDataURL): un PNG de 2760×750 en base64 son
  // varios MB metidos en una sola cadena dentro del href. El enlace se cuelga
  // del documento antes de pulsarlo porque Firefox ignora el click de un <a>
  // que no está en la página.
  function descargar(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // Hoja de compartir del sistema (celular/iPad). Devuelve "si" cuando ella se
  // hizo cargo —se compartió, o el vendedor la cerró a propósito— y "no" cuando
  // este aparato no puede, para seguir al respaldo. Cerrar la hoja es una
  // decisión, no un fallo: no se descarga nada a espaldas del vendedor.
  async function intentarHoja(file) {
    if (!navigator.canShare || !navigator.share || !navigator.canShare({ files: [file] })) return "no";
    try {
      await navigator.share({ files: [file], text: shareText });
      return "si";
    } catch (e) {
      if (e && e.name === "AbortError") return "si";
      return "no";   // iOS puede rechazar por activación perdida: hay respaldo
    }
  }

  // Un solo botón: mandar el voucher POR IMAGEN.
  //
  // WhatsApp no acepta imágenes por enlace, así que el PNG se entrega por el
  // camino que cada aparato permite:
  //  · Pantalla táctil (celular/iPad) → hoja del sistema: se elige WhatsApp y
  //    la imagen ya va adjunta con su pie de foto. Es la ÚNICA vía en
  //    iPhone/Android para que llegue como foto y sale en un solo gesto. Se
  //    detecta por puntero grueso y no por user-agent, porque el iPad se
  //    anuncia como Mac desde iPadOS 13.
  //  · Computadora → la hoja de compartir del Mac no ofrece WhatsApp, así que
  //    la imagen se DESCARGA (queda el archivo para adjuntar con el clip) y
  //    además se COPIA al portapapeles cuando el navegador deja, que es lo más
  //    rápido: ⌘V dentro del chat. Se hacen las dos porque ninguna está
  //    garantizada.
  // El chat se abre siempre VACÍO: ya no hay texto pre-escrito que se pueda
  // enviar solo, sin el voucher.
  async function compartirWhatsApp() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSharing(true);
    setAviso(null);
    const tactil = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const url = waChatUrl(ticket.phone, { escritorio: !tactil });

    try {
      // CAMINO RÁPIDO (celular): la imagen ya está lista desde que se mostró la
      // boleta, así que se llama a navigator.share SIN NINGUNA espera delante.
      // Es lo que evita el fallo de iOS: Safari retira el permiso del toque si
      // entre el dedo y la llamada se cuela un await largo (dibujar el PNG de
      // 2760×750 tarda lo suficiente como para perderlo).
      const listo = listoRef.current;
      if (tactil && listo && (await intentarHoja(listo)) === "si") return;

      // El archivo se construye UNA sola vez y se reutiliza en todos los
      // caminos. Solo se reintenta la hoja si arriba ni siquiera se pudo probar
      // (el voucher todavía no estaba dibujado); si ya se probó y no funcionó,
      // insistir con el mismo archivo daría el mismo resultado.
      const file = listo || await buildVoucherFile(datosVoucher);
      if (tactil && !listo && (await intentarHoja(file)) === "si") return;

      // Copiar SIEMPRE antes de abrir WhatsApp: al abrir la pestaña nueva el
      // documento pierde el foco y Chrome rechaza la escritura al portapapeles
      // con NotAllowedError. Este orden es la diferencia entre que funcione o no.
      let copiada = false;
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
          copiada = true;
        } catch { /* sin permiso de portapapeles: queda la descarga */ }
      }
      descargar(file);
      const win = window.open(url, "_blank");
      setAviso({
        ok: true,
        titulo: copiada ? "Voucher copiado y descargado" : "Voucher descargado: " + archivo,
        pasos: copiada
          ? ["Se abrió el chat de WhatsApp (vacío, a propósito).",
             "Pega la imagen con ⌘V (Ctrl+V) y envíala.",
             "Si no pega, adjunta " + archivo + " con el clip 📎."]
          : ["Se abrió el chat de WhatsApp (vacío, a propósito).",
             "Adjunta " + archivo + " con el clip 📎 y envíala."],
        url: win ? null : url,   // si el navegador bloqueó la ventana, se ofrece el enlace
      });
    } catch {
      setAviso({ ok: false, titulo: "No se pudo preparar el voucher", pasos: ["Intenta de nuevo."], url });
    } finally {
      // Se suelta el botón pase lo que pase, también cuando la hoja de compartir
      // termina bien: antes ese camino salía con un return y el botón se quedaba
      // congelado en "Preparando voucher..." hasta recargar.
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
      {aviso && (
        <div className={"rounded-xl px-3 py-2.5 text-[12px] leading-snug " + (aviso.ok ? "text-green-300" : "text-yellow-300")}
             style={{ background: (aviso.ok ? "#25D366" : "#FCD34D") + "14", border: "1px solid " + (aviso.ok ? "#25D366" : "#FCD34D") + "55" }}>
          <p className="font-bold">{aviso.titulo}</p>
          <ol className="mt-1 space-y-0.5 list-decimal list-inside opacity-90">
            {aviso.pasos.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
          {aviso.url && <p className="mt-1"><a href={aviso.url} target="_blank" rel="noopener noreferrer" className="underline font-bold">Abrir WhatsApp</a></p>}
        </div>
      )}
    </div>
  );
}
