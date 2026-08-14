import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { FB, OWNER_EMAIL, DEFAULT_FB_CONFIG, initFirebaseApp, initFirebase, startFirebaseSync } from "./firebase.js";
import {
  load, save, loadFighters, fetchCloudArray, stripLocalGhosts, outboxList,
  mergePending, upsertFighterTx, saveLocal, reconcileNodeTx,
} from "./storage.js";
import { loadTicketsV4, migrateTicketsIfNeeded, watchTickets, replayTicketsOutbox } from "./tickets.js";
import { normalizeFighters } from "../constants.js";
import { DEFAULT_EVENT_DATES, normalizeEventDates } from "./eventDates.js";
import { normalizeSuper4 } from "./super4.js";
import { reconcileData, dedupeFighters, cleanMatchups, remapSuper4 } from "./dedup.js";
import { eventoActivoId, esDuenoDelEvento, EVENTO_LEGACY_ID, META_LEGACY } from "./eventos.js";
import { leerMetaEvento } from "./eventosNube.js";
import { leerMetaLocal, guardarMetaLocal } from "./moneda.js";

// ============================================
// useEventSync — TODO el ciclo de vida de la sincronización
// ============================================
// Antes esto vivía dentro de App.jsx, mezclado con la interfaz. Agregar el
// próximo dato compartido (resultados en vivo, una lista de árbitros…) obligaba
// a tocar seis puntos coordinados en dos archivos y a volver a razonar sobre las
// carreras de hidratación — justo la clase de error que ya mordió a este
// proyecto antes (reconciliar sobre un estado parcial, las semis truncadas del
// Super 4). Aquí queda junto: arranque, hidratación por clave, cambios remotos,
// limpieza de duplicados, auto-reparo de fantasmas y recuperación de pendientes.
//
// NO cambia ningún comportamiento respecto a lo que había: es el mismo código,
// con las mismas condiciones y el mismo orden de efectos, movido de sitio.
//
// Opciones:
//   scanMode       — el teléfono de la puerta: no se baja los datos del evento.
//   alRecuperar(f) — antes de re-subir cada peleador pendiente (para el aviso).
//   alConfirmar(f) — la nube confirmó ese peleador recuperado.
//   alFallar(f, e) — la nube RECHAZÓ la escritura de ese peleador.
export function useEventSync({ scanMode = false, alRecuperar, alConfirmar, alFallar } = {}) {
  const [fighters, setFighters] = useState([]);
  const [matchups, setMatchups] = useState([]);
  const [super4, setSuper4] = useState([]);
  const [tickets, setTickets] = useState([]);
  // "cargando" | "listo" | "sin-permiso": lo usa la puerta para no decir
  // "Boleta no encontrada" cuando en realidad las entradas aún están bajando o
  // esta cuenta no tiene permiso para leerlas.
  const [ticketsEstado, setTicketsEstado] = useState("cargando");
  const [eventLabel, setEventLabel] = useState(() => load("bm_event_label", "La Velada — próxima fecha por definir"));
  // Las dos fechas reales del evento (ISO). Se normalizan siempre al entrar —
  // de localStorage o de la nube— para que un valor corrupto no deje la app sin
  // fecha ni reviente al imprimir.
  const [eventDates, setEventDatesState] = useState(() => normalizeEventDates(load("bm_event_dates", DEFAULT_EVENT_DATES)));
  // Quién organiza esta edición. Vacío = no se muestra ninguna línea de
  // organizadores (ver SYNC_KEYS). Se lee de este dispositivo antes de que
  // llegue la nube para que la pantalla de acceso —que se dibuja SIN sesión—
  // ya pueda mostrarlo.
  const [eventOrg, setEventOrgState] = useState(() => load("bm_event_org", ""));
  const [sync, setSync] = useState(() => (localStorage.getItem("bm_fb_config") || !localStorage.getItem("bm_fb_disabled")) ? "connecting" : "off");
  const [authUser, setAuthUser] = useState(undefined);
  // null = aún no se decide el modo; false = solo-local (sin nube); true = nube.
  const [cloudMode, setCloudMode] = useState(null);
  const [hydrated, setHydrated] = useState({ fighters: false, matchups: false, super4: false });
  // Qué velada está abierta en este dispositivo y cuál es su ficha (nombre,
  // dueño, moneda, precios). Se lee de este aparato antes que de la nube para
  // que el primer render ya sepa en qué moneda cobra la boletería.
  const eventoId = eventoActivoId();
  const [eventoMeta, setEventoMeta] = useState(
    () => (eventoId === EVENTO_LEGACY_ID ? META_LEGACY : leerMetaLocal()));
  // El dueño ya no es un correo fijo: es el dueño de ESTA velada (el correo del
  // creador sigue valiendo como superusuario). Ver esDuenoDelEvento.
  const isOwner = esDuenoDelEvento(authUser, eventoMeta, { eventoId, superEmail: OWNER_EMAIL });

  function keyReady(k) {
    if (k === "bm_fighters_v4") setHydrated(h => (h.fighters ? h : { ...h, fighters: true }));
    else if (k === "bm_matchups_v3") setHydrated(h => (h.matchups ? h : { ...h, matchups: true }));
    else if (k === "bm_super4_v1") setHydrated(h => (h.super4 ? h : { ...h, super4: true }));
  }

  function applyRemote(k, val) {
    if (k === "bm_fighters_v4") setFighters(normalizeFighters(val));
    else if (k === "bm_matchups_v3") setMatchups(val);
    else if (k === "bm_super4_v1") setSuper4(normalizeSuper4(val));
    else if (k === "bm_event_label") setEventLabel(val);
    else if (k === "bm_event_dates") setEventDatesState(normalizeEventDates(val));
    else if (k === "bm_event_org") setEventOrgState(typeof val === "string" ? val : "");
    // Las boletas no vienen por acá: se sincronizan por nodo individual.
  }

  // Migra (si hace falta) y escucha los nodos individuales de boletas, para que
  // varios dispositivos vendiendo a la vez no se pisen.
  function startTicketsSync() {
    migrateTicketsIfNeeded().then(() => {
      watchTickets(setTickets, setTicketsEstado);
      // Re-sube las ventas que quedaron sin confirmar (típico: se vendió sin
      // señal y la app se recargó, o el sistema mató la PWA mientras el
      // vendedor mandaba el voucher por WhatsApp). Crea solo lo que falta en la
      // nube, así que es seguro repetirlo.
      replayTicketsOutbox().catch(e => console.error("No se pudieron recuperar las ventas pendientes:", e));
    });
  }

  // Trae la ficha del evento abierto y la deja cacheada. Importa que se
  // cachee: la moneda y los precios se resuelven al CARGAR la página (ver
  // constants.js), así que lo que se guarda hoy es lo que la boletería usará en
  // el próximo arranque, aunque ese día el recinto no tenga señal.
  //
  // Un fallo aquí no rompe nada: se sigue con la ficha cacheada. El caso real
  // que cubre es el teléfono de la puerta entrando por wifi de recinto.
  function refrescarMeta() {
    if (eventoId === EVENTO_LEGACY_ID) return; // su ficha vive en el código
    leerMetaEvento(eventoId).then(m => {
      if (!m) return;
      setEventoMeta(m);
      guardarMetaLocal(m);
    });
  }

  // Conecta este dispositivo a OTRO proyecto de Firebase (config pegada a mano).
  // Devuelve true si la configuración sirvió.
  function conectarConConfig(cfg) {
    if (!initFirebase(cfg, setSync, applyRemote, keyReady)) return false;
    startTicketsSync();
    return true;
  }

  // ---- Arranque: datos locales primero, luego la nube ----
  useEffect(() => {
    setFighters(normalizeFighters(loadFighters()));
    setMatchups(load("bm_matchups_v3", []));
    setSuper4(normalizeSuper4(load("bm_super4_v1", [])));
    setTickets(loadTicketsV4());
    const raw = localStorage.getItem("bm_fb_config");
    const disabled = localStorage.getItem("bm_fb_disabled");
    const cfgToUse = raw ? JSON.parse(raw) : (disabled ? null : DEFAULT_FB_CONFIG);
    if (cfgToUse && initFirebaseApp(cfgToUse)) {
      setCloudMode(true);
      try {
        onAuthStateChanged(FB.auth, user => {
          setAuthUser(user);
          // En modo escáner solo se abre la conexión (para el chip y el
          // check-in) y las boletas: nada de peleadores, cartelera ni Super 4.
          if (user) { startFirebaseSync(setSync, applyRemote, keyReady, { soloConexion: scanMode }); startTicketsSync(); refrescarMeta(); }
          else setSync("off");
        });
      } catch (e) { setAuthUser(null); setSync("error"); }
    } else {
      setCloudMode(false);
      setAuthUser(null);
      setTicketsEstado("listo"); // modo solo-local: lo local es toda la verdad
    }
  }, []);

  // ---- Limpieza automática de duplicados ----
  // Elimina peleadores duplicados (mismo nombre + sexo + peso, registrados dos
  // veces) y peleas inválidas o repetidas. Es idempotente: si ya está todo
  // limpio no escribe nada (no genera bucle).
  //
  // SOLO corre cuando el estado ya refleja la nube: las claves sincronizan por
  // canales separados y sin orden garantizado, y reconciliar sobre un estado
  // parcial podría eliminar al registro equivocado y propagarlo a todos los
  // dispositivos. En modo nube solo reconcilia el DUEÑO, y nunca en modo
  // escáner: los teléfonos de la puerta no tienen por qué escribir en el padrón
  // ni en la cartelera. En modo solo-local corre siempre (no hay a quién pisar).
  const reconcileEnabled = !scanMode && (cloudMode === false || (cloudMode === true && isOwner && hydrated.fighters && hydrated.matchups && hydrated.super4));
  useEffect(() => {
    if (!reconcileEnabled || !fighters.length) return;
    const { dedupedFighters, cleanedMatchups, cleanedSuper4, idMap, fightersChanged, matchupsChanged, super4Changed, removedFighters } = reconcileData(fighters, matchups, super4);
    // Local primero (optimista) y a la nube por TRANSACCIÓN: la limpieza se
    // vuelve a aplicar sobre el estado fresco del servidor, así no borra lo que
    // otro dispositivo acaba de registrar.
    if (fightersChanged) {
      setFighters(dedupedFighters); saveLocal("bm_fighters_v4", dedupedFighters);
      reconcileNodeTx("bm_fighters_v4", arr => dedupeFighters(arr, matchups, super4).fighters, merged => setFighters(normalizeFighters(merged)));
      console.info("Duplicados eliminados automáticamente: " + removedFighters + " peleador(es).");
    }
    if (matchupsChanged) {
      setMatchups(cleanedMatchups); saveLocal("bm_matchups_v3", cleanedMatchups);
      reconcileNodeTx("bm_matchups_v3", arr => cleanMatchups(arr, idMap), merged => setMatchups(merged));
    }
    if (super4Changed) {
      setSuper4(cleanedSuper4); saveLocal("bm_super4_v1", cleanedSuper4);
      reconcileNodeTx("bm_super4_v1", arr => remapSuper4(arr, idMap), merged => setSuper4(normalizeSuper4(merged)));
    }
  }, [fighters, matchups, super4, reconcileEnabled]);

  // ---- Auto-reparo de "fantasmas" ----
  // Una sola vez por sesión, al recibir el primer valor de peleadores desde la
  // nube, se lee la copia AUTORITATIVA y se quitan de este dispositivo los que
  // existen SOLO aquí (un guardado que falló y nunca llegó). Ese fantasma no
  // sale en la lista pero sí hace saltar el aviso de "ya registrado" al
  // intentar agregarlo.
  //
  // Seguridad: (a) corre UNA vez, tras la hidratación y ANTES de que el usuario
  // agregue nada; (b) NO hace nada si la nube devuelve nulo o vacío (podría ser
  // un estado transitorio — nunca se vacía la lista local por una lectura dudosa).
  const autoRepairDoneRef = useRef(false);
  useEffect(() => {
    if (autoRepairDoneRef.current) return;
    if (cloudMode !== true || !hydrated.fighters) return;
    autoRepairDoneRef.current = true;
    fetchCloudArray("bm_fighters_v4").then(cloud => {
      const { removedIds } = stripLocalGhosts(fighters, cloud);
      // Los PENDIENTES del outbox no son fantasmas: son escrituras aún no
      // confirmadas que el replay va a re-subir — jamás se eliminan aquí.
      const pendingIds = new Set(outboxList().map(x => x.id));
      const ghostIds = new Set(removedIds.filter(id => !pendingIds.has(id)));
      if (!ghostIds.size) return;
      setFighters(prev => normalizeFighters(prev.filter(f => !ghostIds.has(f.id))));
      const cur = load("bm_fighters_v4", []);
      saveLocal("bm_fighters_v4", cur.filter(f => f && !ghostIds.has(f.id)));
      console.info("Auto-reparo: se quitaron " + ghostIds.size + " registro(s) local(es) que no estaban en la nube.");
    });
  }, [cloudMode, hydrated.fighters]);

  // ---- Recuperación de altas pendientes ----
  // Re-sube los peleadores que quedaron sin confirmar — el caso típico: se
  // registró uno y la app se recargó con la escritura en vuelo (la transacción
  // muere con la página y la nube nunca lo recibió). upsertFighterTx fusiona
  // por id contra el servidor, así que repetirlo es inofensivo.
  const outboxReplayDoneRef = useRef(false);
  useEffect(() => {
    if (outboxReplayDoneRef.current) return;
    if (cloudMode !== true || !hydrated.fighters) return;
    outboxReplayDoneRef.current = true;
    const pending = outboxList();
    if (!pending.length) return;
    console.info("Recuperando " + pending.length + " registro(s) pendiente(s) de guardar en la nube…");
    const u = normalizeFighters(mergePending(load("bm_fighters_v4", []), pending));
    setFighters(u);
    saveLocal("bm_fighters_v4", u);
    pending.forEach(p => {
      const { _queuedAt, ...f } = p;
      alRecuperar?.(f);
      upsertFighterTx(f, u, merged => setFighters(normalizeFighters(merged)), alConfirmar, alFallar);
    });
  }, [cloudMode, hydrated.fighters]);

  // Cambia las fechas del evento en este dispositivo y en la nube. Normaliza
  // antes de guardar: lo que se comparte con el resto del equipo siempre son dos
  // fechas válidas. Solo el dueño puede escribir este nodo (regla de la base),
  // así que la app tampoco ofrece el editor al staff.
  function setEventDates(dates) {
    const norm = normalizeEventDates(dates);
    setEventDatesState(norm);
    save("bm_event_dates", norm);
    return norm;
  }

  // Cambia los organizadores de esta edición. Mismo trato que las fechas: solo
  // el dueño puede escribir el nodo (regla de la base), así que el diálogo no
  // se lo ofrece al staff. Se recorta al mismo largo que acepta el campo para
  // que un valor pegado a mano no desborde la cabecera ni la hoja impresa.
  function setEventOrg(txt) {
    const limpio = String(txt == null ? "" : txt).trim().slice(0, 60);
    setEventOrgState(limpio);
    save("bm_event_org", limpio);
    return limpio;
  }

  // Escribir en el Super 4 o en la cartelera antes de recibir su primer valor
  // de la nube pisaría lo que otro dispositivo ya armó.
  const super4Ready = cloudMode === false || (cloudMode === true && hydrated.fighters && hydrated.super4);
  const matchupsReady = cloudMode === false || (cloudMode === true && hydrated.fighters && hydrated.matchups);

  return {
    fighters, setFighters,
    matchups, setMatchups,
    super4, setSuper4,
    tickets, setTickets, ticketsEstado,
    eventLabel, setEventLabel,
    eventDates, setEventDates,
    eventOrg, setEventOrg,
    sync, authUser, cloudMode, isOwner,
    eventoId, eventoMeta, refrescarMeta,
    super4Ready, matchupsReady,
    conectarConConfig,
  };
}
