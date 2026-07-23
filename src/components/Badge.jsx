// ============================================
// BADGE — etiqueta reutilizable de color dinámico
// (categoría de peso, nivel de experiencia, estado de entrada, etc.)
// Rediseño Foso de Luz: SIEMPRE píldora — tinte del color, borde tenue y una
// sombra interior sutil que le da cuerpo de vidrio. Sin resplandor externo:
// el glow es privilegio del CTA de cada pantalla, no de las etiquetas.
// variant "outline" = tinte suave (~12%), la etiqueta de siempre.
// variant "filled"  = tinte más presente (~20%) para estados destacados.
// ============================================
export default function Badge({ color, variant = "outline", size = "sm", children }) {
  const c = color || "#9CA3AF";
  const sizeClass = size === "xs" ? "text-[14px] px-1.5 py-0.5" : "text-[14px] px-2 py-0.5";
  // Alphas en hex sobre el color recibido: tinte 1F≈12% (33≈20% en filled),
  // borde 52≈32% y sombra interior 1A≈10% — luz contenida dentro de la píldora.
  const tint = variant === "filled" ? "33" : "1F";
  return (
    <span
      className={sizeClass + " font-bold rounded-full tracking-widest uppercase"}
      style={{ backgroundColor: c + tint, border: "1px solid " + c + "52", boxShadow: "inset 0 0 12px " + c + "1A", color: c }}
    >
      {children}
    </span>
  );
}
