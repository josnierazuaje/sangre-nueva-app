import { genId, getAgeCategory, getWeightCategory, weightRangeLabel, WEIGHT_CATEGORIES, AGE_CATEGORIES } from "../constants.js";
import { dupKey } from "./dedup.js";

// Divisiones de peso oficiales (World Boxing) disponibles para el Super 4:
// las 10 masculinas y las 10 femeninas, en su orden de peso. El género va
// implícito en la clave de la división (m_* / f_*).
export const ALL_DIVISION_KEYS = WEIGHT_CATEGORIES.map(d => d.key);
const AGE_ORDER = ["escolar", "cadete", "juvenil", "adulto"];

// Peleadores elegibles para una llave (edad × división): misma categoría de
// edad World Boxing y misma división de peso oficial. La división ya lleva el
// sexo (getWeightCategory usa la lista del género del atleta), así que un
// atleta nunca cae en una división del otro sexo.
export function eligibleForDivision(ageKey, divKey, fighters) {
  return (fighters || []).filter(f => {
    const w = Number(f.weightKg);
    if (!Number.isFinite(w)) return false;
    if (getAgeCategory(f.age).key !== ageKey) return false;
    return getWeightCategory(f.weightKg, f.sexo) === divKey;
  });
}

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
// categoría de edad World Boxing, mismo sexo y dentro del límite de peso.
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
// Categorías de edad (World Boxing) que el Super 4 ofrece por defecto. Sirven
// para el filtro "qué categorías de edad participan".
export const SUPER4_AGE_KEYS = [...new Set(SUPER4_CATEGORIES.map(c => c.ageKey))];

// Valor de orden de una llave para mostrarlas ordenadas por edad y peso.
// Funciona tanto con las llaves nuevas (clave "edad__division") como con las
// viejas de cinturón (cadete71, adulto67…), para no romper el orden durante
// la transición.
function bracketSortValue(b) {
  let ageKey, wSort = 0, gBump = 0;
  if (b.catKey && b.catKey.includes("__")) {
    const [ak, dk] = b.catKey.split("__");
    ageKey = ak;
    const div = WEIGHT_CATEGORIES.find(d => d.key === dk);
    wSort = div ? div.minWeight : 0;
    gBump = div && div.genero === "F" ? 1000 : 0;
  } else {
    const cat = SUPER4_CATEGORIES.find(c => c.key === b.catKey);
    ageKey = cat ? cat.ageKey : (b.ageKey || "");
    wSort = cat ? (cat.minKg != null ? cat.minKg : cat.maxKg || 0) : 0;
  }
  const ai = AGE_ORDER.indexOf(ageKey);
  // gBump (1000) separa M antes que F DENTRO de la misma edad sin cruzar la
  // banda de la edad siguiente (un escalón de edad = 100000).
  return (ai < 0 ? 99 : ai) * 100000 + gBump + wSort;
}
function sortBrackets(list) {
  return [...list].sort((a, b) => bracketSortValue(a) - bracketSortValue(b));
}

// Genera las llaves por combinación (categoría de edad × división de peso
// oficial) para las que hay 4 o más elegibles. Como getAgeCategory y
// getWeightCategory son deterministas, cada atleta cae en exactamente UNA
// combinación, así que no hay solape entre llaves. Parámetros:
//   maxFights: tope de peleas (null = sin tope).
//   ageKeys: categorías de edad que participan (null = las de SUPER4_AGE_KEYS).
//   divisionKeys: divisiones de peso que participan (null = todas).
// Solo se reportan como "faltantes" las combinaciones que tienen entre 1 y 3
// elegibles (las de 0 se omiten para no listar decenas de combinaciones vacías).
export function buildSuper4Brackets(fighters, maxFights = null, ageKeys = null, divisionKeys = null, reservedPersons = null) {
  const pool = filterByMaxFights(fighters, maxFights);
  // null = todas (por defecto); [] = ninguna (nada que armar). Así el filtro
  // vacío no cae por error a "todas".
  const ages = (ageKeys == null ? SUPER4_AGE_KEYS : ageKeys)
    .slice().sort((a, b) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b));
  const divKeys = (divisionKeys == null ? ALL_DIVISION_KEYS : divisionKeys)
    .slice().sort((a, b) => ALL_DIVISION_KEYS.indexOf(a) - ALL_DIVISION_KEYS.indexOf(b));
  const person = dupKey;
  const brackets = [];
  const faltantes = [];
  for (const ageKey of ages) {
    const ageInfo = AGE_CATEGORIES.find(a => a.key === ageKey);
    if (!ageInfo) continue;
    for (const divKey of divKeys) {
      const div = WEIGHT_CATEGORIES.find(d => d.key === divKey);
      if (!div) continue;
      const seenPersons = new Set();
      const eligibles = eligibleForDivision(ageKey, divKey, pool).filter(f => {
        // No re-elegir a quien ya está comprometido en una llave que se
        // conservará (cinturón viejo u otra combinación no regenerada): evita
        // que el mismo peleador quede en dos llaves a la vez.
        if (reservedPersons && reservedPersons.has(person(f))) return false;
        if (seenPersons.has(person(f))) return false; // homónimos (misma identidad) no duplican cupo
        seenPersons.add(person(f));
        return true;
      });
      const catKey = ageKey + "__" + divKey;
      const gen = div.genero === "F" ? "F" : "M";
      const catLabel = `${ageInfo.label} · ${div.label} (${gen})`;
      const regla = `${ageInfo.label} (${ageInfo.minAge}-${ageInfo.maxAge}) · ${div.label} ${weightRangeLabel(div)} · ${gen === "F" ? "Femenino" : "Masculino"}`;
      if (eligibles.length < 4) {
        if (eligibles.length > 0) faltantes.push({ catKey, catLabel, regla, elegibles: eligibles.length, faltan: 4 - eligibles.length });
        continue;
      }
      const four = [...eligibles].sort((a, b) => b.weightKg - a.weightKg).slice(0, 4);
      const [semi1, semi2] = pairSemis(four);
      brackets.push({
        id: genId(),
        catKey, catLabel, regla, ageKey, divKey,
        semis: [
          { red: semi1[0].id, blue: semi1[1].id, winner: null },
          { red: semi2[0].id, blue: semi2[1].id, winner: null },
        ],
        finalWinner: null,
        maxFights: maxFights == null ? null : maxFights,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return { brackets: sortBrackets(brackets), faltantes };
}

// Fusiona las llaves recién regeneradas con las existentes que NO se
// regeneraron (distinta combinación): regenerar un subconjunto nunca borra
// ni pisa las demás (ni sus campeones ya coronados). Para quitar categorías
// está "Limpiar llaves". Conserva las llaves viejas de cinturón que el nuevo
// sistema de divisiones no reemplaza.
export function mergeRegenerated(existing, regenerated) {
  const regenKeys = new Set((regenerated || []).map(b => b.catKey));
  const conservadas = (existing || []).filter(b => !regenKeys.has(b.catKey));
  return sortBrackets([...(regenerated || []), ...conservadas]);
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
// persona, para no duplicar a nadie). `catKey` identifica la categoría: si es
// del formato "edad__division" usa el nuevo sistema; si no, es una llave
// vieja de cinturón (compatibilidad con las llaves ya generadas).
export function availableReplacements(catKey, fighters, brackets, maxFights = null) {
  const pool = filterByMaxFights(fighters, maxFights);
  let eligible;
  if (catKey && catKey.includes("__")) {
    const [ageKey, divKey] = catKey.split("__");
    eligible = eligibleForDivision(ageKey, divKey, pool);
  } else {
    const cat = SUPER4_CATEGORIES.find(c => c.key === catKey);
    if (!cat) return [];
    eligible = eligibleForCategory(cat, pool);
  }
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
  return eligible.filter(f => !usedIds.has(f.id) && !usedPersons.has(person(f)));
}
