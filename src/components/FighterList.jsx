import { useState, useMemo } from "react";
import { WEIGHT_CATEGORIES_M, WEIGHT_CATEGORIES_F, EXPERIENCE_LEVELS, AGE_CATEGORIES, FECHIBOX_LABEL, getCategoryInfo, getExperienceInfo, getAgeCategory, weightRangeLabel, getInitials } from "../constants.js";
import Badge from "./Badge.jsx";
import PageHeader from "./PageHeader.jsx";
import { escapeHtml } from "../lib/html.js";
import { waChatUrl } from "../lib/whatsapp.js";
import { printHtml } from "../lib/printHtml.js";
import { buildFightersXlsx } from "../lib/xlsxPlanillas.js";
import { downloadBytes, xlsxFilename, XLSX_MIME } from "../lib/download.js";
import { normName } from "../lib/dedup.js";

// Un filtro de la banda: la cifra en oro y la etiqueta en blanco, sin píldora.
// El activo se marca con el filo de oro de abajo (.filtro.on en index.css), el
// mismo gesto que la tarjeta de peleador. Ya no recibe color: doce colores
// distintos en la misma franja le quitaban seriedad a la página.
function Filtro({ n, label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} className={"filtro flex-shrink-0" + (active ? " on" : "")}>
      <span className="n">{n}</span>
      <span className="l">{label}</span>
    </button>
  );
}

// Una banda de filtros con su rótulo (NIVEL / SEXO / CATEGORÍA). El rótulo solo
// se ve en escritorio; en móvil los grupos se distinguen por el hilo.
function GrupoFiltros({ titulo, children }) {
  return (
    <div className="filtro-grupo">
      <span className="filtro-titulo">{titulo}</span>
      <div className="filtro-items">{children}</div>
    </div>
  );
}

// ============================================
// COMPONENTE: LISTA PELEADORES
// ============================================
// Ojo: acá NO hay filtro de "Faltantes". Los peleadores sin compromiso tienen
// su propia pestaña en el menú de la izquierda (FaltantesView), que además
// sabe emparejarlos; repetirlo como filtro solo llenaba la franja.
export default function FighterList({ fighters, onEdit, onDelete }) {
  const [searchQuery, setSearchQuery] = useState(""); const [categoryFilter, setCategoryFilter] = useState("all"); const [experienceFilter, setExperienceFilter] = useState("all"); const [sortBy, setSortBy] = useState("recent"); const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [sexFilter, setSexFilter] = useState("all"); // "all" | "M" | "F"
  const [ageFilter, setAgeFilter] = useState("all"); // "all" | clave de categoría de edad
  const filtered = useMemo(() => {
    let r = [...fighters];
    if (sexFilter !== "all") r = r.filter(f => (f.sexo || "M") === sexFilter);
    if (ageFilter === "invalid") r = r.filter(f => { const k = getAgeCategory(f.age).key; return k === "infantil" || k === "veterano"; });
    else if (ageFilter !== "all") r = r.filter(f => getAgeCategory(f.age).key === ageFilter);
    // Búsqueda insensible a acentos/mayúsculas/espacios: usa normName (la MISMA
    // normalización que la deduplicación) para que buscar "joaquin paz"
    // encuentre a "Joaquín Paz". Antes usaba toLowerCase() a secas y no hallaba
    // nombres con tilde aunque el dedup sí los detectaba como existentes.
    if (searchQuery.trim()) { const s = normName(searchQuery); r = r.filter(f => normName(f.fullName).includes(s) || normName(f.gym).includes(s)); }
    if (categoryFilter !== "all") r = r.filter(f => f.weightCategory === categoryFilter);
    if (experienceFilter !== "all") r = r.filter(f => f.experienceLevel === experienceFilter);
    switch (sortBy) { case "name": r.sort((a, b) => a.fullName.localeCompare(b.fullName)); break; case "weight": r.sort((a, b) => a.weightKg - b.weightKg); break; case "experience": r.sort((a, b) => b.fightCount - a.fightCount); break; default: r.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
    return r;
  }, [fighters, searchQuery, categoryFilter, experienceFilter, sortBy, sexFilter, ageFilter]);
  const stats = useMemo(() => { const e = {}; fighters.forEach(f => { e[f.experienceLevel] = (e[f.experienceLevel] || 0) + 1; }); return e; }, [fighters]);
  // Conteo por sexo para los filtros Masculino/Femenino.
  const sexCounts = useMemo(() => { const c = { M: 0, F: 0 }; fighters.forEach(f => { c[(f.sexo || "M") === "F" ? "F" : "M"]++; }); return c; }, [fighters]);
  // Conteo por categoría de edad (World Boxing) para los filtros de edad.
  const ageCounts = useMemo(() => { const c = {}; fighters.forEach(f => { const k = getAgeCategory(f.age).key; c[k] = (c[k] || 0) + 1; }); return c; }, [fighters]);
  // Atletas fuera de los rangos oficiales (menores de 13 o mayores de 40).
  const invalidCount = (ageCounts.infantil || 0) + (ageCounts.veterano || 0);
  function del(id) { if (confirmDeleteId === id) { onDelete(id); setConfirmDeleteId(null); } else { setConfirmDeleteId(id); setTimeout(() => setConfirmDeleteId(null), 3000); } }
  // "Todos": limpia todos los filtros para ver a todos los registrados.
  const sinFiltros = !searchQuery.trim() && categoryFilter === "all" && experienceFilter === "all" && sexFilter === "all" && ageFilter === "all";
  function verTodos() { setSearchQuery(""); setCategoryFilter("all"); setExperienceFilter("all"); setSexFilter("all"); setAgeFilter("all"); }

  // Imprime exactamente la lista que se está viendo (respeta la búsqueda, el
  // sexo, la categoría de edad, la división, el nivel y el orden activos), con
  // los datos útiles para buscarle rival a cada uno: división de peso,
  // categoría de edad World Boxing, nivel de experiencia y escuela. El
  // subtítulo deja claro qué filtro estaba activo al imprimir.
  // Descripción de los filtros activos, para que la planilla (impresa o en
  // Excel) diga siempre a qué corresponde la lista que trae.
  function subtituloFiltros() {
    const filtros = [];
    if (sexFilter !== "all") filtros.push(sexFilter === "F" ? "Femeninas" : "Masculinos");
    if (ageFilter === "invalid") filtros.push("INVÁLIDOS (fuera de rango oficial 13-40)");
    else if (ageFilter !== "all") { const a = AGE_CATEGORIES.find(x => x.key === ageFilter); if (a) filtros.push(`${a.label} (${FECHIBOX_LABEL[a.key] || a.label})`); }
    if (categoryFilter !== "all") { const c = getCategoryInfo(categoryFilter); if (c) filtros.push(`División: ${c.label} ${weightRangeLabel(c)} (${c.genero === "F" ? "Mujeres" : "Hombres"})`); }
    if (experienceFilter !== "all") { const e = getExperienceInfo(experienceFilter); if (e) filtros.push(`Nivel: ${e.label}`); }
    if (searchQuery.trim()) filtros.push(`Búsqueda: "${searchQuery.trim()}"`);
    return (filtros.length ? filtros.join(" · ") : "Todos los peleadores") + ` — ${filtered.length} peleador${filtered.length !== 1 ? "es" : ""}`;
  }

  // La misma lista en Excel editable, con peso, edad y peleas como números de
  // verdad (se puede ordenar y filtrar) y la columna "Rival propuesto" en
  // blanco para anotar a mano.
  function excelList() {
    const fecha = new Date().toLocaleDateString("es-CL");
    downloadBytes(
      buildFightersXlsx(filtered, subtituloFiltros()),
      xlsxFilename("Peleadores Sangre Nueva", fecha.replace(/\//g, "-")),
      XLSX_MIME,
    );
  }

  function printList() {
    const subtitulo = subtituloFiltros();
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
    printHtml(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Peleadores — Sangre Nueva</title>
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
  }

  if (!fighters.length) return <div className="text-center py-16 border border-dashed border-boxing-lineBright rounded-[22px]"><div className="text-5xl mb-4 opacity-30">{"\u{1F94A}"}</div><p className="text-boxing-muted" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "0.08em" }}>Sin peleadores</p><p className="text-boxing-muted text-sm opacity-60 mt-1">Registra al primer peleador para el cartel.</p></div>;
  return (
    <div className="space-y-3">
      <PageHeader kicker="Base de datos de atletas" title="Peleadores" count={fighters.length} />
      {/* Banda de filtros: tres grupos (nivel, sexo, categoría) separados por el
          hilo carmesí→cobalto en vez de por una píldora de color por filtro. */}
      <div className="filtro-banda">
        <GrupoFiltros titulo="Nivel">
          <Filtro n={fighters.length} label="Todos" active={sinFiltros} onClick={verTodos} />
          <span className="filtro-sep" aria-hidden="true" />
          {/* "Amateur Avanzado" es la etiqueta más larga de la fila: en móvil se
              corta a "Amateur" para que quepan más filtros por línea. */}
          {EXPERIENCE_LEVELS.map(e => { const c = stats[e.key] || 0; if (!c) return null; const label = e.key === "amateur" ? <>Amateur<span className="hidden lg:inline"> Avanzado</span></> : e.label; return <Filtro key={e.key} n={c} label={label} active={experienceFilter === e.key} onClick={() => setExperienceFilter(experienceFilter === e.key ? "all" : e.key)} />; })}
        </GrupoFiltros>
        <hr className="hilo-ring" />
        <GrupoFiltros titulo="Sexo">
          <Filtro n={sexCounts.M} label="Masculino" active={sexFilter === "M"} onClick={() => setSexFilter(sexFilter === "M" ? "all" : "M")} />
          <Filtro n={sexCounts.F} label="Femenino" active={sexFilter === "F"} onClick={() => setSexFilter(sexFilter === "F" ? "all" : "F")} />
        </GrupoFiltros>
        <hr className="hilo-ring" />
        <GrupoFiltros titulo="Categoría">
          {/* En móvil solo el nombre World Boxing (U15, U17, U19, Elite); la
              equivalencia FECHIBOX —útil pero larga— aparece en escritorio, que
              es donde hay ancho de sobra. Las planillas impresas la siguen
              llevando siempre. */}
          {AGE_CATEGORIES.map(a => { const c = ageCounts[a.key] || 0; if (!c) return null; return <Filtro key={a.key} n={c} label={<>{a.label}<span className="hidden lg:inline"> · {FECHIBOX_LABEL[a.key] || a.label}</span></>} active={ageFilter === a.key} onClick={() => setAgeFilter(ageFilter === a.key ? "all" : a.key)} />; })}
          {invalidCount > 0 && <Filtro n={invalidCount} label="Inválidos" active={ageFilter === "invalid"} onClick={() => setAgeFilter(ageFilter === "invalid" ? "all" : "invalid")} />}
        </GrupoFiltros>
      </div>
      {/* Móvil: búsqueda arriba y filtros abajo, como siempre. Escritorio
          (lg): todo en una sola fila-herramienta para liberar alto visual. */}
      <div className="space-y-3 lg:space-y-0 lg:flex lg:gap-2 lg:items-stretch">
      {/* Pozos de tinta: .input-ink trae fondo hundido, radio 14px, placeholder
          apagado y el halo cobalto de foco — aquí solo queda el tamaño. */}
      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar..." className="input-ink w-full px-3 py-2.5 text-sm lg:flex-1" />
      <div className="flex gap-2 lg:flex-shrink-0">
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input-ink flex-1 px-2 py-2 text-sm">
          <option value="all">Todas categorías</option>
          <optgroup label="Hombres">{WEIGHT_CATEGORIES_M.map(c => <option key={c.key} value={c.key}>{c.label} ({weightRangeLabel(c)})</option>)}</optgroup>
          <optgroup label="Mujeres">{WEIGHT_CATEGORIES_F.map(c => <option key={c.key} value={c.key}>{c.label} ({weightRangeLabel(c)})</option>)}</optgroup>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-ink px-2 py-2 text-sm"><option value="recent">Recientes</option><option value="name">Nombre</option><option value="weight">Peso</option><option value="experience">Experiencia</option></select>
        <button onClick={printList} title="Imprimir la lista visible (con los filtros activos)" className="btn-gold px-3 py-2 text-sm">🖨️</button>
        <button onClick={excelList} title="Descargar la lista visible en Excel para editarla (Numbers, Excel o Google Sheets)" className="px-3 py-2 text-sm rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white transition-colors">📊</button>
      </div>
      </div>
      {/* Móvil: lista vertical de siempre. Escritorio: cuadrícula de 2
          columnas (lg) o 3 (xl) para aprovechar el ancho disponible. */}
      <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
        {!filtered.length ? <p className="text-boxing-muted text-center py-8 text-sm lg:col-span-full">Sin resultados</p> : filtered.map(f => {
          const cat = getCategoryInfo(f.weightCategory); const exp = getExperienceInfo(f.experienceLevel);
          // Rediseño: la tarjeta lleva --cat (color de la DIVISIÓN) — pinta el
          // aro del avatar; el filo de oro y el hover los da .fighter-card.
          return (<div key={f.id} className="fighter-card group p-3.5 space-y-2.5 fade-in" style={{ "--cat": cat?.color || "#9CA3AF" }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="avatar-ring"><span>{getInitials(f.fullName)}</span></div>
                <div className="min-w-0 flex-1">
                  <h3 className="leading-tight truncate text-[17px]" style={{ fontFamily: "'Playfair Display',Georgia,serif", color: "#f2edf4" }}>{f.fullName}</h3>
                  <p className="text-boxing-muted text-[14px] mt-0.5 truncate tracking-[0.14em] uppercase"><span style={{ color: "rgba(200,160,74,0.6)" }}>· </span>{f.gym}</p>
                </div>
              </div>
              {/* Acciones que no estorban: en escritorio aparecen al pasar el
                  cursor (group-hover); en móvil siempre visibles (no hay hover).
                  Editar vira a dorado, eliminar a carmesí — el peligro se
                  anuncia con color. */}
              <div className="flex gap-1.5 ml-2 flex-shrink-0 lg:opacity-0 lg:translate-y-1 lg:group-hover:opacity-100 lg:group-hover:translate-y-0 lg:focus-within:opacity-100 lg:focus-within:translate-y-0 transition-all duration-150">
                <button onClick={() => onEdit(f)} aria-label="Editar" className="w-[30px] h-[30px] rounded-[10px] border border-white/10 bg-black/60 flex items-center justify-center text-boxing-muted hover:text-boxing-goldBright hover:bg-boxing-goldFight/10 hover:border-boxing-goldFight/40 transition-colors"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                <button onClick={() => del(f.id)} aria-label="Eliminar" className={"w-[30px] h-[30px] rounded-[10px] border flex items-center justify-center transition-colors " + (confirmDeleteId === f.id ? "text-red-400 border-red-500/50 bg-red-900/20" : "border-white/10 bg-black/60 text-boxing-muted hover:text-red-400 hover:bg-red-900/20 hover:border-red-500/40")}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-[56px]">
              <Badge color={cat?.color || "#F59E0B"}>{f.weightKg}kg · {cat?.label}</Badge>
              <Badge color={exp?.color}>{f.fightCount}p · {exp?.label}</Badge>
              <Badge color={getAgeCategory(f.age).color}>{f.age}a · {getAgeCategory(f.age).label.split(" ")[0]}</Badge>
              <Badge color={(f.sexo || "M") === "F" ? "#EC4899" : "#3B82F6"}>{(f.sexo || "M") === "F" ? "F" : "M"}</Badge>
            </div>
            {/* El teléfono se escribe a mano y con espacios ("+56 9 6406 1816").
                Antes el enlace solo quitaba el "+" y los espacios llegaban a la
                URL, así que WhatsApp abría una pantalla de error en vez del
                chat. waChatUrl normaliza el número (mismas pruebas que la venta). */}
            {f.phone && <div className="text-sm text-boxing-muted pl-[56px]"><a href={waChatUrl(f.phone)} target="_blank" rel="noopener noreferrer" className="hover:text-green-400">{"\u{1F4F1}"} {f.phone}</a></div>}
            {confirmDeleteId === f.id && <p className="text-red-400 text-sm fade-in pl-[56px]">{"⚠️"} Toca de nuevo para eliminar</p>}
          </div>);
        })}
      </div>
    </div>
  );
}
