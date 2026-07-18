// ============================================
// ENCABEZADO DE PÁGINA (compartido por todas las pestañas)
// ============================================
// Da jerarquía y autoridad de título: un rótulo dorado pequeño (kicker), el
// título grande en Bebas Neue con la barra crimson, un número/contador dorado
// opcional, y una línea divisoria fina que separa el encabezado del contenido.
// El tamaño escala con clamp() — grande y con presencia en escritorio, sobrio
// en móvil. Se usa igual en las 6 vistas para que la app se vea consistente.
export default function PageHeader({ title, count, kicker, right = null }) {
  return (
    <div className="mb-5 lg:mb-7">
      {kicker && (
        <div className="text-[10px] lg:text-[11px] font-semibold tracking-[0.35em] uppercase text-boxing-goldFight mb-2 pl-[18px]" style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>
          {kicker}
        </div>
      )}
      <div className="flex items-center gap-3.5">
        <span className="flex-shrink-0 rounded-full" style={{ width: "5px", height: "clamp(30px,3.4vw,40px)", background: "linear-gradient(180deg,#c42438,#7c1420)" }} />
        <h2 className="flex items-baseline gap-3 min-w-0 text-boxing-cream leading-none" style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: "clamp(30px,3.6vw,44px)", letterSpacing: "0.03em" }}>
          <span className="truncate">{title}</span>
          {count != null && <span className="flex-shrink-0 text-boxing-goldFight" style={{ fontSize: "0.64em" }}>{count}</span>}
        </h2>
        {right && <div className="ml-auto flex-shrink-0">{right}</div>}
      </div>
      <div className="mt-3.5 h-px w-full" style={{ background: "linear-gradient(90deg,rgba(196,36,56,0.75) 0%,rgba(61,45,66,0.9) 28%,rgba(61,45,66,0) 100%)" }} />
    </div>
  );
}
