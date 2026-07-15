import { ref, set as dbSet, update as dbUpdate, remove as dbRemove, get, onValue, runTransaction } from "firebase/database";
import { SYNC_KEYS } from "../constants.js";
import { FB, fbPath, reportSyncError } from "./firebase.js";
import { mergeRegenerated } from "./super4.js";

// Normaliza el valor crudo de un nodo-arreglo (que RTDB puede devolver como
// arreglo, objeto con claves numéricas, null o el centinela "__EMPTY__") a un
// arreglo. Usado por Super 4 y por las escrituras transaccionales de peleadores.
export function nodeToArray(v) {
  if (v == null || v === "__EMPTY__") return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object") return Object.values(v);
  return [];
}

// Fusiones puras (testeables) para las transacciones de peleadores. upsert
// reemplaza el peleador con el mismo id o lo agrega; remove lo quita. Se
// aplican SOBRE el estado más fresco del servidor dentro de la transacción,
// así dos dispositivos registrando a la vez no se pisan (antes cada save()
// reescribía el arreglo completo desde el estado local, last-write-wins).
export function applyUpsertFighter(list, fighter) {
  const arr = nodeToArray(list);
  const i = arr.findIndex(x => x && x.id === fighter.id);
  if (i === -1) return [...arr, fighter];
  const next = arr.slice();
  next[i] = fighter;
  return next;
}
export function applyRemoveFighter(list, id) {
  return nodeToArray(list).filter(x => x && x.id !== id);
}

// ============================================
// STORAGE
// ============================================
// NOTA (Fase 3): fighters/matchups/bm_event_label siguen sincronizados como
// un solo "blob" (todo el arreglo se sobrescribe en cada save()). Se acepta
// el riesgo de que dos dispositivos editando exactamente al mismo tiempo se
// pisen entre sí, porque en la práctica los edita una sola persona a la vez
// (registro de peleadores/matchmaking, no ventas en el mostrador). Las
// boletas sí se movieron a nodos individuales (más abajo) porque ahí sí hay
// varios dispositivos vendiendo a la vez el día del evento.
export function load(k, def) { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : def; } catch { return def; } }

export function save(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
  if (FB.ready && Object.prototype.hasOwnProperty.call(SYNC_KEYS, k)) {
    let payload;
    try {
      payload = JSON.parse(JSON.stringify(v));
      // RTDB no guarda arreglos vacíos: set([]) BORRA el nodo, y un nodo
      // ausente hace que la próxima conexión de un dispositivo con datos
      // viejos en localStorage los re-suba ("resucita" lo borrado, ver
      // startFirebaseSync). El centinela mantiene el nodo vivo con el
      // significado "vaciado a propósito". Se aplica a TODAS las claves de
      // arreglo (peleadores, peleas y Super 4): antes solo cubría bm_super4_v1,
      // así que al "Reiniciar evento" un dispositivo ausente resucitaba
      // peleadores y peleas borrados (incluidos datos de menores). El lector
      // (firebase.js) ya traduce "__EMPTY__" → [] de forma genérica para
      // cualquier clave, así que es seguro para los clientes actuales.
      if (Array.isArray(payload) && payload.length === 0) payload = "__EMPTY__";
    } catch (e) { console.error("No se pudo preparar " + k + " para sincronizar:", e); return; }
    // dbSet devuelve una promesa: un rechazo asíncrono (permiso, token, dato
    // inválido) NO lo atraparía un try/catch, por eso va con .catch().
    dbSet(ref(FB.db, fbPath(k)), payload).catch(e => reportSyncError("No se pudo sincronizar " + k + " con Firebase (el cambio sí quedó guardado localmente):", e));
  }
}

// Marca resultados del Super 4 (ganadores/campeón) ubicando la llave por su
// ID dentro de una TRANSACCIÓN sobre el nodo completo. Antes se escribía por
// índice de posición; pero al agregar/generar llaves el arreglo se reordena,
// así que un índice viejo podía caer en la llave equivocada y corromper otro
// resultado. Por id, la escritura siempre llega a la llave correcta, y la
// transacción reintenta ante escrituras concurrentes (dos personas marcando
// semifinales distintas de la misma llave no se pisan). `fields` puede traer
// "semis/N" (una semifinal) y "finalWinner".
export function patchSuper4Bracket(fullList, bracketId, fields) {
  localStorage.setItem("bm_super4_v1", JSON.stringify(fullList));
  if (!FB.ready) return;
  const clean = JSON.parse(JSON.stringify(fields));
  const nodeRef = ref(FB.db, fbPath("bm_super4_v1"));
  runTransaction(nodeRef, cur => {
    if (!Array.isArray(cur)) return cur; // "__EMPTY__"/null/objeto raro: no pisar a ciegas
    const i = cur.findIndex(b => b && b.id === bracketId);
    if (i === -1) return cur; // la llave aún no llegó a la nube: no escribir a ciegas
    const next = cur.slice();
    const b = { ...next[i], semis: (next[i].semis || []).map(s => ({ ...s })) };
    for (const [k, v] of Object.entries(clean)) {
      if (k.indexOf("semis/") === 0) b.semis[Number(k.split("/")[1])] = v;
      else b[k] = v;
    }
    next[i] = b;
    return next;
  }).catch(e => reportSyncError("No se pudo sincronizar el resultado del Super 4 (sí quedó guardado localmente):", e));
}

// Agrega/regenera llaves del Super 4 fusionando contra el estado MÁS FRESCO
// del servidor dentro de una transacción, en vez de reescribir el nodo con un
// arreglo local que puede estar atrasado (lo que borraría en silencio una
// llave o un resultado creado en otro dispositivo). Actualiza el estado local
// primero de forma optimista y luego con el resultado real de la transacción.
export function mergeSuper4Tx(existingLocal, newBrackets, onMerged) {
  const optimista = mergeRegenerated(existingLocal || [], newBrackets);
  localStorage.setItem("bm_super4_v1", JSON.stringify(optimista));
  onMerged(optimista);
  if (!FB.ready) return;
  const nodeRef = ref(FB.db, fbPath("bm_super4_v1"));
  const clean = JSON.parse(JSON.stringify(newBrackets));
  runTransaction(nodeRef, cur => mergeRegenerated(nodeToArray(cur), clean))
    .then(res => {
      if (!res.committed) return;
      const list = nodeToArray(res.snapshot.val());
      localStorage.setItem("bm_super4_v1", JSON.stringify(list));
      onMerged(list);
    })
    .catch(e => reportSyncError("No se pudo sincronizar el Super 4 (el cambio sí quedó guardado localmente):", e));
}

export function loadFighters() {
  return load("bm_fighters_v4", []);
}

// Alta/edición y baja de peleadores de forma TRANSACCIONAL: la fusión (por id)
// se aplica sobre el estado más fresco del servidor dentro de runTransaction,
// no sobre el arreglo local que puede estar atrasado. Así, el día del pesaje
// con varios organizadores registrando a la vez, un peleador nuevo ya no
// desaparece porque otro dispositivo guardó su propia copia encima. Actualiza
// localStorage de inmediato (optimista) y avisa el resultado real al confirmar.
// `optimisticList` es el arreglo local ya actualizado; `onMerged(list)` recibe
// la lista autoritativa fusionada del servidor (el llamador la normaliza).
export function upsertFighterTx(fighter, optimisticList, onMerged) {
  fighterArrayTx(cur => applyUpsertFighter(cur, fighter), optimisticList, onMerged);
}
export function removeFighterTx(id, optimisticList, onMerged) {
  fighterArrayTx(cur => applyRemoveFighter(cur, id), optimisticList, onMerged);
}
function fighterArrayTx(apply, optimisticList, onMerged) {
  const k = "bm_fighters_v4";
  localStorage.setItem(k, JSON.stringify(optimisticList));
  if (!FB.ready) return;
  runTransaction(ref(FB.db, fbPath(k)), cur => {
    const next = apply(cur);
    // Mantiene vivo el nodo si queda vacío (mismo centinela que save(), evita
    // que un arreglo vacío borre el nodo y resucite datos, ver save()).
    return (Array.isArray(next) && next.length === 0) ? "__EMPTY__" : next;
  }).then(res => {
    if (res.committed) onMerged(nodeToArray(res.snapshot.val()));
  }).catch(e => reportSyncError("No se pudo sincronizar los peleadores con Firebase (el cambio sí quedó guardado localmente):", e));
}

// ============================================
// BOLETAS — nodos individuales en sangre_nueva/tickets/{id}
// (antes era un solo arreglo en bm_tickets_v4; ver migrateTicketsIfNeeded)
// ============================================
export function loadTicketsV4() { return load("bm_tickets_v4", []); }
function cacheTicketsV4(list) { localStorage.setItem("bm_tickets_v4", JSON.stringify(list)); }
export function padN(n) { return String(n).padStart(4, "0"); }

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout esperando a Firebase")), ms)),
  ]);
}

// Correlativo local (sin sincronización): se deriva del máximo id ya usado
// en las boletas que ya tenemos, sin depender de un contador aparte.
function maxCounterFromTickets(tickets, tipo) {
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
    return prefix + "-X" + Date.now().toString(36).toUpperCase();
  }
  const next = maxCounterFromTickets(localTickets, tipo) + 1;
  return prefix + "-" + padN(next);
}

// Devuelve la promesa de la escritura (con su propio .catch), por si el
// llamador quiere reaccionar; NO debe esperarse con await en el flujo de venta:
// sin conexión RTDB deja la promesa pendiente hasta reconectar y colgaría el
// voucher. El fallo real (rechazo) se avisa por el chip vía reportSyncError.
export function addTicketNode(ticket) {
  if (!FB.ready) return Promise.resolve();
  return dbSet(ref(FB.db, fbPath("tickets/" + ticket.id)), ticket)
    .catch(e => reportSyncError("No se pudo guardar la boleta en Firebase (sigue guardada localmente):", e));
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
export async function checkInTicketTx(id) {
  if (!FB.ready) return { offline: true };
  const nodeRef = ref(FB.db, fbPath("tickets/" + id));
  try {
    const res = await withTimeout(runTransaction(nodeRef, t => {
      if (!t || t.status !== "activo") return; // no existe o ya no está activa: aborta
      return { ...t, status: "ingresado", checkedInAt: new Date().toISOString() };
    }), 8000);
    const val = res.snapshot.val();
    if (res.committed && val && val.status === "ingresado") return { ok: true, ticket: val };
    if (val && val.status === "ingresado") return { already: true, ticket: val };
    return { error: new Error("boleta no encontrada o no activa"), ticket: val };
  } catch (e) {
    console.error("No se pudo marcar el ingreso de la boleta en Firebase:", e);
    return { error: e };
  }
}
export function removeTicketNode(id) {
  if (!FB.ready) return Promise.resolve();
  return dbRemove(ref(FB.db, fbPath("tickets/" + id)))
    .catch(e => reportSyncError("No se pudo eliminar la boleta en Firebase (sigue eliminada localmente):", e));
}

// Escucha sangre_nueva/tickets completo y reconstruye el arreglo ordenado
// por fecha de creación para la UI. onValue entrega el estado ya fusionado
// del servidor cada vez que cualquier boleta cambia (la propia o la de otro
// dispositivo), así que no hace falta diffear child-by-child.
let ticketsWatching = false;
export function watchTickets(onChange) {
  if (!FB.ready || ticketsWatching) return;
  ticketsWatching = true;
  const nodeRef = ref(FB.db, fbPath("tickets"));
  onValue(nodeRef, snap => {
    const val = snap.val() || {};
    const list = Object.values(val).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    cacheTicketsV4(list);
    onChange(list);
  });
}

// Pura y testeable: de un arreglo de boletas arma el mapa de escrituras
// "tickets/{id}" (para un dbUpdate multi-ruta) y el máximo correlativo por
// tipo. Ignora ids vacíos y los de emergencia (prefijo-XNNN, sin dígitos tras
// el guion), que no cuentan para el correlativo. La usan la migración en
// caliente y la restauración de un respaldo.
export function buildTicketRestore(tickets) {
  const ticketUpdates = {};
  const maxByType = {};
  (tickets || []).forEach(t => {
    if (!t || !t.id) return;
    ticketUpdates["tickets/" + t.id] = t;
    const m = /^[A-Za-z]+-(\d+)$/.exec(t.id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > (maxByType[t.ticketType] || 0)) maxByType[t.ticketType] = n;
    }
  });
  return { ticketUpdates, maxByType };
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
  if (!FB.ready || !Array.isArray(tickets) || !tickets.length) return 0;
  const { ticketUpdates, maxByType } = buildTicketRestore(tickets);
  const n = Object.keys(ticketUpdates).length;
  if (!n) return 0;
  await dbUpdate(ref(FB.db, fbPath("")), ticketUpdates);
  await Promise.all(Object.entries(maxByType).map(([tipo, max]) =>
    runTransaction(ref(FB.db, fbPath("counters/" + tipo)), cur => Math.max(cur || 0, max))
  ));
  return n;
}

export function clearTicketsCache() { localStorage.removeItem("bm_tickets_v4"); }

// Borra del dispositivo los datos del evento (peleadores —incluye menores—,
// peleas, Super 4 y boletas con datos de compradores) al cerrar sesión, para
// que un aparato perdido o prestado no los exponga sin autenticación. La nube
// es la fuente de verdad: al volver a iniciar sesión se re-sincroniza todo.
export function clearLocalEventData() {
  Object.keys(SYNC_KEYS).forEach(k => localStorage.removeItem(k));
  localStorage.removeItem("bm_tickets_v4");
}

// ============================================
// REINICIAR EVENTO (Fase 5) — respaldo antes de borrar
// ============================================
// Guarda una copia completa del evento en sangre_nueva_backups/{fecha}.
// Ese nodo está protegido en database.rules.json para que solo el dueño
// (por email) pueda leerlo o escribirlo — la Fase 2 ya deja esa regla lista.
export async function backupEventToCloud(data) {
  if (!FB.ready) return null;
  const key = new Date().toISOString().replace(/[.:]/g, "-");
  // Firebase rechaza valores undefined (ej. notes de un peleador sin notas);
  // el round-trip por JSON los omite igual que ya hace save().
  await dbSet(ref(FB.db, "sangre_nueva_backups/" + key), JSON.parse(JSON.stringify(data)));
  return key;
}

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
