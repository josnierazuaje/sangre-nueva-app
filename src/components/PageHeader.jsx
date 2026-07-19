// ============================================
// ENCABEZADO DE PÁGINA (compartido por todas las pestañas)
// ============================================
// Rediseño "Foso de Luz": título de CARTEL — kicker dorado con guion de luz,
// título en serif (Playfair/Didot) con degradado marfil y el contador en
// itálica dorada. Siempre alineado a la izquierda (los carteles de boxeo
// componen en columna de golpe visual, no en simetría). El tamaño escala con
// clamp() — presencia en escritorio, sobriedad en móvil. Se usa igual en las
// 6 vistas para que la app se vea consistente.
export default function PageHeader({ title, count, kicker, right = null }) {
  return (
    <div className="mb-5 lg:mb-7">
      {kicker && (
        <div className="flex items-center gap-3 text-[10px] lg:text-[11px] font-semibold tracking-[0.4em] uppercase text-boxing-goldFight mb-2" style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>
          <span aria-hidden="true" style={{ width: "26px", height: "1px", background: "#c8a04a", boxShadow: "0 0 8px rgba(200,160,74,0.6)", flexShrink: 0 }} />
          {kicker}
        </div>
      )}
      <div className="flex items-center gap-3.5">
        <h2 className="flex items-baseline gap-3 min-w-0 leading-none" style={{ fontSize: "clamp(30px,3.8vw,50px)" }}>
          <span className="truncate titulo-cartel">{title}</span>
          {count != null && <span className="flex-shrink-0 titulo-oro" style={{ fontStyle: "italic", fontSize: "0.6em" }}>{count}</span>}
        </h2>
        {right && <div className="ml-auto flex-shrink-0">{right}</div>}
      </div>
      <div className="mt-3.5 h-px w-full" style={{ background: "linear-gradient(90deg,rgba(196,36,56,0.7) 0%,rgba(61,45,66,0.9) 30%,rgba(61,45,66,0) 85%)" }} />
    </div>
  );
}
