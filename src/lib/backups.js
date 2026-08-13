// ============================================
// RESPALDOS DEL EVENTO EN LA NUBE
// ============================================
// "Reiniciar evento" guarda una copia completa en sangre_nueva_backups/{fecha}
// antes de borrar nada, y desde la app se pueden listar y volver a traer. Ese
// nodo está protegido en database.rules.json para que SOLO el dueño (por
// correo) pueda leerlo o escribirlo: contiene el padrón entero, con datos de
// menores, y los datos de los compradores.
//
// Salió de storage.js sin cambiar lógica, junto con la separación de boletas.

import { ref, set as dbSet, get } from "firebase/database";
import { FB } from "./firebase.js";
import { nodeToArray } from "./storage.js";

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
