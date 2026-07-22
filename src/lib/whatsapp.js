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

// Lo que aparece YA ESCRITO en el campo Teléfono de la venta. La velada es en
// Chile y prácticamente todo comprador tiene móvil chileno, así que el vendedor
// solo teclea los 8 dígitos que cambian, con la cola esperando.
export const PREFIJO_CL = "+56 9 ";

// El campo sigue siendo OPCIONAL, pero con el prefijo puesto de antemano queda
// "lleno" aunque nadie escriba nada. Si detrás del prefijo no hay dígitos, la
// venta se guarda SIN teléfono: guardar "+56 9" a secas dejaría una boleta con
// un enlace de WhatsApp roto, que es peor que no tener teléfono.
export function telefonoIngresado(raw) {
  const t = String(raw || "").trim();
  const d = t.replace(/\D/g, "");
  // "", "5", "56", "569": no hay nada más que el prefijo (o parte de él).
  return CHILE.startsWith(d) || (CHILE + "9").startsWith(d) ? "" : t;
}

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

// Enlace al chat de WhatsApp SIN texto pre-escrito.
//
// La entrada viaja como IMAGEN, nunca como mensaje escrito. Antes el enlace
// llevaba el texto ya puesto y eso era justamente la trampa: el chat se abría
// con el mensaje listo, un Enter de más lo mandaba y al comprador le llegaba
// puro texto sin el voucher. Con el chat vacío lo único que hay para enviar es
// la imagen.
//
// En el celular wa.me abre la aplicación. En el computador se va directo a
// WhatsApp Web —donde se pega la imagen— porque wa.me mete antes una pantalla
// intermedia ("Continue to Chat") que solo estorba.
// Sin teléfono válido se abre WhatsApp para elegir el contacto a mano.
export function waChatUrl(telefono, { escritorio = false } = {}) {
  const p = waPhone(telefono);
  if (escritorio) return p ? "https://web.whatsapp.com/send?phone=" + p : "https://web.whatsapp.com/";
  return "https://wa.me/" + p;
}
