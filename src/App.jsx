import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { FB, OWNER_EMAIL, DEFAULT_FB_CONFIG, parseFbConfig, initFirebaseApp, initFirebase, startFirebaseSync } from "./lib/firebase.js";
import { load, save, loadFighters, upsertFighterTx, removeFighterTx, loadTicketsV4, migrateTicketsIfNeeded, watchTickets, clearTicketsCache, clearLocalEventData, backupEventToCloud, clearAllTicketsData, restoreTicketsFromBackup, fetchCloudArray, stripLocalGhosts, outboxList, mergePending } from "./lib/storage.js";
import { normalizeFighters } from "./constants.js";
import { normalizeSuper4 } from "./lib/super4.js";
import { downloadBytes } from "./lib/download.js";
import { reconcileData } from "./lib/dedup.js";
import FighterList from "./components/FighterList.jsx";
import FighterForm from "./components/FighterForm.jsx";
import MatchmakingView from "./components/MatchmakingView.jsx";
import LoginScreen from "./components/LoginScreen.jsx";

// Vistas pesadas cargadas bajo demanda (code-splitting): salen del bundle
// inicial de arranque. TicketsManager arrastra qrcode (y, al escanear, jsQR);
// Super4View es grande. La PWA precachea sus chunks para que funcionen offline.
const Super4View = lazy(() => import("./components/Super4View.jsx"));
const FightCardView = lazy(() => import("./components/FightCardView.jsx"));
const TicketsManager = lazy(() => import("./components/TicketsManager.jsx"));

// Las 6 pestañas de la app, con su ícono (path SVG de Heroicons). Una sola
// fuente para las dos navegaciones: la barra inferior (móvil) y el menú
// lateral de escritorio (≥1024px) — así nunca se desalinean entre sí.
const NAV_ITEMS = [
  { key: "list", label: "Peleadores", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { key: "register", label: "Agregar", d: "M12 4v16m8-8H4" },
  { key: "super4", label: "Super 4", d: "M8 21h8m-4-4v4m-6-9a6 6 0 0012 0V4H6v8zM6 6H3v2a4 4 0 004 4M18 6h3v2a4 4 0 01-4 4" },
  { key: "vs", label: "VS", d: "M13 10V3L4 14h7v7l9-11h-7z" },
  { key: "card", label: "Cartelera", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { key: "finance", label: "Entradas", d: "M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" },
];

// APP PRINCIPAL
// ============================================
export default function App() {
  const [fighters, setFighters] = useState([]);
  const [matchups, setMatchups] = useState([]);
  const [super4, setSuper4] = useState([]);
  const [ticketsNew, setTicketsNew] = useState([]);
  const urlTicketCode = useMemo(() => new URLSearchParams(location.search).get("ticket"), []);
  const urlTicketToken = useMemo(() => new URLSearchParams(location.search).get("t"), []);
  const [view, setView] = useState(() => urlTicketCode ? "finance" : "list");
  const [editF, setEditF] = useState(null);
  // Protección contra borrado accidental: al eliminar un peleador se guarda por
  // unos segundos para poder DESHACER (re-crearlo con su mismo id). Un borrado
  // se sincroniza a la nube, así que un toque errado ya no es irreversible.
  const [undoDelete, setUndoDelete] = useState(null);
  const undoTimerRef = useRef(null);
  // Confirmación de alta SIEMPRE visible: además del banner verde del
  // formulario, un toast fijo abajo confirma cada peleador agregado (pedido
  // del organizador: registrando de corrido, la confirmación no puede
  // pasar desapercibida).
  const [addedToast, setAddedToast] = useState(null);
  const addedToastTimerRef = useRef(null);
  // Dueño actual del toast de alta (id del último peleador agregado). El slot
  // es único: sin este guard, un rechazo tardío o la confirmación de un alta
  // ANTERIOR pisaría el aviso del alta más reciente (registrando de corrido,
  // el último registro debe mandar sobre el aviso).
  const addedToastOwnerRef = useRef(null);
  const [eventLabel, setEventLabel] = useState(() => load("bm_event_label", "La Velada — próxima fecha por definir"));
  const [sync, setSync] = useState(() => (localStorage.getItem("bm_fb_config") || !localStorage.getItem("bm_fb_disabled")) ? "connecting" : "off");
  const [menuOpen, setMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState(undefined);
  // Hidratación de la sincronización: null = aún no se decide el modo;
  // false = modo solo-local (sin nube); en modo nube, un objeto con qué
  // claves ya recibieron su primer valor desde Firebase en esta sesión.
  const [cloudMode, setCloudMode] = useState(null);
  const [hydrated, setHydrated] = useState({ fighters: false, matchups: false, super4: false });
  const isOwner = !!(authUser && authUser.email === OWNER_EMAIL);
  // Al cerrar sesión: borra los datos locales sensibles (un dispositivo perdido
  // no debe conservarlos legibles sin login) y recarga para partir de un estado
  // limpio en el próximo inicio (evita listeners de sync colgados tras re-login).
  async function logout() {
    // El outbox garantiza la entrega SOLO mientras sobreviva en este
    // dispositivo. Cerrar sesión lo borra (clearLocalEventData) — así que si
    // hay altas aún sin subir a la nube (típico sin conexión), avisamos antes
    // de que se pierdan en silencio. Sin este guard, el "✓ guardado" inmediato
    // podría mentir: se dio por guardado algo que este borrado destruiría.
    const pend = outboxList().length;
    if (pend && !confirm(`Tienes ${pend} registro(s) que TODAVÍA no se guardaron en la nube.\n\nSi cierras sesión ahora, se PERDERÁN.\n\nEspera a que el chip de arriba diga "Sincronizado" antes de cerrar sesión. Si dice "Conectando…", revisa tu internet; si dice "Error", revisa tus permisos.\n\n¿Cerrar sesión de todos modos?`)) return;
    clearLocalEventData();
    try { await signOut(FB.auth); } catch (e) { console.error("Error al cerrar sesión:", e); }
    location.reload();
  }
  // "Recargar desde la nube": arreglo de un clic para el usuario. Borra los
  // datos locales de este dispositivo y recarga, así la app vuelve a bajar la
  // copia limpia de la nube (la fuente compartida). Sirve cuando un guardado
  // falló y quedó un registro "fantasma" solo aquí (aparece al registrar como
  // "ya existe" pero no sale en la lista). No toca la nube ni a otros
  // dispositivos: solo reemplaza lo local por lo remoto.
  function reloadFromCloud() {
    if (cloudMode !== true || !FB.ready) { alert("No hay conexión con la nube en este momento.\n\nRevisa tu internet e intenta de nuevo."); return; }
    // Igual que en logout: recargar desde la nube BORRA lo local (incluido el
    // outbox), así que unas altas sin subir se perderían. Avisamos primero.
    const pend = outboxList().length;
    if (pend && !confirm(`Tienes ${pend} registro(s) que TODAVÍA no se guardaron en la nube.\n\n"Recargar desde la nube" reemplaza lo de este dispositivo con la copia de la nube, así que esos ${pend} registro(s) se PERDERÍAN.\n\nEspera a que el chip de arriba diga "Sincronizado" (si dice "Error", revisa tus permisos) y luego recarga.\n\n¿Recargar de todos modos?`)) return;
    if (!confirm("¿Recargar los datos desde la nube?\n\nSe reemplazan los datos de ESTE dispositivo con la copia compartida en la nube. Útil si ves algo que no cuadra (por ejemplo, un peleador que aparece al registrar pero no en la lista).\n\nNo afecta la nube ni a otros dispositivos.")) return;
    clearLocalEventData();
    location.reload();
  }
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
    // Las boletas (v4) ya no vienen por acá: se sincronizan aparte por nodo
    // individual, ver migrateTicketsIfNeeded/watchTickets más abajo.
  }

  // Deja de escuchar el nodo viejo de bm_tickets_v4 vía el sync genérico y,
  // en su lugar, migra (si hace falta) y escucha los nodos individuales de
  // boletas para que varios dispositivos vendiendo a la vez no se pisen.
  function startTicketsSync() {
    migrateTicketsIfNeeded().then(() => watchTickets(setTicketsNew));
  }

  function toggleSync() {
    const raw = localStorage.getItem("bm_fb_config");
    const disabled = localStorage.getItem("bm_fb_disabled");
    if (raw || !disabled) {
      if (confirm("¿Desconectar la sincronización en la nube en este dispositivo?\n\nLos datos locales se conservan; solo dejan de sincronizarse.")) {
        localStorage.removeItem("bm_fb_config");
        localStorage.setItem("bm_fb_disabled", "1");
        location.reload();
      }
      return;
    }
    localStorage.removeItem("bm_fb_disabled");
    location.reload();
  }

  function pasteCustomFbConfig() {
    const t = prompt("Pega aquí tu firebaseConfig (el bloque { apiKey: ..., databaseURL: ... } de la consola de Firebase).\n\nSolo úsalo si quieres conectar este dispositivo a otro proyecto distinto al de por defecto.");
    if (!t) return;
    const cfg = parseFbConfig(t);
    if (!cfg) { alert("No pude leer la configuración. Copia el bloque completo entre llaves { }."); return; }
    if (initFirebase(cfg, setSync, applyRemote, keyReady)) {
      localStorage.setItem("bm_fb_config", JSON.stringify(cfg));
      localStorage.removeItem("bm_fb_disabled");
      startTicketsSync();
    }
  }

  useEffect(() => {
    setFighters(normalizeFighters(loadFighters()));
    setMatchups(load("bm_matchups_v3", []));
    setSuper4(normalizeSuper4(load("bm_super4_v1", [])));
    setTicketsNew(loadTicketsV4());
    const raw = localStorage.getItem("bm_fb_config");
    const disabled = localStorage.getItem("bm_fb_disabled");
    const cfgToUse = raw ? JSON.parse(raw) : (disabled ? null : DEFAULT_FB_CONFIG);
    if (cfgToUse && initFirebaseApp(cfgToUse)) {
      setCloudMode(true);
      try {
        onAuthStateChanged(FB.auth, user => {
          setAuthUser(user);
          if (user) { startFirebaseSync(setSync, applyRemote, keyReady); startTicketsSync(); }
          else setSync("off");
        });
      } catch (e) { setAuthUser(null); setSync("error"); }
    } else {
      setCloudMode(false);
      setAuthUser(null);
    }
  }, []);

  // Reconciliación automática: detecta y elimina peleadores duplicados
  // (mismo nombre + sexo + peso, registrados dos veces) y peleas inválidas
  // o repetidas (la misma persona a ambos lados, parejas duplicadas). Es
  // idempotente: si ya está todo limpio no escribe nada (no genera bucle).
  //
  // SOLO corre cuando el estado ya refleja la nube: en modo nube, después
  // de que peleadores Y peleas recibieron su primer valor de Firebase en
  // esta sesión (las claves sincronizan por canales separados sin orden
  // garantizado — reconciliar sobre un estado parcial podría eliminar al
  // registro equivocado y propagar el error a todos los dispositivos); en
  // modo solo-local, corre de inmediato porque lo local es toda la verdad.
  const reconcileEnabled = cloudMode === false || (cloudMode === true && hydrated.fighters && hydrated.matchups && hydrated.super4);
  useEffect(() => {
    if (!reconcileEnabled || !fighters.length) return;
    const { dedupedFighters, cleanedMatchups, cleanedSuper4, fightersChanged, matchupsChanged, super4Changed, removedFighters } = reconcileData(fighters, matchups, super4);
    if (fightersChanged) { setFighters(dedupedFighters); save("bm_fighters_v4", dedupedFighters); console.info("Duplicados eliminados automáticamente: " + removedFighters + " peleador(es)."); }
    if (matchupsChanged) { setMatchups(cleanedMatchups); save("bm_matchups_v3", cleanedMatchups); }
    if (super4Changed) { setSuper4(cleanedSuper4); save("bm_super4_v1", cleanedSuper4); }
  }, [fighters, matchups, super4, reconcileEnabled]);

  // AUTO-REPARO de "fantasmas": una sola vez por sesión, al conectar y recibir
  // el primer valor de peleadores desde la nube, se lee la copia AUTORITATIVA
  // de la nube y se quitan de este dispositivo los peleadores que existen SOLO
  // aquí (un guardado que falló y nunca llegó a la nube). Ese fantasma no sale
  // en la lista sincronizada pero sí hace saltar el aviso de "ya registrado" al
  // intentar agregarlo — justo el síntoma reportado.
  //
  // Seguridad: (a) corre UNA vez, tras la hidratación y ANTES de que el usuario
  // agregue nada, y solo quita los ids detectados en ese instante (un alta
  // posterior que aún se sincroniza NO se toca); (b) NO hace nada si la nube
  // devuelve nulo o vacío (podría ser un estado transitorio — nunca se vacía la
  // lista local por una lectura dudosa).
  const autoRepairDoneRef = useRef(false);
  useEffect(() => {
    if (autoRepairDoneRef.current) return;
    if (cloudMode !== true || !hydrated.fighters) return;
    autoRepairDoneRef.current = true;
    fetchCloudArray("bm_fighters_v4").then(cloud => {
      // stripLocalGhosts NO quita nada si la nube es nula o vacía (seguridad).
      const { removedIds } = stripLocalGhosts(fighters, cloud);
      // Los PENDIENTES del outbox no son fantasmas: son escrituras aún no
      // confirmadas que el replay va a re-subir — jamás se eliminan aquí.
      const pendingIds = new Set(outboxList().map(x => x.id));
      const ghostIds = new Set(removedIds.filter(id => !pendingIds.has(id)));
      if (!ghostIds.size) return;
      setFighters(prev => normalizeFighters(prev.filter(f => !ghostIds.has(f.id))));
      const cur = load("bm_fighters_v4", []);
      localStorage.setItem("bm_fighters_v4", JSON.stringify(cur.filter(f => f && !ghostIds.has(f.id))));
      console.info("Auto-reparo: se quitaron " + ghostIds.size + " registro(s) local(es) que no estaban en la nube.");
    });
  }, [cloudMode, hydrated.fighters]);

  // REPLAY del outbox: al conectar (tras recibir el primer valor de la nube),
  // re-sube los registros que quedaron PENDIENTES de confirmación — el caso
  // típico: se registró un peleador y la app se recargó con la escritura en
  // vuelo (la transacción muere con la página y la nube nunca lo recibió).
  // upsertFighterTx fusiona por id contra el servidor, así el replay es
  // idempotente: si el registro sí alcanzó a llegar, solo lo re-confirma.
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
    localStorage.setItem("bm_fighters_v4", JSON.stringify(u));
    pending.forEach(p => {
      const { _queuedAt, ...f } = p;
      // El último pendiente queda como dueño del toast: al confirmarse se ve
      // el "✓ guardado" de la recuperación (los demás confirman en silencio).
      addedToastOwnerRef.current = f.id;
      upsertFighterTx(f, u, merged => setFighters(normalizeFighters(merged)), confirmSaved, reportAddError);
    });
  }, [cloudMode, hydrated.fighters]);

  // Escribir en las llaves del Super 4 antes de recibir su primer valor de
  // la nube podría pisar llaves ya armadas en otro dispositivo (misma
  // carrera de sincronización que la reconciliación de arriba).
  const super4Ready = cloudMode === false || (cloudMode === true && hydrated.fighters && hydrated.super4);
  // Mismo guard para la cartelera (VS): escribir bm_matchups_v3 antes de recibir
  // su primer valor de la nube pisaría peleas armadas en otro dispositivo.
  const matchupsReady = cloudMode === false || (cloudMode === true && hydrated.fighters && hydrated.matchups);

  // Al agregar un peleador nuevo la vista se queda en "Agregar" para seguir
  // registrando atletas de corrido (la confirmación la muestra el propio
  // formulario); solo al editar uno existente se vuelve a la lista.
  // Alta/edición y baja escriben de forma transaccional (fusión por id contra
  // el servidor) para no pisar peleadores que otro dispositivo registró a la
  // vez; onMerged aplica la lista autoritativa ya fusionada.
  // Confirmación verde para la RECUPERACIÓN del outbox: cuando al reabrir la app
  // se re-suben los registros que habían quedado pendientes, este callback
  // muestra "✓ guardado" del último recuperado al confirmarlo la nube (el alta
  // normal ya confirma al instante, así que NO usa esto). Solo el DUEÑO del
  // toast lo actualiza.
  function confirmSaved(f) {
    if (addedToastOwnerRef.current !== f.id) return;
    clearTimeout(addedToastTimerRef.current);
    setAddedToast({ name: f.fullName, phase: "saved" });
    addedToastTimerRef.current = setTimeout(() => setAddedToast(null), 6000);
  }
  // Escritura RECHAZADA por la nube (permiso, token vencido, sin conexión…).
  // storage liga el PELEADOR al callback (no el error), así que `f` es el
  // peleador y el guard de "dueño" funciona. El toast pasa a "error" HONESTO en
  // vez de quedarse en "guardando" y saltar a un "pendiente" que promete
  // falsamente "se completará solo". Corta el timer de los 20s para que ese
  // pendiente engañoso nunca aparezca. El registro sigue en el outbox: se
  // reintenta al reabrir la app.
  function reportAddError(f, err) {
    if (err) console.error("Escritura de peleador rechazada por la nube:", err);
    if (addedToastOwnerRef.current !== f.id) return;
    clearTimeout(addedToastTimerRef.current);
    setAddedToast({ name: f.fullName, phase: "error" });
  }
  function addFighter(f) {
    let u;
    if (editF) { u = fighters.map(x => x.id === f.id ? f : x); setEditF(null); setView("list"); }
    else {
      u = [...fighters, f];
      addedToastOwnerRef.current = f.id;
      clearTimeout(addedToastTimerRef.current);
      // Confirmación INMEDIATA "✓ guardado": ya no se espera a la nube. El
      // outbox GARANTIZA la entrega —el registro queda en localStorage y en la
      // cola, y se re-sincroniza aunque se recargue la app o se esté sin
      // conexión (por eso el fantasma ya no puede pasar)—, así que dar el visto
      // bueno al instante es honesto y hace el registro fluido. Esa garantía se
      // PROTEGE: logout y "Recargar desde la nube" —los únicos que borran el
      // outbox— avisan si hay pendientes, para que un "guardado" nunca se
      // destruya en silencio. El estado de conexión lo muestra el chip. Si la
      // nube RECHAZA de verdad (permiso/token/dato inválido), reportAddError lo
      // pasa a rojo. Texto "guardado" (no "…en la base de datos"): sin conexión
      // el registro está guardado y en cola, aún no confirmado en la nube.
      setAddedToast({ name: f.fullName, phase: "saved" });
      addedToastTimerRef.current = setTimeout(() => setAddedToast(null), 6000);
    }
    // onCommitted va vacío en el alta: el verde ya se mostró (no hace falta
    // esperar el commit para confirmar, y así una confirmación lenta no re-abre
    // el aviso ya cerrado). onError sí, para pasar a rojo ante un rechazo real.
    setFighters(u); upsertFighterTx(f, u, merged => setFighters(normalizeFighters(merged)), undefined, editF ? undefined : reportAddError);
  }
  function editFighter(f) { setEditF(f); setView("register"); window.scrollTo(0, 0); }
  function delFighter(id) {
    const victim = fighters.find(f => f.id === id);
    const u = fighters.filter(f => f.id !== id); setFighters(u); removeFighterTx(id, u, merged => setFighters(normalizeFighters(merged)));
    // Ofrece DESHACER durante unos segundos (guarda el registro borrado).
    if (victim) { clearTimeout(undoTimerRef.current); setUndoDelete(victim); undoTimerRef.current = setTimeout(() => setUndoDelete(null), 8000); }
  }
  // Re-crea el peleador recién borrado con su MISMO id (transacción por id, no
  // pisa a nadie). Cierra el aviso de deshacer.
  function undoLastDelete() {
    const f = undoDelete; if (!f) return;
    clearTimeout(undoTimerRef.current); setUndoDelete(null);
    // El restaurado pasa a ser el dueño del toast y confirma al instante (mismo
    // criterio que el alta: el outbox garantiza el re-guardado).
    addedToastOwnerRef.current = f.id;
    setAddedToast({ name: f.fullName, phase: "saved" });
    clearTimeout(addedToastTimerRef.current);
    addedToastTimerRef.current = setTimeout(() => setAddedToast(null), 6000);
    const u = [...fighters, f]; setFighters(u); upsertFighterTx(f, u, merged => setFighters(normalizeFighters(merged)), undefined, reportAddError);
  }
  function cancel() { setEditF(null); setView("list"); }

  // Incluye ticketsNew (boletas reales v4) además de fighters/matchups —
  // antes de la Fase 5 el export manual no incluía las boletas reales, con
  // lo cual no servía como respaldo de ellas.
  // El respaldo del evento en JSON. Usa downloadBytes (el mismo ayudante que
  // las planillas de Excel): antes revocaba la URL justo después del click,
  // que es la causa conocida de que en Safari el archivo se descargue VACÍO.
  function handleExport() {
    const d = { fighters, matchups, super4, ticketsNew };
    downloadBytes(JSON.stringify(d, null, 2), "evento_" + new Date().toISOString().split("T")[0] + ".json", "application/json");
  }
  function handleImport() { const i = document.createElement("input"); i.type = "file"; i.accept = ".json"; i.onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const d = JSON.parse(ev.target.result); if (d.fighters) { const nf = normalizeFighters(d.fighters); setFighters(nf); save("bm_fighters_v4", nf); } if (d.matchups) { setMatchups(d.matchups); save("bm_matchups_v3", d.matchups); } if (Array.isArray(d.super4)) { const ns = normalizeSuper4(d.super4); setSuper4(ns); save("bm_super4_v1", ns); } restoreTicketsFromImport(d.ticketsNew); } catch { alert("JSON inválido"); } }; r.readAsText(f); }; i.click(); }
  // Las boletas viven en nodos individuales en la nube (no en el blob), así que
  // se restauran aparte: requieren conexión y se agregan por id a las
  // existentes; watchTickets refresca la UI al confirmarse la escritura.
  function restoreTicketsFromImport(ticketsNew) {
    if (!Array.isArray(ticketsNew) || !ticketsNew.length) return;
    if (!FB.ready) { alert("El respaldo trae " + ticketsNew.length + " boleta(s), pero restaurarlas requiere conexión a internet. Vuelve a importar el archivo con conexión."); return; }
    if (!confirm("¿Restaurar también " + ticketsNew.length + " boleta(s) del respaldo? Se agregan (por número) a las que ya existan.")) return;
    restoreTicketsFromBackup(ticketsNew)
      .then(n => alert("Se restauraron " + n + " boleta(s) del respaldo."))
      .catch(err => { console.error("No se pudieron restaurar las boletas:", err); alert("No se pudieron restaurar las boletas del respaldo.\n\nError: " + err.message); });
  }

  // "Reiniciar evento" (Fase 5, antes "Restaurar"): ya no repuebla atletas
  // de demostración (se quitaron del código en la Fase 2) — el evento queda
  // vacío para cargar peleadores reales desde cero. Antes de borrar nada:
  // (a) descarga un respaldo JSON local (incluye boletas v4 reales) y
  // (b) guarda una copia completa en sangre_nueva_backups/ en Firebase,
  // protegida por reglas para que solo el dueño la pueda leer (Fase 2).
  // Requiere doble confirmación: un confirm() explicando qué se borra, y
  // escribir la palabra BORRAR en un prompt.
  async function resetEvent() {
    const detalle = "¿Reiniciar el evento?\n\nSe borrarán TODOS los peleadores, peleas y boletas (incluidas las entradas ya vendidas).\n\nAntes de borrar se descarga un respaldo y se guarda una copia en la nube. Esta acción no se puede deshacer desde la app.";
    if (!confirm(detalle)) return;
    const palabra = prompt("Para confirmar, escribe la palabra BORRAR (en mayúsculas):");
    if (palabra === null) return;
    if (palabra !== "BORRAR") { alert("No escribiste BORRAR exactamente. Se canceló el reinicio — no se borró nada."); return; }

    handleExport();

    if (FB.ready) {
      try {
        await backupEventToCloud({ fighters, matchups, super4, ticketsNew, eventLabel, backedUpAt: new Date().toISOString() });
      } catch (e) {
        alert("No se pudo guardar el respaldo en la nube. El reinicio se canceló para no perder datos.\n\nError: " + e.message);
        return;
      }
    }

    setFighters([]); save("bm_fighters_v4", []);
    setMatchups([]); save("bm_matchups_v3", []);
    setSuper4([]); save("bm_super4_v1", []);
    setTicketsNew([]); clearTicketsCache();
    try { await clearAllTicketsData(); } catch (e) { console.error("No se pudieron borrar las boletas en Firebase:", e); }

    alert("Evento reiniciado. El respaldo se descargó" + (FB.ready ? " y también quedó guardado en la nube." : "."));
  }

  const nav = (active) => "flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors " + (active ? "text-boxing-goldFight" : "text-boxing-muted active:text-gray-300");
  // Cambio de pestaña compartido por las dos navegaciones (móvil y sidebar):
  // al ir a la lista o a "Agregar" se descarta la edición en curso, igual
  // que hacían los botones de la barra inferior.
  function go(k) { if (k === "list" || k === "register") setEditF(null); setView(k); }
  // Editar el nombre/fecha del evento (la barra inferior en móvil y el pie
  // del sidebar en escritorio usan el mismo prompt).
  function editEventLabel() { const cur = load("bm_event_label", "La Velada — próxima fecha por definir"); const v = prompt("Nombre y fecha del evento:", cur); if (v !== null && v.trim()) { save("bm_event_label", v.trim()); setEventLabel(v.trim()); } }
  // Acciones del menú del dueño (⋮), compartidas por el header móvil y el
  // pie del sidebar de escritorio.
  const menuActions = [
    { label: "Recargar desde la nube", danger: false, run: reloadFromCloud },
    { label: "Importar", danger: false, run: handleImport },
    { label: "Exportar", danger: false, run: handleExport },
    { label: "Firebase manual", danger: false, run: pasteCustomFbConfig },
    { label: "Reiniciar evento", danger: true, run: resetEvent },
  ];
  const menuItemCls = (danger) => "block w-full text-left text-[11px] text-gray-400 hover:bg-white/5 px-3 py-1.5 transition-colors " + (danger ? "hover:text-red-400" : "hover:text-boxing-goldFight");
  // Botón de sincronización: píldora con punto de estado vivo (verde pulsa
  // lento = sincronizado; naranja pulsa rápido = conectando; la urgencia se
  // comunica con ritmo, no con más resplandor). Mismo look en móvil y escritorio.
  const syncBtnCls = "flex items-center justify-center gap-1.5 text-[10px] px-3 py-1 rounded-full border font-semibold tracking-[0.18em] uppercase transition-colors " + (sync === "on" ? "text-green-400/80 border-green-500/25" : sync === "connecting" ? "text-yellow-400/90 border-yellow-500/30" : sync === "error" ? "text-red-400 border-red-500/40" : "text-gray-500 border-gray-600/60 hover:text-boxing-goldFight hover:border-boxing-goldDim");
  const syncDot = <span aria-hidden="true" className={"punto-vivo" + (sync === "connecting" ? " alerta" : sync === "on" ? "" : " apagado")} style={sync === "error" ? { background: "#DC2626", animation: "none" } : undefined} />;
  const syncLabel = <>{syncDot}{sync === "on" ? "Sincronizado" : sync === "connecting" ? "Conectando…" : sync === "error" ? "Error" : "Nube"}</>;

  if (authUser === undefined) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b5f6e", fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.1em" }}>Cargando…</div>;
  if (authUser === null) return <LoginScreen />;

  return (
    // Móvil (por defecto): columna centrada de 512px (max-w-lg), idéntica a
    // siempre. Escritorio (lg, ≥1024px): la app ocupa todo el ancho y se
    // reparte en fila — sidebar fijo a la izquierda + contenido fluido.
    <div className="app-root max-w-[512px] mx-auto flex flex-col overflow-hidden lg:max-w-none lg:flex-row">
      {/* ===== Sidebar de escritorio (≥1024px) — no existe en móvil =====
          Rediseño: cristal ahumado (.side-frost, con filo de oro en el borde
          derecho) y el ítem activo como ÚNICO glow del chrome (.nav-lado.on). */}
      <aside className="hidden lg:flex flex-col w-64 xl:w-72 flex-shrink-0 relative side-frost">
        <div className="flex flex-col items-center pt-7 pb-5 gap-1" style={{ position: "relative" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "0.35em", color: "rgba(138,132,148,0.85)", textTransform: "uppercase" }}>Azuaje Team & HH Arias</div>
          <img src="/assets/logo-sangre-nueva.png" alt="Sangre Nueva" style={{ height: "72px", width: "auto", objectFit: "contain", filter: "drop-shadow(0 10px 28px rgba(155,26,42,0.4))", marginTop: "4px" }} />
          <div className="text-center leading-none" style={{ marginTop: "2px" }}>
            <div className="marca-oro" style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: "26px", letterSpacing: "0.12em", lineHeight: 1 }}>SANGRE NUEVA</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "14px", color: "rgba(200,160,74,0.9)", letterSpacing: "0.1em", marginTop: "3px" }}>La Velada</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
            <div style={{ width: "40px", height: "1px", background: "linear-gradient(90deg,transparent,rgba(200,160,74,0.4))" }} />
            <div style={{ width: "5px", height: "5px", background: "#c8a04a", transform: "rotate(45deg)", borderRadius: "1px", boxShadow: "0 0 8px rgba(229,199,107,0.6)" }} />
            <div style={{ width: "40px", height: "1px", background: "linear-gradient(90deg,rgba(200,160,74,0.4),transparent)" }} />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map(it => (
            <button key={it.key} onClick={() => go(it.key)} className={"nav-lado" + (view === it.key ? " on" : "")}>
              <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={it.d} /></svg>
              <span>{it.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex-shrink-0 p-3 space-y-2" style={{ position: "relative" }}>
          <button onClick={editEventLabel} title="Tocar para editar" className="chip-fantasma w-full">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="truncate">{eventLabel}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <button onClick={toggleSync} className={"flex-1 text-center " + syncBtnCls}>{syncLabel}</button>
            {isOwner ? <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="text-gray-500 hover:text-boxing-goldFight hover:bg-white/5 w-6 h-6 flex items-center justify-center transition-colors">⋮</button>
              {menuOpen && <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 bottom-8 z-20 bg-boxing-panel border border-boxing-line py-1 min-w-[130px] shadow-lg rounded-xl overflow-hidden">
                  {menuActions.map(a => <button key={a.label} onClick={() => { setMenuOpen(false); a.run(); }} className={menuItemCls(a.danger)}>{a.label}</button>)}
                  <div className="border-t border-boxing-line my-1" />
                  <button onClick={() => { setMenuOpen(false); logout(); }} className={menuItemCls(true)}>Cerrar sesión</button>
                </div>
              </>}
            </div> :
              <button onClick={logout} className="text-[10px] text-gray-500 hover:text-red-400 px-1.5 py-0.5 tracking-widest uppercase transition-colors">Salir</button>}
          </div>
        </div>
      </aside>

      {/* ===== Header móvil (se oculta en escritorio: su contenido vive en el sidebar) ===== */}
      <header className="lg:hidden" style={{ flexShrink: 0, borderBottom: "1px solid #2a1f2e", zIndex: 10, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-40px", left: "50%", transform: "translateX(-50%)", width: "320px", height: "160px", background: "radial-gradient(ellipse, rgba(155,26,42,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="flex justify-end px-3 pt-1.5 pb-0" style={{ position: "relative" }}>
          <div className="flex gap-1 items-center">
            <button onClick={toggleSync} className={syncBtnCls}>
              {syncLabel}
            </button>
            {isOwner ? <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="text-gray-500 hover:text-boxing-goldFight hover:bg-white/5 w-6 h-6 flex items-center justify-center transition-colors">⋮</button>
              {menuOpen && <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-7 z-20 bg-boxing-panel border border-boxing-line py-1 min-w-[110px] shadow-lg rounded-xl overflow-hidden">
                  {menuActions.map(a => <button key={a.label} onClick={() => { setMenuOpen(false); a.run(); }} className={menuItemCls(a.danger)}>{a.label}</button>)}
                  <div className="border-t border-boxing-line my-1" />
                  <button onClick={() => { setMenuOpen(false); logout(); }} className={menuItemCls(true)}>Cerrar sesión</button>
                </div>
              </>}
            </div> :
              <button onClick={logout} className="text-[10px] text-gray-500 hover:text-red-400 px-1.5 py-0.5 tracking-widest uppercase transition-colors">Salir</button>}
          </div>
        </div>
        {/* Bloque de marca compacto: en un teléfono la cabecera es chrome FIJO
            (nunca hace scroll), así que cada píxel se lo quita a la lista. Se
            conserva la jerarquía completa —sello, escudo, oro, itálica y orla—
            en escala de teléfono. El sidebar de escritorio no se toca. */}
        <div className="flex flex-col items-center pb-2.5 pt-1 gap-0.5" style={{ position: "relative" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "9.5px", fontWeight: 600, letterSpacing: "0.36em", color: "rgba(138,132,148,0.85)", textTransform: "uppercase" }}>Azuaje Team & HH Arias</div>
          <img src="/assets/logo-sangre-nueva.png" alt="Sangre Nueva" style={{ height: "58px", width: "auto", objectFit: "contain", filter: "drop-shadow(0 8px 20px rgba(155,26,42,0.4))", marginTop: "2px" }} />
          <div className="text-center leading-none" style={{ marginTop: "1px" }}>
            <div className="marca-oro" style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: "24px", letterSpacing: "0.12em", lineHeight: 1 }}>SANGRE NUEVA</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "13px", color: "rgba(200,160,74,0.9)", letterSpacing: "0.1em", marginTop: "2px" }}>La Velada</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "5px" }}>
            <div style={{ width: "38px", height: "1px", background: "linear-gradient(90deg,transparent,rgba(200,160,74,0.4))" }} />
            <div style={{ width: "4px", height: "4px", background: "#c8a04a", transform: "rotate(45deg)", borderRadius: "1px", boxShadow: "0 0 8px rgba(229,199,107,0.6)" }} />
            <div style={{ width: "38px", height: "1px", background: "linear-gradient(90deg,rgba(200,160,74,0.4),transparent)" }} />
          </div>
        </div>
      </header>

      {/* En móvil el padding y el scroll son los mismos de siempre (16px, 80px
          abajo para la barra de navegación). En escritorio se amplía el
          respiro y el contenido se topa en un ancho cómodo (max-w-6xl). */}
      <main className="flex-1 min-w-0 overflow-y-auto px-4 pt-4 pb-20 lg:px-6 lg:pt-8 lg:pb-12 xl:px-10" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="lg:max-w-6xl lg:mx-auto">
          <Suspense fallback={<div style={{ padding: "40px 0", textAlign: "center", color: "#6b5f6e", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.1em" }}>Cargando…</div>}>
            {view === "list" && <FighterList fighters={fighters} matchups={matchups} onEdit={editFighter} onDelete={delFighter} />}
            {view === "register" && <FighterForm onSubmit={addFighter} editingFighter={editF} existingFighters={fighters} onCancel={editF ? cancel : undefined} />}
            {view === "super4" && <Super4View fighters={fighters} super4={super4} setSuper4={setSuper4} ready={super4Ready} />}
            {view === "vs" && <MatchmakingView fighters={fighters} matchups={matchups} setMatchups={setMatchups} super4={super4} ready={matchupsReady} super4Ready={super4Ready} />}
            {view === "card" && <FightCardView matchups={matchups} fighters={fighters} super4={super4} />}
            {view === "finance" && <TicketsManager tickets={ticketsNew} setTickets={setTicketsNew} initialTicketCode={urlTicketCode} initialTicketToken={urlTicketToken} />}
          </Suspense>
        </div>
      </main>

      {/* Event Dates Bar (editable: tocar para cambiar) — solo móvil; en
          escritorio la fecha vive en el pie del sidebar. Mismos estilos de
          siempre, ahora como clases para poder ocultarla con lg:hidden. */}
      <div onClick={editEventLabel} className="flex-shrink-0 flex justify-center items-center gap-2 py-[5px] border-t border-boxing-line bg-boxing-panel cursor-pointer lg:hidden">
        <svg className="w-3 h-3 text-boxing-goldFight" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <span className="text-[10px] text-boxing-goldFight font-bold tracking-wide">{eventLabel}</span>
        <span className="text-[9px] text-gray-600">(tocar para editar)</span>
      </div>

      {/* Barra de navegación inferior — solo móvil; en escritorio la
          navegación vive en el sidebar. Mismos botones (NAV_ITEMS). */}
      <nav className="nav-safe lg:hidden" style={{ flexShrink: 0, background: "#080608", borderTop: "1px solid #2a1f2e" }}>
        <div className="max-w-lg mx-auto flex">
          {NAV_ITEMS.map(it => (
            <button key={it.key} onClick={() => go(it.key)} className={nav(view === it.key)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={it.d} /></svg>
              <span className="text-[10px]">{it.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Toasts fijos (abajo al centro), visibles en cualquier vista y a
          cualquier altura del scroll. Se apilan si coinciden:
          — alta (addedToast): ✓ verde "guardado" al instante (el outbox
            garantiza la entrega) / ⚠️ rojo solo si la nube RECHAZA de verdad;
          — rojo con 🗑️: DESHACER un borrado (un toque errado en la papelera se
            sincroniza a la nube; sin esto sería irreversible). */}
      {(addedToast || undoDelete) && <div className="fixed left-1/2 -translate-x-1/2 z-50 bottom-20 lg:bottom-6 w-[calc(100%-32px)] max-w-md space-y-2">
        {addedToast && <div className={"flex items-center gap-3 bg-boxing-panel shadow-lg px-4 py-3 fade-in border rounded-2xl " + (addedToast.phase === "error" ? "border-red-500/60" : "border-green-500/60")} style={{ boxShadow: addedToast.phase === "error" ? "0 0 24px rgba(220,38,38,0.25)" : "0 0 24px rgba(34,197,94,0.2)" }}>
          <span className={"text-lg leading-none " + (addedToast.phase === "error" ? "text-red-400" : "text-green-400")}>{addedToast.phase === "error" ? "⚠️" : "✓"}</span>
          <span className={"text-sm font-semibold flex-1 min-w-0 " + (addedToast.phase === "error" ? "text-red-300" : "text-green-400")}>
            {addedToast.phase === "error"
              ? <>No se pudo guardar a <b>{addedToast.name}</b> en la nube — revisa tu conexión o permisos. Quedó en cola y se reintentará al reabrir la app.</>
              : <><b>{addedToast.name}</b> guardado</>}
          </span>
          <button onClick={() => { clearTimeout(addedToastTimerRef.current); setAddedToast(null); }} title="Cerrar" className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-boxing-muted hover:text-boxing-cream transition-colors">✕</button>
        </div>}
        {undoDelete && <div className="flex items-center gap-3 bg-boxing-panel border border-red-500/50 shadow-lg px-4 py-3 fade-in rounded-2xl" style={{ boxShadow: "0 0 24px rgba(220,38,38,0.25)" }}>
          <span className="text-red-400 text-lg leading-none">🗑️</span>
          <span className="text-boxing-cream text-sm flex-1 min-w-0 truncate">Eliminaste a <b className="text-boxing-cream">{undoDelete.fullName}</b></span>
          <button onClick={undoLastDelete} className="flex-shrink-0 px-3 py-1.5 rounded-full bg-boxing-crimson hover:bg-boxing-crimsonLight text-boxing-cream text-xs font-bold tracking-widest uppercase transition-colors">Deshacer</button>
          <button onClick={() => { clearTimeout(undoTimerRef.current); setUndoDelete(null); }} title="Cerrar" className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-boxing-muted hover:text-boxing-cream transition-colors">✕</button>
        </div>}
      </div>}
    </div>
  );
}
