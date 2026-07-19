// Imprime un documento HTML autónomo usando un IFRAME OCULTO en vez de abrir
// una ventana "about:blank" (window.open + document.write). Ventajas:
//  - Llega a la ventana de impresión más rápido y sin abrir una pestaña/ventana
//    aparte — importante en la app instalada como PWA, donde abrir esa ventana
//    era lento y dejaba pestañas "about:blank" colgando.
//  - El navegador no puede bloquearlo como a un popup.
//  - El iframe se limpia solo: al cerrar el diálogo (onafterprint) o, como
//    respaldo, a los 60s.
// `html` debe ser un documento completo (<!DOCTYPE html>…): los tres builders
// (peleadores, cartelera, Super 4) ya lo devuelven así, con sus estilos inline.
// El iframe queda AISLADO, así que los estilos de la app no se mezclan con los
// de la planilla.
export function printHtml(html) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0",
    width: "0", height: "0", border: "0", visibility: "hidden",
  });
  let removed = false;
  const remove = () => { if (removed) return; removed = true; try { iframe.remove(); } catch (e) {} };
  iframe.onload = () => {
    const w = iframe.contentWindow;
    if (!w) { remove(); return; }
    // Pequeño respiro para que el contenido termine de maquetarse antes de
    // abrir la impresión (algunos navegadores lo necesitan tras srcdoc).
    setTimeout(() => {
      try {
        w.focus();
        w.onafterprint = remove; // limpia al cerrar el diálogo de impresión
        w.print();
      } catch (e) { console.error("No se pudo abrir la impresión:", e); remove(); return; }
      setTimeout(remove, 60000); // respaldo si onafterprint no dispara
    }, 50);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
