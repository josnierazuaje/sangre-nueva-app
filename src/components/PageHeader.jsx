// ============================================
// ENCABEZADO DE PÁGINA (compartido por todas las pestañas)
// ============================================
// Rediseño "Foso de Luz", versión CENTRADA (pedido del organizador, jul 2026):
// el título tenía que marcar autoridad, como el nombre de un cartel de velada.
// Todo compone en columna simétrica al centro:
//   · kicker dorado flanqueado por un guion de luz a CADA lado,
//   · título en serif (Playfair/Didot) con degradado marfil y, si viene, el
//     contador inline en itálica dorada (Peleadores 100),
//   · el dato de la derecha (llaves / peleas / sin pelea) pasa a una línea meta
//     centrada BAJO el título — al centrar el título ya no cabía anclado a un
//     costado sin romper la simetría,
//   · y un filete de oro simétrico que se apaga hacia los dos extremos.
// El tamaño escala con clamp() —presencia en escritorio, sobriedad en móvil— y
// se usa igual en las 6 vistas para que la app se vea de una sola pieza.
//
// `count`: número inline junto al título (Peleadores, Cartelera).
// `right`:  bloque descriptivo (Super 4, Emparejamientos, Faltantes) — se
//           muestra centrado bajo el título, no a la derecha.
export default function PageHeader({ title, count, kicker, right = null }) {
  // Guion de luz del kicker: la misma barra dorada de antes, ahora a los dos
  // lados para que el rótulo quede centrado y simétrico.
  const guion = (
    <span aria-hidden="true" style={{ width: "26px", height: "1px", background: "#c8a04a", boxShadow: "0 0 8px rgba(200,160,74,0.6)", flexShrink: 0 }} />
  );
  return (
    <div className="mb-5 lg:mb-7 text-center">
      {kicker && (
        <div className="flex items-center justify-center gap-3 text-[14px] font-semibold tracking-[0.4em] uppercase text-boxing-goldFight mb-2.5" style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>
          {guion}
          <span>{kicker}</span>
          {guion}
        </div>
      )}
      <h2 className="flex items-baseline justify-center gap-3 leading-none max-w-full" style={{ fontSize: "clamp(30px,3.8vw,50px)" }}>
        <span className="titulo-cartel truncate">{title}</span>
        {count != null && <span className="flex-shrink-0 titulo-oro" style={{ fontStyle: "italic", fontSize: "0.6em" }}>{count}</span>}
      </h2>
      {right && <div className="mt-2.5 flex justify-center">{right}</div>}
      {/* Filete de oro simétrico: se apaga hacia los dos extremos, así el título
          queda "coronado" al centro en vez de subrayado desde un costado. */}
      <div className="mt-4 mx-auto h-px w-full max-w-[420px]" style={{ background: "linear-gradient(90deg,transparent 0%,rgba(200,160,74,0.12) 18%,rgba(229,199,107,0.65) 50%,rgba(200,160,74,0.12) 82%,transparent 100%)" }} />
    </div>
  );
}
