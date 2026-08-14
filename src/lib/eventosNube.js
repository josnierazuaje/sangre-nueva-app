// ============================================
// EVENTOS EN LA NUBE — listar los míos, crear uno nuevo
// ============================================
// La parte de multi-evento que sí habla con Firebase. Las rutas y el
// aislamiento (lo delicado) viven en ./eventos.js, que es puro; aquí solo está
// la conversación con la base.
//
// POR QUÉ HAY UN ÍNDICE POR USUARIO. Realtime Database no sabe responder "los
// eventos cuyo dueño soy yo" sin darme permiso de lectura sobre TODOS los
// eventos —incluidos los de otros organizadores, con sus menores y sus
// compradores dentro—. Así que cada usuario lleva su propia lista de ids en
// `usuarios/{uid}/eventos` y después pide la ficha de cada uno. Es el patrón
// normal en RTDB y es lo que permite que la app la use más de un organizador
// sin que ninguno vea los datos del otro.

import { ref, get, update as dbUpdate } from "firebase/database";
import { FB, OWNER_EMAIL } from "./firebase.js";
import {
  EVENTO_LEGACY_ID, META_LEGACY, rutaMeta, rutaEventosDeUsuario,
  nuevoEventoId, esEventoIdValido,
} from "./eventos.js";
import { DEFAULT_EVENT_DATES } from "./eventDates.js";
import { MONEDAS, MONEDA_POR_DEFECTO, preciosPorDefecto } from "./moneda.js";
import { aforoValido, AFORO_POR_DEFECTO } from "./fichaEvento.js";
import { FEDERACIONES, FEDERACION_POR_DEFECTO } from "./federacion.js";

// Ficha de un evento. Devuelve null si no existe o si esta cuenta no tiene
// permiso para leerla (que para la app es lo mismo: no está a su alcance).
export async function leerMetaEvento(eventoId) {
  if (eventoId === EVENTO_LEGACY_ID) return META_LEGACY;
  if (!FB.ready || !FB.db) return null;
  try {
    const snap = await get(ref(FB.db, rutaMeta(eventoId)));
    const val = snap.val();
    return val ? { ...val, id: eventoId } : null;
  } catch (e) {
    console.error("No se pudo leer la ficha del evento " + eventoId + ":", e);
    return null;
  }
}

// Los eventos que este usuario puede abrir, del más nuevo al más viejo.
//
// La velada de Chile no está en el índice y no hace falta que lo esté: es
// anterior a todo esto y su ficha vive en el código. Se le agrega a mano al
// dueño histórico para que su histórico siga a un clic, sin escribir nada en el
// árbol de producción.
export async function listarMisEventos(user) {
  const propios = [];
  if (user && user.email === OWNER_EMAIL) propios.push(META_LEGACY);
  if (!FB.ready || !FB.db || !user) return propios;
  let ids = [];
  try {
    const snap = await get(ref(FB.db, rutaEventosDeUsuario(user.uid)));
    ids = Object.keys(snap.val() || {});
  } catch (e) {
    console.error("No se pudo leer tu lista de eventos:", e);
    return propios;
  }
  const fichas = await Promise.all(ids.map(id => leerMetaEvento(id)));
  // Una ficha ilegible (evento borrado a mano en la consola, permiso retirado)
  // no puede tumbar la lista entera: se descarta y los demás siguen apareciendo.
  const validas = fichas.filter(Boolean);
  validas.sort((a, b) => String(b.creadoEl || "").localeCompare(String(a.creadoEl || "")));
  return [...validas, ...propios];
}

// Crea una velada nueva y deja al creador como su dueño.
//
// Todo va en UNA sola escritura multi-ruta: si se hiciera en varios pasos y
// fallara el de en medio, quedaría un evento sin ficha (invisible en la lista,
// pero ocupando su id) o una ficha sin entrada en el índice (datos que el dueño
// ya no encuentra desde la app). Con `update` de varias rutas, o entra todo o
// no entra nada.
export async function crearEvento({ nombre, dates, pais, moneda, federacion, aforo, user }, sufijoId) {
  if (!FB.ready || !FB.db) throw new Error("No hay conexión con la nube.");
  if (!user) throw new Error("Hay que iniciar sesión para crear un evento.");
  const limpio = String(nombre || "").trim().slice(0, 80);
  if (limpio.length < 2) throw new Error("El nombre del evento es muy corto.");
  const id = nuevoEventoId(limpio, sufijoId);
  if (!esEventoIdValido(id)) throw new Error("Ese nombre no da un identificador válido.");
  const mon = MONEDAS[moneda] ? moneda : MONEDA_POR_DEFECTO;
  const fechas = dates && dates.semis && dates.final ? dates : DEFAULT_EVENT_DATES;
  const meta = {
    nombre: limpio,
    ownerUid: user.uid,
    // El correo se guarda solo para que la ficha se entienda desde la consola
    // de Firebase; QUIEN MANDA es ownerUid, que es lo que comparan las reglas.
    ownerEmail: user.email || "",
    pais: String(pais || "").slice(0, 2).toUpperCase(),
    moneda: mon,
    federacion: FEDERACIONES[federacion] ? federacion : FEDERACION_POR_DEFECTO,
    precios: preciosPorDefecto(mon),
    aforo: aforoValido(aforo, AFORO_POR_DEFECTO),
    creadoEl: new Date().toISOString(),
  };
  const updates = {};
  updates["eventos/" + id + "/meta"] = meta;
  updates["eventos/" + id + "/bm_event_label"] = limpio;
  updates["eventos/" + id + "/bm_event_dates"] = fechas;
  updates[rutaEventosDeUsuario(user.uid) + "/" + id] = true;
  await dbUpdate(ref(FB.db), updates);
  return { ...meta, id };
}

// Cambia datos de la ficha que el dueño puede editar desde la app (hoy: el
// nombre visible, la moneda, los precios y el aforo). No toca ownerUid ni
// creadoEl — las reglas de la base tampoco lo permitirían.
export async function actualizarMetaEvento(eventoId, cambios) {
  if (eventoId === EVENTO_LEGACY_ID) throw new Error("La velada de Chile es un histórico: su ficha no se edita.");
  if (!FB.ready || !FB.db) throw new Error("No hay conexión con la nube.");
  const permitidos = {};
  if (cambios.nombre != null) permitidos.nombre = String(cambios.nombre).trim().slice(0, 80);
  if (cambios.moneda && MONEDAS[cambios.moneda]) permitidos.moneda = cambios.moneda;
  if (cambios.precios) permitidos.precios = cambios.precios;
  if (cambios.aforo !== undefined) permitidos.aforo = aforoValido(cambios.aforo, AFORO_POR_DEFECTO);
  if (cambios.pais != null) permitidos.pais = String(cambios.pais).slice(0, 2).toUpperCase();
  if (cambios.federacion && FEDERACIONES[cambios.federacion]) permitidos.federacion = cambios.federacion;
  if (!Object.keys(permitidos).length) return null;
  await dbUpdate(ref(FB.db, rutaMeta(eventoId)), permitidos);
  return permitidos;
}
