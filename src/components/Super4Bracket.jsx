// ============================================
// PIEZAS DE LA LLAVE — conector, tarjeta y fila
// ============================================
// Las tres piezas con que se dibuja un bracket del Super 4. Estaban declaradas
// DENTRO de Super4View, lo que en React tiene un costo real: cada render del
// padre creaba tipos de componente nuevos, así que React desmontaba y volvía a
// montar estas tarjetas en vez de actualizarlas. Fuera del padre se declaran
// una sola vez.
//
// `Fila` recibe el índice de peleadores (`byId`) por prop: antes lo tomaba del
// cierre del padre, que es justo lo que la ataba a vivir ahí dentro.

const LINEA = "#4a4050";

export function Conector() {
  return (
    <div className="relative">
      <div style={{ position: "absolute", left: 0, width: "50%", top: "25%", borderTop: `1.5px solid ${LINEA}` }} />
      <div style={{ position: "absolute", left: 0, width: "50%", top: "75%", borderTop: `1.5px solid ${LINEA}` }} />
      <div style={{ position: "absolute", left: "50%", top: "25%", height: "50%", borderLeft: `1.5px solid ${LINEA}` }} />
      <div style={{ position: "absolute", left: "50%", width: "50%", top: "50%", borderTop: `1.5px solid ${LINEA}` }} />
    </div>
  );
}

export function Tarjeta({ dia, decidido, destacada, children }) {
  // Rediseño: superficie de tinta redondeada; la FINAL (destacada) es el
  // altar de la llave — borde de oro y aura contenida (.s4-altar), el único
  // resplandor en reposo de toda la llave.
  return (
    <div className={"rounded-2xl border overflow-hidden " + (destacada ? "s4-altar" : "border-white/10")} style={destacada ? undefined : { background: "linear-gradient(168deg,#171219,#0c0a0e)" }}>
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className={"text-[14px] font-semibold tracking-[0.18em] uppercase " + (destacada ? "text-boxing-goldFight" : "text-boxing-muted")}>{dia}</span>
        {decidido && <span className="text-[14px] rounded-full bg-white/10 text-boxing-cream px-2 py-0.5">Fin</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// Una fila = un peleador del cupo, con dos acciones:
//   ✓ marca (o desmarca) que ganó y avanza a la siguiente ronda.
//   ✕ lo elimina de la llave y abre el selector para poner a otro.
// La final no lleva ✕ (sus atletas salen de las semifinales, no se
// reemplazan a mano), así que onRemove llega sólo en las semifinales.
export function Fila({ byId, fid, winner, onWin, onRemove, lado, placeholder, bloqueada }) {
  // Venda de esquina: barra vertical del color del rincón (roja arriba, azul
  // abajo) que se apaga hacia el centro; al ganar, funde a dorado.
  const esGanadorVenda = winner && winner === fid;
  const vendaColor = esGanadorVenda ? "#e5c76b" : lado === "rojo" ? "#c42438" : "#2563EB";
  const cuadro = <span aria-hidden="true" className="flex-shrink-0 self-stretch" style={{ width: 3, minHeight: 26, borderRadius: "0 3px 3px 0", background: `linear-gradient(180deg, ${vendaColor}, transparent 130%)` }} />;
  const f = fid ? byId[fid] : null;
  const inexistente = !!fid && !f; // el id apunta a un peleador borrado / no sincronizado
  // Cupo LIBRE (vacío o con peleador eliminado) de una SEMIFINAL: se puede
  // rellenar sin regenerar toda la llave. Se ofrece un botón claro "Elegir"
  // que abre el selector de peleadores elegibles para la categoría. onRemove
  // solo llega en las semifinales; la final toma a sus atletas de las semis,
  // así que ahí este botón no aparece (se conserva el placeholder).
  if ((!fid || inexistente) && onRemove) return (
    <div className="flex items-center gap-2 pr-2.5 py-1.5">
      {cuadro}
      <span className="flex flex-col min-w-0 flex-1">
        <span className="text-[14px] text-boxing-muted italic truncate">Cupo libre</span>
        {inexistente && <span className="text-[14px] text-boxing-muted/70 truncate">peleador eliminado</span>}
      </span>
      <button type="button" onClick={onRemove} title="Elegir un peleador para este cupo" className="px-3 h-7 flex items-center justify-center gap-1 rounded-full border border-green-500/60 text-green-300 hover:bg-green-600/25 text-[14px] font-bold tracking-wide flex-shrink-0 transition-colors">{"＋"} Elegir</button>
    </div>
  );
  // Cupo vacío que NO se rellena aquí (placeholder de la final): en itálica
  // serif apagada, como promesa del ganador que vendrá.
  if (!fid) return (
    <div className="flex items-center gap-2 pr-2.5 py-2 opacity-60">
      {cuadro}
      <span className="text-[14px] text-boxing-muted italic truncate" style={{ fontFamily: "'Playfair Display',Georgia,serif" }}>{placeholder}</span>
    </div>
  );
  const esGanador = winner === fid;
  const perdio = winner && winner !== fid;
  // El ✓ se bloquea si el atleta ya no existe o si la final aún no tiene a
  // sus dos finalistas (no se puede coronar con una sola semi decidida).
  const winBloqueado = inexistente || bloqueada;
  return (
    <div className={"flex items-center gap-2 pr-2.5 py-1.5 " + (esGanador ? "bg-boxing-goldDim/15" : "")}>
      {cuadro}
      <span className="flex flex-col min-w-0 flex-1">
        <span className={"text-[14px] leading-tight truncate " + (perdio ? "text-boxing-muted line-through" : esGanador ? "font-bold text-boxing-goldBright" : "text-boxing-cream font-bold")}>{f ? f.fullName : "—"}</span>
        <span className="text-[14px] text-boxing-muted truncate">{f ? `${f.gym} · ${f.weightKg}kg · ${f.age}a` : "peleador eliminado"}</span>
      </span>
      {/* Sellos de juez: círculos monocromos que solo se encienden (verde el
          ✓, rosa-carmesí el ✕) al tocarlos; el ✓ del ganador queda sólido. */}
      {onWin && <button type="button" disabled={winBloqueado} onClick={onWin} title={esGanador ? "Quitar como ganador" : "Marcó ganador — avanza"} className={"seal seal-win text-sm" + (winBloqueado ? " opacity-30 cursor-not-allowed" : "")} style={esGanador ? { background: "#16a34a", borderColor: "#22C55E", color: "#fff", boxShadow: "0 0 12px rgba(34,197,94,0.5)" } : undefined}>✓</button>}
      {onRemove && <button type="button" onClick={onRemove} title="Eliminar y elegir otro" className="seal seal-chg text-sm">✕</button>}
    </div>
  );
}
