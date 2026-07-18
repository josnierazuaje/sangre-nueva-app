import { useState, useEffect, useRef, useMemo } from "react";
import { getWeightCategory, getCategoryInfo, getExperienceLevel, getExperienceInfo, getAgeCategory, weightRangeLabel, guessGenderFromName, genId } from "../constants.js";
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

  const ic = "w-full px-3 py-2.5 bg-black border border-boxing-lineBright rounded-none text-boxing-cream placeholder-boxing-muted focus:outline-none focus:border-boxing-goldDim focus:bg-boxing-raised text-base transition-colors";
  const lbl = "block text-[10px] font-semibold text-boxing-muted mb-1.5 tracking-[0.3em] uppercase";
  return (
    // En escritorio el formulario se centra con un ancho cómodo (los campos
    // no se estiran a todo el ancho de la pantalla) y gana algo de respiro.
    <form ref={formRef} onSubmit={submit} className="space-y-4 bg-boxing-panel border border-boxing-line p-5 lg:max-w-2xl lg:mx-auto lg:p-8">
      <PageHeader kicker={editingFighter ? "Editar registro" : "Nuevo registro"} title={editingFighter ? "Editar Peleador" : "Agregar Peleador"} />
      {addedName && <div className="bg-green-900/20 border border-green-500/40 px-3 py-2.5 fade-in flex items-center gap-2">
        <span className="text-green-400 text-lg">✓</span>
        <span className="text-green-400 text-sm font-semibold">{addedName} fue agregado correctamente a la cartelera</span>
      </div>}
      {dupNotice && <div className="bg-amber-900/20 border border-amber-500/50 px-3 py-2.5 fade-in flex items-start gap-2">
        <span className="text-amber-400 text-lg leading-none">⚠️</span>
        <span className="text-amber-300 text-sm font-semibold">{dupNotice}</span>
      </div>}
      <div><label className={lbl}>Nombre</label><input ref={nameRef} type="text" value={fullName} onChange={e => setFullName(titleCaseLive(e.target.value))} placeholder="Martin Vargas" maxLength={60} className={ic} />{errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName}</p>}</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Peso (kg)</label><input type="number" value={weightStr} onChange={e => setWeightStr(e.target.value)} placeholder="65" step="0.1" className={ic} />{errors.weightStr && <p className="text-red-400 text-xs mt-1">{errors.weightStr}</p>}</div>
        <div><label className={lbl}>Edad</label><input type="number" value={ageStr} onChange={e => setAgeStr(e.target.value)} placeholder="25" className={ic} />{errors.ageStr && <p className="text-red-400 text-xs mt-1">{errors.ageStr}</p>}</div>
      </div>
      {categoryInfo && <div className="bg-black px-3 py-2 border border-boxing-line fade-in"><span className="text-xs text-boxing-muted tracking-widest uppercase">Categoría (World Boxing): </span><span className="text-boxing-goldFight font-semibold">{categoryInfo.label} · {weightRangeLabel(categoryInfo)}</span></div>}
      {ageCategoryInfo && <div className="bg-black px-3 py-2 border border-boxing-line flex items-center gap-2 fade-in"><span className="text-xs text-boxing-muted tracking-widest uppercase">Edad (World Boxing): </span><Badge color={ageCategoryInfo.color}>{ageCategoryInfo.label} · {ageCategoryInfo.formato}</Badge></div>}
      <div><label className={lbl}>Nº peleas</label><input type="number" value={fightCountStr} onChange={e => setFightCountStr(e.target.value)} placeholder="0" min="0" className={ic} /></div>
      {experienceInfo && <div className="bg-black px-3 py-2 border border-boxing-line flex items-center gap-2 fade-in"><span className="text-xs text-boxing-muted tracking-widest uppercase">Nivel: </span><Badge color={experienceInfo.color}>{experienceInfo.label}</Badge></div>}
      <div><label className={lbl}>Escuela / Gimnasio</label><input type="text" list="gym-options" value={gym} onChange={e => setGym(titleCaseLive(e.target.value))} placeholder="Team Azuaje" maxLength={60} autoComplete="off" className={ic} /><datalist id="gym-options">{gymOptions.map(g => <option key={g} value={g} />)}</datalist>{errors.gym && <p className="text-red-400 text-xs mt-1">{errors.gym}</p>}</div>
      <div><label className={lbl}>Sexo</label><div className="flex gap-2">
        <button type="button" onClick={() => setSexo("M")} className={"flex-1 py-2.5 text-sm font-bold border tracking-widest uppercase transition-colors " + (sexo === "M" ? "bg-blue-600/15 border-blue-500 text-blue-300" : "bg-black border-boxing-lineBright text-boxing-muted")}>Masculino</button>
        <button type="button" onClick={() => setSexo("F")} className={"flex-1 py-2.5 text-sm font-bold border tracking-widest uppercase transition-colors " + (sexo === "F" ? "bg-pink-600/15 border-pink-500 text-pink-300" : "bg-black border-boxing-lineBright text-boxing-muted")}>Femenino</button>
      </div></div>
      <div><label className={lbl}>Notas</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Oficial" rows={2} className={ic + " resize-none"} /></div>
      <div className="flex gap-3 pt-2"><button type="submit" className="btn-primary flex-1 py-3.5" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "20px", letterSpacing: "0.1em" }}>{editingFighter ? "Guardar" : "Añadir a Grilla"}</button>{editingFighter && onCancel && <button type="button" onClick={onCancel} className="px-4 py-3.5 bg-black border border-boxing-lineBright text-boxing-muted tracking-widest uppercase text-sm">Cancelar</button>}</div>
    </form>
  );
}
