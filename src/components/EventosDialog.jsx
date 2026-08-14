import { useState, useEffect } from "react";
import { EVENTO_LEGACY_ID } from "../lib/eventos.js";
import { listarMisEventos, crearEvento, actualizarMetaEvento } from "../lib/eventosNube.js";
import { MONEDAS, preciosPorDefecto, formatearImporte, precioValido } from "../lib/moneda.js";
import { FEDERACIONES } from "../lib/federacion.js";
import { AFORO_POR_DEFECTO, aforoValido } from "../lib/fichaEvento.js";
import { DEFAULT_EVENT_DATES } from "../lib/eventDates.js";

// ============================================
// EVENTOS — abrir otra velada, crear la siguiente
// ============================================
// La app manejaba UNA velada: para montar la siguiente había que "Reiniciar
// evento", que borra la anterior. Así se perdieron la cartelera y el Super 4 de
// la velada del 1-2 de agosto de 2026. Desde acá cada velada es un evento
// aparte, con su padrón, su boletería y su respaldo — y las anteriores siguen
// ahí para consultarlas o reimprimir su cierre.
//
// Cambiar de evento RECARGA la app a propósito. La alternativa —cambiar las
// rutas en caliente— dejaría vivos los listeners de Firebase del evento
// anterior, y esa clase de fuga es justo la que hace que un peleador aparezca
// en la velada equivocada. Recargar es la única forma honesta de soltarlos, y
// es lo que ya hacen "Recargar desde la nube" y "Firebase manual".
export default function EventosDialog({ user, eventoId, eventoMeta, isOwner, pendientes, onCambiar, onCreado, onMetaCambiada, onClose }) {
  const [eventos, setEventos] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const [modo, setModo] = useState("lista"); // "lista" | "crear" | "precios"

  useEffect(() => {
    let vivo = true;
    listarMisEventos(user)
      .then(l => { if (vivo) setEventos(l); })
      .catch(e => { if (vivo) { setError(e.message); setEventos([]); } });
    return () => { vivo = false; };
  }, [user]);

  const lbl = "block text-[14px] font-semibold text-[rgba(200,160,74,0.55)] mb-1.5 tracking-[0.22em] uppercase";
  const ic = "w-full px-3 py-2.5 input-ink text-base";

  function cambiar(id) {
    if (id === eventoId) { onClose(); return; }
    // Los pendientes NO se pierden al cambiar de evento (cada velada tiene su
    // propia cola en este dispositivo), pero dejan de reintentarse hasta que se
    // vuelva. Con la puerta vendiendo eso importa, así que se dice claro en vez
    // de dejar que el organizador lo descubra.
    if (pendientes && pendientes.total && !confirm(
      `En esta velada quedan ${pendientes.detalle} sin subir a la nube.\n\n` +
      `No se pierden: se quedan guardados en este dispositivo y se reintentan cuando vuelvas a abrir esta velada. Pero mientras estés en la otra, no se van a subir.\n\n` +
      `¿Cambiar de evento igualmente?`)) return;
    onCambiar(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-boxing-panel border border-boxing-goldDim/50 rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-boxing-line">
          <p className="text-boxing-cream font-bold" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.05em" }}>Veladas</p>
          <p className="text-[14px] text-boxing-muted">Cada velada guarda su padrón, su cartelera y su boletería por separado</p>
        </div>

        {modo === "lista" && <ListaEventos
          eventos={eventos} error={error} eventoId={eventoId} onElegir={cambiar}
          onCrear={() => setModo("crear")}
          onPrecios={isOwner && eventoId !== EVENTO_LEGACY_ID ? () => setModo("precios") : null}
          meta={eventoMeta} />}

        {modo === "crear" && <CrearEvento
          user={user} lbl={lbl} ic={ic}
          onCancel={() => setModo("lista")}
          onCreado={meta => onCreado(meta)} />}

        {modo === "precios" && <PreciosEvento
          eventoId={eventoId} meta={eventoMeta} lbl={lbl} ic={ic}
          onCancel={() => setModo("lista")}
          onGuardado={onMetaCambiada} />}

        {modo === "lista" && <div className="flex gap-2 p-3 border-t border-boxing-line">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-boxing-line text-boxing-muted hover:text-boxing-cream text-sm font-bold tracking-[0.14em] uppercase transition-colors">Cerrar</button>
        </div>}
      </div>
    </div>
  );
}

function ListaEventos({ eventos, error, eventoId, onElegir, onCrear, onPrecios, meta }) {
  return (
    <div className="p-4 space-y-3">
      {eventos === null && <p className="text-boxing-muted text-sm py-4 text-center">Buscando tus veladas…</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {eventos && eventos.map(ev => {
        const activo = ev.id === eventoId;
        return (
          <button key={ev.id} onClick={() => onElegir(ev.id)}
            className={"w-full text-left px-3 py-2.5 rounded-2xl border transition-colors " + (activo ? "border-boxing-goldDim bg-black/30" : "border-boxing-line hover:border-boxing-goldDim/50")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-boxing-cream font-semibold truncate">{ev.nombre || ev.id}</span>
              {activo && <span className="text-[14px] text-boxing-goldFight tracking-[0.18em] uppercase flex-shrink-0">Abierta</span>}
            </div>
            <div className="text-[14px] text-boxing-muted mt-0.5">
              {ev.id === EVENTO_LEGACY_ID ? "Histórico · Chile" : (ev.pais ? ev.pais + " · " : "") + (MONEDAS[ev.moneda] ? MONEDAS[ev.moneda].codigo : "")}
            </div>
          </button>
        );
      })}

      {eventos && !eventos.length && <p className="text-boxing-muted text-sm py-2">Todavía no tienes ninguna velada creada.</p>}

      <div className="space-y-2 pt-1">
        <button onClick={onCrear} className="btn-gold w-full py-2.5 text-sm font-bold tracking-[0.14em] uppercase">Crear velada nueva</button>
        {onPrecios && <button onClick={onPrecios} className="w-full py-2.5 rounded-full border border-boxing-line text-boxing-muted hover:text-boxing-cream text-sm font-bold tracking-[0.14em] uppercase transition-colors">
          Precios y aforo{meta && MONEDAS[meta.moneda] ? " · " + meta.moneda : ""}
        </button>}
      </div>
    </div>
  );
}

function CrearEvento({ user, lbl, ic, onCancel, onCreado }) {
  const [nombre, setNombre] = useState("");
  const [moneda, setMoneda] = useState("EUR");
  const [pais, setPais] = useState("ES");
  const [federacion, setFederacion] = useState("NINGUNA");
  const [aforo, setAforo] = useState(AFORO_POR_DEFECTO);
  const [semis, setSemis] = useState(DEFAULT_EVENT_DATES.semis);
  const [final, setFinal] = useState(DEFAULT_EVENT_DATES.final);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function crear() {
    if (nombre.trim().length < 2 || guardando) return;
    setGuardando(true); setError("");
    try {
      const meta = await crearEvento({ nombre, dates: { semis, final }, pais, moneda, federacion, aforo, user });
      onCreado(meta);
    } catch (e) {
      console.error("No se pudo crear la velada:", e);
      setError(e.message || "No se pudo crear la velada.");
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="p-4 space-y-4">
        <div>
          <label className={lbl}>Nombre de la velada</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} placeholder="Sangre Nueva Madrid — 1ª edición" className={ic} autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>País</label>
            <select value={pais} onChange={e => { const p = e.target.value; setPais(p); setMoneda(p === "CL" ? "CLP" : "EUR"); setFederacion(p === "CL" ? "FECHIBOX" : "NINGUNA"); }} className={ic}>
              <option value="ES">España</option>
              <option value="CL">Chile</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Moneda</label>
            <select value={moneda} onChange={e => setMoneda(e.target.value)} className={ic}>
              {Object.keys(MONEDAS).map(c => <option key={c} value={c}>{c} {MONEDAS[c].simbolo}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={lbl}>Nomenclatura de categorías</label>
          <select value={federacion} onChange={e => setFederacion(e.target.value)} className={ic}>
            <option value="NINGUNA">Solo World Boxing (U15, U17, U19, Elite)</option>
            <option value="RFEB">RFEB — España (por confirmar)</option>
            <option value="FECHIBOX">FECHIBOX — Chile</option>
          </select>
          {/* Imprimir un nombre de categoría equivocado en una planilla que se
              entrega a los clubes es peor que no imprimirlo: por eso la opción
              segura es la primera y es la que viene marcada. */}
          <p className="text-[14px] text-boxing-muted mt-1">
            Las categorías oficiales son siempre las de World Boxing. Esto solo agrega el nombre local
            en las planillas impresas. Las etiquetas de la RFEB están sin confirmar contra su reglamento.
          </p>
        </div>

        <div>
          <label className={lbl}>Aforo del recinto</label>
          <input type="number" min="1" step="10" value={aforo} onChange={e => setAforo(e.target.value)} className={ic} />
          <p className="text-[14px] text-boxing-muted mt-1">Cuántas personas caben. Es el número contra el que la pestaña Entradas mide lo vendido ("77 / {aforoValido(aforo, AFORO_POR_DEFECTO)}").</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Semifinales</label>
            <input type="date" value={semis} onChange={e => e.target.value && setSemis(e.target.value)} className={ic} />
          </div>
          <div>
            <label className={lbl}>Final</label>
            <input type="date" value={final} onChange={e => e.target.value && setFinal(e.target.value)} className={ic} />
          </div>
        </div>

        {/* Se dice lo que la velada nueva NO trae, porque es lo que más
            sorprende: nace vacía a propósito. Los peleadores del histórico no
            se copian —son inscripciones de otra velada, en otro país— y las
            entradas se numeran desde cero. */}
        <p className="text-[14px] text-boxing-muted leading-relaxed">
          La velada nueva nace vacía: sin peleadores, sin cartelera y con la boletería en cero.
          Los precios de entrada arrancan en {formatearImporte(preciosPorDefecto(moneda).preventa, moneda)} (preventa)
          y se cambian después desde "Moneda y precios".
        </p>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      <div className="flex gap-2 p-3 border-t border-boxing-line">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-full border border-boxing-line text-boxing-muted hover:text-boxing-cream text-sm font-bold tracking-[0.14em] uppercase transition-colors">Volver</button>
        <button onClick={crear} disabled={nombre.trim().length < 2 || guardando} className="btn-gold flex-1 py-2.5 text-sm font-bold tracking-[0.14em] uppercase disabled:opacity-40">{guardando ? "Creando…" : "Crear"}</button>
      </div>
    </>
  );
}

function PreciosEvento({ eventoId, meta, lbl, ic, onCancel, onGuardado }) {
  const monedaInicial = meta && MONEDAS[meta.moneda] ? meta.moneda : "EUR";
  const [moneda, setMoneda] = useState(monedaInicial);
  const [federacion, setFederacion] = useState((meta && meta.federacion) || "NINGUNA");
  const [aforo, setAforo] = useState((meta && meta.aforo) || AFORO_POR_DEFECTO);
  const [precios, setPrecios] = useState(() => (meta && meta.precios) || preciosPorDefecto(monedaInicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Al cambiar de moneda se proponen los precios típicos de esa moneda: dejar
  // 10.000 puesto al pasar a euros es el error caro (10.000 € la entrada).
  function cambiarMoneda(c) {
    setMoneda(c);
    setPrecios(preciosPorDefecto(c));
  }

  async function guardar() {
    if (guardando) return;
    setGuardando(true); setError("");
    const limpios = {
      inscripcion: precioValido(precios.inscripcion, 0),
      preventa: precioValido(precios.preventa, 0),
      puerta: precioValido(precios.puerta, 0),
    };
    try {
      const aforoLimpio = aforoValido(aforo, AFORO_POR_DEFECTO);
      await actualizarMetaEvento(eventoId, { moneda, federacion, aforo: aforoLimpio, precios: limpios });
      onGuardado({ ...meta, moneda, federacion, aforo: aforoLimpio, precios: limpios });
    } catch (e) {
      console.error("No se pudieron guardar los precios:", e);
      setError(e.message || "No se pudieron guardar.");
      setGuardando(false);
    }
  }

  const TIPOS = [["inscripcion", "Inscripción"], ["preventa", "Preventa"], ["puerta", "Puerta"]];

  return (
    <>
      <div className="p-4 space-y-4">
        <div>
          <label className={lbl}>Moneda</label>
          <select value={moneda} onChange={e => cambiarMoneda(e.target.value)} className={ic}>
            {Object.keys(MONEDAS).map(c => <option key={c} value={c}>{c} {MONEDAS[c].simbolo}</option>)}
          </select>
        </div>

        <div>
          <label className={lbl}>Nomenclatura de categorías</label>
          <select value={federacion} onChange={e => setFederacion(e.target.value)} className={ic}>
            {Object.keys(FEDERACIONES).map(c => <option key={c} value={c}>{c === "NINGUNA" ? "Solo World Boxing" : FEDERACIONES[c].nombre}</option>)}
          </select>
        </div>

        {TIPOS.map(([key, etiqueta]) => (
          <div key={key}>
            <label className={lbl}>{etiqueta}</label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" step={MONEDAS[moneda].decimales ? "0.5" : "500"} value={precios[key]}
                onChange={e => setPrecios({ ...precios, [key]: e.target.value })} className={ic} />
              <span className="text-boxing-muted text-sm w-24 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatearImporte(precioValido(precios[key], 0), moneda)}
              </span>
            </div>
          </div>
        ))}

        <div>
          <label className={lbl}>Aforo del recinto</label>
          <input type="number" min="1" step="10" value={aforo} onChange={e => setAforo(e.target.value)} className={ic} />
        </div>

        {/* La app resuelve los precios y el aforo al cargar la página
            (constants.js), así
            que guardarlos sin recargar dejaría la pantalla de venta con la
            tarifa vieja. Se avisa antes en vez de recargar por sorpresa. */}
        <p className="text-[14px] text-boxing-muted leading-relaxed">
          Al guardar, la app se recarga para que la venta, las boletas y la barra de aforo usen los valores nuevos.
          Las boletas YA emitidas conservan el precio con el que se cobraron.
        </p>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      <div className="flex gap-2 p-3 border-t border-boxing-line">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-full border border-boxing-line text-boxing-muted hover:text-boxing-cream text-sm font-bold tracking-[0.14em] uppercase transition-colors">Volver</button>
        <button onClick={guardar} disabled={guardando} className="btn-gold flex-1 py-2.5 text-sm font-bold tracking-[0.14em] uppercase disabled:opacity-40">{guardando ? "Guardando…" : "Guardar"}</button>
      </div>
    </>
  );
}
