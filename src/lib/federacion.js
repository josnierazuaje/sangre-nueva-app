// ============================================
// FEDERACIÓN — la nomenclatura local de las categorías de edad
// ============================================
// Las categorías oficiales de la app son las de World Boxing (U15, U17, U19,
// Elite): son las que valen internacionalmente y NO cambian de país. Lo que sí
// cambia es cómo las llama la federación de cada sitio, y ese nombre local es
// el que los entrenadores reconocen en una planilla impresa.
//
// Hasta ahora la equivalencia chilena (FECHIBOX) estaba escrita en el código y
// salía en la cartelera, en las llaves y en las listas. En España eso imprime
// una planilla que nadie reconoce. Ahora la federación es un dato del evento.
//
// ⚠️ LAS ETIQUETAS ESPAÑOLAS ESTÁN POR CONFIRMAR. Las de FECHIBOX vienen de
// usarlas en una velada real; las de la RFEB están puestas de memoria y no
// contra su reglamento. Por eso existe la opción "sin federación": mientras no
// estén confirmadas, es preferible imprimir solo la categoría World Boxing
// —que es correcta en cualquier país— que imprimir un nombre local equivocado
// en una planilla que se entrega a los clubes.

import { EVENTO_LEGACY_ID, eventoActivoId } from "./eventos.js";
import { leerMetaLocal } from "./fichaEvento.js";

export const FEDERACIONES = {
  FECHIBOX: {
    codigo: "FECHIBOX",
    nombre: "FECHIBOX",
    etiquetas: { escolar: "Escolar", cadete: "Cadete", juvenil: "Juvenil", adulto: "Adulto/Elite" },
  },
  RFEB: {
    codigo: "RFEB",
    nombre: "RFEB",
    // Por confirmar contra el reglamento de la Real Federación Española de
    // Boxeo antes de usarlas en una planilla oficial (ver el aviso de arriba).
    etiquetas: { escolar: "Escolar", cadete: "Cadete", juvenil: "Junior", adulto: "Élite" },
  },
  // Sin equivalencia local: la app imprime solo U15/U17/U19/Elite. Es el valor
  // seguro y el que se usa mientras no se confirme la nomenclatura de un país.
  NINGUNA: { codigo: "NINGUNA", nombre: "", etiquetas: {} },
};

export const FEDERACION_POR_DEFECTO = "NINGUNA";

export function federacionInfo(codigo) {
  return FEDERACIONES[codigo] || FEDERACIONES[FEDERACION_POR_DEFECTO];
}

// Qué federación usa la velada abierta. El histórico de Chile mantiene
// FECHIBOX: sus planillas ya impresas y su hoja de cierre dicen eso.
export function federacionDelEventoActivo() {
  if (eventoActivoId() === EVENTO_LEGACY_ID) return FEDERACIONES.FECHIBOX;
  const meta = leerMetaLocal();
  return federacionInfo(meta && meta.federacion);
}

// Nombre local de una categoría de edad, o cadena vacía si esta velada no usa
// ninguna equivalencia. Los llamadores ya saben tratar el vacío: la planilla
// simplemente no imprime esa parte.
export function etiquetaFederacion(claveEdad, fed) {
  const f = fed || federacionDelEventoActivo();
  return (f.etiquetas && f.etiquetas[claveEdad]) || "";
}
