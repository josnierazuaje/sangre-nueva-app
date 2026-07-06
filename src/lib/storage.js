import { ref, set as dbSet } from "firebase/database";
import { SYNC_KEYS } from "../constants.js";
import { FB, fbPath } from "./firebase.js";

// ============================================
// STORAGE
// ============================================
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

export function loadTicketsV4() { return load("bm_tickets_v4", []); }
export function saveTicketsV4(t) { save("bm_tickets_v4", t); }
export function loadCountersV4() { return load("bm_tc_v4", { inscripcion: 0, preventa: 0, puerta: 0 }); }
export function saveCountersV4(c) { save("bm_tc_v4", c); }
export function padN(n) { return String(n).padStart(4, "0"); }
