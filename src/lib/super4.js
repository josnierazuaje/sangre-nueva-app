import { genId, getAgeCategory } from "../constants.js";
import { dupKey } from "./dedup.js";

// ============================================
// TORNEO SUPER 4 — llaves de 4 atletas por cinturón
// Semifinales el sábado 01 y final el domingo 02. Las categorías en
// disputa salen del afiche oficial del campeonato de novatos.
// ============================================

// Filtra un grupo de peleadores por número MÁXIMO de peleas: deja solo a los
// que tienen esa cantidad o menos (ej. maxFights=3 = hasta 3 peleas).
// maxFights null/ausente = sin tope (todos).
export function filterByMaxFights(fighters, maxFights) {
  if (maxFights == null) return fighters || [];
  return (fighters || []).filter(f => (Number(f.fightCount) || 0) <= maxFights);
}

// Devuelve el tope de peleas con que se armó una llave. Las llaves nuevas lo
// guardan como número (maxFights); las viejas (antes de este cambio) lo
// guardaban como nivel de experiencia (maxExpKey), que se convierte aquí a
// su número de peleas máximo para no perder el tope tras actualizar la app.
const LEGACY_TIER_MAXFIGHTS = { debutante: 0, principiante: 3, amateur: 10, profesional: null };
export function bracketMaxFights(b) {
  if (!b) return null;
  if (typeof b.maxFights === "number") return b.maxFights;
  if (b.maxExpKey) return LEGACY_TIER_MAXFIGHTS[b.maxExpKey] ?? null;
  return null;
}
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
export function buildSuper4Brackets(fighters, maxFights = null) {
  // Tope de peleas: solo entran a la llave los peleadores hasta esa cantidad
  // de peleas (ej. novatos = hasta 3). Se guarda en cada llave para que los
  // reemplazos (botón ✕) respeten el mismo tope.
  const pool = filterByMaxFights(fighters, maxFights);
  const usedIds = new Set();
  const usedPersons = new Set();
  // Identidad de persona = la misma clave que usa la deduplicación
  // (nombre+sexo+peso), para no fusionar por error a dos atletas distintos
  // que comparten nombre pero pelean en pesos distintos.
  const person = dupKey;
  const byKey = {};
  const faltantes = [];
  for (const key of PROCESS_ORDER) {
    const cat = SUPER4_CATEGORIES.find(c => c.key === key);
    const seenPersons = new Set();
    const eligibles = eligibleForCategory(cat, pool).filter(f => {
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
      maxFights: maxFights == null ? null : maxFights,
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

// Reemplaza al peleador de un cupo de semifinal (lado "red" o "blue") por
// otro (newFid). Como el enfrentamiento cambia, el ganador de esa semi se
// limpia (nadie ganó todavía el nuevo cruce), y si con eso cambia un
// finalista, el campeón de la final deja de ser válido y también se limpia.
export function replaceFighter(brackets, bracketId, semiIndex, lado, newFid) {
  return (brackets || []).map(b => {
    if (b.id !== bracketId) return b;
    const semis = b.semis.map((s, i) => {
      if (i !== semiIndex) return s;
      return { ...s, [lado]: newFid, winner: null };
    });
    const finalistas = [semis[0].winner, semis[1].winner];
    const finalWinner = (finalistas[0] && finalistas[1] && finalistas.includes(b.finalWinner)) ? b.finalWinner : null;
    return { ...b, semis, finalWinner };
  });
}

// Atletas que pueden entrar a reemplazar a alguien en una llave: elegibles
// para esa categoría, dentro del mismo tope de peleas con que se armó la
// llave (maxFights), y que NO están ya en ninguna llave (ni por id ni por
// persona, para no duplicar a nadie). `catKey` identifica la categoría.
export function availableReplacements(catKey, fighters, brackets, maxFights = null) {
  const cat = SUPER4_CATEGORIES.find(c => c.key === catKey);
  if (!cat) return [];
  const pool = filterByMaxFights(fighters, maxFights);
  const byId = {};
  (fighters || []).forEach(f => { byId[f.id] = f; });
  const person = dupKey; // misma identidad que la deduplicación (ver buildSuper4Brackets)
  const usedIds = new Set();
  const usedPersons = new Set();
  (brackets || []).forEach(b => (b.semis || []).forEach(s => {
    ["red", "blue"].forEach(lado => {
      const id = s[lado];
      if (id == null) return;
      usedIds.add(id);
      const f = byId[id];
      if (f) usedPersons.add(person(f));
    });
  }));
  return eligibleForCategory(cat, pool).filter(f => !usedIds.has(f.id) && !usedPersons.has(person(f)));
}
