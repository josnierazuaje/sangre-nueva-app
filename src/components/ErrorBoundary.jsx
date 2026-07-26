import React from "react";

// ¿El error es de "no pude cargar un trozo de la app"? Pasa tras un despliegue
// nuevo: el navegador tiene cacheada (service worker) la versión vieja, que
// pide un chunk con un hash que ya no existe en el servidor → falla el
// import() dinámico. NO es un bug del código; se arregla recargando (el service
// worker toma la versión nueva). Se cubren los tres mensajes de navegador:
//  · Chrome:  "Failed to fetch dynamically imported module"
//  · Firefox: "error loading dynamically imported module"
//  · Safari:  "Importing a module script failed"
// (y el nombre ChunkLoadError / patrón "Loading chunk … failed" por si acaso).
export function isChunkLoadError(error) {
  if (!error) return false;
  const msg = String((error && (error.message || error.name)) || error);
  return /ChunkLoadError/i.test(String(error && error.name)) ||
    /dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg);
}

// Recarga automática con freno anti-bucle: si recargar NO arregla el problema
// (p.ej. sin conexión, o el despliegue aún no terminó), no se puede quedar
// recargando en círculos. Reglas: no recargar dos veces en menos de 15 s, y
// como máximo 3 veces por pestaña; superado eso, se muestra el botón manual.
// Usa sessionStorage (por pestaña); si no está disponible, NO recarga (prudente).
export function shouldAutoReload(now) {
  try {
    const t = typeof now === "number" ? now : Date.now();
    const last = parseInt(sessionStorage.getItem("bm_chunk_reload_at") || "0", 10);
    const count = parseInt(sessionStorage.getItem("bm_chunk_reload_n") || "0", 10);
    if (count >= 3) return false;
    if (last && t - last < 15000) return false;
    sessionStorage.setItem("bm_chunk_reload_at", String(t));
    sessionStorage.setItem("bm_chunk_reload_n", String(count + 1));
    return true;
  } catch {
    return false;
  }
}

// ERROR BOUNDARY
// Atrapa errores de renderizado de cualquier componente hijo para evitar
// que un fallo puntual (ej: un dato inesperado) tumbe toda la app y deje
// pantalla negra. Los datos ya guardados no se pierden (viven en
// localStorage/Firebase, no en este estado de React).
//
// Caso especial: si el fallo es "no cargó un trozo de la app" (versión vieja
// cacheada tras un despliegue), en vez de la pantalla roja se recarga sola para
// tomar la versión nueva — así el staff en la puerta nunca ve un error por eso.
// ============================================
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, chunk: false }; }
  static getDerivedStateFromError(error) { return { hasError: true, chunk: isChunkLoadError(error) }; }
  componentDidCatch(error, info) {
    console.error("Error capturado por ErrorBoundary:", error, info);
    // Recarga sola ante un desajuste de versión (una sola vez, con freno).
    if (isChunkLoadError(error) && shouldAutoReload()) location.reload();
  }
  render() {
    if (this.state.hasError && this.state.chunk) {
      // Pantalla calmada (no roja): es una actualización, no un error del usuario.
      // Si la recarga automática se disparó, esto apenas se ve; si el freno la
      // detuvo, queda el botón para recargar a mano.
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center", background: "#080608", color: "#e8ddd0" }}>
          <div style={{ maxWidth: "380px", width: "100%", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.07)", background: "linear-gradient(170deg,#131016,#0c0a0e)", padding: "32px 24px" }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "30px", letterSpacing: "0.05em", color: "#c8a04a", marginBottom: "14px" }}>Actualizando</div>
            <p style={{ color: "#9CA3AF", fontSize: "14px", margin: "0 auto 22px", maxWidth: "320px", lineHeight: 1.5 }}>Salió una versión nueva de la app. Estamos cargando la última — toma solo un momento. Tus datos están a salvo.</p>
            <button onClick={() => location.reload()} className="btn-primary" style={{ padding: "12px 32px", fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.1em", cursor: "pointer" }}>Recargar ahora</button>
          </div>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center", background: "#080608", color: "#e8ddd0" }}>
          {/* Panel de tinta redondeado del sistema: el aviso vive en su propia
              tarjeta en vez de flotar suelto sobre el fondo. */}
          <div style={{ maxWidth: "380px", width: "100%", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.07)", background: "linear-gradient(170deg,#131016,#0c0a0e)", padding: "32px 24px" }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "30px", letterSpacing: "0.05em", color: "#c42438", marginBottom: "14px" }}>Algo salió mal</div>
            <p style={{ color: "#9CA3AF", fontSize: "14px", margin: "0 auto 22px", maxWidth: "320px", lineHeight: 1.5 }}>La app tuvo un error inesperado al mostrar esta pantalla. Tus datos están a salvo (se guardan en la nube), no se perdió nada. Recarga para continuar.</p>
            <button onClick={() => location.reload()} className="btn-primary" style={{ padding: "12px 32px", fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.1em", cursor: "pointer" }}>Recargar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
