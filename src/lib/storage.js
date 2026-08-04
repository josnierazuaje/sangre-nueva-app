import { ref, set as dbSet, update as dbUpdate, remove as dbRemove, get, onValue, runTransaction } from "firebase/database";
import { SYNC_KEYS } from "../constants.js";
import { FB, fbPath, reportSyncError } from "./firebase.js";
import { mergeRegenerated, normalizeSuper4 } from "./super4.js";

// Normaliza el valor crudo de un nodo-arreglo (que RTDB puede devolver como
// arreglo, objeto con claves numéricas, null o el centinela "__EMPTY__") a un
// arreglo. Usado por Super 4 y por las escrituras transaccionales de peleadores.
export function nodeToArray(v) {
  if (v == null || v === "__EMPTY__") return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object") return Object.values(v);
  return [];
}

// Quita recursivamente las claves cuyo valor es `undefined`. RTDB las RECHAZA
// (a diferencia de JSON.stringify, que simplemente las omite) y su validación
// lanza de forma SÍNCRONA desde runTransaction, no como promesa rechazada: un
// solo campo opcional sin valor —p.ej. `notes` con el campo Notas vacío— hacía
// que la excepción subiera por upsertFighterTx hasta el onSubmit del
// formulario, saltándose su limpieza y dejando los campos llenos tras un alta
// que ya se había confirmado en pantalla. Se sanea aquí, en la frontera con la
// nube, para que ningún llamador pueda repetir el fallo.
export function stripUndefined(v) {
  // En un arreglo, RTDB rechaza igual un ELEMENTO undefined (un hueco de un
  // arreglo disperso) que una clave: se descartan, no se mapean.
  if (Array.isArray(v)) return v.filter(x => x !== undefined).map(stripUndefined);
  if (v && typeof v === "object") {
    const o = {};
    Object.keys(v).forEach(k => { if (v[k] !== undefined) o[k] = stripUndefined(v[k]); });
    return o;
  }
  return v;
}

// Valor EXACTO que la transacción de peleadores devuelve a RTDB. Vive fuera de
// fighterArrayTx —en vez de en línea dentro del callback— para que se pueda
// FIJAR CON PRUEBAS: el saneado es justo lo que rompió el alta con Notas vacío,
// y en línea era invisible para los tests (se podía borrar sin que fallara
// nada). El orden importa: primero se sanea y DESPUÉS se mira si quedó vacío.
export function fighterNodeValue(next) {
  const clean = stripUndefined(next);
  // Mantiene vivo el nodo si queda vacío (mismo centinela que save(), evita
  // que un arreglo vacío borre el nodo y resucite datos, ver save()).
  return (Array.isArray(clean) && clean.length === 0) ? "__EMPTY__" : clean;
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
export function mergeSuper4Tx(existingLocal, newBrackets, onMerged, clearKeys = null) {
  const optimista = mergeRegenerated(existingLocal || [], newBrackets, clearKeys);
  localStorage.setItem("bm_super4_v1", JSON.stringify(optimista));
  onMerged(optimista);
  if (!FB.ready) return;
  const nodeRef = ref(FB.db, fbPath("bm_super4_v1"));
  const clean = JSON.parse(JSON.stringify(newBrackets));
  runTransaction(nodeRef, cur => mergeRegenerated(nodeToArray(cur), clean, clearKeys))
    .then(res => {
      if (!res.committed) return;
      // normalizeSuper4: Firebase no guarda las claves con valor null, así que
      // una semifinal entera en null desaparece y el arreglo `semis` vuelve
      // con un solo elemento. Se repara AQUÍ, que es la otra puerta de entrada
      // de datos de la nube al estado (la primera es applyRemote en App.jsx).
      const list = normalizeSuper4(nodeToArray(res.snapshot.val()));
      localStorage.setItem("bm_super4_v1", JSON.stringify(list));
      onMerged(list);
    })
    .catch(e => reportSyncError("No se pudo sincronizar el Super 4 (el cambio sí quedó guardado localmente):", e));
}

export function loadFighters() {
  return load("bm_fighters_v4", []);
}

// Escribe la CARTELERA fusionando contra el estado más fresco del servidor.
//
// Era el último nodo que se reescribía entero desde la copia local (save()).
// La ventana no es de milisegundos: la cola sin conexión del SDK guarda la
// escritura TAL CUAL y la manda al reconectar, así que una tablet que editó una
// nota el viernes con la señal caída y quedó abierta en segundo plano podía, al
// recuperar red el sábado, sobrescribir el nodo con su arreglo viejo y borrar
// toda la cartelera armada después (y resucitar peleas ya eliminadas).
//
// `aplicar(arr)` recibe el arreglo del SERVIDOR y devuelve el nuevo; los
// llamadores renumeran ahí dentro (renumerarPeleas) para que los números de
// pelea salgan del estado fusionado, no del local.
export function matchupsTx(aplicar, optimista, onMerged) {
  saveLocal("bm_matchups_v3", optimista);
  if (!FB.ready) return;
  runTransaction(ref(FB.db, fbPath("bm_matchups_v3")), cur => fighterNodeValue(aplicar(nodeToArray(cur))))
    .then(res => { if (res.committed) onMerged?.(nodeToArray(res.snapshot.val())); })
    .catch(e => reportSyncError("No se pudo sincronizar la cartelera (el cambio sí quedó guardado localmente):", e));
}

// Guarda SOLO en este dispositivo, sin tocar la nube. Lo usa la reconciliación
// automática, que a la nube escribe por transacción (reconcileNodeTx).
export function saveLocal(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch (e) { console.error("No se pudo guardar " + k + " en este dispositivo:", e); }
}

// Aplica una limpieza (dedup de peleadores, saneo de la cartelera…) SOBRE el
// estado más fresco del servidor, dentro de una transacción.
//
// Antes, la reconciliación automática llamaba a save(), que hace un dbSet del
// nodo COMPLETO desde la copia local — justo el patrón last-write-wins que las
// altas de peleadores habían dejado atrás. La carrera era real: un dispositivo
// registraba a alguien (transacción confirmada, fuera del outbox) y, casi a la
// vez, otro detectaba un duplicado cualquiera y reescribía el nodo entero con
// su arreglo atrasado; el peleador nuevo desaparecía de la nube y, vía onValue,
// de todos los dispositivos. Y como TODOS los que reciben el duplicado disparan
// su limpieza a la vez, la ventana se multiplicaba.
//
// `aplicar(arr)` debe ser pura y recibir el arreglo del servidor. Si no cambia
// nada, la transacción se ABORTA (no escribe) para no generar un bucle.
export function reconcileNodeTx(key, aplicar, onMerged) {
  if (!FB.ready) return;
  runTransaction(ref(FB.db, fbPath(key)), cur => {
    const arr = nodeToArray(cur);
    if (!arr.length) return cur; // nodo vacío o aún sin llegar: no pisar a ciegas
    const next = aplicar(arr);
    if (!Array.isArray(next) || JSON.stringify(next) === JSON.stringify(arr)) return; // sin cambios: abortar
    return fighterNodeValue(next); // saneo + centinela "__EMPTY__"
  }).then(res => { if (res.committed) onMerged?.(nodeToArray(res.snapshot.val())); })
    .catch(e => reportSyncError("No se pudo sincronizar la limpieza automática de " + key + ":", e));
}

// Lee el valor AUTORITATIVO de un nodo-arreglo directo desde la nube (una sola
// lectura, no un listener). Lo usa el auto-reparo: si un guardado falló y quedó
// un registro "fantasma" solo en este dispositivo (existe local pero no en la
// nube), comparar contra este snapshot permite quitarlo. Devuelve null si no
// hay conexión o la lectura falla (el llamador NO debe tocar nada en ese caso,
// para no borrar datos por una lectura fallida). "__EMPTY__" → [] (vaciado a
// propósito); nodo ausente → null (desconocido, no se toca).
// Pura y testeable: quita de la lista LOCAL los peleadores cuyo id NO está en
// la copia de la nube (fantasmas de un guardado que falló y quedó solo en este
// dispositivo). Devuelve { cleaned, removedIds }. Reglas de seguridad:
//  - Si la nube es nula o un arreglo VACÍO, no quita nada (nunca se vacía la
//    lista local por una lectura dudosa/transitoria).
//  - Solo QUITA por id; jamás agrega ni modifica registros existentes.
export function stripLocalGhosts(local, cloud) {
  const L = Array.isArray(local) ? local : [];
  if (!Array.isArray(cloud) || cloud.length === 0) return { cleaned: L, removedIds: [] };
  const cloudIds = new Set(cloud.map(f => f && f.id));
  const cleaned = L.filter(f => f && cloudIds.has(f.id));
  const removedIds = L.filter(f => f && !cloudIds.has(f.id)).map(f => f.id);
  return { cleaned, removedIds };
}

export async function fetchCloudArray(key) {
  if (!FB.ready || !FB.db) return null;
  try {
    const snap = await get(ref(FB.db, fbPath(key)));
    const val = snap.val();
    if (val === null || val === undefined) return null; // nodo ausente: no concluir "vacío"
    return nodeToArray(val); // maneja arreglo/objeto/"__EMPTY__"
  } catch (e) {
    console.error("No se pudo leer " + key + " de la nube para el auto-reparo:", e);
    return null;
  }
}

// ============================================
// OUTBOX de peleadores — escrituras que SOBREVIVEN a la recarga
// ============================================
// El alta/edición escribe local al instante y a Firebase en segundo plano
// (transacción). Si la página se recarga antes del commit —el flujo típico:
// registrar y "actualizar la app" por la PWA— la transacción MUERE con la
// página, la nube nunca recibe el registro y la sincronización (remota gana)
// lo borra de lo local: pérdida silenciosa. El outbox cierra ese hueco: cada
// upsert se anota como PENDIENTE y solo sale cuando la nube CONFIRMA el
// commit; al arrancar la app, los pendientes se re-suben solos (replay).
// Como el upsert fusiona por id contra el servidor, el replay es idempotente.
const OUTBOX_KEY = "bm_fighters_outbox";
// Vida útil de un pendiente: tras 14 días sin poder confirmarse se descarta.
// Antes eran 48h, pero era MUY corto y causaba pérdida silenciosa: un
// dispositivo que registra SIN conexión y no reconecta en 2 días (p.ej. pesaje
// el viernes, evento el domingo → >48h) perdía el registro — al podarse el
// pendiente, el auto-reparo lo tomaba por "fantasma" y lo borraba sin aviso, y
// los guards de logout/recargar quedaban ciegos (outboxList() ya daba 0). 14
// días cubren con holgura cualquier ventana del evento. El costo (una edición
// pendiente muy vieja podría resucitar un peleador borrado en otro dispositivo)
// es raro y RECUPERABLE (reaparece visible, se vuelve a borrar), mucho mejor
// que perder una inscripción en silencio (posible menor).
export const OUTBOX_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Puras y testeables (la lista viaja como argumento):
export function applyOutboxPut(list, fighter, now) {
  const L = (Array.isArray(list) ? list : []).filter(x => x && x.id !== fighter.id);
  return [...L, { ...fighter, _queuedAt: now }];
}
export function applyOutboxRemove(list, id) {
  return (Array.isArray(list) ? list : []).filter(x => x && x.id !== id);
}
export function pruneOutbox(list, now) {
  return (Array.isArray(list) ? list : []).filter(x => x && typeof x._queuedAt === "number" && now - x._queuedAt < OUTBOX_TTL_MS);
}
// Fusiona los pendientes sobre una lista de peleadores (por id, quitando la
// marca interna _queuedAt). Lo usa el replay para el estado optimista.
export function mergePending(fighters, pending) {
  let u = Array.isArray(fighters) ? fighters : [];
  (pending || []).forEach(p => { const { _queuedAt, ...f } = p; u = applyUpsertFighter(u, f); });
  return u;
}

// Envolturas sobre localStorage. Escribir puede lanzar (cuota llena), y estas
// se llaman desde el manejador del formulario y desde DENTRO del .then de la
// transacción, así que una excepción aquí abortaba el alta a medias.
// Los dos casos NO son iguales y se avisan distinto:
//  - outboxPut AGREGA (la cadena crece → puede exceder la cuota) y es lo que
//    SOSTIENE el "✓ guardado": si no se puede anotar el pendiente, la garantía
//    de reenvío se perdió, y eso sí merece el chip de sincronización en rojo.
//  - outboxRemove FILTRA (escribe una cadena más corta sobre la misma clave, o
//    sea que por cuota no puede fallar) y solo descuenta algo ya confirmado: si
//    fallara, el pendiente sobrante es inofensivo (el replay es idempotente y
//    el TTL lo poda). Basta la consola — jamás debe pintar de rojo un guardado
//    que la nube SÍ confirmó, que es lo que pasaría si la excepción subiera
//    hasta el .catch de la transacción.
export function outboxList() { return pruneOutbox(load(OUTBOX_KEY, []), Date.now()); }
function outboxPut(f) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(applyOutboxPut(load(OUTBOX_KEY, []), f, Date.now()))); }
  catch (e) { reportSyncError("No se pudo anotar el registro pendiente en este dispositivo:", e); }
}
function outboxRemove(id) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(applyOutboxRemove(load(OUTBOX_KEY, []), id))); }
  catch (e) { console.error("No se pudo descontar el registro pendiente en este dispositivo:", e); }
}
// ¿Este dispositivo usa la nube? (misma condición con la que App decide el
// modo). En modo solo-local el outbox no aplica: no hay nube que confirme.
function cloudIntended() { return !!(localStorage.getItem("bm_fb_config") || !localStorage.getItem("bm_fb_disabled")); }

// Alta/edición y baja de peleadores de forma TRANSACCIONAL: la fusión (por id)
// se aplica sobre el estado más fresco del servidor dentro de runTransaction,
// no sobre el arreglo local que puede estar atrasado. Así, el día del pesaje
// con varios organizadores registrando a la vez, un peleador nuevo ya no
// desaparece porque otro dispositivo guardó su propia copia encima. Actualiza
// localStorage de inmediato (optimista) y avisa el resultado real al confirmar.
// `optimisticList` es el arreglo local ya actualizado; `onMerged(list)` recibe
// la lista autoritativa fusionada del servidor (el llamador la normaliza);
// `onCommitted(fighter)` avisa cuando la NUBE confirmó este upsert (para el
// toast honesto y para sacar el registro del outbox); `onError(err)` avisa
// cuando la escritura fue RECHAZADA (permiso denegado, token vencido, sin
// conexión…) para que el toast diga la verdad en vez de prometer que "se
// completará solo". El registro permanece en el outbox (no se saca) para que
// el replay lo reintente al reconectar o reabrir la app.
export function upsertFighterTx(fighter, optimisticList, onMerged, onCommitted, onError) {
  if (cloudIntended()) outboxPut(fighter); // outboxPut ya no puede lanzar (ver arriba)
  fighterArrayTx(cur => applyUpsertFighter(cur, fighter), optimisticList, merged => {
    // Confirmación real: el servidor devolvió la lista fusionada con el id.
    if (merged.some(x => x && x.id === fighter.id)) {
      outboxRemove(fighter.id);
      onCommitted?.(fighter);
    }
    onMerged(merged);
  }, err => onError?.(fighter, err)); // liga el PELEADOR al callback (como onCommitted): el toast necesita su id/nombre, no el error de Firebase
}
export function removeFighterTx(id, optimisticList, onMerged) {
  // Un borrado explícito cancela cualquier pendiente del mismo peleador (si
  // no, el replay lo resucitaría después de eliminarlo).
  outboxRemove(id);
  fighterArrayTx(cur => applyRemoveFighter(cur, id), optimisticList, onMerged);
}
function fighterArrayTx(apply, optimisticList, onMerged, onError) {
  const k = "bm_fighters_v4";
  // La copia local no debe poder tumbar el envío a la nube: con la cuota llena
  // (o el almacenamiento bloqueado por el navegador) setItem LANZA, y esa
  // excepción salía hasta el formulario. Se avisa y se sigue — la nube es el
  // destino que de verdad importa.
  try {
    localStorage.setItem(k, JSON.stringify(optimisticList));
  } catch (e) {
    reportSyncError("No se pudo guardar la copia local de los peleadores en este dispositivo:", e);
  }
  if (!FB.ready) return;
  let tx;
  try {
    tx = runTransaction(ref(FB.db, fbPath(k)), cur => fighterNodeValue(apply(cur)));
  } catch (e) {
    // runTransaction VALIDA el dato de forma síncrona y LANZA (no rechaza) si
    // es inválido, así que el .catch() de abajo no lo vería y la excepción
    // escaparía al llamador. Se reporta por el mismo camino que un rechazo.
    reportSyncError("No se pudo sincronizar los peleadores con Firebase (el cambio sí quedó guardado localmente):", e);
    onError?.(e);
    return;
  }
  tx.then(res => {
    if (res.committed) onMerged(nodeToArray(res.snapshot.val()));
  }).catch(e => {
    reportSyncError("No se pudo sincronizar los peleadores con Firebase (el cambio sí quedó guardado localmente):", e);
    // Escritura rechazada: avisa al llamador para que el toast sea honesto. El
    // pendiente NO se saca del outbox aquí (se reintenta en el próximo replay).
    onError?.(e);
  });
}

// ============================================
// BOLETAS — nodos individuales en sangre_nueva/tickets/{id}
// (antes era un solo arreglo en bm_tickets_v4; ver migrateTicketsIfNeeded)
// ============================================
export function loadTicketsV4() { return load("bm_tickets_v4", []); }

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
function cacheTicketsV4(list) { localStorage.setItem("bm_tickets_v4", JSON.stringify(list)); }
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
const TICKETS_OUTBOX_KEY = "bm_tickets_outbox";

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
  try { localStorage.setItem(TICKETS_OUTBOX_KEY, JSON.stringify(applyOutboxPut(load(TICKETS_OUTBOX_KEY, []), t, Date.now()))); }
  catch (e) { reportSyncError("No se pudo anotar la venta pendiente en este dispositivo:", e); }
}
function ticketsOutboxRemove(id) {
  // Solo descuenta algo ya confirmado y escribe una cadena más corta (por cuota
  // no puede fallar): basta la consola, nunca debe pintar de rojo una venta que
  // la nube SÍ confirmó.
  try { localStorage.setItem(TICKETS_OUTBOX_KEY, JSON.stringify(applyOutboxRemove(load(TICKETS_OUTBOX_KEY, []), id))); }
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
export function applyCheckIn(t, nowISO) {
  if (!t || t.status !== "activo") return undefined;
  return { ...t, status: "ingresado", checkedInAt: nowISO };
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
const CHECKIN_OUTBOX_KEY = "bm_checkin_outbox";
export function checkinOutboxList() { return pruneOutbox(load(CHECKIN_OUTBOX_KEY, []), Date.now()); }
function checkinOutboxPut(id) {
  try { localStorage.setItem(CHECKIN_OUTBOX_KEY, JSON.stringify(applyOutboxPut(load(CHECKIN_OUTBOX_KEY, []), { id }, Date.now()))); }
  catch (e) { console.error("No se pudo anotar el ingreso pendiente en este dispositivo:", e); }
}
function checkinOutboxRemove(id) {
  try { localStorage.setItem(CHECKIN_OUTBOX_KEY, JSON.stringify(applyOutboxRemove(load(CHECKIN_OUTBOX_KEY, []), id))); }
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
export async function checkInTicketTx(id) {
  if (!FB.ready) return { offline: true };
  const nodeRef = ref(FB.db, fbPath("tickets/" + id));
  // Se anota ANTES de lanzar: si la página muere con la escritura en vuelo, el
  // replay al reabrir es lo único que puede salvar el ingreso.
  if (cloudIntended()) checkinOutboxPut(id);
  const tx = runTransaction(nodeRef, t => applyCheckIn(t, new Date().toISOString()));
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
      const res = await runTransaction(ref(FB.db, fbPath("tickets/" + p.id)), t => applyCheckIn(t, new Date().toISOString()));
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

export function clearTicketsCache() { localStorage.removeItem("bm_tickets_v4"); }

// Borra del dispositivo los datos del evento (peleadores —incluye menores—,
// peleas, Super 4 y boletas con datos de compradores) al cerrar sesión, para
// que un aparato perdido o prestado no los exponga sin autenticación. La nube
// es la fuente de verdad: al volver a iniciar sesión se re-sincroniza todo.
export function clearLocalEventData() {
  Object.keys(SYNC_KEYS).forEach(k => localStorage.removeItem(k));
  localStorage.removeItem("bm_tickets_v4");
  // También los PENDIENTES del outbox: traen datos de peleadores (incluye
  // menores) y no deben quedar legibles sin login. Además, "Recargar desde la
  // nube" usa esta misma limpieza como reparación de un clic: si el outbox
  // sobreviviera, el replay re-fusionaría justo el registro que se intentaba
  // purgar, y un pendiente encolado por una cuenta podría terminar re-subido
  // por la cuenta que inicie sesión después.
  localStorage.removeItem(OUTBOX_KEY);
  // También los pendientes de VENTA: traen datos del comprador y, igual que los
  // de peleadores, no deben quedar legibles sin login ni sobrevivir a un
  // "Recargar desde la nube" (los guards de App.jsx avisan antes de borrarlos).
  localStorage.removeItem(TICKETS_OUTBOX_KEY);
  localStorage.removeItem(CHECKIN_OUTBOX_KEY);
}

// ============================================
// REINICIAR EVENTO (Fase 5) — respaldo antes de borrar
// ============================================
// Guarda una copia completa del evento en sangre_nueva_backups/{fecha}.
// Ese nodo está protegido en database.rules.json para que solo el dueño
// (por email) pueda leerlo o escribirlo — la Fase 2 ya deja esa regla lista.
// Lista los respaldos guardados en la nube, del más nuevo al más viejo, con la
// fecha ya legible y un resumen de lo que contienen. Hasta ahora "Reiniciar
// evento" guardaba una copia que la app NO sabía volver a leer: la única forma
// de recuperarla era entrar a la consola de Firebase, algo fuera del alcance
// del organizador. Solo el dueño puede leer ese nodo (ver database.rules.json).
export async function listCloudBackups() {
  if (!FB.ready) return [];
  const snap = await get(ref(FB.db, "sangre_nueva_backups"));
  const val = snap.val() || {};
  return Object.entries(val).map(([clave, d]) => ({
    clave,
    // La clave es un ISO con "." y ":" cambiados por "-" (ver backupEventToCloud).
    fecha: descifrarFechaRespaldo(clave),
    peleadores: nodeToArray(d && d.fighters).length,
    peleas: nodeToArray(d && d.matchups).length,
    boletas: nodeToArray(d && d.ticketsNew).length,
    eventLabel: (d && d.eventLabel) || "",
  })).sort((a, b) => b.clave.localeCompare(a.clave));
}

// Pura y testeable: de la clave del respaldo saca una fecha legible en español.
// Devuelve la clave tal cual si no se puede interpretar (nunca falla).
export function descifrarFechaRespaldo(clave) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/.exec(String(clave || ""));
  if (!m) return String(clave || "");
  const [, a, mes, d, h, min] = m;
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${Number(d)} de ${MESES[Number(mes) - 1] || mes} de ${a}, ${h}:${min}`;
}

// Trae un respaldo completo de la nube para restaurarlo.
export async function fetchCloudBackup(clave) {
  if (!FB.ready) return null;
  const snap = await get(ref(FB.db, "sangre_nueva_backups/" + clave));
  return snap.exists() ? snap.val() : null;
}

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
