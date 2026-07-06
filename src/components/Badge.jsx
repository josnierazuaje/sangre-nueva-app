// ============================================
// BADGE — etiqueta reutilizable de color dinámico
// (categoría de peso, nivel de experiencia, estado de entrada, etc.)
// variant "outline" = solo borde y texto del color.
// variant "filled"  = fondo tenue del color y texto sólido, en píldora.
// ============================================
export default function Badge({ color, variant = "outline", size = "sm", children }) {
  const c = color || "#9CA3AF";
  const sizeClass = size === "xs" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5";
  if (variant === "filled") {
    return <span className={sizeClass + " font-bold rounded-full tracking-widest uppercase"} style={{ backgroundColor: c + "20", color: c }}>{children}</span>;
  }
  return <span className={sizeClass + " font-bold border tracking-widest uppercase"} style={{ borderColor: c + "50", color: c }}>{children}</span>;
}
