// ============================================
// EVENTOS — una app, muchas veladas
// ============================================
// Hasta aquí la app manejaba UNA velada: todo colgaba del nodo `sangre_nueva`
// en Firebase y de unas claves fijas de localStorage. Montar la siguiente
// obligaba a "Reiniciar evento", que borra la anterior — por eso la cartelera
// y el Super 4 de la velada del 1-2 de agosto de 2026 se perdieron: los datos
// de una velada y los de la siguiente ocupaban exactamente el mismo sitio.
//
// Ahora cada velada tiene su propio id y su propio rincón de la base:
//
//     eventos/{id}/bm_fighters_v4        eventos/{id}/tickets/{boleta}
//     eventos/{id}/meta                  eventos/{id}/backups/{fecha}
//
// LA VELADA DE CHILE NO SE MUEVE. Su id es el centinela `sangre_nueva` y sus
// rutas siguen siendo las de siempre (`sangre_nueva/…`, `sangre_nueva_backups`),
// con sus reglas y sus 42 boletas intactas. Migrar datos reales de producción
// —cobros ya hechos, datos de menores— es un riesgo que no hay ninguna
// necesidad de correr: basta con que el código sepa que ese evento vive en la
// dirección vieja. Lo mismo con las claves de localStorage: los dispositivos
// que ya tienen la PWA instalada siguen leyendo las suyas sin migración ni
// pantalla de bienvenida.
//
// Todo lo de aquí es PURO salvo las tres funciones que tocan localStorage al
// final, para que las rutas —lo único que, mal calculado, mezclaría los datos
// de dos veladas— se puedan fijar con pruebas.

// El evento histórico: la velada de Chile, en la dirección de siempre.
export const EVENTO_LEGACY_ID = "sangre_nueva";

// Qué evento está abierto en ESTE dispositivo. No es un dato del evento sino
// del aparato (como bm_fb_config o el modo escáner), así que no se prefija.
export const EVENTO_ACTIVO_KEY = "bm_evento_activo";

// Ficha del evento histórico. Vive en el código y no en la nube a propósito:
// crear un nodo `meta` dentro de `sangre_nueva` obligaría a escribir en el
// árbol de producción para no ganar nada — su nombre y su moneda no van a
// cambiar nunca.
export const META_LEGACY = {
  id: EVENTO_LEGACY_ID,
  nombre: "Sangre Nueva — Chile",
  pais: "CL",
  moneda: "CLP",
  creadoEl: "2026-07-03",
};

// ============================================
// IDENTIFICADORES
// ============================================
// Un id de evento se convierte en un tramo de ruta de Firebase, así que no
// puede traer los caracteres que RTDB prohíbe (. $ # [ ] /) ni espacios. Se
// deriva del nombre para que la consola de Firebase se lea sola ("madrid-2026-…"
// dice mucho más que "-Nx8fK2…") y lleva un sufijo corto que evita que dos
// veladas del mismo nombre —"Velada de Otoño" cada año— caigan en el mismo sitio
// y se pisen los datos.
export function slugify(nombre) {
  return String(nombre || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes: "Alcorcón" → "alcorcon"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// `sufijo` se inyecta para poder fijar el id en las pruebas; en producción lo
// genera el azar.
export function nuevoEventoId(nombre, sufijo) {
  const base = slugify(nombre) || "velada";
  const s = sufijo || Math.random().toString(36).slice(2, 8);
  return base + "-" + s;
}

// ¿Es un id que se puede usar como tramo de ruta? El guard existe porque un id
// inválido no falla al escribirlo: Firebase lanza al construir la referencia, y
// eso ocurriría en medio de un alta de peleador, no al crear el evento.
export function esEventoIdValido(id) {
  return typeof id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && id !== "meta";
}

// ============================================
// RUTAS
// ============================================
// Las dos funciones que de verdad importan: dado el evento activo, dónde vive
// cada dato. Si estas se equivocan, dos veladas comparten padrón o boletería.

// Ruta en Firebase de una clave del evento ("bm_fighters_v4", "tickets/PRE-0001",
// "counters/preventa"…). Con la clave vacía devuelve la raíz del evento, que es
// lo que usa la migración de boletas para escribir varios hijos de una vez.
export function rutaEvento(eventoId, clave) {
  const k = clave == null ? "" : String(clave);
  if (eventoId === EVENTO_LEGACY_ID) return EVENTO_LEGACY_ID + "/" + k;
  return "eventos/" + eventoId + "/" + k;
}

// Dónde se guardan los respaldos de "Reiniciar evento" y "Limpiar". Colgarlos
// del evento (y no de un nodo global) es lo que evita el accidente de restaurar
// en la velada de Madrid un respaldo de la de Santiago.
export function rutaBackups(eventoId) {
  if (eventoId === EVENTO_LEGACY_ID) return "sangre_nueva_backups";
  return "eventos/" + eventoId + "/backups";
}

// Ficha del evento (nombre, dueño, país, moneda). El legacy no tiene: su ficha
// es META_LEGACY, en el código.
export function rutaMeta(eventoId) {
  if (eventoId === EVENTO_LEGACY_ID) return null;
  return "eventos/" + eventoId + "/meta";
}

// Lista blanca de colaboradores de ESTE evento. El staff dejó de ser global: el
// entrenador que ayuda en la puerta en Madrid no tiene por qué ver el padrón de
// otra velada — y cuando la app la use otro organizador, mucho menos.
export function rutaStaff(eventoId) {
  if (eventoId === EVENTO_LEGACY_ID) return "staff"; // el árbol viejo, sin tocar
  return "eventos/" + eventoId + "/staff";
}

// Índice "mis eventos" de un usuario. RTDB no sabe filtrar "los eventos cuyo
// ownerUid es el mío" sin permiso de lectura sobre TODOS, así que cada usuario
// lleva su propia lista de ids y luego lee la ficha de cada uno.
export function rutaEventosDeUsuario(uid) {
  return "usuarios/" + uid + "/eventos";
}

// Clave de localStorage de un dato del evento. El prefijo es lo que impide que
// la caché de una velada se lea como si fuera la de otra al cambiar de evento
// — incluidas las COLAS de pendientes, que son el caso grave: una venta que
// quedó sin subir en Santiago no puede reaparecer en la boletería de Madrid.
export function claveLocal(eventoId, clave) {
  if (eventoId === EVENTO_LEGACY_ID) return clave; // los dispositivos ya instalados no migran nada
  return "ev:" + eventoId + ":" + clave;
}

// ============================================
// EVENTO ACTIVO (lo único que toca localStorage)
// ============================================
// Se lee una sola vez al arrancar y se cachea en memoria: `rutaEvento` se llama
// en cada escritura, y una velada entera son miles de llamadas. Además hace que
// cambiar de evento a mitad de sesión sea imposible por accidente — el cambio
// escribe y RECARGA la app (ver cambiarDeEvento en App), que es la única forma
// honesta de soltar los listeners de Firebase ya montados sobre el evento viejo.
let activoCache = null;

export function eventoActivoId() {
  if (activoCache) return activoCache;
  let guardado = null;
  try { guardado = localStorage.getItem(EVENTO_ACTIVO_KEY); } catch (e) {}
  // Por defecto, el evento de siempre: un dispositivo que ya tenía la app
  // instalada la reabre y ve exactamente lo que veía ayer.
  activoCache = esEventoIdValido(guardado) ? guardado : EVENTO_LEGACY_ID;
  return activoCache;
}

export function guardarEventoActivo(id) {
  if (!esEventoIdValido(id) && id !== EVENTO_LEGACY_ID) return false;
  try { localStorage.setItem(EVENTO_ACTIVO_KEY, id); } catch (e) {
    console.error("No se pudo recordar el evento activo en este dispositivo:", e);
    return false;
  }
  activoCache = id;
  return true;
}

// ============================================
// QUIÉN MANDA EN UN EVENTO
// ============================================
// Hasta ahora "el dueño" era un correo escrito en el código y en las reglas: el
// de Josnier. Con varias veladas —y con la idea de que la app la usen otros
// organizadores— el dueño pasa a ser de CADA evento, y es su `ownerUid`.
//
// El correo del creador de la app se conserva como superusuario: es quien puede
// entrar a socorrer un evento ajeno (y es lo que dicen las reglas de la base,
// que son las que de verdad mandan — esto solo decide qué botones se ofrecen).
//
// Puro a propósito, con el correo y el evento como argumentos: así se puede
// probar sin arrastrar Firebase, y no hay dos sitios distintos leyendo quién es
// el dueño.
export function esDuenoDelEvento(user, meta, { eventoId, superEmail } = {}) {
  if (!user) return false;
  if (superEmail && user.email === superEmail) return true;
  // El histórico de Chile no tiene ficha en la nube: su dueño es el de siempre,
  // el superusuario. Sin este caso, al abrirlo el menú del dueño desaparecería.
  if (eventoId === EVENTO_LEGACY_ID) return false;
  return !!(meta && meta.ownerUid && meta.ownerUid === user.uid);
}

// Atajos para el evento ABIERTO: son los que usa el resto de la app, para que
// ningún módulo tenga que acordarse de pasar el id (olvidarlo en un solo sitio
// es exactamente cómo se mezclarían los datos de dos veladas).
export function fbPathEvento(clave) { return rutaEvento(eventoActivoId(), clave); }
export function lsKey(clave) { return claveLocal(eventoActivoId(), clave); }

// Prefijo de TODAS las claves de una velada en este dispositivo. Pura, para
// poder probar el barrido sin depender de localStorage.
export function prefijoLocal(eventoId) {
  return eventoId === EVENTO_LEGACY_ID ? null : "ev:" + eventoId + ":";
}

// Qué claves hay que borrar de este dispositivo al borrar una velada. Se separa
// del barrido para poder fijarlo con pruebas: si se quedara corto, en el aparato
// seguirían los peleadores (con menores) y las boletas de una velada que ya no
// existe, y "Recargar desde la nube" no los limpiaría porque ya no hay nube que
// consultar. Devuelve [] para el histórico: sus claves no llevan prefijo y
// barrer por él borraría las de la velada abierta.
export function clavesLocalesDeEvento(eventoId, todasLasClaves) {
  const pre = prefijoLocal(eventoId);
  if (!pre) return [];
  return (todasLasClaves || []).filter(k => typeof k === "string" && k.indexOf(pre) === 0);
}

export function borrarDatosLocalesDeEvento(eventoId) {
  try {
    const todas = [];
    for (let i = 0; i < localStorage.length; i++) todas.push(localStorage.key(i));
    const suyas = clavesLocalesDeEvento(eventoId, todas);
    suyas.forEach(k => localStorage.removeItem(k));
    return suyas.length;
  } catch (e) {
    console.error("No se pudieron borrar los datos locales de la velada:", e);
    return 0;
  }
}

// Solo para las pruebas: reinicia la caché entre casos.
export function _resetEventoActivoCache() { activoCache = null; }
