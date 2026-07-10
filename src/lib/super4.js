import { genId, getAgeCategory } from "../constants.js";
import { normName } from "./dedup.js";

// ============================================
// TORNEO SUPER 4 — llaves de 4 atletas por cinturón
// Semifinales el sábado 01 y final el domingo 02. Las categorías en
// disputa salen del afiche oficial del campeonato de novatos.
// ============================================
export const SUPER4_CATEGORIES = [
  { key: "cadete71", label: "Cadetes 71kg", ageKey: "cadete", maxKg: 71, sexo: "M", regla: "Cadete (15-16) · hasta 71kg" },
  { key: "juvenil81", label: "Juvenil 81kg", ageKey: "juvenil", maxKg: 81, sexo: "M", regla: "Juvenil (17-18) · hasta 81kg" },
  { key: "adulto67", label: "Adulto Masculino 67kg", ageKey: "adulto", maxKg: 67, sexo: "M", regla: "Adulto (19-40) · hasta 67kg" },
  { key: "adulto60", label: "Adulto Masculino 60kg", ageKey: "adulto", maxKg: 60, sexo: "M", regla: "Adulto (19-40) · hasta 60kg" },
  { key: "adulto92", label: "Adulto Masculino +92kg", ageKey: "adulto", minKg: 92, sexo: "M", regla: "Adulto (19-40) · desde 92kg" },
];

// Peleadores que cumplen la regla de una categoría del torneo: misma
// categoría de edad FECHIBOX, mismo sexo y dentro del límite de peso.
export function eligibleForCategory(cat, fighters) {
  return (fighters || []).filter(f => {
    if ((f.sexo || "M") !== cat.sexo) return false;
    if (getAgeCategory(f.age).key !== cat.ageKey) return false;
    const w = Number(f.weightKg);
    if (!Number.isFinite(w)) return false;
    if (cat.maxKg != null && w > cat.maxKg) return false;
    if (cat.minKg != null && w < cat.minKg) return false;
    return true;
  });
}

// Elige los 4 más cercanos al límite de la categoría (más parejos entre sí
// y más representativos del cinturón en disputa).
export function pickFour(cat, eligibles) {
  const sorted = [...eligibles].sort((a, b) => cat.minKg != null
    ? a.weightKg - b.weightKg   // +92: los más cercanos a 92 desde arriba
    : b.weightKg - a.weightKg); // hasta X: los más cercanos al límite desde abajo
  return sorted.slice(0, 4);
}

// Arma las dos semifinales evitando (si se puede) que se crucen compañeros
// de la misma escuela en la primera ronda, y minimizando la diferencia de
// peso dentro de cada pelea.
export function pairSemis(four) {
  const [a, b, c, d] = four;
  const options = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
  const gym = f => (f.gym || "").trim().toLowerCase();
  const score = pairs => pairs.reduce((s, [x, y]) =>
    s + (gym(x) === gym(y) ? 100 : 0) + Math.abs(x.weightKg - y.weightKg), 0);
  options.sort((p, q) => score(p) - score(q));
  return options[0];
}

// Genera todas las llaves posibles con los peleadores registrados. Un mismo
// atleta nunca queda en dos llaves (las categorías de adultos se solapan en
// peso: alguien de 58kg califica para 60 y para 67), y la misma persona
// registrada dos veces (duplicado que la dedup aún no atrapó, ej. con pesos
// levemente distintos) nunca ocupa dos cupos de la misma llave. Las
// categorías con solape de peso se procesan de la más liviana a la más
// pesada (60 antes que 67) para que la llave pesada no "robe" al atleta que
// completaba la liviana. Devuelve también las categorías que no se pudieron
// armar por falta de elegibles.
const PROCESS_ORDER = ["cadete71", "juvenil81", "adulto60", "adulto67", "adulto92"];
export function buildSuper4Brackets(fighters) {
  const usedIds = new Set();
  const usedPersons = new Set();
  const person = f => normName(f.fullName) + "|" + (f.sexo || "M");
  const byKey = {};
  const faltantes = [];
  for (const key of PROCESS_ORDER) {
    const cat = SUPER4_CATEGORIES.find(c => c.key === key);
    const seenPersons = new Set();
    const eligibles = eligibleForCategory(cat, fighters).filter(f => {
      if (usedIds.has(f.id) || usedPersons.has(person(f)) || seenPersons.has(person(f))) return false;
      seenPersons.add(person(f));
      return true;
    });
    if (eligibles.length < 4) {
      faltantes.push({ catKey: cat.key, catLabel: cat.label, regla: cat.regla, elegibles: eligibles.length, faltan: 4 - eligibles.length });
      continue;
    }
    const four = pickFour(cat, eligibles);
    four.forEach(f => { usedIds.add(f.id); usedPersons.add(person(f)); });
    const [semi1, semi2] = pairSemis(four);
    byKey[cat.key] = {
      id: genId(),
      catKey: cat.key,
      catLabel: cat.label,
      regla: cat.regla,
      semis: [
        { red: semi1[0].id, blue: semi1[1].id, winner: null },
        { red: semi2[0].id, blue: semi2[1].id, winner: null },
      ],
      finalWinner: null,
      createdAt: new Date().toISOString(),
    };
  }
  // Las llaves se muestran en el orden del afiche, no en el de procesamiento.
  const brackets = SUPER4_CATEGORIES.filter(c => byKey[c.key]).map(c => byKey[c.key]);
  return { brackets, faltantes };
}

// Marca (o desmarca, si se vuelve a tocar) al ganador de una semifinal.
// Cualquier cambio en los finalistas invalida el resultado de la final (la
// final que se disputó ya no es la misma), así que el campeón se limpia.
export function setSemiWinner(brackets, bracketId, semiIndex, fighterId) {
  return (brackets || []).map(b => {
    if (b.id !== bracketId) return b;
    const semis = b.semis.map((s, i) => {
      if (i !== semiIndex) return s;
      return { ...s, winner: s.winner === fighterId ? null : fighterId };
    });
    const cambiaronFinalistas = semis.some((s, i) => s.winner !== b.semis[i].winner);
    const finalWinner = cambiaronFinalistas ? null : (b.finalWinner ?? null);
    return { ...b, semis, finalWinner };
  });
}

// Marca (o desmarca) al campeón en la final. Solo válido entre los dos
// ganadores de semifinal, y solo cuando AMBAS semifinales ya se decidieron
// (con una sola decidida la final aún no existe — no se puede coronar).
export function setFinalWinner(brackets, bracketId, fighterId) {
  return (brackets || []).map(b => {
    if (b.id !== bracketId) return b;
    const finalistas = [b.semis[0].winner, b.semis[1].winner];
    if (!finalistas[0] || !finalistas[1]) return b;
    if (!finalistas.includes(fighterId)) return b;
    return { ...b, finalWinner: b.finalWinner === fighterId ? null : fighterId };
  });
}
