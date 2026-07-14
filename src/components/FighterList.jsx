import { useState, useMemo } from "react";
import { WEIGHT_CATEGORIES_M, WEIGHT_CATEGORIES_F, EXPERIENCE_LEVELS, getCategoryInfo, getExperienceInfo, getAgeCategory, weightRangeLabel, getInitials } from "../constants.js";
import Badge from "./Badge.jsx";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ============================================
// COMPONENTE: LISTA PELEADORES
// ============================================
export default function FighterList({ fighters, matchups = [], onEdit, onDelete }) {
  const [searchQuery, setSearchQuery] = useState(""); const [categoryFilter, setCategoryFilter] = useState("all"); const [experienceFilter, setExperienceFilter] = useState("all"); const [sortBy, setSortBy] = useState("recent"); const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showFaltantes, setShowFaltantes] = useState(false);
  // "Faltantes": peleadores que no quedaron en ninguna pelea del VS —
  // el matchmaking nunca empareja cruces que rompan las reglas World Boxing
  // (categoría de edad, sexo), así que quien no tiene rival compatible
  // queda aquí, con sus datos intactos, a la espera de un rival nuevo.
  const matchedIds = useMemo(() => { const s = new Set(); matchups.forEach(m => { s.add(m.fighterRedId); s.add(m.fighterBlueId); }); return s; }, [matchups]);
  const faltantesCount = useMemo(() => fighters.filter(f => !matchedIds.has(f.id)).length, [fighters, matchedIds]);
  const filtered = useMemo(() => {
    let r = [...fighters];
    if (showFaltantes) r = r.filter(f => !matchedIds.has(f.id));
    if (searchQuery.trim()) { const s = searchQuery.toLowerCase(); r = r.filter(f => f.fullName.toLowerCase().includes(s) || f.gym.toLowerCase().includes(s)); }
    if (categoryFilter !== "all") r = r.filter(f => f.weightCategory === categoryFilter);
    if (experienceFilter !== "all") r = r.filter(f => f.experienceLevel === experienceFilter);
    switch (sortBy) { case "name": r.sort((a, b) => a.fullName.localeCompare(b.fullName)); break; case "weight": r.sort((a, b) => a.weightKg - b.weightKg); break; case "experience": r.sort((a, b) => b.fightCount - a.fightCount); break; default: r.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
    return r;
  }, [fighters, searchQuery, categoryFilter, experienceFilter, sortBy, showFaltantes, matchedIds]);
  const stats = useMemo(() => { const e = {}; fighters.forEach(f => { e[f.experienceLevel] = (e[f.experienceLevel] || 0) + 1; }); return e; }, [fighters]);
  function del(id) { if (confirmDeleteId === id) { onDelete(id); setConfirmDeleteId(null); } else { setConfirmDeleteId(id); setTimeout(() => setConfirmDeleteId(null), 3000); } }

  // Imprime exactamente la lista que se está viendo (respeta el filtro de
  // Faltante, la búsqueda, la categoría, el nivel y el orden activos), con
  // los datos útiles para buscarle rival a cada uno: división de peso,
  // categoría de edad World Boxing, nivel de experiencia y escuela. El
  // subtítulo deja claro qué filtro estaba activo al imprimir.
  function printList() {
    const filtros = [];
    if (showFaltantes) filtros.push("FALTANTES (sin rival asignado en el VS)");
    if (categoryFilter !== "all") { const c = getCategoryInfo(categoryFilter); if (c) filtros.push(`División: ${c.label} ${weightRangeLabel(c)} (${c.genero === "F" ? "Mujeres" : "Hombres"})`); }
    if (experienceFilter !== "all") { const e = getExperienceInfo(experienceFilter); if (e) filtros.push(`Nivel: ${e.label}`); }
    if (searchQuery.trim()) filtros.push(`Búsqueda: "${searchQuery.trim()}"`);
    const subtitulo = (filtros.length ? filtros.join(" · ") : "Todos los peleadores") + ` — ${filtered.length} peleador${filtered.length !== 1 ? "es" : ""}`;
    const rows = filtered.map((f, i) => {
      const cat = getCategoryInfo(f.weightCategory);
      const ac = getAgeCategory(f.age);
      const exp = getExperienceInfo(f.experienceLevel);
      return `<tr>
        <td>${i + 1}</td>
        <td class="nombre">${escapeHtml(f.fullName)}</td>
        <td>${(f.sexo || "M") === "F" ? "F" : "M"}</td>
        <td>${f.weightKg}kg<div class="detalle">${escapeHtml(cat ? cat.label + " · " + weightRangeLabel(cat) : "")}</div></td>
        <td>${f.age}a<div class="detalle">${escapeHtml(ac.label)}</div></td>
        <td>${f.fightCount}p<div class="detalle">${escapeHtml(exp ? exp.label : "")}</div></td>
        <td class="esc">${escapeHtml(f.gym)}</td>
        <td class="rival"></td>
      </tr>`;
    }).join("");
    const win = window.open("", "_blank");
    if (!win) { alert("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo."); return; }
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Peleadores — Sangre Nueva</title>
<style>
  /* Forzar impresión de los colores de fondo (sin esto el PDF sale sin color). */
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#000;}
  .header{background:#000;color:#FDE047;text-align:center;padding:14px 0;font-size:22px;font-weight:bold;}
  .subtitulo{background:#FED7AA;text-align:center;padding:8px;font-size:14px;font-weight:bold;border:1px solid #000;border-top:none;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{border:1px solid #000;padding:6px 8px;text-align:center;}
  thead th{background:#BFDBFE;}
  td.nombre{font-weight:bold;text-align:left;}
  td.esc{text-align:left;}
  td.rival{min-width:130px;}
  .detalle{font-size:10px;color:#374151;margin-top:2px;}
  @page{size:landscape;margin:12mm;}
</style></head>
<body>
<div class="header">Sangre Nueva — La Velada · Peleadores</div>
<div class="subtitulo">${escapeHtml(subtitulo)}</div>
<table>
<thead><tr><th>N°</th><th>Nombre</th><th>Sexo</th><th>Peso</th><th>Edad</th><th>Peleas</th><th>Escuela</th><th>Rival propuesto</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  if (!fighters.length) return <div className="text-center py-16 border border-dashed border-boxing-lineBright"><div className="text-5xl mb-4 opacity-30">{"\u{1F94A}"}</div><p className="text-boxing-muted" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.08em" }}>Sin peleadores</p><p className="text-boxing-muted text-sm opacity-60 mt-1">Registra al primer peleador para el cartel.</p></div>;
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-3 text-boxing-cream" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "26px", letterSpacing: "0.05em" }}>
        <span style={{ width: "4px", height: "26px", background: "#c42438", display: "block", flexShrink: 0 }} />
        Peleadores <span className="text-boxing-goldFight">({fighters.length})</span>
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {EXPERIENCE_LEVELS.map(e => { const c = stats[e.key] || 0; if (!c) return null; return <button key={e.key} onClick={() => setExperienceFilter(experienceFilter === e.key ? "all" : e.key)} className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 border bg-black transition-colors min-w-[64px]" style={{ borderColor: experienceFilter === e.key ? e.color : e.color + "40" }}>
          <span className="text-sm font-bold leading-none" style={{ color: e.color }}>{c}</span>
          <span className="text-[9px] mt-0.5 tracking-widest uppercase" style={{ color: e.color }}>{e.label}</span>
        </button>; })}
        {faltantesCount > 0 && <button onClick={() => setShowFaltantes(!showFaltantes)} className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 border bg-black transition-colors min-w-[64px]" style={{ borderColor: showFaltantes ? "#F97316" : "#F9731640" }}>
          <span className="text-sm font-bold leading-none" style={{ color: "#F97316" }}>{faltantesCount}</span>
          <span className="text-[9px] mt-0.5 tracking-widest uppercase" style={{ color: "#F97316" }}>Faltante</span>
        </button>}
      </div>
      {showFaltantes && <div className="border border-orange-500/30 bg-orange-900/10 px-3 py-2 fade-in">
        <p className="text-orange-400 text-xs">Peleadores sin rival asignado en el VS: aún no hay un contrincante compatible (peso, sexo y categoría de edad World Boxing). Sus datos quedan guardados a la espera de un rival.</p>
      </div>}
      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar..." className="w-full px-3 py-2.5 bg-black border border-boxing-lineBright rounded-none text-boxing-cream placeholder-boxing-muted focus:outline-none focus:border-boxing-goldDim text-sm transition-colors" />
      <div className="flex gap-2">
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="flex-1 px-2 py-2 bg-black border border-boxing-lineBright rounded-none text-boxing-cream text-sm transition-colors">
          <option value="all">Todas categorías</option>
          <optgroup label="Hombres">{WEIGHT_CATEGORIES_M.map(c => <option key={c.key} value={c.key}>{c.label} ({weightRangeLabel(c)})</option>)}</optgroup>
          <optgroup label="Mujeres">{WEIGHT_CATEGORIES_F.map(c => <option key={c.key} value={c.key}>{c.label} ({weightRangeLabel(c)})</option>)}</optgroup>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-2 py-2 bg-black border border-boxing-lineBright rounded-none text-boxing-cream text-sm transition-colors"><option value="recent">Recientes</option><option value="name">Nombre</option><option value="weight">Peso</option><option value="experience">Experiencia</option></select>
        <button onClick={printList} title="Imprimir la lista visible (con los filtros activos)" className="px-3 py-2 bg-black border border-boxing-goldDim text-boxing-goldFight text-sm transition-colors hover:bg-boxing-goldDim/10">🖨️</button>
      </div>
      <div className="space-y-2">
        {!filtered.length ? <p className="text-boxing-muted text-center py-8 text-sm">Sin resultados</p> : filtered.map(f => {
          const cat = getCategoryInfo(f.weightCategory); const exp = getExperienceInfo(f.experienceLevel);
          return (<div key={f.id} className="bg-boxing-panel border border-boxing-line p-3 space-y-2 fade-in transition-colors hover:border-boxing-lineBright" style={{ borderLeft: "3px solid " + (exp?.color || "#4B5563") }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-xs font-bold border" style={{ borderColor: (cat?.color || "#9CA3AF") + "60", color: cat?.color || "#9CA3AF" }}>{getInitials(f.fullName)}</div>
                <div className="min-w-0 flex-1"><h3 className="text-boxing-cream font-medium text-base leading-tight truncate">{f.fullName}</h3><p className="text-boxing-muted text-xs mt-0.5 truncate tracking-wide uppercase">{f.gym}</p></div>
              </div>
              <div className="flex gap-1 ml-2 flex-shrink-0"><button onClick={() => onEdit(f)} className="p-2 text-boxing-muted hover:text-boxing-goldFight hover:bg-white/5 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button><button onClick={() => del(f.id)} className={"p-2 transition-colors hover:bg-white/5 " + (confirmDeleteId === f.id ? "text-red-400" : "text-boxing-muted hover:text-red-400")}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></div>
            <div className="flex flex-wrap gap-1.5 pl-11">
              <Badge color={cat?.color || "#F59E0B"}>{f.weightKg}kg · {cat?.label}</Badge>
              <Badge color={exp?.color}>{f.fightCount}p · {exp?.label}</Badge>
              <Badge color={getAgeCategory(f.age).color}>{f.age}a · {getAgeCategory(f.age).label.split(" ")[0]}</Badge>
              <Badge color={(f.sexo || "M") === "F" ? "#EC4899" : "#3B82F6"}>{(f.sexo || "M") === "F" ? "F" : "M"}</Badge>
            </div>
            {f.phone && <div className="text-xs text-boxing-muted pl-11"><a href={"https://wa.me/" + f.phone.replace("+", "")} target="_blank" className="hover:text-green-400">{"\u{1F4F1}"} {f.phone}</a></div>}
            {confirmDeleteId === f.id && <p className="text-red-400 text-xs fade-in pl-11">{"⚠️"} Toca de nuevo para eliminar</p>}
          </div>);
        })}
      </div>
    </div>
  );
}
