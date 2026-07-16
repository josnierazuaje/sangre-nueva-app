// Escapa las 5 entidades HTML peligrosas (incluida la comilla simple) para
// inyectar texto libre de forma segura en el HTML de las ventanas de impresión
// (planilla de cartelera, llaves del Super 4). Fuente ÚNICA: antes había tres
// copias y la de Super4View no escapaba la comilla simple.
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
