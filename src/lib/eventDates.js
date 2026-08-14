// ============================================
// Fechas del evento — el dato, y las etiquetas que salen de él
// ============================================
// Las dos fechas de la velada (semifinales y final del Super 4) estaban
// quemadas en constants.js: montar la próxima fecha obligaba a editar el
// código y desplegar de nuevo. Aquí viven como un DATO —dos fechas en formato
// ISO ("2026-08-01")— que el organizador edita desde la app y que se sincroniza
// como una clave más. Este módulo solo sabe dos cosas: validar esas fechas y
// convertirlas en las etiquetas que muestran la app, las planillas y los
// impresos ("Sáb 01", "sábado 01 de agosto", el rango completo…).
//
// Es puro a propósito: no lee localStorage ni Firebase. Quien tenga las fechas
// llama a buildEventLabels y reparte el resultado.

const WEEKDAYS_FULL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAYS_ABBR = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Fecha ISO de HOY, calculada desde el año/mes/día LOCALES y armada en UTC
// (misma razón que describeEventDate: con hora local, una zona al oeste de
// Greenwich se corre un día). El `now` entra como parámetro para poder
// probarla sin depender del reloj de quien corre los tests.
export function isoDeHoy(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

// Fecha por defecto mientras el organizador no haya puesto la suya (y valor
// inicial del nodo en la nube): HOY.
//
// Antes eran las dos fechas de la velada de agosto de 2026, escritas aquí a
// mano. Eso convertía a una velada concreta —y ya pasada— en el valor de
// fábrica de la app: un dispositivo nuevo, o la próxima organización que tome
// la app, veía su cartelera anunciando sola el "sábado 01 y domingo 02 de
// agosto de 2026" hasta que alguien se diera cuenta. Con el día de hoy el valor
// sigue siendo válido para imprimir, pero ya no afirma una fecha ajena: es
// evidente que hay que cambiarlo en "Datos del evento".
//
// El reloj se lee UNA sola vez, al cargar el módulo. El resto de las funciones
// siguen sin mirar la hora — que es lo que las mantiene puras y testeables.
export const DEFAULT_EVENT_DATES = { semis: isoDeHoy(), final: isoDeHoy() };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// "2026-08-01" → true. Exige día REAL del calendario: "2026-02-30" es falso
// (un input date nunca lo produce, pero el valor viaja por la nube y puede
// llegar de un respaldo viejo o editado a mano).
export function isValidISODate(s) {
  const m = typeof s === "string" && s.match(ISO_RE);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  // Día 0 del mes siguiente = último día de este mes.
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

// Deja siempre un par de fechas usable: lo que no se entienda cae al valor por
// defecto, campo por campo. Así un nodo corrupto en la nube nunca deja la app
// sin fecha ni la hace explotar al imprimir.
export function normalizeEventDates(raw) {
  const semis = isValidISODate(raw?.semis) ? raw.semis : DEFAULT_EVENT_DATES.semis;
  const final = isValidISODate(raw?.final) ? raw.final : DEFAULT_EVENT_DATES.final;
  return { semis, final };
}

// Descompone una fecha ISO en sus partes ya en español. Se calcula en UTC a
// propósito: con hora local, un navegador al oeste de Greenwich interpreta
// "2026-08-01" como el 31 de julio por la noche y la etiqueta saldría con el
// día anterior.
export function describeEventDate(iso) {
  const s = isValidISODate(iso) ? iso : DEFAULT_EVENT_DATES.semis;
  const [y, mo, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return {
    iso: s,
    weekdayFull: WEEKDAYS_FULL[dt.getUTCDay()],
    weekdayAbbr: WEEKDAYS_ABBR[dt.getUTCDay()],
    day: String(d).padStart(2, "0"), // string: conserva el cero a la izquierda
    monthName: MONTHS[mo - 1],
    month: mo,
    year: y,
  };
}

// Misma forma que tenía la constante EVENT_DATES escrita a mano, para que todo
// lo que ya la leía siga funcionando igual.
export function describeEventDates(dates) {
  const d = normalizeEventDates(dates);
  return { semis: describeEventDate(d.semis), final: describeEventDate(d.final) };
}

// Las 7 etiquetas que usa el resto de la app. Los formatos son los mismos de
// siempre; lo único nuevo es que ahora salen de un dato editable.
export function buildEventLabels(dates) {
  const { semis: s, final: f } = describeEventDates(dates);
  return {
    semiAbbr: `${s.weekdayAbbr} ${s.day}`,                    // "Sáb 01"
    finalAbbr: `${f.weekdayAbbr} ${f.day}`,                   // "Dom 02"
    semiWd: `${s.weekdayFull} ${s.day}`,                      // "sábado 01"
    finalWd: `${f.weekdayFull} ${f.day}`,                     // "domingo 02"
    semiLong: `${s.weekdayFull} ${s.day} de ${s.monthName}`,  // "sábado 01 de agosto"
    finalLong: `${f.weekdayFull} ${f.day} de ${f.monthName}`, // "domingo 02 de agosto"
    rango: rangoLabel(s, f),
  };
}

// Rango completo para encabezados y para compartir: dice lo mínimo necesario
// para que la fecha no sea ambigua. Una velada de un solo día no puede decir
// "el 1 y el 1"; una que cruza de mes o de año necesita nombrar los dos.
function rangoLabel(s, f) {
  if (s.iso === f.iso) return `${s.weekdayFull} ${s.day} de ${s.monthName} de ${s.year}`;
  if (s.year === f.year && s.month === f.month) {
    return `${s.weekdayFull} ${s.day} y ${f.weekdayFull} ${f.day} de ${f.monthName} de ${f.year}`;
  }
  if (s.year === f.year) {
    return `${s.weekdayFull} ${s.day} de ${s.monthName} y ${f.weekdayFull} ${f.day} de ${f.monthName} de ${f.year}`;
  }
  return `${s.weekdayFull} ${s.day} de ${s.monthName} de ${s.year} y ${f.weekdayFull} ${f.day} de ${f.monthName} de ${f.year}`;
}
