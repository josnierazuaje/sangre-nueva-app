// Número de teléfono en el formato que exige wa.me: internacional, solo
// dígitos, sin el "+". Es lo único que decide si el enlace abre el chat del
// comprador o una pantalla de error, así que vive aparte y con pruebas.
//
// El campo Teléfono de la venta es texto libre ("+56 9…" es solo el ejemplo),
// y en Chile la gente lo escribe de todas estas formas:
//   "+56 9 1234 5678" · "56912345678" · "9 1234 5678" · "09 1234 5678"
//   "(9) 1234-5678"   · "+56-9-1234-5678"
// Todas deben terminar en "56912345678".
const CHILE = "56";

export function waPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  // Prefijo de salida internacional escrito a mano (00 56 9…).
  if (d.startsWith("00")) d = d.slice(2);
  // Ya viene con código de país chileno y móvil: listo.
  if (d.length === 11 && d.startsWith(CHILE + "9")) return d;
  // Formato nacional con cero de larga distancia: 09 1234 5678.
  if (d.length === 10 && d.startsWith("09")) return CHILE + d.slice(1);
  // Móvil chileno sin código de país: 9 1234 5678.
  if (d.length === 9 && d.startsWith("9")) return CHILE + d;
  // Cualquier otro caso se manda tal cual: puede ser un número extranjero ya
  // completo. Es mejor intentar abrir el chat que descartarlo en silencio.
  return d;
}

// Enlace al chat de WhatsApp con el texto ya escrito. Sin teléfono válido
// abre el selector de contactos de WhatsApp, que también sirve.
export function waUrl(telefono, texto) {
  return "https://wa.me/" + waPhone(telefono) + "?text=" + encodeURIComponent(texto || "");
}
