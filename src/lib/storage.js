import { ref, set as dbSet } from "firebase/database";
import { getWeightCategory, getExperienceLevel, SYNC_KEYS } from "../constants.js";
import { FB, fbPath } from "./firebase.js";

// ============================================
// ATLETAS SANGRE NUEVA — LA VELADA (precargados desde Excel)
// exp = nº de peleas/experiencia, sexo: "M"/"F"
// NOTA (Fase 2 pendiente): estos datos reales de atletas, incluyendo
// menores de edad, no deberían vivir en el bundle público. Se eliminan
// en la Fase 2 de la migración.
// ============================================
const SN_RAW = [
  ["BOXEO CDIE", "Ignacio Maturana", 3, 75, 27, "M"],
  ["BOXEO CDIE", "Martin Lopez", 2, 67, 19, "M"],
  ["BOXEO CDIE", "Franchesca Granados", 2, 49, 17, "F"],
  ["DOMINGUEZ", "Francisco Angulo", 0, 63, 17, "M"],
  ["DOMINGUEZ", "Benjamin Oliveros", 3, 70, 19, "M"],
  ["DOMINGUEZ", "Karla Castro", 0, 60, 18, "F"],
  ["DOMINGUEZ", "Mateo Godoy", 3, 66, 15, "M"],
  ["ACUÑA", "Gabriela Valencia", 2, 98, 36, "F"],
  ["ACUÑA", "Moises Villamil", 4, 60, 29, "M"],
  ["ACUÑA", "Jairo Melgarejo", 0, 120, 31, "M"],
  ["IRON KING", "Diego Avaria", 4, 57, 28, "M"],
  ["IRON KING", "Bastian Aguayo", 0, 75, 32, "M"],
  ["IRON KING", "Francisco Herrera", 0, 80, 19, "M"],
  ["IRON KING", "Benjamin Zabarburu", 1, 59, 17, "M"],
  ["ATHLETIC", "Alonso Cabello", 3, 81, 15, "M"],
  ["ATHLETIC", "Vicente Godoy", 1, 80, 15, "M"],
  ["ATHLETIC", "Mauricio Arancibia", 1, 89, 33, "M"],
  ["SUDAKA", "Carlos Sepulveda", 2, 60, 17, "M"],
  ["GORILAS PSUR", "Jhosua Ureta", 1, 60, 29, "M"],
  ["DOMINGUEZ", "Joaquin Lopez", 1, 70, 20, "M"],
  ["SUDAKA", "Rodrigo Bravo", 2, 60, 21, "M"],
  ["AZUAJE", "Sebastian Rueda", 3, 58, 17, "M"],
  ["AZUAJE", "Cesar Donoso", 2, 75, 23, "M"],
  ["AZUAJE", "Leonardo Fuentealba", 5, 90, 32, "M"],
  ["PATRICIO BRAVO", "Jimi Andrade", 10, 60, 17, "M"],
  ["PATRICIO BRAVO", "Juan Pedro", 5, 58, 15, "M"],
  ["PATRICIO BRAVO", "Cristobal Lopez", 3, 48, 13, "M"],
  ["PATRICIO BRAVO", "Sebastian Curillan", 5, 92, 18, "M"],
  ["PATRICIO BRAVO", "Lucas Diaz", 0, 71, 16, "M"],
  ["PATRICIO BRAVO", "Vicente Morales", 3, 67, 18, "M"],
  ["PATRICIO BRAVO", "Cristobal Astorga", 0, 70, 16, "M"],
  ["BOXEO HIDALGO", "Sebastian Vasquez", 2, 69, 28, "M"],
  ["BOXEO HIDALGO", "Cristofer Villanueva", 0, 85, 14, "M"],
  ["AZUAJE", "Vili Urdaneta", 3, 60, 19, "M"],
  ["PRIMAL CLUB", "Tomas Espindola", 4, 52, 13, "M"],
  ["PRIMAL CLUB", "Lucas Villaroel", 2, 71, 18, "M"],
  ["PRIMAL CLUB", "Elias Espindola", 4, 88, 17, "M"],
  ["PRIMAL CLUB", "Isabella Cordova", 0, 52, 15, "F"],
  ["PRIMAL CLUB", "Benjamin Osorio", 12, 69, 22, "M"],
  ["BAM TALCA", "Pablo Gaete", 3, 67, 15, "M"],
  ["BAM TALCA", "Ignacio Castillo", 1, 70, 23, "M"],
  ["BAM TALCA", "Vicente Concha", 4, 90, 19, "M"],
  ["BAM TALCA", "Ignacio Gonzales", 1, 91, 28, "M"],
];
const SN_FIGHTERS = SN_RAW.map((r, i) => ({
  id: "sn" + (i + 1), fullName: r[1], phone: "", gym: r[0], age: r[4], weightKg: r[3],
  weightCategory: getWeightCategory(r[3]), experienceLevel: getExperienceLevel(r[2]),
  fightCount: r[2], sexo: r[5], createdAt: new Date(2026, 5, 1, 10, i).toISOString(),
}));
export const DEMO_FIGHTERS = SN_FIGHTERS;

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
  const d = load("bm_fighters_v4", null);
  if (d) return d;
  save("bm_fighters_v4", DEMO_FIGHTERS);
  return [...DEMO_FIGHTERS];
}

export function loadTicketsV4() { return load("bm_tickets_v4", []); }
export function saveTicketsV4(t) { save("bm_tickets_v4", t); }
export function loadCountersV4() { return load("bm_tc_v4", { inscripcion: 0, preventa: 0, puerta: 0 }); }
export function saveCountersV4(c) { save("bm_tc_v4", c); }
export function padN(n) { return String(n).padStart(4, "0"); }
