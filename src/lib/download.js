// Descarga un archivo generado en memoria (sin servidor): crea una URL
// temporal para los bytes, dispara un <a download> invisible y la libera.
// Es el equivalente a printHtml.js pero para "Guardar en el disco" en vez de
// "Imprimir": lo usan los botones de Excel de la cartelera, el Super 4 y la
// lista de peleadores.
export function downloadBytes(bytes, filename, mime = "application/octet-stream") {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari necesita que la URL siga viva un instante después del click; si se
  // revoca de inmediato la descarga sale vacía.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Tipo MIME oficial de los libros de Excel. Sin esto macOS puede abrir el
// archivo con la app equivocada.
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Tipo MIME del PDF de llaves del Super 4. Con esto WhatsApp y el celular lo
// reconocen como documento y lo abren en el visor en vez de ofrecer guardarlo
// como archivo desconocido.
export const PDF_MIME = "application/pdf";

// Nombre de archivo seguro: sin barras ni dos puntos (rompen la descarga en
// algunos navegadores) y con la fecha al final para no pisar el anterior
// cuando se baja la planilla varias veces el mismo día del evento.
function safeFilename(base, fecha, ext) {
  const limpio = String(base).replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${limpio}${fecha ? " " + fecha : ""}.${ext}`;
}
export function xlsxFilename(base, fecha) { return safeFilename(base, fecha, "xlsx"); }
export function pdfFilename(base, fecha) { return safeFilename(base, fecha, "pdf"); }
