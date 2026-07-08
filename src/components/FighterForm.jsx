import { useState, useEffect, useRef } from "react";
import { getWeightCategory, getCategoryInfo, getExperienceLevel, getExperienceInfo, genId } from "../constants.js";
import Badge from "./Badge.jsx";

// ============================================
// COMPONENTE: FORMULARIO PELEADOR
// ============================================
export default function FighterForm({ onSubmit, editingFighter, onCancel }) {
  const [fullName, setFullName] = useState(editingFighter?.fullName || "");
  const [gym, setGym] = useState(editingFighter?.gym || "");
  const [ageStr, setAgeStr] = useState(editingFighter?.age?.toString() || "");
  const [weightStr, setWeightStr] = useState(editingFighter?.weightKg?.toString() || "");
  const [fightCountStr, setFightCountStr] = useState(editingFighter?.fightCount?.toString() || "0");
  const [notes, setNotes] = useState(editingFighter?.notes || "");
  const [sexo, setSexo] = useState(editingFighter?.sexo || "M");
  const [errors, setErrors] = useState({});
  const [addedName, setAddedName] = useState(null);
  const addedTimerRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => { if (editingFighter) { setFullName(editingFighter.fullName || ""); setGym(editingFighter.gym || ""); setAgeStr(editingFighter.age?.toString() || ""); setWeightStr(editingFighter.weightKg?.toString() || ""); setFightCountStr(editingFighter.fightCount?.toString() || "0"); setNotes(editingFighter.notes || ""); setSexo(editingFighter.sexo || "M"); setErrors({}); } }, [editingFighter]);
  useEffect(() => () => clearTimeout(addedTimerRef.current), []);

  const parsedWeight = parseFloat(weightStr); const weightCategory = !isNaN(parsedWeight) && parsedWeight > 0 ? getWeightCategory(parsedWeight) : null; const categoryInfo = weightCategory ? getCategoryInfo(weightCategory) : null;
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
    // El campo de teléfono se quitó del formulario; se conserva el valor ya
    // guardado al editar peleadores antiguos que lo tenían.
    onSubmit({ id: editingFighter?.id || genId(), fullName: name, phone: editingFighter?.phone || "", sexo, gym: gym.trim().replace(/\s+/g, " "), age: parseInt(ageStr), weightKg: parsedWeight, weightCategory, experienceLevel, fightCount: parsedFightCount, createdAt: editingFighter?.createdAt || new Date().toISOString(), notes: notes.trim() || undefined });
    if (!editingFighter) {
      setFullName(""); setGym(""); setAgeStr(""); setWeightStr(""); setFightCountStr("0"); setNotes(""); setErrors({});
      setAddedName(name);
      clearTimeout(addedTimerRef.current);
      addedTimerRef.current = setTimeout(() => setAddedName(null), 4000);
      // El scroll vive en el <main> de la app (no en window), así que se
      // sube al inicio del formulario para que la confirmación quede visible.
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  const ic = "w-full px-3 py-2.5 bg-black border border-boxing-lineBright rounded-none text-boxing-cream placeholder-boxing-muted focus:outline-none focus:border-boxing-goldDim focus:bg-boxing-raised text-base transition-colors";
  const lbl = "block text-[10px] font-semibold text-boxing-muted mb-1.5 tracking-[0.3em] uppercase";
  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4 bg-boxing-panel border border-boxing-line p-5">
      <h2 className="flex items-center gap-3 text-boxing-cream" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "26px", letterSpacing: "0.05em" }}>
        <span style={{ width: "4px", height: "26px", background: "#c42438", display: "block", flexShrink: 0 }} />
        {editingFighter ? "Editar" : "Agregar"} Peleador
      </h2>
      {addedName && <div className="bg-green-900/20 border border-green-500/40 px-3 py-2.5 fade-in flex items-center gap-2">
        <span className="text-green-400 text-lg">✓</span>
        <span className="text-green-400 text-sm font-semibold">{addedName} fue agregado correctamente a la cartelera</span>
      </div>}
      <div><label className={lbl}>Nombre</label><input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Juan Pérez" maxLength={60} className={ic} />{errors.fullName && <p className="text-red-400 text-xs mt-1">{errors.fullName}</p>}</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Peso (kg)</label><input type="number" value={weightStr} onChange={e => setWeightStr(e.target.value)} placeholder="68.5" step="0.1" className={ic} />{errors.weightStr && <p className="text-red-400 text-xs mt-1">{errors.weightStr}</p>}</div>
        <div><label className={lbl}>Edad</label><input type="number" value={ageStr} onChange={e => setAgeStr(e.target.value)} placeholder="25" className={ic} />{errors.ageStr && <p className="text-red-400 text-xs mt-1">{errors.ageStr}</p>}</div>
      </div>
      {categoryInfo && <div className="bg-black px-3 py-2 border border-boxing-line fade-in"><span className="text-xs text-boxing-muted tracking-widest uppercase">Categoría: </span><span className="text-boxing-goldFight font-semibold">{categoryInfo.label}</span></div>}
      <div><label className={lbl}>Escuela / Gimnasio</label><input type="text" value={gym} onChange={e => setGym(e.target.value)} placeholder="Barrio Franklin" maxLength={60} className={ic} />{errors.gym && <p className="text-red-400 text-xs mt-1">{errors.gym}</p>}</div>
      <div><label className={lbl}>Sexo</label><div className="flex gap-2">
        <button type="button" onClick={() => setSexo("M")} className={"flex-1 py-2.5 text-sm font-bold border tracking-widest uppercase transition-colors " + (sexo === "M" ? "bg-blue-600/15 border-blue-500 text-blue-300" : "bg-black border-boxing-lineBright text-boxing-muted")}>Masculino</button>
        <button type="button" onClick={() => setSexo("F")} className={"flex-1 py-2.5 text-sm font-bold border tracking-widest uppercase transition-colors " + (sexo === "F" ? "bg-pink-600/15 border-pink-500 text-pink-300" : "bg-black border-boxing-lineBright text-boxing-muted")}>Femenino</button>
      </div></div>
      <div><label className={lbl}>Nº peleas</label><input type="number" value={fightCountStr} onChange={e => setFightCountStr(e.target.value)} placeholder="0" min="0" className={ic} /></div>
      {experienceInfo && <div className="bg-black px-3 py-2 border border-boxing-line flex items-center gap-2 fade-in"><span className="text-xs text-boxing-muted tracking-widest uppercase">Nivel: </span><Badge color={experienceInfo.color}>{experienceInfo.label}</Badge></div>}
      <div><label className={lbl}>Notas</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Zurdo, buen juego de pies..." rows={2} className={ic + " resize-none"} /></div>
      <div className="flex gap-3 pt-2"><button type="submit" className="flex-1 bg-boxing-crimson hover:bg-boxing-crimsonLight text-boxing-cream py-3.5 transition-colors active:scale-[0.98]" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "20px", letterSpacing: "0.1em" }}>{editingFighter ? "Guardar" : "+ Añadir al Cartel"}</button>{editingFighter && onCancel && <button type="button" onClick={onCancel} className="px-4 py-3.5 bg-black border border-boxing-lineBright text-boxing-muted tracking-widest uppercase text-sm">Cancelar</button>}</div>
    </form>
  );
}
