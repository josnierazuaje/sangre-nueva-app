// ============================================
// BOLETAS — venta, ingreso en la puerta y su sincronización
// ============================================
// Todo lo que rodea a una entrada vendida vive acá: el correlativo, la
// escritura por nodo individual, las dos colas que protegen lo que representa
// dinero (ventas e ingresos pendientes de confirmar), el check-in atómico de la
// puerta, la escucha en vivo y la restauración desde un respaldo.
//
// Salió de storage.js —que había crecido a 930 líneas mezclando peleadores,
// boletas y respaldos— sin cambiar una sola línea de lógica: es el mismo
// código, con las mismas garantías, movido de sitio. La dependencia va en una
// sola dirección: esto usa las piezas genéricas de storage.js (localStorage,
// las colas puras, la intención de nube), y storage.js no sabe de boletas.

import { ref, set as dbSet, update as dbUpdate, remove as dbRemove, get, onValue, runTransaction } from "firebase/database";
import { FB, fbPath, reportSyncError } from "./firebase.js";
import { load, pruneOutbox, applyOutboxPut, applyOutboxRemove, cloudIntended } from "./storage.js";
import { TICKETS_OUTBOX_KEY, CHECKIN_OUTBOX_KEY, TICKETS_CACHE_KEY } from "./storageKeys.js";
import { lsKey } from "./eventos.js";

export function loadTicketsV4() { return load(TICKETS_CACHE_KEY, []); }

// Guarda el espejo local de boletas cuando NO hay nube. Con la sincronización
// desconectada, watchTickets no corre y era el único que escribía ese espejo:
// las ventas y los check-ins vivían solo en la memoria de la página, así que
// recargar la app —el gesto habitual para "actualizarla"— dejaba el registro de
// ventas en cero, sin error ni aviso. Y el propio diálogo de desconectar
// prometía justo lo contrario ("los datos locales se conservan").
export function cacheTicketsSiSinNube(list) {
  if (FB.ready) return; // con nube, watchTickets ya mantiene el espejo al día
  cacheTicketsV4(list);
}

// Lee UNA boleta directo de la nube. La puerta valida contra el espejo local
// (rápido, y funciona sin señal), pero ese espejo puede no tenerla todavía: un
// teléfono recién abierto con "?scan=1" empieza vacío y tarda en bajar las
// 300-800 boletas. Sin esta consulta puntual, un QR legítimo salía como
// "Boleta no encontrada" y el portero podía rechazar a alguien que sí pagó.
// Devuelve la boleta, o null si no existe / no se pudo leer.
export async function fetchTicket(id) {
  if (!FB.ready || !FB.db) return null;
  try {
    const snap = await withTimeout(get(ref(FB.db, fbPath("tickets/" + id))), 5000);
    return snap.exists() ? snap.val() : null;
  } catch (e) {
    console.error("No se pudo consultar la boleta " + id + " en la nube:", e);
    return null;
  }
}
function cacheTicketsV4(list) { localStorage.setItem(lsKey(TICKETS_CACHE_KEY), JSON.stringify(list)); }
export function padN(n) { return String(n).padStart(4, "0"); }

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    // `esTimeout` distingue "no contestó a tiempo" (la escritura SIGUE en vuelo
    // y probablemente se confirme sola) de un rechazo real (permiso, dato
    // inválido). El check-in los trata muy distinto: uno es "pendiente", el
    // otro es un error de verdad.
    new Promise((_, reject) => setTimeout(() => {
      const e = new Error("timeout esperando a Firebase");
      e.esTimeout = true;
      reject(e);
    }, ms)),
  ]);
}

// Correlativo local (sin sincronización): se deriva del máximo id ya usado
// en las boletas que ya tenemos, sin depender de un contador aparte.
// Sufijo único para los ids de emergencia: reloj + aleatorio, el mismo patrón
// que genId() ya usa para los peleadores.
export function emergencySuffix() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
}

export function maxCounterFromTickets(tickets, tipo) {
  let max = 0;
  (tickets || []).forEach(t => {
    if (t.ticketType !== tipo) return;
    const m = /^[A-Za-z]+-(\d+)$/.exec(t.id || "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

// Genera el siguiente id de boleta. Con sincronización activa, usa un
// contador transaccional en Firebase (atómico entre dispositivos). Si la
// transacción falla o no hay conexión, genera un id de emergencia único
// (marcado con "-X") en vez de arriesgarse a duplicar un correlativo.
export async function nextTicketId(tipo, prefix, localTickets) {
  if (FB.ready) {
    try {
      const counterRef = ref(FB.db, fbPath("counters/" + tipo));
      const result = await withTimeout(runTransaction(counterRef, cur => (cur || 0) + 1), 4000);
      if (result.committed) return prefix + "-" + padN(result.snapshot.val());
    } catch (e) {
      console.error("No se pudo generar un correlativo en la nube (¿sin conexión?); se usa un id de emergencia:", e);
    }
    // Id de emergencia. Lleva una parte ALEATORIA además del reloj: sin ella,
    // dos teléfonos vendiendo el mismo tipo de entrada en el mismo milisegundo
    // generaban el MISMO id, la segunda venta pisaba a la primera (mismo nodo,
    // last-write-wins) y en la puerta el QR del primer comprador cotejaba
    // contra el token del segundo: "entrada falsificada" a alguien que pagó.
    return prefix + "-X" + emergencySuffix();
  }
  const next = maxCounterFromTickets(localTickets, tipo) + 1;
  return prefix + "-" + padN(next);
}

// ============================================
// OUTBOX de boletas — ventas que SOBREVIVEN a la recarga
// ============================================
// Misma garantía que el outbox de peleadores, pero para lo que representa
// DINERO. Antes, addTicketNode era dispara-y-olvida: sin señal la escritura
// quedaba encolada SOLO en la memoria del SDK, y el flujo de venta obliga a
// salir a WhatsApp para mandar el voucher — con la PWA en segundo plano el
// sistema puede matarla y la cola muere con ella. La boleta nunca llegaba a la
// nube y, al reconectar, watchTickets sobrescribía la copia local con la del
// servidor: la venta desaparecía TAMBIÉN del teléfono del vendedor, sin aviso.
// El comprador quedaba pagado y sin entrada ("Boleta no encontrada" en la
// puerta) y la caja no cuadraba. Es el mismo fallo que ya ocurrió con los
// peleadores (los "fantasmas"), que fue lo que motivó el primer outbox.

// Marcas internas que viven SOLO en este dispositivo y jamás deben viajar a la
// nube: `_queuedAt` (antigüedad del pendiente) y `_pending` (bandera de la UI).
export function stripLocalFlags(t) {
  if (!t || typeof t !== "object") return t;
  const o = {};
  Object.keys(t).forEach(k => { if (k[0] !== "_") o[k] = t[k]; });
  return o;
}

// Pura y testeable: fusiona los pendientes sobre la copia de la NUBE. Solo
// agrega los que FALTAN en el servidor — nunca pisa la versión remota de una
// boleta que ya existe. Es deliberado: un pendiente viejo podría decir
// "activo" mientras el servidor ya la tiene "ingresado", y dejarlo ganar
// revertiría un check-in en pantalla. Los agregados se marcan con `_pending`
// para que el Historial los muestre como aún no sincronizados.
export function mergePendingTickets(cloudList, pending) {
  const base = Array.isArray(cloudList) ? cloudList : [];
  const yaEstan = new Set(base.map(t => t && t.id));
  const faltantes = (pending || [])
    .filter(p => p && p.id && !yaEstan.has(p.id))
    .map(p => ({ ...stripLocalFlags(p), _pending: true }));
  return [...base, ...faltantes];
}

// Ordena por fecha de creación (el orden que espera la UI del Historial).
export function sortTickets(list) {
  return [...(list || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// Reutiliza las funciones puras del outbox de peleadores: son genéricas sobre
// objetos con `id` (agregar/quitar por id y podar por TTL), así que no hay
// motivo para duplicar esa lógica —ni sus pruebas— para las boletas.
export function ticketsOutboxList() { return pruneOutbox(load(TICKETS_OUTBOX_KEY, []), Date.now()); }
function ticketsOutboxPut(t) {
  // Igual que en peleadores: anotar el pendiente es lo que SOSTIENE la promesa
  // de entrega, así que si falla (cuota llena) se avisa en el chip.
  try { localStorage.setItem(lsKey(TICKETS_OUTBOX_KEY), JSON.stringify(applyOutboxPut(load(TICKETS_OUTBOX_KEY, []), t, Date.now()))); }
  catch (e) { reportSyncError("No se pudo anotar la venta pendiente en este dispositivo:", e); }
}
function ticketsOutboxRemove(id) {
  // Solo descuenta algo ya confirmado y escribe una cadena más corta (por cuota
  // no puede fallar): basta la consola, nunca debe pintar de rojo una venta que
  // la nube SÍ confirmó.
  try { localStorage.setItem(lsKey(TICKETS_OUTBOX_KEY), JSON.stringify(applyOutboxRemove(load(TICKETS_OUTBOX_KEY, []), id))); }
  catch (e) { console.error("No se pudo descontar la venta pendiente en este dispositivo:", e); }
}

// Devuelve la promesa de la escritura (con su propio .catch), por si el
// llamador quiere reaccionar; NO debe esperarse con await en el flujo de venta:
// sin conexión RTDB deja la promesa pendiente hasta reconectar y colgaría el
// voucher. El fallo real (rechazo) se avisa por el chip vía reportSyncError.
// La boleta se anota como PENDIENTE antes de salir y solo se descuenta cuando
// la nube confirma el commit; si la app se recarga o muere en el intermedio,
// replayTicketsOutbox la re-sube al arrancar.
export function addTicketNode(ticket) {
  const limpia = stripLocalFlags(ticket);
  if (cloudIntended()) ticketsOutboxPut(limpia);
  if (!FB.ready) return Promise.resolve();
  return dbSet(ref(FB.db, fbPath("tickets/" + limpia.id)), limpia)
    .then(() => ticketsOutboxRemove(limpia.id))
    .catch(e => reportSyncError("No se pudo guardar la boleta en Firebase (sigue guardada localmente):", e));
}

// Re-sube las ventas que quedaron PENDIENTES de confirmación. Se llama al
// arrancar la sincronización de boletas. Crea el nodo SOLO si no existe: si la
// boleta ya está en la nube (la escritura sí llegó, o alguien ya la marcó como
// ingresada) no se pisa nada — un dbSet a ciegas devolvería una boleta ya
// usada al estado "activo" y su QR volvería a admitir gente. Devuelve cuántos
// pendientes quedaron resueltos.
export async function replayTicketsOutbox() {
  if (!FB.ready) return 0;
  const pendientes = ticketsOutboxList();
  if (!pendientes.length) return 0;
  console.info("Recuperando " + pendientes.length + " venta(s) pendiente(s) de guardar en la nube…");
  let resueltas = 0;
  for (const p of pendientes) {
    const boleta = stripLocalFlags(p);
    try {
      const res = await runTransaction(ref(FB.db, fbPath("tickets/" + boleta.id)), cur => {
        if (cur) return; // ya existe en la nube: abortar sin escribir
        return boleta;
      });
      // El nodo existe (lo creamos ahora o ya estaba): la venta está a salvo.
      if (res.snapshot.exists()) { ticketsOutboxRemove(boleta.id); resueltas++; }
    } catch (e) {
      // Sigue en el outbox: se reintenta al reconectar o al reabrir la app.
      reportSyncError("No se pudo recuperar la venta pendiente " + boleta.id + ":", e);
    }
  }
  return resueltas;
}
export function updateTicketNode(id, patch) {
  if (!FB.ready) return Promise.resolve();
  return dbUpdate(ref(FB.db, fbPath("tickets/" + id)), patch)
    .catch(e => reportSyncError("No se pudo actualizar la boleta en Firebase (sigue actualizada localmente):", e));
}

// Marca el ingreso de una boleta de forma ATÓMICA en el servidor: la
// transacción solo pasa la boleta de "activo" a "ingresado" si en ese momento
// SIGUE activa. Así, si dos puertas escanean el mismo QR (o el original y una
// captura reenviada) casi a la vez, solo una gana: la otra recibe already=true
// y no cuenta un segundo ingreso. Sin esto, ambas leían "activo" del espejo
// local y escribían "ingresado" (last-write-wins), dejando pasar a dos
// personas con una sola entrada pagada.
// Devuelve: { ok } (recién ingresada), { already, ticket } (ya estaba
// ingresada / otra puerta la marcó), { offline } (sin conexión: no se pudo
// confirmar en el servidor), o { error }.
// Pura y testeable: LA regla que decide si una persona entra al recinto.
// Devuelve el nodo nuevo, o `undefined` para ABORTAR la transacción (la boleta
// no existe o ya no está activa). Vivía como callback anónimo dentro de
// runTransaction, o sea que la lógica más crítica del evento no tenía una sola
// prueba y podía romperse en un refactor sin que nada fallara.
// `manual` = el operador tecleó el número y el QR no verificó la boleta. Se
// GUARDA en el registro para que el cierre distinga los ingresos verificados de
// los aceptados por criterio del staff: quien vio el voucher de otra persona
// (una foto reenviada en un grupo) podía llegar a la puerta, decir un
// correlativo cercano y entrar gratis a costa de una entrada pagada.
export function applyCheckIn(t, nowISO, manual) {
  if (!t || t.status !== "activo") return undefined;
  const next = { ...t, status: "ingresado", checkedInAt: nowISO };
  if (manual) next.checkedInManual = true;
  return next;
}

// Pura y testeable: traduce el resultado de la transacción al veredicto que ve
// el staff de la puerta.
export function interpretCheckIn(committed, val) {
  if (committed && val && val.status === "ingresado") return { ok: true, ticket: val };
  if (val && val.status === "ingresado") return { already: true, ticket: val };
  return { error: new Error("boleta no encontrada o no activa"), ticket: val };
}

// ============================================
// OUTBOX de INGRESOS — check-ins que sobreviven a la recarga
// ============================================
// Sin señal, RTDB aplica la transacción en local y la encola en MEMORIA: si la
// página muere antes de reconectar, el servidor nunca se entera y esa boleta
// sigue "activo" en la nube — su QR (o una captura reenviada) vuelve a admitir
// al grupo entero en otra puerta. Se anota el ingreso como pendiente para
// reintentarlo al reabrir la app.
export function checkinOutboxList() { return pruneOutbox(load(CHECKIN_OUTBOX_KEY, []), Date.now()); }
function checkinOutboxPut(id, manual) {
  try { localStorage.setItem(lsKey(CHECKIN_OUTBOX_KEY), JSON.stringify(applyOutboxPut(load(CHECKIN_OUTBOX_KEY, []), { id, manual: !!manual }, Date.now()))); }
  catch (e) { console.error("No se pudo anotar el ingreso pendiente en este dispositivo:", e); }
}
function checkinOutboxRemove(id) {
  try { localStorage.setItem(lsKey(CHECKIN_OUTBOX_KEY), JSON.stringify(applyOutboxRemove(load(CHECKIN_OUTBOX_KEY, []), id))); }
  catch (e) { console.error("No se pudo descontar el ingreso pendiente en este dispositivo:", e); }
}

// Marca el ingreso de una boleta de forma ATÓMICA en el servidor: la
// transacción solo pasa la boleta de "activo" a "ingresado" si en ese momento
// SIGUE activa. Así, si dos puertas escanean el mismo QR (o el original y una
// captura reenviada) casi a la vez, solo una gana: la otra recibe already=true
// y no cuenta un segundo ingreso.
//
// Ante MALA SEÑAL ya no se espera a ciegas. Antes se esperaban 8 s y luego se
// devolvía { error }, con lo cual el portero veía "No se pudo marcar el
// ingreso" mientras la app ya lo contaba como adentro (la transacción se aplica
// en local) — y al re-buscar la boleta le decía "✓ Ya registrado". Un mensaje
// se contradecía con el otro y la fila se paraba 8 segundos por persona.
// Ahora: si no hay socket, se devuelve { pendiente } al instante; si hay socket
// pero no contesta en 5 s, también { pendiente } — la escritura sigue en vuelo
// y el outbox la reintenta. Solo un rechazo REAL devuelve { error }.
//
// Devuelve: { ok } (recién ingresada), { already, ticket } (ya estaba
// ingresada / otra puerta la marcó), { pendiente } (sin confirmar en el
// servidor: quedó en cola), { offline } (este dispositivo no usa la nube), o
// { error }.
export async function checkInTicketTx(id, { manual = false } = {}) {
  if (!FB.ready) return { offline: true };
  const nodeRef = ref(FB.db, fbPath("tickets/" + id));
  // Se anota ANTES de lanzar: si la página muere con la escritura en vuelo, el
  // replay al reabrir es lo único que puede salvar el ingreso.
  if (cloudIntended()) checkinOutboxPut(id, manual);
  const tx = runTransaction(nodeRef, t => applyCheckIn(t, new Date().toISOString(), manual));
  // Sin socket, RTDB no resuelve la transacción hasta reconectar: esperarla
  // sería parar la fila. Se deja en vuelo y se informa como pendiente.
  if (!FB.connected) {
    tx.then(res => { if (res.committed) checkinOutboxRemove(id); })
      .catch(e => reportSyncError("No se pudo marcar el ingreso de la boleta en Firebase:", e));
    return { pendiente: true };
  }
  try {
    const res = await withTimeout(tx, 5000);
    checkinOutboxRemove(id); // el servidor contestó: ya no hay nada pendiente
    return interpretCheckIn(res.committed, res.snapshot.val());
  } catch (e) {
    if (e && e.esTimeout) {
      // La transacción NO se canceló: sigue en vuelo y se confirmará sola.
      tx.then(res => { if (res.committed) checkinOutboxRemove(id); }).catch(() => {});
      return { pendiente: true };
    }
    checkinOutboxRemove(id); // rechazo real: reintentarlo no arreglaría nada
    console.error("No se pudo marcar el ingreso de la boleta en Firebase:", e);
    return { error: e };
  }
}

// Reintenta los ingresos que quedaron sin confirmar (se escaneó sin señal y la
// app se recargó o el sistema mató la PWA). Reusa la misma transacción, que es
// idempotente: si otra puerta ya la marcó, applyCheckIn aborta y no cuenta un
// segundo ingreso. Devuelve cuántos quedaron resueltos.
export async function replayCheckinOutbox() {
  if (!FB.ready) return 0;
  const pendientes = checkinOutboxList();
  if (!pendientes.length) return 0;
  console.info("Recuperando " + pendientes.length + " ingreso(s) sin confirmar…");
  let resueltos = 0;
  for (const p of pendientes) {
    try {
      const res = await runTransaction(ref(FB.db, fbPath("tickets/" + p.id)), t => applyCheckIn(t, new Date().toISOString(), p.manual));
      const val = res.snapshot.val();
      // Resuelto si la boleta quedó ingresada (por nosotros o por otra puerta),
      // y también si ya no existe o fue anulada: en esos casos no hay nada que
      // reintentar y dejarlo en la cola solo lo repetiría cada arranque.
      if (!val || val.status !== "activo") { checkinOutboxRemove(p.id); resueltos++; }
    } catch (e) {
      reportSyncError("No se pudo recuperar el ingreso pendiente " + p.id + ":", e);
    }
  }
  return resueltos;
}
export function removeTicketNode(id) {
  // Un borrado explícito cancela el pendiente de esa misma boleta: si no, el
  // replay la resucitaría después de eliminarla (mismo criterio que
  // removeFighterTx).
  ticketsOutboxRemove(id);
  if (!FB.ready) return Promise.resolve();
  return dbRemove(ref(FB.db, fbPath("tickets/" + id)))
    .catch(e => reportSyncError("No se pudo eliminar la boleta en Firebase (sigue eliminada localmente):", e));
}

// Escucha sangre_nueva/tickets completo y reconstruye el arreglo ordenado
// por fecha de creación para la UI. onValue entrega el estado ya fusionado
// del servidor cada vez que cualquier boleta cambia (la propia o la de otro
// dispositivo), así que no hace falta diffear child-by-child.
let ticketsWatching = false;
// `onEstado(estado)` avisa a la app en qué punto está la lista de boletas:
// "cargando" (aún no llegó el primer valor), "listo" (ya hay datos del
// servidor) o "sin-permiso" (esta cuenta no puede leerlas). Sin esto, la puerta
// mostraba "❌ Boleta no encontrada" en los tres casos: mientras bajaban las
// boletas y —lo peor— cuando el UID no estaba en la lista blanca /staff, con el
// chip en verde diciendo "Sincronizado". El portero rechazaba entradas
// legítimas una tras otra creyendo que eran falsas.
export function watchTickets(onChange, onEstado) {
  if (!FB.ready || ticketsWatching) return;
  ticketsWatching = true;
  const nodeRef = ref(FB.db, fbPath("tickets"));
  onValue(nodeRef, snap => {
    onEstado?.("listo");
    const val = snap.val() || {};
    // Las ventas PENDIENTES (emitidas aquí y aún sin confirmar en la nube) se
    // fusionan sobre la copia del servidor. Sin esto, esta misma lista las
    // borraba del dispositivo del vendedor: la boleta desaparecía de la app
    // aunque el comprador ya tuviera su voucher con el QR.
    const list = sortTickets(mergePendingTickets(Object.values(val), ticketsOutboxList()));
    cacheTicketsV4(list);
    onChange(list);
  }, err => {
    // onValue SÍ acepta un callback de error, pero no se le pasaba ninguno: un
    // permission-denied se perdía en silencio y la lista se quedaba vacía para
    // siempre, indistinguible de "no hay boletas vendidas".
    ticketsWatching = false; // permite reintentar tras arreglar los permisos
    onEstado?.("sin-permiso");
    reportSyncError("No se pudieron leer las boletas de Firebase (¿esta cuenta está en la lista de staff?):", err);
  });
}

// Pura y testeable: de un arreglo de boletas arma el mapa de escrituras
// "tickets/{id}" (para un dbUpdate multi-ruta) y el máximo correlativo por
// tipo. Ignora ids vacíos y los de emergencia (prefijo-XNNN, sin dígitos tras
// el guion), que no cuentan para el correlativo. La usan la migración en
// caliente y la restauración de un respaldo.
export function buildTicketRestore(tickets, idsExistentes = []) {
  const yaEstan = new Set(idsExistentes);
  const ticketUpdates = {};
  const maxByType = {};
  const omitidos = [];
  (tickets || []).forEach(t => {
    if (!t || !t.id) return;
    // El correlativo cuenta SIEMPRE, exista o no la boleta: el contador nunca
    // debe bajar, o se reasignarían números ya usados.
    const m = /^[A-Za-z]+-(\d+)$/.exec(t.id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > (maxByType[t.ticketType] || 0)) maxByType[t.ticketType] = n;
    }
    // Las que YA están en la nube no se tocan. Antes se sobrescribían enteras,
    // así que restaurar el respaldo de la mañana a mitad del evento devolvía a
    // "activo" todas las boletas que ya habían entrado (con checkedInAt en
    // null) y cada QR usado volvía a admitir a su grupo completo. El diálogo
    // siempre prometió lo contrario: "se agregan (por número) a las que ya
    // existan" — ahora eso es literalmente lo que hace.
    if (yaEstan.has(t.id)) { omitidos.push(t.id); return; }
    // stripLocalFlags: un respaldo exportado mientras había ventas pendientes
    // arrastra la marca `_pending`, que no debe llegar a la nube.
    ticketUpdates["tickets/" + t.id] = stripLocalFlags(t);
  });
  return { ticketUpdates, maxByType, omitidos };
}

// Migración en caliente, una sola vez: si sangre_nueva/tickets todavía no
// existe pero el arreglo viejo (bm_tickets_v4) sí tiene datos, copia cada
// boleta a su nodo individual e inicializa los contadores desde el máximo
// correlativo por tipo. Es idempotente (no hace nada si tickets/ ya
// existe) y NO borra ni modifica el arreglo viejo — queda como respaldo de
// solo lectura en Firebase hasta que se limpie manualmente más adelante.
let migrationAttempted = false;
export async function migrateTicketsIfNeeded() {
  if (!FB.ready || migrationAttempted) return;
  migrationAttempted = true;
  try {
    const ticketsSnap = await get(ref(FB.db, fbPath("tickets")));
    if (ticketsSnap.exists()) return; // ya migrado
    const oldSnap = await get(ref(FB.db, fbPath("bm_tickets_v4")));
    const oldTickets = oldSnap.val();
    if (!Array.isArray(oldTickets) || !oldTickets.length) return;
    // Los contadores aún no existen (primera migración), así que van en el
    // mismo dbUpdate atómico que las boletas.
    const { ticketUpdates, maxByType } = buildTicketRestore(oldTickets);
    const updates = { ...ticketUpdates };
    Object.entries(maxByType).forEach(([tipo, n]) => { updates["counters/" + tipo] = n; });
    await dbUpdate(ref(FB.db, fbPath("")), updates);
    console.info("Migración de boletas a nodos individuales completada (" + oldTickets.length + " boletas).");
  } catch (e) {
    migrationAttempted = false; // permite reintentar en el próximo inicio si falló
    console.error("No se pudo migrar las boletas a nodos individuales:", e);
  }
}

// Restaura boletas desde un respaldo (JSON importado) a sus nodos individuales.
// Escribe las boletas en un dbUpdate atómico y luego SUBE cada contador al
// máximo correlativo restaurado con una transacción — nunca lo baja, así
// respeta la regla .validate de contador no-decreciente y no reasigna
// correlativos si ya se vendió más desde que se hizo el respaldo. Devuelve
// cuántas boletas escribió. Requiere conexión (los nodos de boletas viven solo
// en la nube); si no hay FB, no hace nada y devuelve 0.
export async function restoreTicketsFromBackup(tickets) {
  if (!FB.ready || !Array.isArray(tickets) || !tickets.length) return { agregadas: 0, omitidas: 0 };
  // Se mira PRIMERO qué boletas existen ya en la nube: las del respaldo que ya
  // están se dejan intactas (ver buildTicketRestore). Es la diferencia entre
  // "agregar lo que falta" y "devolver el evento a como estaba en la mañana".
  const snap = await get(ref(FB.db, fbPath("tickets")));
  const existentes = Object.keys(snap.val() || {});
  const { ticketUpdates, maxByType, omitidos } = buildTicketRestore(tickets, existentes);
  const n = Object.keys(ticketUpdates).length;
  if (n) await dbUpdate(ref(FB.db, fbPath("")), ticketUpdates);
  // Los contadores suben al máximo restaurado aunque no se agregara ninguna
  // boleta: nunca se baja un correlativo.
  await Promise.all(Object.entries(maxByType).map(([tipo, max]) =>
    runTransaction(ref(FB.db, fbPath("counters/" + tipo)), cur => Math.max(cur || 0, max))
  ));
  return { agregadas: n, omitidas: omitidos.length };
}

export function clearTicketsCache() { localStorage.removeItem(lsKey(TICKETS_CACHE_KEY)); }
// Borra las boletas reales por completo: los nodos individuales, los
// contadores, y el arreglo viejo bm_tickets_v4 (si no se borra este último,
// la migración en caliente lo confundiría con datos pendientes de migrar y
// resucitaría las boletas ya borradas en el próximo inicio).
export async function clearAllTicketsData() {
  if (!FB.ready) return;
  await Promise.all([
    dbRemove(ref(FB.db, fbPath("tickets"))),
    dbRemove(ref(FB.db, fbPath("counters"))),
    dbRemove(ref(FB.db, fbPath("bm_tickets_v4"))),
  ]);
}
