import { useState } from "react";
import { buildEventLabels } from "../lib/eventDates.js";

// ============================================
// DATOS DEL EVENTO — título y las dos fechas
// ============================================
// Antes esto era un prompt() con una sola línea de texto libre, y las fechas
// REALES (las que salen en la cartelera, en las llaves y en los impresos) ni
// siquiera estaban ahí: vivían escritas en el código, así que montar la próxima
// velada exigía tocar el repositorio y desplegar. Acá se editan las tres cosas
// juntas, con la vista previa de cómo va a quedar la fecha escrita.
//
// Las fechas solo las cambia el DUEÑO: la regla de la base rechaza esa
// escritura al staff, y una fecha movida por error desde el teléfono de la
// puerta a mitad del evento se propagaría a todos los dispositivos.
export default function EventSettingsDialog({ label, dates, org = "", isOwner, onSave, onClose }) {
  const [titulo, setTitulo] = useState(label || "");
  const [semis, setSemis] = useState(dates.semis);
  const [final, setFinal] = useState(dates.final);
  const [organizadores, setOrganizadores] = useState(org || "");

  // Vista previa en vivo: se ve la frase exacta que va a salir en la cartelera
  // antes de guardar (los inputs de fecha muestran "01-08-2026" según el
  // sistema, que no es lo que lee el público en la planilla).
  const preview = buildEventLabels({ semis, final });
  const unSoloDia = semis === final;
  const alReves = final < semis;
  const puedeGuardar = !!titulo.trim();

  function guardar() {
    if (!puedeGuardar) return;
    onSave({ label: titulo.trim(), dates: { semis, final }, org: organizadores.trim() });
    onClose();
  }

  const lbl = "block text-[14px] font-semibold text-[rgba(200,160,74,0.55)] mb-1.5 tracking-[0.22em] uppercase";
  const ic = "w-full px-3 py-2.5 input-ink text-base";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      {/* max-h + scroll: con el campo de organizadores el diálogo ya no cabe
          entero en un teléfono chico, y sin esto los botones Cancelar/Guardar
          quedaban fuera de la pantalla. */}
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-boxing-panel border border-boxing-goldDim/50 rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-boxing-line">
          <p className="text-boxing-cream font-bold" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", letterSpacing: "0.05em" }}>Datos del evento</p>
          <p className="text-[14px] text-boxing-muted">El título, quién organiza y las fechas que salen en la cartelera y en las llaves</p>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className={lbl}>Título del evento</label>
            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={80} placeholder="La Velada — 3ª edición" className={ic} />
            {!puedeGuardar && <p className="text-red-400 text-sm mt-1">Ponle un título al evento.</p>}
          </div>

          {/* Quién organiza ESTA edición. Vacío es una respuesta válida: la
              línea desaparece de la cabecera, del acceso y de la hoja de
              cierre. Antes iba escrito en el código, así que la app anunciaba
              para siempre a los organizadores de la primera velada. */}
          <div>
            <label className={lbl}>Organizadores</label>
            <input type="text" value={organizadores} disabled={!isOwner} onChange={e => setOrganizadores(e.target.value)} maxLength={60} placeholder="Club o clubes que organizan (opcional)" className={ic + (isOwner ? "" : " opacity-50")} />
            <p className="text-[14px] text-boxing-muted mt-1">Sale arriba de la marca, en el acceso y en la hoja de cierre. Déjalo vacío y no aparece.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Semifinales</label>
              <input type="date" value={semis} disabled={!isOwner} onChange={e => e.target.value && setSemis(e.target.value)} className={ic + (isOwner ? "" : " opacity-50")} />
            </div>
            <div>
              <label className={lbl}>Final</label>
              <input type="date" value={final} disabled={!isOwner} onChange={e => e.target.value && setFinal(e.target.value)} className={ic + (isOwner ? "" : " opacity-50")} />
            </div>
          </div>

          {!isOwner && <p className="text-[14px] text-boxing-muted">Solo el organizador puede cambiar las fechas y los organizadores. El título sí lo puedes editar.</p>}

          {/* Avisos honestos, no bloqueos: una velada de un solo día es válida
              (semifinales y final la misma noche), y el orden invertido casi
              siempre es un dedazo — pero la última palabra la tiene quien organiza. */}
          {isOwner && unSoloDia && <p className="text-[14px] text-boxing-goldFight">Las semifinales y la final quedan el MISMO día.</p>}
          {isOwner && alReves && <p className="text-[14px] text-red-400">Ojo: la final quedó ANTES que las semifinales.</p>}

          <div className="rounded-2xl border border-boxing-line px-3 py-2.5 bg-black/25">
            <p className={lbl + " mb-1"}>Así se va a ver</p>
            {organizadores.trim() && <p className="text-boxing-muted text-[14px] tracking-[0.2em] uppercase mb-1">{organizadores.trim()}</p>}
            {/* first-letter (y no `capitalize`): la fecha se escribe como una
                frase —"Sábado 01 y domingo 02 de agosto"—, no con Cada Palabra
                En Mayúscula. Es la misma regla que usa la cartelera. */}
            <p className="text-boxing-cream text-sm first-letter:uppercase leading-relaxed">{preview.rango}</p>
            <p className="text-[14px] text-boxing-muted mt-1">Llaves: semifinales {preview.semiAbbr} · final {preview.finalAbbr}</p>
          </div>
        </div>

        <div className="flex gap-2 p-3 border-t border-boxing-line">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-boxing-line text-boxing-muted hover:text-boxing-cream text-sm font-bold tracking-[0.14em] uppercase transition-colors">Cancelar</button>
          <button onClick={guardar} disabled={!puedeGuardar} className="btn-gold flex-1 py-2.5 text-sm font-bold tracking-[0.14em] uppercase disabled:opacity-40">Guardar</button>
        </div>
      </div>
    </div>
  );
}
