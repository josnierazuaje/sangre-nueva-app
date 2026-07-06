import { useState, useEffect, useMemo } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { FB, OWNER_EMAIL, DEFAULT_FB_CONFIG, parseFbConfig, initFirebaseApp, initFirebase, startFirebaseSync } from "./lib/firebase.js";
import { load, save, loadFighters, loadTicketsV4, migrateTicketsIfNeeded, watchTickets } from "./lib/storage.js";
import FighterList from "./components/FighterList.jsx";
import FighterForm from "./components/FighterForm.jsx";
import MatchmakingView from "./components/MatchmakingView.jsx";
import FightCardView from "./components/FightCardView.jsx";
import TicketsManager from "./components/TicketsManager.jsx";
import LoginScreen from "./components/LoginScreen.jsx";

// APP PRINCIPAL
// ============================================
export default function App() {
  const [fighters, setFighters] = useState([]);
  const [matchups, setMatchups] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketsNew, setTicketsNew] = useState([]);
  const urlTicketCode = useMemo(() => new URLSearchParams(location.search).get("ticket"), []);
  const [view, setView] = useState(() => urlTicketCode ? "finance" : "list");
  const [editF, setEditF] = useState(null);
  const [eventLabel, setEventLabel] = useState(() => load("bm_event_label", "La Velada — próxima fecha por definir"));
  const [sync, setSync] = useState(() => (localStorage.getItem("bm_fb_config") || !localStorage.getItem("bm_fb_disabled")) ? "connecting" : "off");
  const [menuOpen, setMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState(undefined);
  const isOwner = !!(authUser && authUser.email === OWNER_EMAIL);
  function logout() { signOut(FB.auth); }

  function applyRemote(k, val) {
    if (k === "bm_fighters_v4") setFighters(val);
    else if (k === "bm_matchups_v3") setMatchups(val);
    else if (k === "bm_expenses_v3") setExpenses(val);
    else if (k === "bm_tickets_v3") setTickets(val);
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
    if (initFirebase(cfg, setSync, applyRemote)) {
      localStorage.setItem("bm_fb_config", JSON.stringify(cfg));
      localStorage.removeItem("bm_fb_disabled");
      startTicketsSync();
    }
  }

  useEffect(() => {
    setFighters(loadFighters());
    setMatchups(load("bm_matchups_v3", []));
    setExpenses(load("bm_expenses_v3", []));
    setTickets(load("bm_tickets_v3", []));
    setTicketsNew(loadTicketsV4());
    const raw = localStorage.getItem("bm_fb_config");
    const disabled = localStorage.getItem("bm_fb_disabled");
    const cfgToUse = raw ? JSON.parse(raw) : (disabled ? null : DEFAULT_FB_CONFIG);
    if (cfgToUse && initFirebaseApp(cfgToUse)) {
      try {
        onAuthStateChanged(FB.auth, user => {
          setAuthUser(user);
          if (user) { startFirebaseSync(setSync, applyRemote); startTicketsSync(); }
          else setSync("off");
        });
      } catch (e) { setAuthUser(null); setSync("error"); }
    } else {
      setAuthUser(null);
    }
  }, []);

  function addFighter(f) { let u; if (editF) { u = fighters.map(x => x.id === f.id ? f : x); setEditF(null); } else { u = [...fighters, f]; } setFighters(u); save("bm_fighters_v4", u); setView("list"); }
  function editFighter(f) { setEditF(f); setView("register"); window.scrollTo(0, 0); }
  function delFighter(id) { const u = fighters.filter(f => f.id !== id); setFighters(u); save("bm_fighters_v4", u); }
  function cancel() { setEditF(null); setView("list"); }

  function handleExport() { const d = { fighters, matchups, expenses, tickets }; const b = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "evento_" + new Date().toISOString().split("T")[0] + ".json"; a.click(); URL.revokeObjectURL(u); }
  function handleImport() { const i = document.createElement("input"); i.type = "file"; i.accept = ".json"; i.onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const d = JSON.parse(ev.target.result); if (d.fighters) { setFighters(d.fighters); save("bm_fighters_v4", d.fighters); } if (d.matchups) { setMatchups(d.matchups); save("bm_matchups_v3", d.matchups); } if (d.expenses) { setExpenses(d.expenses); save("bm_expenses_v3", d.expenses); } if (d.tickets) { setTickets(d.tickets); save("bm_tickets_v3", d.tickets); } } catch { alert("JSON inválido"); } }; r.readAsText(f); }; i.click(); }
  // NOTA (Fase 2): ya no restaura atletas de demostración (se eliminaron del
  // código público). Este flujo de "Restaurar" se rediseña por completo en
  // la Fase 5 (respaldo automático + doble confirmación antes de borrar).
  // NOTA (Fase 3): ya no toca las boletas reales (bm_tickets_v4/nodos
  // sangre_nueva/tickets) — borrarlas de verdad implicaría eliminar cada
  // nodo en Firebase sin respaldo ni doble confirmación, algo que se
  // implementa recién en la Fase 5 ("Reiniciar evento"). Hasta entonces,
  // "Restaurar" solo limpia peleadores/peleas/gastos/boletas v3 (legado).
  function resetDemo() { if (!confirm("¿Borrar peleadores, peleas y gastos de este evento? (las entradas vendidas no se tocan)")) return; setFighters([]); save("bm_fighters_v4", []); setMatchups([]); save("bm_matchups_v3", []); setExpenses([]); save("bm_expenses_v3", []); setTickets([]); save("bm_tickets_v3", []); }

  const nav = (active) => "flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors " + (active ? "text-boxing-goldFight" : "text-boxing-muted active:text-gray-300");

  if (authUser === undefined) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b5f6e", fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.1em" }}>Cargando…</div>;
  if (authUser === null) return <LoginScreen />;

  return (
    <div className="app-root" style={{ maxWidth: "512px", margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header style={{ flexShrink: 0, borderBottom: "1px solid #2a1f2e", zIndex: 10, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-40px", left: "50%", transform: "translateX(-50%)", width: "320px", height: "160px", background: "radial-gradient(ellipse, rgba(155,26,42,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="flex justify-end px-3 pt-1.5 pb-0" style={{ position: "relative" }}>
          <div className="flex gap-1 items-center">
            <button onClick={toggleSync} className={"text-[10px] px-2 py-0.5 border font-semibold tracking-widest uppercase transition-colors " + (sync === "on" ? "text-green-400 border-green-500/40" : sync === "connecting" ? "text-yellow-400 border-yellow-500/40" : sync === "error" ? "text-red-400 border-red-500/40" : "text-gray-500 border-gray-600 hover:text-boxing-goldFight hover:border-boxing-goldDim")}>
              {sync === "on" ? "☁ Sincronizado" : sync === "connecting" ? "☁ Conectando…" : sync === "error" ? "☁ Error" : "☁ Nube"}
            </button>
            {isOwner ? <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="text-gray-500 hover:text-boxing-goldFight hover:bg-white/5 w-6 h-6 flex items-center justify-center transition-colors">⋮</button>
              {menuOpen && <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-7 z-20 bg-boxing-panel border border-boxing-line py-1 min-w-[110px] shadow-lg">
                  <button onClick={() => { setMenuOpen(false); resetDemo(); }} className="block w-full text-left text-[11px] text-gray-400 hover:text-red-400 hover:bg-white/5 px-3 py-1.5 transition-colors">Restaurar</button>
                  <button onClick={() => { setMenuOpen(false); handleImport(); }} className="block w-full text-left text-[11px] text-gray-400 hover:text-boxing-goldFight hover:bg-white/5 px-3 py-1.5 transition-colors">Importar</button>
                  <button onClick={() => { setMenuOpen(false); handleExport(); }} className="block w-full text-left text-[11px] text-gray-400 hover:text-boxing-goldFight hover:bg-white/5 px-3 py-1.5 transition-colors">Exportar</button>
                  <button onClick={() => { setMenuOpen(false); pasteCustomFbConfig(); }} className="block w-full text-left text-[11px] text-gray-400 hover:text-boxing-goldFight hover:bg-white/5 px-3 py-1.5 transition-colors">Firebase manual</button>
                  <div className="border-t border-boxing-line my-1" />
                  <button onClick={() => { setMenuOpen(false); logout(); }} className="block w-full text-left text-[11px] text-gray-400 hover:text-red-400 hover:bg-white/5 px-3 py-1.5 transition-colors">Cerrar sesión</button>
                </div>
              </>}
            </div> :
              <button onClick={logout} className="text-[10px] text-gray-500 hover:text-red-400 px-1.5 py-0.5 tracking-widest uppercase transition-colors">Salir</button>}
          </div>
        </div>
        <div className="flex flex-col items-center pb-4 pt-2 gap-1" style={{ position: "relative" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "11px", fontWeight: 600, letterSpacing: "0.4em", color: "#c8a04a", textTransform: "uppercase" }}>Azuaje Team & HH Arias</div>
          <img src="/assets/logo-sangre-nueva.png" alt="Sangre Nueva" style={{ height: "88px", width: "auto", objectFit: "contain", filter: "drop-shadow(0 0 14px rgba(200,160,74,0.35))", marginTop: "4px" }} />
          <div className="text-center leading-none" style={{ marginTop: "2px" }}>
            <div style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: "32px", letterSpacing: "0.04em", color: "#e8ddd0", lineHeight: 1 }}>SANGRE NUEVA</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "16px", color: "#c8a04a", letterSpacing: "0.15em", marginTop: "4px" }}>La Velada</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px" }}>
            <div style={{ width: "50px", height: "1px", background: "linear-gradient(90deg,transparent,#8a6d2f)" }} />
            <div style={{ width: "5px", height: "5px", background: "#c8a04a", transform: "rotate(45deg)" }} />
            <div style={{ width: "50px", height: "1px", background: "linear-gradient(90deg,#8a6d2f,transparent)" }} />
          </div>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 16px 80px" }}>
        {view === "list" && <FighterList fighters={fighters} onEdit={editFighter} onDelete={delFighter} />}
        {view === "register" && <FighterForm onSubmit={addFighter} editingFighter={editF} onCancel={editF ? cancel : undefined} />}
        {view === "vs" && <MatchmakingView fighters={fighters} matchups={matchups} setMatchups={setMatchups} />}
        {view === "card" && <FightCardView matchups={matchups} fighters={fighters} />}
        {view === "finance" && <TicketsManager tickets={ticketsNew} setTickets={setTicketsNew} initialTicketCode={urlTicketCode} />}
      </main>

      {/* Event Dates Bar (editable: tocar para cambiar) */}
      <div onClick={() => { const cur = load("bm_event_label", "La Velada — próxima fecha por definir"); const v = prompt("Nombre y fecha del evento:", cur); if (v !== null && v.trim()) { save("bm_event_label", v.trim()); setEventLabel(v.trim()); } }} style={{ flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "5px 0", borderTop: "1px solid #2a1f2e", background: "#100d10", cursor: "pointer" }}>
        <svg className="w-3 h-3 text-boxing-goldFight" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <span className="text-[10px] text-boxing-goldFight font-bold tracking-wide">{eventLabel}</span>
        <span className="text-[9px] text-gray-600">(tocar para editar)</span>
      </div>

      <nav className="nav-safe" style={{ flexShrink: 0, background: "#080608", borderTop: "1px solid #2a1f2e" }}>
        <div className="max-w-lg mx-auto flex">
          <button onClick={() => { setView("list"); setEditF(null); }} className={nav(view === "list")}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-[10px]">Peleadores</span>
          </button>
          <button onClick={() => { setEditF(null); setView("register"); }} className={nav(view === "register")}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            <span className="text-[10px]">Agregar</span>
          </button>
          <button onClick={() => setView("vs")} className={nav(view === "vs")}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            <span className="text-[10px]">VS</span>
          </button>
          <button onClick={() => setView("card")} className={nav(view === "card")}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            <span className="text-[10px]">Cartelera</span>
          </button>
          <button onClick={() => setView("finance")} className={nav(view === "finance")}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
            <span className="text-[10px]">Entradas</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
