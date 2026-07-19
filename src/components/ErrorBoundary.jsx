import React from "react";

// ERROR BOUNDARY
// Atrapa errores de renderizado de cualquier componente hijo para evitar
// que un fallo puntual (ej: un dato inesperado) tumbe toda la app y deje
// pantalla negra. Los datos ya guardados no se pierden (viven en
// localStorage/Firebase, no en este estado de React).
// ============================================
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("Error capturado por ErrorBoundary:", error, info); }
  render() {
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
