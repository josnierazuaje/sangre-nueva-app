import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, get, set, onValue } from "firebase/database";
import { getAuth } from "firebase/auth";
import { SYNC_KEYS } from "../constants.js";

export const FB = { app: null, db: null, auth: null, ready: false };
export function fbPath(k) { return "sangre_nueva/" + k; }

// Config pública del proyecto de Firebase del equipo (la apiKey de un SDK
// web de Firebase no es secreta: la seguridad la dan las Reglas de la base
// de datos, no ocultar esta clave). Se usa para que cualquier dispositivo
// se conecte automáticamente a la misma base de datos sin pegar nada.
export const DEFAULT_FB_CONFIG = {
  apiKey: "AIzaSyCpt37J3Nph8KIL6rGXNcGOUNnk08paYTc",
  authDomain: "velada-sangre-nueva-22fb0.firebaseapp.com",
  databaseURL: "https://velada-sangre-nueva-22fb0-default-rtdb.firebaseio.com",
  projectId: "velada-sangre-nueva-22fb0",
  storageBucket: "velada-sangre-nueva-22fb0.firebasestorage.app",
  messagingSenderId: "41697069846",
  appId: "1:41697069846:web:a7726fe384e8730b2e1e37",
};

// Acepta el bloque firebaseConfig pegado desde la consola de Firebase, que no
// siempre es JSON estricto (claves sin comillas). Antes se evaluaba con
// `new Function(...)`, lo que ejecutaba cualquier código pegado por el
// usuario — ahora solo se acepta JSON estricto o, si eso falla, se extraen
// los pares clave: "valor" manualmente, sin ejecutar nada.
export function parseFbConfig(t) {
  t = (t || "").trim();
  const m = t.match(/\{[\s\S]*\}/); if (m) t = m[0];
  try { return JSON.parse(t); } catch (e) {}
  return parseFbConfigKeyValue(t);
}

function parseFbConfigKeyValue(t) {
  const cfg = {};
  const re = /["']?([A-Za-z0-9_]+)["']?\s*:\s*["']([^"']*)["']/g;
  let match, found = false;
  while ((match = re.exec(t))) { cfg[match[1]] = match[2]; found = true; }
  return found ? cfg : null;
}

export const OWNER_EMAIL = "josnier.azuaje@gmail.com";

export function initFirebaseApp(cfg) {
  if (!cfg || !cfg.apiKey || !cfg.databaseURL) return false;
  FB.app = getApps().length ? getApp() : initializeApp(cfg);
  FB.db = getDatabase(FB.app);
  FB.auth = getAuth(FB.app);
  return true;
}

// onKeyReady (opcional) se llama UNA vez por clave cuando el primer valor
// de esa clave llegó de la nube en esta sesión — sirve para saber cuándo el
// estado local ya refleja la nube (ej. la reconciliación automática de
// duplicados espera a que peleadores Y peleas estén hidratados, porque las
// claves sincronizan por canales separados y sin orden garantizado).
// Guarda el callback de estado para que las escrituras (en storage.js) puedan
// avisar de un fallo real de sincronización (ver reportSyncError). onValue de
// .info/connected lo restablece a "on"/"connecting" cuando cambia la conexión.
let notifyStatus = null;

// Marca el chip de sincronización como "error" y loguea. Se llama cuando una
// escritura a Firebase es RECHAZADA de verdad (permiso denegado, token
// vencido, dato inválido) — no cuando solo está sin conexión (RTDB encola esas
// escrituras y las promesas quedan pendientes, no rechazadas). Antes estos
// fallos caían en un try/catch que no atrapa promesas: se perdían en silencio.
export function reportSyncError(context, e) {
  console.error(context, e);
  if (notifyStatus) notifyStatus("error");
}

export function startFirebaseSync(onStatus, onRemote, onKeyReady) {
  if (FB.ready) return;
  notifyStatus = onStatus;
  onStatus("connecting");
  FB.ready = true;
  // Estado REAL de conexión: .info/connected es un nodo especial del cliente
  // RTDB (siempre legible) que refleja si el socket está conectado. Antes se
  // ponía "on" de forma incondicional en esta línea y el chip se quedaba verde
  // para siempre aunque el teléfono perdiera la red toda la noche — el
  // operador creía que sus ventas estaban respaldadas cuando no lo estaban.
  onValue(ref(FB.db, ".info/connected"), s => onStatus(s.val() ? "on" : "connecting"));
  Object.keys(SYNC_KEYS).forEach(k => {
    const nodeRef = ref(FB.db, fbPath(k));
    get(nodeRef).then(snap => {
      // Primera conexion: si la nube esta vacia y aqui hay datos, subimos los locales
      if (snap.val() === null) {
        const localRaw = localStorage.getItem(k);
        if (localRaw) { try { set(nodeRef, JSON.parse(localRaw)); } catch (e) { console.error("No se pudo subir " + k + " a Firebase en la primera conexión:", e); } }
      }
      let first = true;
      onValue(nodeRef, s => {
        const val = s.val();
        // "__EMPTY__" es el centinela de "arreglo vaciado a propósito" que
        // escribe save() (RTDB borra los nodos con []); se traduce de vuelta.
        const remote = (val === null || val === undefined) ? SYNC_KEYS[k] : (val === "__EMPTY__" ? [] : val);
        const remoteRaw = JSON.stringify(remote);
        if (localStorage.getItem(k) !== remoteRaw) { // distinto: aplica el cambio remoto
          localStorage.setItem(k, remoteRaw);
          onRemote(k, remote);
        }
        if (first) { first = false; onKeyReady?.(k); }
      });
    });
  });
}

export function initFirebase(cfg, onStatus, onRemote, onKeyReady) {
  try {
    if (!cfg || !cfg.apiKey) { onStatus("error"); alert("Configuración inválida. Pega el bloque firebaseConfig completo."); return false; }
    if (!cfg.databaseURL) { onStatus("error"); alert("A tu configuración le falta databaseURL.\n\nEn la consola de Firebase crea la Realtime Database (parte C de la guía) y vuelve a copiar la config — debe incluir la línea databaseURL."); return false; }
    if (!initFirebaseApp(cfg)) { onStatus("error"); return false; }
    if (FB.auth.currentUser) startFirebaseSync(onStatus, onRemote, onKeyReady);
    else onStatus("off");
    return true;
  } catch (e) { onStatus("error"); alert("Error al conectar con Firebase: " + e.message); return false; }
}
