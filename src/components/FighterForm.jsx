import { useState, useEffect, useRef, useMemo } from "react";
import { getWeightCategory, getCategoryInfo, getExperienceLevel, getExperienceInfo, getAgeCategory, weightRangeLabel, guessGenderFromName, genId, getInitials } from "../constants.js";
import { normName } from "../lib/dedup.js";
import Badge from "./Badge.jsx";
import PageHeader from "./PageHeader.jsx";

// Pone en mayúscula la primera letra de cada palabra al escribir (juan perez
// → Juan Perez), sin tocar el resto de las letras ni forzar minúsculas.
function titleCaseLive(s) {
  return String(s).replace(/(^|\s)(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

// ============================================
// COMPONENTE: FORMULARIO PELEADOR
// ============================================
export default function FighterForm({ onSubmit, editingFighter, existingFighters = [], onCancel }) {
  const [fullName, setFullName] = useState(editingFighter?.fullName || "");
  const [gym, setGym] = useState(editingFighter?.gym || "");
  const [ageStr, setAgeStr] = useState(editingFighter?.age?.toString() || "");
  const [weightStr, setWeightStr] = useState(editingFighter?.weightKg?.toString() || "");
  const [fightCountStr, setFightCountStr] = useState(editingFighter?.fightCount?.toString() || "0");
  const [notes, setNotes] = useState(editingFighter?.notes || "");
  const [sexo, setSexo] = useState(editingFighter?.sexo || "M");
  const [errors, setErrors] = useState({});
  const [addedName, setAddedName] = useState(null);
  // Aviso "ya estaba registrado — no se duplicó" (reemplaza al confirm() que
  // antes ofrecía "agregar de todos modos" y creaba un registro que la
  // reconciliación borraba en silencio, confundiendo al organizador).
  const [dupNotice, setDupNotice] = useState(null);
  const addedTimerRef = useRef(null);
  const formRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => { if (editingFighter) { setFullName(editingFighter.fullName || ""); setGym(editingFighter.gym || ""); setAgeStr(editingFighter.age?.toString() || ""); setWeightStr(editingFighter.weightKg?.toString() || ""); setFightCountStr(editingFighter.fightCount?.toString() || "0"); setNotes(editingFighter.notes || ""); setSexo(editingFighter.sexo || "M"); setErrors({}); } }, [editingFighter]);
  useEffect(() => () => clearTimeout(addedTimerRef.current), []);

  // Escuelas ya registradas (únicas) para el autocompletado predictivo del
  // campo Escuela/Gimnasio: al escribir las iniciales el navegador sugiere.
  const gymOptions = useMemo(() => {
    const set = new Set();
    existingFighters.forEach(f => { const g = (f.gym || "").trim(); if (g) set.add(g); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [existingFighters]);

  const parsedWeight = parseFloat(weightStr); const weightCategory = !isNaN(parsedWeight) && parsedWeight > 0 ? getWeightCategory(parsedWeight, sexo) : null; const categoryInfo = weightCategory ? getCategoryInfo(weightCategory) : null;
  const parsedAge = parseInt(ageStr); const ageCategoryInfo = !isNaN(parsedAge) && parsedAge > 0 ? getAgeCategory(parsedAge) : null;
  const parsedFightCount = parseInt(fightCountStr) || 0; const experienceLevel = getExperienceLevel(parsedFightCount); const experienceInfo = getExperienceInfo(experienceLevel);

  function validate() {
    const newErrors = {};
    const trimmedName = fullName.trim();
    if (!trimmedName) newErrors.fullName = "Requerido";
    else if (trimmedName.length < 2) newErrors.fullName = "Muy corto";
    else if (trimmedName.length > 60) newErrors.fullName = "Máximo 60 caracteres";
    if (!gym.trim()) newErrors.gym = "Requerido";
    else if (gym.trim().length > 60) newErrors.gym = "Máximo 60 caracteres";
    const parsedAge = parseInt(ageStr); if (!ageStr || isNaN(parsedAge) || parsedAge < 8 || parsedAge > 65) newErrors.ageStr = "8-65";
    if (!weightStr || isNaN(parsedWeight) || parsedWeight < 30 || parsedWeight > 150) newErrors.weightStr = "30-150kg";
    setErrors(newErrors);
    return !Object.keys(newErrors).length;
  }

  function submit(e) {
    e.preventDefault(); if (!validate()) return;
    const name = fullName.trim().replace(/\s+/g, " ");
    // Advierte si el sexo seleccionado no coincide con el que sugiere el
    // nombre (posible olvido al no cambiar el toggle). Es solo un aviso:
    // se puede continuar si el sexo es correcto.
    const guess = guessGenderFromName(name);
    if (guess && guess !== sexo) {
      const elegido = sexo === "M" ? "MASCULINO" : "FEMENINO";
      const probable = guess === "M" ? "masculino" : "femenino";
      if (!confirm(`¿Deseas agregar a "${name}" como ${elegido}?\n\nEl nombre parece ${probable}. Si el sexo es correcto, continúa; si no, cancela y cámbialo antes de guardar.`)) return;
    }
    // Anti-duplicado: si ya hay un peleador con el mismo nombre + sexo + peso
    // (el MISMO criterio con que la app deduplica), NO se agrega un segundo
    // registro. Antes esto ofrecía "¿Agregar de todos modos?" y, al aceptar,
    // creaba un duplicado que la reconciliación borraba en silencio —el
    // organizador veía "lo agregué" pero luego "no aparece". Ahora se avisa
    // claramente y no se duplica; para cambiarle datos, se edita el existente.
    // Solo al agregar (no al editar el mismo registro).
    if (!editingFighter) {
      const dup = existingFighters.find(x => normName(x.fullName) === normName(name) && (x.sexo || "M") === sexo && x.weightKg === parsedWeight);
      if (dup) {
        setAddedName(null);
        setDupNotice(`"${name}" ya estaba registrado (${parsedWeight}kg${dup.gym ? " · " + dup.gym : ""}) — no se duplicó. Si necesitas cambiarle algo, edítalo desde la lista.`);
        clearTimeout(addedTimerRef.current);
        addedTimerRef.current = setTimeout(() => setDupNotice(null), 7000);
        formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
    }
    // El campo de teléfono se quitó del formulario; se conserva el valor ya
    // guardado al editar peleadores antiguos que lo tenían.
    onSubmit({ id: editingFighter?.id || genId(), fullName: name, phone: editingFighter?.phone || "", sexo, gym: gym.trim().replace(/\s+/g, " "), age: parseInt(ageStr), weightKg: parsedWeight, weightCategory, experienceLevel, fightCount: parsedFightCount, createdAt: editingFighter?.createdAt || new Date().toISOString(), notes: notes.trim() || undefined });
    if (!editingFighter) {
      setFullName(""); setGym(""); setAgeStr(""); setWeightStr(""); setFightCountStr("0"); setNotes(""); setErrors({});
      setDupNotice(null);
      setAddedName(name);
      clearTimeout(addedTimerRef.current);
      // 7s (antes 4): registrando de corrido es fácil perderse la confirmación.
      addedTimerRef.current = setTimeout(() => setAddedName(null), 7000);
      // El scroll vive en el <main> de la app (no en window), así que se
      // sube al inicio del formulario para que la confirmación quede visible.
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      // Deja el cursor listo en "Nombre" para seguir agregando peleadores
      // sin tener que tocar el campo de nuevo.
      nameRef.current?.focus();
    }
  }

  // Pozos de tinta: el input-ink trae fondo hundido, radio de 14px y el halo
  // cobalto al foco (el único momento de luz azul del formulario).
  const ic = "w-full px-3 py-2.5 input-ink text-base";
  // Kickers de campo: condensada pequeña en oro apagado, como en el cartel.
  const lbl = "block text-[11px] font-semibold text-[rgba(200,160,74,0.55)] mb-1.5 tracking-[0.22em] uppercase";
  // Color de la división para la ficha en vivo (aro del avatar y humo de la
  // tarjeta); gris neutro mientras no haya peso válido.
  const catColor = categoryInfo?.color || "#9CA3AF";
  return (
    // En escritorio el formulario se centra con un ancho cómodo; en xl gana
    // la columna derecha con la FICHA EN VIVO del mockup (solo presentación).
    <div className="xl:flex xl:items-start xl:justify-center xl:gap-7">
      {/* Panel de tinta: humo carmesí sutil en la esquina del CTA — toda la
          atmósfera del panel apunta hacia la campana final. */}
      <form ref={formRef} onSubmit={submit} className="space-y-4 border border-boxing-line rounded-3xl p-5 lg:max-w-2xl lg:mx-auto lg:p-8 xl:mx-0 xl:flex-1 xl:max-w-2xl min-w-0" style={{ background: "radial-gradient(360px 300px at 88% 96%, rgba(196,36,56,0.07), transparent 65%), linear-gradient(170deg, #16111a, #100d10)" }}>
        <PageHeader kicker={editingFighter ? "Editar registro" : "Nuevo registro"} title={editingFighter ? "Editar Peleador" : "Agregar Peleador"} />
        {addedName && <div className="bg-green-900/20 border border-green-500/40 rounded-xl px-3 py-2.5 fade-in flex items-center gap-2">
          <span className="text-green-400 text-lg">✓</span>
          <span className="text-green-400 text-sm font-semibold">{addedName} fue agregado correctamente a la cartelera</span>
        </div>}
        {dupNotice && <div className="bg-amber-900/20 border border-amber-500/50 rounded-xl px-3 py-2.5 fade-in flex items-start gap-2">
          <span className="text-amber-400 text-lg leading-none">⚠️</span>
          <span className="text-amber-300 text-sm font-semibold">{dupNotice}</span>
        </div>}
        <div><label className={lbl}>Nombre</label><input ref={nameRef} type="text" value={fullName} onChange={e => setFullName(titleCaseLive(e.target.value))} placeholder="Martin Vargas" maxLength={60} className={ic} />{errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName}</p>}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Peso (kg)</label><input type="number" value={weightStr} onChange={e => setWeightStr(e.target.value)} placeholder="65" step="0.1" className={ic} />{errors.weightStr && <p className="text-red-400 text-xs mt-1">{errors.weightStr}</p>}</div>
          <div><label className={lbl}>Edad</label><input type="number" value={ageStr} onChange={e => setAgeStr(e.target.value)} placeholder="25" className={ic} />{errors.ageStr && <p className="text-red-400 text-xs mt-1">{errors.ageStr}</p>}</div>
        </div>
        {categoryInfo && <div className="bg-black/60 rounded-xl px-3 py-2 border border-boxing-line fade-in"><span className="text-xs text-boxing-muted tracking-widest uppercase">Categoría (World Boxing): </span><span className="text-boxing-goldFight font-semibold">{categoryInfo.label} · {weightRangeLabel(categoryInfo)}</span></div>}
        {ageCategoryInfo && <div className="bg-black/60 rounded-xl px-3 py-2 border border-boxing-line flex items-center gap-2 fade-in"><span className="text-xs text-boxing-muted tracking-widest uppercase">Edad (World Boxing): </span><Badge color={ageCategoryInfo.color}>{ageCategoryInfo.label} · {ageCategoryInfo.formato}</Badge></div>}
        <div><label className={lbl}>Nº peleas</label><input type="number" value={fightCountStr} onChange={e => setFightCountStr(e.target.value)} placeholder="0" min="0" className={ic} />
          {/* Nivel automático pegado al campo: píldora con punto luminoso del
              color del nivel — nace del Nº de peleas y cambia sola. */}
          {experienceInfo && <span className="inline-flex items-center gap-2 mt-2.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.18em] uppercase fade-in" style={{ color: experienceInfo.color, background: experienceInfo.color + "1A", border: "1px solid " + experienceInfo.color + "52" }}>
            <span aria-hidden="true" className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: experienceInfo.color, boxShadow: "0 0 6px " + experienceInfo.color }} />
            Nivel: {experienceInfo.label}
          </span>}
        </div>
        <div><label className={lbl}>Escuela / Gimnasio</label><input type="text" list="gym-options" value={gym} onChange={e => setGym(titleCaseLive(e.target.value))} placeholder="Team Azuaje" maxLength={60} autoComplete="off" className={ic} /><datalist id="gym-options">{gymOptions.map(g => <option key={g} value={g} />)}</datalist>{errors.gym && <p className="text-red-400 text-xs mt-1">{errors.gym}</p>}</div>
        <div><label className={lbl}>Sexo</label>
          {/* Báscula de pesaje: el pulgar cruza la pista y cambia su resplandor
              de cobalto a rosa. Mismo setter de siempre, solo cambia la piel. */}
          <div className={"sexo-toggle" + (sexo === "F" ? " f" : "")} role="radiogroup" aria-label="Sexo">
            <span className="thumb" aria-hidden="true" />
            <button type="button" onClick={() => setSexo("M")} className="opt m" aria-pressed={sexo === "M"}>Masculino</button>
            <button type="button" onClick={() => setSexo("F")} className="opt f" aria-pressed={sexo === "F"}>Femenino</button>
          </div>
        </div>
        <div><label className={lbl}>Notas</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Oficial" rows={2} className={ic + " resize-none"} /></div>
        <div className="pt-1">
          {/* Hairline dorada: separa la campana final del resto del formulario */}
          <div aria-hidden="true" className="h-px mb-5" style={{ background: "linear-gradient(90deg, transparent, rgba(229,199,107,0.35), transparent)" }} />
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 h-14" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "20px", letterSpacing: "0.14em" }}>{editingFighter ? "Guardar" : "Añadir a Grilla"}</button>
            {editingFighter && onCancel && <button type="button" onClick={onCancel} className="btn-gold px-5 text-sm font-semibold tracking-widest uppercase">Cancelar</button>}
          </div>
        </div>
      </form>
      {/* FICHA EN VIVO (solo escritorio xl): la misma tarjeta de Peleadores
          llenándose en tiempo real — confirmación visible antes de guardar.
          Cero estado nuevo: todo se deriva de los valores del formulario.
          En pantallas menores no se muestra (el aviso verde ya confirma). */}
      <aside className="hidden xl:block w-[290px] flex-none" aria-hidden="true">
        <div className="flex items-center gap-2 text-[11.5px] tracking-[0.2em] uppercase text-boxing-muted mb-2.5">
          <span className="w-[18px] h-px bg-[rgba(200,160,74,0.5)]" />Ficha en vivo
        </div>
        <div className="fighter-card p-[18px] pb-5" style={{ "--cat": catColor }}>
          <div className="flex items-center gap-3">
            <div className="avatar-ring" style={{ "--cat": catColor }}><span>{getInitials(fullName) || "—"}</span></div>
            <div className="min-w-0">
              <div className="text-[19px] leading-tight truncate" style={{ fontFamily: "'Playfair Display',Georgia,serif", color: "#f2edf4" }}>{fullName.trim() || "Nuevo peleador"}</div>
              <div className="text-[11px] tracking-[0.14em] uppercase text-boxing-muted mt-0.5 truncate">{gym.trim() || "Escuela por definir"}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {categoryInfo && <Badge color={categoryInfo.color}>{parsedWeight}kg · {categoryInfo.label}</Badge>}
            {experienceInfo && <Badge color={experienceInfo.color}>{parsedFightCount}p · {experienceInfo.label}</Badge>}
            {ageCategoryInfo && <Badge color={ageCategoryInfo.color}>{parsedAge}a · {ageCategoryInfo.label.split(" ")[0]}</Badge>}
            <Badge color={sexo === "F" ? "#EC4899" : "#3B82F6"}>{sexo === "F" ? "F" : "M"}</Badge>
          </div>
        </div>
        <p className="text-xs text-boxing-muted mt-3.5 px-1 leading-relaxed">La tarjeta se completa mientras escribes: nombre, división por peso y nivel por Nº de peleas.</p>
      </aside>
    </div>
  );
}
