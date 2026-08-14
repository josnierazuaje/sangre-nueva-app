// ============================================
// LA FICHA DE LA VELADA ABIERTA, EN ESTE DISPOSITIVO
// ============================================
// Cada velada lleva su ficha (`eventos/{id}/meta`): nombre, dueño, país,
// moneda, precios de las entradas, aforo del recinto y federación. Este módulo
// es el único sitio que la lee, y es de dónde salen todos los valores que
// antes estaban escritos en `constants.js`.
//
// POR QUÉ SE CACHEA EN EL DISPOSITIVO. Estos datos hacen falta ANTES de que
// conteste la nube: el primer render de la boletería ya pinta precios y ya
// dibuja la barra de aforo. Así que la ficha se guarda en localStorage —igual
// que los peleadores o las boletas— y se lee de ahí al arrancar. Lo que se
// cachea hoy es lo que la puerta usará mañana aunque el recinto no tenga señal.
//
// Salió de `moneda.js`, que se estaba convirtiendo en un cajón de sastre: ahí
// quedó lo que de verdad es moneda (las monedas, el formateo de importes) y
// aquí lo que es la ficha de la velada.

import { EVENTO_LEGACY_ID, eventoActivoId, lsKey } from "./eventos.js";
import { MONEDAS, MONEDA_POR_DEFECTO, MONEDA_LEGACY, monedaInfo, preciosPorDefecto, precioValido } from "./moneda.js";

export const META_CACHE_KEY = "bm_event_meta";

// Aforo del recinto donde se hace la velada: cuántas personas caben. Manda la
// barra de la pestaña Entradas ("77 / 320"), que es lo que el organizador mira
// para saber si aún puede vender.
//
// 320 era el número escrito en el código, y es el del gimnasio de la velada de
// Chile. En Madrid será otro — por eso ahora es un dato de cada velada.
export const AFORO_POR_DEFECTO = 320;
// Un recinto no tiene aforo cero ni un millón. El tope no protege de nada
// grave; evita que un dedazo (un cero de más) deje la barra de aforo inservible
// justo el día que hay que decidir si se siguen vendiendo entradas.
export const AFORO_MAX = 100000;

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

// La ficha de la velada abierta, o null. El histórico de Chile no tiene ficha
// en la nube (ver eventos.js): sus valores son los fijos de siempre.
function fichaActiva() {
  return eventoActivoId() === EVENTO_LEGACY_ID ? null : leerMetaLocal();
}

// Moneda del evento abierto. La del histórico está FIJADA, no heredada del
// defecto: sus cifras y su hoja de cierre, ya entregada a los socios, tienen
// que seguir diciendo exactamente lo mismo.
export function monedaDelEventoActivo() {
  if (eventoActivoId() === EVENTO_LEGACY_ID) return MONEDA_LEGACY;
  const meta = leerMetaLocal();
  return meta && MONEDAS[meta.moneda] ? meta.moneda : MONEDA_POR_DEFECTO;
}

// Formato de fecha del país de la velada: 14/8/2026 en España, 14-08-2026 en
// Chile. Lo usan las hojas impresas, que son documentos que se entregan.
export function localeDelEventoActivo() {
  return monedaInfo(monedaDelEventoActivo()).locale;
}

export function preciosDelEventoActivo() {
  const moneda = monedaDelEventoActivo();
  const meta = fichaActiva();
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

export function aforoDelEventoActivo() {
  const meta = fichaActiva();
  return aforoValido(meta && meta.aforo, AFORO_POR_DEFECTO);
}

// Pura y testeable. Un aforo inválido (vacío, cero, negativo, con decimales o
// absurdo) cae al valor por defecto: la barra de aforo divide entre este
// número, y un 0 la dejaría en Infinity — es decir, la pestaña Entradas rota
// el día del evento por un campo mal escrito semanas antes.
export function aforoValido(v, porDefecto) {
  if (v === null || v === undefined || v === "") return porDefecto;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= AFORO_MAX ? n : porDefecto;
}
