// ============================================
// MONEDA Y PRECIOS — un dato del evento, no del código
// ============================================
// La app nació para una velada en Chile, así que el peso chileno estaba escrito
// en el código: `"$" + n.toLocaleString("es-CL")` y las entradas a 5.000, 7.000
// y 10.000. Mudarse a España con eso puesto significa una boletería que cobra
// "$10.000" por una entrada de 10 €.
//
// Ahora la moneda y los precios viajan en la ficha del evento (`meta`), así que
// la velada de Santiago sigue en pesos —sus 42 boletas cuadran igual que
// siempre— y la de Madrid nace en euros. Y no hay que tocar el código para
// abrir la siguiente en otro país.
//
// Dos detalles que no son cosmética:
//  · el símbolo NO va siempre delante: en España se escribe "15 €" (con espacio
//    y detrás), en Chile "$15.000". Ponerlo mal delata al instante que la app es
//    de fuera, justo delante del cliente al que se la quieres vender;
//  · el euro lleva céntimos y el peso chileno no. Redondear un precio de 12,50 €
//    a 13 € porque el formateador no tiene decimales es dinero mal cobrado.

import { EVENTO_LEGACY_ID, eventoActivoId, lsKey } from "./eventos.js";

export const MONEDAS = {
  EUR: {
    codigo: "EUR", simbolo: "€", locale: "es-ES", decimales: 2, simboloDetras: true,
    // Precios de arranque de una velada amateur en España (entrada de club,
    // no de recinto grande). Son solo el valor inicial: el organizador los
    // edita en la ficha del evento.
    precios: { inscripcion: 10, preventa: 12, puerta: 15 },
  },
  CLP: {
    codigo: "CLP", simbolo: "$", locale: "es-CL", decimales: 0, simboloDetras: false,
    precios: { inscripcion: 5000, preventa: 7000, puerta: 10000 },
  },
};

// España es el mercado de aquí en adelante; Chile queda como el histórico.
export const MONEDA_POR_DEFECTO = "EUR";

// La moneda del evento HISTÓRICO no se decide por el defecto de arriba: está
// fijada a pesos para que sus cifras (y su hoja de cierre, ya impresa y
// entregada a los socios) sigan diciendo exactamente lo mismo que decían.
export const MONEDA_LEGACY = "CLP";

export function monedaInfo(codigo) {
  return MONEDAS[codigo] || MONEDAS[MONEDA_POR_DEFECTO];
}

export function preciosPorDefecto(codigo) {
  return { ...monedaInfo(codigo).precios };
}

// Formatea un importe en la moneda dada. Puro y testeable: es lo que sale en la
// boleta, en el voucher de WhatsApp, en el reporte y en la hoja de cierre.
export function formatearImporte(n, codigo) {
  const m = monedaInfo(codigo);
  const num = Number(n) || 0;
  const txt = num.toLocaleString(m.locale, {
    minimumFractionDigits: m.decimales,
    maximumFractionDigits: m.decimales,
  });
  // El espacio antes del símbolo en euros es el que manda la norma española y
  // el que espera cualquiera que lea la boleta allí ("15 €", no "15€").
  return m.simboloDetras ? txt + " " + m.simbolo : m.simbolo + txt;
}

// ============================================
// LA FICHA DEL EVENTO ABIERTO, EN ESTE DISPOSITIVO
// ============================================
// La moneda hace falta ANTES de que conteste la nube: el primer render ya
// pinta precios. Por eso la ficha se cachea en localStorage —igual que los
// peleadores o las boletas— y se lee de ahí al arrancar.
export const META_CACHE_KEY = "bm_event_meta";

export function leerMetaLocal() {
  try {
    const raw = localStorage.getItem(lsKey(META_CACHE_KEY));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function guardarMetaLocal(meta) {
  try { localStorage.setItem(lsKey(META_CACHE_KEY), JSON.stringify(meta || {})); }
  catch (e) { console.error("No se pudo cachear la ficha del evento en este dispositivo:", e); }
}

// Moneda del evento abierto. El histórico de Chile no tiene ficha en la nube
// (ver eventos.js): su moneda está fijada, no heredada del defecto.
export function monedaDelEventoActivo() {
  if (eventoActivoId() === EVENTO_LEGACY_ID) return MONEDA_LEGACY;
  const meta = leerMetaLocal();
  return meta && MONEDAS[meta.moneda] ? meta.moneda : MONEDA_POR_DEFECTO;
}

// Formato de fecha del país de la velada: 14/8/2026 en España, 14-08-2026 en
// Chile. Lo usa el pie de la hoja de cierre, que es un documento que se
// entrega impreso.
export function localeDelEventoActivo() {
  return monedaInfo(monedaDelEventoActivo()).locale;
}

export function preciosDelEventoActivo() {
  const moneda = monedaDelEventoActivo();
  const meta = eventoActivoId() === EVENTO_LEGACY_ID ? null : leerMetaLocal();
  const guardados = meta && meta.precios ? meta.precios : null;
  const base = preciosPorDefecto(moneda);
  if (!guardados) return base;
  // Un precio suelto corrupto (o un tipo de entrada nuevo que la ficha vieja no
  // conocía) cae al valor por defecto en vez de dejar la venta en NaN.
  return {
    inscripcion: precioValido(guardados.inscripcion, base.inscripcion),
    preventa: precioValido(guardados.preventa, base.preventa),
    puerta: precioValido(guardados.puerta, base.puerta),
  };
}

// El cero SÍ es un precio válido (una entrada de cortesía), pero un campo
// AUSENTE no lo es: Number(null) y Number("") valen 0, así que sin este filtro
// una ficha a la que le falta un tipo de entrada cobraría 0 — es decir, la
// puerta regalando entradas sin que nadie se entere hasta el cierre.
export function precioValido(v, porDefecto) {
  if (v === null || v === undefined || v === "") return porDefecto;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}
