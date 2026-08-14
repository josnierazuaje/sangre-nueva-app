import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getDatabase, ref, get, set, onValue } from "firebase/database";
import { getAuth } from "firebase/auth";
import { SYNC_KEYS } from "../constants.js";

// `connected` refleja el estado REAL del socket con RTDB (lo alimenta el
// listener de .info/connected en startFirebaseSync). `ready` solo dice que la
// sincronización arrancó y NUNCA vuelve a false, así que no sirve para saber si
// hay señal: el check-in lo usaba y por eso su rama "sin conexión" era
// inalcanzable y cada escaneo esperaba 8 s a ciegas antes de dar error.
export const FB = { app: null, db: null, auth: null, ready: false, connected: false };
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

// Cuenta compartida de ESCÁNER para el staff de la puerta. El enlace "?scan=1"
// abre la app directo en la pantalla de escanear y precarga este correo, para
// que el staff solo teclee la clave compartida. Esta cuenta debe existir en
// Firebase (Authentication) y su UID estar en la lista blanca /staff — así las
// reglas le permiten leer boletas y marcar ingresos, pero el modo escáner le
// oculta todo lo demás. La clave NO va en el código: la comparte el dueño.
export const SCANNER_EMAIL = "escaner@sangrenueva.app";

// ============================================
// APP CHECK — que solo ESTA app pueda hablar con la base
// ============================================
// El login dice QUIÉN entra; App Check dice DESDE DÓNDE. Sin esto, cualquiera
// con la clave de una cuenta puede escribir en la base desde un script, un
// navegador o una copia de la app: las reglas lo dejarían pasar porque, para
// ellas, es un usuario legítimo. Con App Check, cada petición viaja con un
// token que solo se consigue ejecutando la app real en un dominio autorizado.
//
// Clave del SITIO de reCAPTCHA v3: es pública a propósito —viaja en el bundle,
// como el resto de la configuración— y no sirve para nada sin la clave secreta,
// que vive únicamente en la consola de Firebase. Los dominios autorizados están
// en la consola de reCAPTCHA: sangre-nueva-la-velada.pages.dev y localhost.
const RECAPTCHA_SITE_KEY = "6LfMH4UtAAAAAEX9xw3sCHtyFToF2XqyDAn8JtOd";

// Arranca App Check. TODO lo de aquí es "mejor esfuerzo": si reCAPTCHA no
// carga (sin señal, un bloqueador de anuncios, el wifi del recinto con portal
// cautivo), se avisa por consola y la app SIGUE funcionando. Un fallo de esta
// capa jamás puede impedir registrar un peleador o vender una entrada — por eso
// va dentro de un try/catch y nunca lanza hacia arriba.
//
// Mientras App Check esté en modo MONITOREO en la consola, un token ausente o
// inválido no bloquea nada: solo aparece como "petición no verificada" en las
// métricas. Ese es el modo en el que se despliega, a propósito: primero se mira
// que los dispositivos de verdad salgan verificados, y solo después se decide
// activar el bloqueo (y nunca en la semana de una velada).
let appCheckIniciado = false;
function initAppCheck(cfg) {
  // Solo para el proyecto propio: con "Firebase manual" se puede conectar el
  // aparato a OTRO proyecto, donde esta clave no está registrada y el token
  // sería inservible.
  if (appCheckIniciado || cfg.projectId !== DEFAULT_FB_CONFIG.projectId) return;
  try {
    // En localhost no hay reCAPTCHA que valga: este interruptor hace que el SDK
    // imprima en la consola un token de depuración para registrarlo a mano en
    // App Check → Apps → ⋮ → "Administrar tokens de depuración". Sin esto,
    // `npm run dev` quedaría fuera el día que se active el bloqueo.
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(FB.app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      // Renueva el token solo antes de que venza (dura 1 hora): sin esto, una
      // velada de cuatro horas se quedaría sin token a mitad de camino.
      isTokenAutoRefreshEnabled: true,
    });
    appCheckIniciado = true;
  } catch (e) {
    console.error("App Check no pudo iniciarse (la app sigue funcionando):", e);
  }
}

export function initFirebaseApp(cfg) {
  if (!cfg || !cfg.apiKey || !cfg.databaseURL) return false;
  FB.app = getApps().length ? getApp() : initializeApp(cfg);
  // ANTES de getDatabase/getAuth: así las peticiones salen ya con su token en
  // vez de empezar sin él y quedar como "no verificadas" en las métricas.
  initAppCheck(cfg);
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

// `opts.soloConexion` (modo escáner): deja lista la conexión y el chip de
// estado, pero NO se suscribe a los datos del evento. El teléfono de la puerta
// solo valida entradas: bajarse el padrón completo —con nombre, edad y escuela
// de los menores— y volver a bajarlo entero cada vez que el organizador corrige
// la cartelera era gasto de datos y, sobre todo, dejaba esa información
// guardada en un aparato prestado o personal. También es lo que permite que las
// reglas le nieguen la lectura a la cuenta de puerta sin romper la app.
export function startFirebaseSync(onStatus, onRemote, onKeyReady, opts = {}) {
  if (FB.ready) return;
  notifyStatus = onStatus;
  onStatus("connecting");
  FB.ready = true;
  // Estado REAL de conexión: .info/connected es un nodo especial del cliente
  // RTDB (siempre legible) que refleja si el socket está conectado. Antes se
  // ponía "on" de forma incondicional en esta línea y el chip se quedaba verde
  // para siempre aunque el teléfono perdiera la red toda la noche — el
  // operador creía que sus ventas estaban respaldadas cuando no lo estaban.
  onValue(ref(FB.db, ".info/connected"), s => {
    FB.connected = !!s.val();
    onStatus(FB.connected ? "on" : "connecting");
  });
  if (opts.soloConexion) return;
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
          // La caché local es un acelerador, no el dato: si no se puede
          // escribir (cuota llena) el cambio remoto debe llegar IGUAL a la app.
          // Sin este guard la excepción sale del callback y ni onRemote ni
          // onKeyReady se ejecutan, así que esta clave deja de recibir datos de
          // la nube el resto de la sesión y el replay del outbox —que espera a
          // que la clave esté lista— no corre nunca.
          try { localStorage.setItem(k, remoteRaw); } catch (e) { console.error("No se pudo cachear " + k + " en este dispositivo:", e); }
          onRemote(k, remote);
        }
        if (first) { first = false; onKeyReady?.(k); }
      }, err => {
        // onValue acepta un callback de error y no se le pasaba ninguno: un
        // permiso denegado se perdía en silencio, la clave nunca hidrataba y
        // todo lo que espera esa hidratación (limpieza de duplicados, replay
        // del outbox) se quedaba esperando para siempre, con el chip en verde.
        onKeyReady?.(k); // desbloquea a los que esperan, aunque sea sin datos
        reportSyncError("No se pudo leer " + k + " de Firebase (¿esta cuenta tiene permiso?):", err);
      });
    }).catch(e => {
      onKeyReady?.(k);
      reportSyncError("No se pudo leer " + k + " de Firebase (¿esta cuenta tiene permiso?):", e);
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
