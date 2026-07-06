import { ref, set as dbSet, update as dbUpdate, remove as dbRemove, get, onValue, runTransaction } from "firebase/database";
import { SYNC_KEYS } from "../constants.js";
import { FB, fbPath } from "./firebase.js";

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
    try { dbSet(ref(FB.db, fbPath(k)), JSON.parse(JSON.stringify(v))); } catch (e) { console.error("No se pudo sincronizar " + k + " con Firebase (el cambio sí quedó guardado localmente):", e); }
  }
}

export function loadFighters() {
  return load("bm_fighters_v4", []);
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

export function addTicketNode(ticket) {
  if (!FB.ready) return;
  try { dbSet(ref(FB.db, fbPath("tickets/" + ticket.id)), ticket); }
  catch (e) { console.error("No se pudo guardar la boleta en Firebase (sigue guardada localmente):", e); }
}
export function updateTicketNode(id, patch) {
  if (!FB.ready) return;
  try { dbUpdate(ref(FB.db, fbPath("tickets/" + id)), patch); }
  catch (e) { console.error("No se pudo actualizar la boleta en Firebase (sigue actualizada localmente):", e); }
}
export function removeTicketNode(id) {
  if (!FB.ready) return;
  try { dbRemove(ref(FB.db, fbPath("tickets/" + id))); }
  catch (e) { console.error("No se pudo eliminar la boleta en Firebase (sigue eliminada localmente):", e); }
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
    const updates = {};
    const maxByType = {};
    oldTickets.forEach(t => {
      updates["tickets/" + t.id] = t;
      const m = /^[A-Za-z]+-(\d+)$/.exec(t.id || "");
      if (m) {
        const n = parseInt(m[1], 10);
        if (!maxByType[t.ticketType] || n > maxByType[t.ticketType]) maxByType[t.ticketType] = n;
      }
    });
    Object.entries(maxByType).forEach(([tipo, n]) => { updates["counters/" + tipo] = n; });
    await dbUpdate(ref(FB.db, fbPath("")), updates);
    console.info("Migración de boletas a nodos individuales completada (" + oldTickets.length + " boletas).");
  } catch (e) {
    migrationAttempted = false; // permite reintentar en el próximo inicio si falló
    console.error("No se pudo migrar las boletas a nodos individuales:", e);
  }
}
