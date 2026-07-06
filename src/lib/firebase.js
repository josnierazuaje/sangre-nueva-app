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

export function parseFbConfig(t) {
  t = (t || "").trim();
  const m = t.match(/\{[\s\S]*\}/); if (m) t = m[0];
  try { return JSON.parse(t); } catch (e) {}
  try { return (new Function("return (" + t + ")"))(); } catch (e) { return null; }
}

export const OWNER_EMAIL = "josnier.azuaje@gmail.com";

export function initFirebaseApp(cfg) {
  if (!cfg || !cfg.apiKey || !cfg.databaseURL) return false;
  FB.app = getApps().length ? getApp() : initializeApp(cfg);
  FB.db = getDatabase(FB.app);
  FB.auth = getAuth(FB.app);
  return true;
}

export function startFirebaseSync(onStatus, onRemote) {
  if (FB.ready) return;
  onStatus("connecting");
  FB.ready = true; onStatus("on");
  Object.keys(SYNC_KEYS).forEach(k => {
    const nodeRef = ref(FB.db, fbPath(k));
    get(nodeRef).then(snap => {
      // Primera conexion: si la nube esta vacia y aqui hay datos, subimos los locales
      if (snap.val() === null) {
        const localRaw = localStorage.getItem(k);
        if (localRaw) { try { set(nodeRef, JSON.parse(localRaw)); } catch (e) { console.error("No se pudo subir " + k + " a Firebase en la primera conexión:", e); } }
      }
      onValue(nodeRef, s => {
        const val = s.val();
        const remote = (val === null || val === undefined) ? SYNC_KEYS[k] : val;
        const remoteRaw = JSON.stringify(remote);
        if (localStorage.getItem(k) === remoteRaw) return; // ya estamos al dia (o fue nuestro propio cambio)
        localStorage.setItem(k, remoteRaw);
        onRemote(k, remote);
      });
    });
  });
}

export function initFirebase(cfg, onStatus, onRemote) {
  try {
    if (!cfg || !cfg.apiKey) { onStatus("error"); alert("Configuración inválida. Pega el bloque firebaseConfig completo."); return false; }
    if (!cfg.databaseURL) { onStatus("error"); alert("A tu configuración le falta databaseURL.\n\nEn la consola de Firebase crea la Realtime Database (parte C de la guía) y vuelve a copiar la config — debe incluir la línea databaseURL."); return false; }
    if (!initFirebaseApp(cfg)) { onStatus("error"); return false; }
    if (FB.auth.currentUser) startFirebaseSync(onStatus, onRemote);
    else onStatus("off");
    return true;
  } catch (e) { onStatus("error"); alert("Error al conectar con Firebase: " + e.message); return false; }
}
