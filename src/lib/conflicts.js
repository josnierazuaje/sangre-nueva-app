import { getAgeCategory } from "../constants.js";
import { experienceOk } from "./matchmaking.js";

// Revisión EN VIVO de las peleas ya guardadas contra las reglas duras
// vigentes. Los emparejamientos guardan sus advertencias congeladas al
// momento de crearse; esto se recalcula con los datos ACTUALES para detectar
// peleas que quedaron inválidas después de armarse: el atleta entró al
// Super 4, le corrigieron el récord / la escuela / la edad, o su rival fue
// eliminado de la lista de peleadores.
export function matchupConflicts(matchups, fighters, super4Ids) {
  const byId = {};
  fighters.forEach(f => { byId[f.id] = f; });
  const out = { huerfanas: [], super4: [], edadMixta: [], mismaEscuela: [], experiencia: [] };
  matchups.forEach(m => {
    const r = byId[m.fighterRedId], b = byId[m.fighterBlueId];
    if (!r || !b) {
      const vivo = r || b;
      out.huerfanas.push({ n: m.roundNumber, id: m.id, texto: `Pelea ${m.roundNumber}: ${vivo ? vivo.fullName : "(ambos eliminados)"} — su rival ya no está en la lista de peleadores` });
      return;
    }
    const enS4 = [r, b].filter(f => super4Ids.has(f.id)).map(f => f.fullName);
    if (enS4.length) out.super4.push({ n: m.roundNumber, id: m.id, texto: `Pelea ${m.roundNumber}: ${enS4.join(" y ")} ya está${enS4.length > 1 ? "n" : ""} en el Super 4` });
    const c1 = getAgeCategory(r.age), c2 = getAgeCategory(b.age);
    if (c1.key !== c2.key) out.edadMixta.push({ n: m.roundNumber, id: m.id, texto: `Pelea ${m.roundNumber}: ${r.fullName} (${c1.label}, ${r.age}a) vs ${b.fullName} (${c2.label}, ${b.age}a)` });
    if ((r.gym || "").trim().toLowerCase() === (b.gym || "").trim().toLowerCase()) out.mismaEscuela.push({ n: m.roundNumber, id: m.id, texto: `Pelea ${m.roundNumber}: ${r.fullName} vs ${b.fullName} — ${r.gym}` });
    if (!experienceOk(r, b)) out.experiencia.push({ n: m.roundNumber, id: m.id, texto: `Pelea ${m.roundNumber}: ${r.fullName} (${r.fightCount || 0} peleas) vs ${b.fullName} (${b.fightCount || 0} peleas)` });
  });
  out.total = out.huerfanas.length + out.super4.length + out.edadMixta.length + out.mismaEscuela.length + out.experiencia.length;
  // Las peleas IMPOSIBLES (rival eliminado / atleta en el Super 4) no admiten
  // criterio humano: se pueden quitar de un toque. El resto (edad, escuela,
  // experiencia) queda listado para decisión del organizador, porque pudo
  // haberse creado a mano con confirmación.
  out.removibles = [...new Set([...out.huerfanas, ...out.super4].map(x => x.id))];
  return out;
}
