import { genId, getCategoryInfo, getExperienceInfo, getAgeCategory, getWeightCategory } from "../constants.js";

// Dos atletas de la misma escuela/gimnasio no pueden emparejarse (entrenan
// juntos). Comparación tolerante a mayúsculas y espacios. Es una regla DURA en
// el emparejamiento automático y el sorteo (no solo una advertencia).
function sameGym(a, b) {
  return (a.gym || "").trim().toLowerCase() === (b.gym || "").trim().toLowerCase();
}

// Diferencia máxima de peleas entre rivales (regla DURA de seguridad): un
// atleta no puede cruzarse con otro que le lleve más de MAX_FIGHT_DIFF peleas
// de experiencia. Única excepción: si AMBOS son pro avanzados (PRO_FIGHTS+
// peleas), donde el cruce ya no importa. Así, un principiante de 3 peleas
// nunca se empareja con un peleador de 15.
const MAX_FIGHT_DIFF = 3;
const PRO_FIGHTS = 15;
export function experienceOk(a, b) {
  const fa = a.fightCount || 0, fb = b.fightCount || 0;
  if (Math.abs(fa - fb) <= MAX_FIGHT_DIFF) return true;
  return fa >= PRO_FIGHTS && fb >= PRO_FIGHTS;
}

// ============================================
// MATCHMAKING ALGORITHM
// ============================================
export function analyzeMatch(f1, f2) {
  const w = [];
  const wd = Math.abs(f1.weightKg - f2.weightKg);
  const cat = getCategoryInfo(f1.weightCategory);
  const tol = cat?.tolerance || 3;
  if (f1.weightCategory !== f2.weightCategory) w.push({ type: "weight", severity: "high", message: `Categorías distintas: ${getCategoryInfo(f1.weightCategory)?.label} vs ${getCategoryInfo(f2.weightCategory)?.label}` });
  else if (wd > tol * 2) w.push({ type: "weight", severity: "high", message: `Δ${wd.toFixed(1)}kg — diferencia excesiva (tol: ${tol}kg)` });
  else if (wd > tol) w.push({ type: "weight", severity: "medium", message: `Δ${wd.toFixed(1)}kg (tol: ${tol}kg)` });
  if (f1.experienceLevel !== f2.experienceLevel) {
    const lvls = ["debutante", "principiante", "amateur", "profesional"];
    const diff = Math.abs(lvls.indexOf(f1.experienceLevel) - lvls.indexOf(f2.experienceLevel));
    if (diff >= 2) w.push({ type: "experience", severity: "high", message: `${getExperienceInfo(f1.experienceLevel)?.label} vs ${getExperienceInfo(f2.experienceLevel)?.label} - PELIGROSO` });
    else w.push({ type: "experience", severity: "medium", message: `Niveles: ${getExperienceInfo(f1.experienceLevel)?.label} vs ${getExperienceInfo(f2.experienceLevel)?.label}` });
  }
  if ((f1.sexo || "M") !== (f2.sexo || "M")) w.push({ type: "sexo", severity: "high", message: "Sexos distintos — NO EMPAREJAR" });
  // Rangos de edad oficiales World Boxing: las categorías no se pueden mezclar.
  const ac1 = getAgeCategory(f1.age), ac2 = getAgeCategory(f2.age);
  if (ac1.key !== ac2.key) w.push({ type: "age", severity: "high", message: `${ac1.label} (${f1.age}a) vs ${ac2.label} (${f2.age}a) — NO SE PUEDEN MEZCLAR (World Boxing)` });
  else if (Math.abs(f1.age - f2.age) > 10) w.push({ type: "age", severity: "medium", message: `Δ${Math.abs(f1.age - f2.age)} años de edad` });
  if ((f1.gym || "").toLowerCase() === (f2.gym || "").toLowerCase()) w.push({ type: "same_gym", severity: "low", message: `Misma escuela: ${f1.gym || ""}` });
  return w;
}

export function getScore(f1, f2) {
  let s = 100;
  if (f1.weightCategory !== f2.weightCategory) s -= 50;
  s -= Math.abs(f1.weightKg - f2.weightKg) * 3;
  const lvls = ["debutante", "principiante", "amateur", "profesional"];
  s -= Math.abs(lvls.indexOf(f1.experienceLevel) - lvls.indexOf(f2.experienceLevel)) * 25;
  if ((f1.gym || "").toLowerCase() === (f2.gym || "").toLowerCase()) s -= 15;
  if ((f1.sexo || "M") !== (f2.sexo || "M")) s -= 100;
  if (getAgeCategory(f1.age).key !== getAgeCategory(f2.age).key) s -= 100;
  else s -= Math.max(0, Math.abs(f1.age - f2.age) - 6) * 2;
  return Math.max(0, Math.round(s));
}

export function autoMatchAll(fighters) {
  const used = new Set(); const matchups = [];
  const groups = {};
  fighters.forEach(f => { const k = (f.sexo || "M") + "_" + f.weightCategory + "_" + f.experienceLevel + "_" + getAgeCategory(f.age).key; if (!groups[k]) groups[k] = []; groups[k].push(f); });
  Object.values(groups).forEach(g => {
    g.sort((a, b) => a.weightKg - b.weightKg);
    for (let i = 0; i < g.length; i++) {
      if (used.has(g[i].id)) continue;
      const f1 = g[i];
      // Rival más cercano en peso que cumpla las reglas duras: otra escuela y
      // diferencia de peleas válida (edad/sexo/división ya son iguales en el grupo).
      let f2 = null;
      for (let j = i + 1; j < g.length; j++) {
        if (used.has(g[j].id)) continue;
        if (!sameGym(f1, g[j]) && experienceOk(f1, g[j])) { f2 = g[j]; break; }
      }
      if (!f2) continue; // sin rival válido en el grupo: queda para la fase de resto
      used.add(f1.id); used.add(f2.id);
      matchups.push({ id: genId(), fighterRedId: f1.id, fighterBlueId: f2.id, roundNumber: matchups.length + 1, warnings: analyzeMatch(f1, f2), createdAt: new Date().toISOString() });
    }
  });
  const rem = fighters.filter(f => !used.has(f.id)).sort((a, b) => a.weightKg - b.weightKg);
  for (let i = 0; i < rem.length; i++) {
    if (used.has(rem[i].id)) continue; let best = null, bs = -1;
    for (let j = i + 1; j < rem.length; j++) {
      if (used.has(rem[j].id)) continue;
      // Filtro duro: nunca mezclar categorías de edad World Boxing ni sexos distintos, sin excepción de puntaje.
      if (getAgeCategory(rem[i].age).key !== getAgeCategory(rem[j].age).key) continue;
      if ((rem[i].sexo || "M") !== (rem[j].sexo || "M")) continue;
      if (sameGym(rem[i], rem[j])) continue; // regla dura: nunca misma escuela
      if (!experienceOk(rem[i], rem[j])) continue; // regla dura: máx 3 peleas de diferencia (salvo ambos pro 15+)
      const sc = getScore(rem[i], rem[j]); if (sc > bs) { bs = sc; best = rem[j]; }
    }
    if (best && bs >= 30) {
      used.add(rem[i].id); used.add(best.id);
      matchups.push({ id: genId(), fighterRedId: rem[i].id, fighterBlueId: best.id, roundNumber: matchups.length + 1, warnings: analyzeMatch(rem[i], best), createdAt: new Date().toISOString() });
    }
  }
  return matchups;
}

// ============================================
// SORTEO ALEATORIO
// ============================================
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function sorteoMatch(fighters) {
  const used = new Set(); const matchups = [];
  const groups = {};
  fighters.forEach(f => { const k = (f.sexo || "M") + "_" + f.weightCategory + "_" + f.experienceLevel + "_" + getAgeCategory(f.age).key; if (!groups[k]) groups[k] = []; groups[k].push(f); });
  Object.values(groups).forEach(g => {
    const sh = shuffle(g.filter(f => !used.has(f.id)));
    for (let i = 0; i < sh.length; i++) {
      if (used.has(sh[i].id)) continue;
      const f1 = sh[i];
      // En orden aleatorio, el primer rival que cumpla las reglas duras (otra
      // escuela y diferencia de peleas válida).
      let f2 = null;
      for (let j = i + 1; j < sh.length; j++) {
        if (used.has(sh[j].id)) continue;
        if (!sameGym(f1, sh[j]) && experienceOk(f1, sh[j])) { f2 = sh[j]; break; }
      }
      if (!f2) continue;
      used.add(f1.id); used.add(f2.id);
      matchups.push({ id: genId(), fighterRedId: f1.id, fighterBlueId: f2.id, roundNumber: matchups.length + 1, warnings: analyzeMatch(f1, f2), createdAt: new Date().toISOString() });
    }
  });
  const rem = shuffle(fighters.filter(f => !used.has(f.id)));
  for (let i = 0; i < rem.length - 1; i += 2) {
    if (used.has(rem[i].id) || used.has(rem[i + 1].id)) continue;
    // Filtro duro: nunca mezclar categorías de edad World Boxing ni sexos distintos, sin excepción de puntaje.
    if (getAgeCategory(rem[i].age).key !== getAgeCategory(rem[i + 1].age).key) continue;
    if ((rem[i].sexo || "M") !== (rem[i + 1].sexo || "M")) continue;
    if (sameGym(rem[i], rem[i + 1])) continue; // regla dura: nunca misma escuela
    if (!experienceOk(rem[i], rem[i + 1])) continue; // regla dura: máx 3 peleas de diferencia (salvo ambos pro 15+)
    const sc = getScore(rem[i], rem[i + 1]);
    if (sc >= 20) {
      used.add(rem[i].id); used.add(rem[i + 1].id);
      matchups.push({ id: genId(), fighterRedId: rem[i].id, fighterBlueId: rem[i + 1].id, roundNumber: matchups.length + 1, warnings: analyzeMatch(rem[i], rem[i + 1]), createdAt: new Date().toISOString() });
    }
  }
  return matchups;
}

// ============================================
// EMPAREJAMIENTO ÓPTIMO — el "un solo botón"
// ============================================
// Fusiona lo mejor de Auto VS (emparejamiento JUSTO por peso/nivel/escuela) y
// del sorteo (probar MUCHOS ordenamientos). Genera varios repartos válidos —el
// determinista de Auto VS más N corridas aleatorias— y se queda con el MEJOR:
// primero el que empareja a MÁS atletas y, a igualdad, el más parejo (mayor
// puntaje total). Nunca relaja una regla dura ni el umbral de calidad de Auto
// VS, así que el resultado SIEMPRE empareja a tantos atletas como Auto VS (o
// más) y cada pelea es al menos igual de segura y pareja.
//
// Umbral de calidad de la fase "resto" (cruces entre grupos): idéntico al de
// autoMatchAll (Auto VS). No se baja al 20 del sorteo para no colar peleas de
// peor calidad de peso que las que Auto VS aceptaría.
const REST_MIN_SCORE = 30;

// Puntaje de un reparto completo: nº de peleas (cobertura) y suma de calidad.
function matchQuality(matchups, byId) {
  let score = 0;
  for (const m of matchups) score += getScore(byId[m.fighterRedId], byId[m.fighterBlueId]);
  return { pairs: matchups.length, score };
}

function pushPair(matchups, f1, f2) {
  matchups.push({ id: genId(), fighterRedId: f1.id, fighterBlueId: f2.id, roundNumber: matchups.length + 1, warnings: analyzeMatch(f1, f2), createdAt: new Date().toISOString() });
}

// Una corrida ALEATORIA con EXACTAMENTE las mismas reglas duras y el mismo
// umbral (30) que Auto VS, pero recorriendo a los atletas en orden aleatorio
// para explorar repartos distintos. Igual que autoMatchAll salvo que baraja los
// grupos en vez de ordenarlos por peso.
function randomMatchAll(fighters) {
  const used = new Set(); const matchups = [];
  const groups = {};
  fighters.forEach(f => { const k = (f.sexo || "M") + "_" + f.weightCategory + "_" + f.experienceLevel + "_" + getAgeCategory(f.age).key; if (!groups[k]) groups[k] = []; groups[k].push(f); });
  Object.values(groups).forEach(g => {
    const sh = shuffle(g);
    for (let i = 0; i < sh.length; i++) {
      if (used.has(sh[i].id)) continue;
      const f1 = sh[i];
      // Primer rival del grupo (mismo sexo/división/nivel/edad) que cumpla las
      // reglas duras restantes: otra escuela y diferencia de peleas válida.
      let f2 = null;
      for (let j = i + 1; j < sh.length; j++) {
        if (used.has(sh[j].id)) continue;
        if (!sameGym(f1, sh[j]) && experienceOk(f1, sh[j])) { f2 = sh[j]; break; }
      }
      if (!f2) continue;
      used.add(f1.id); used.add(f2.id);
      pushPair(matchups, f1, f2);
    }
  });
  const rem = shuffle(fighters.filter(f => !used.has(f.id)));
  for (let i = 0; i < rem.length; i++) {
    if (used.has(rem[i].id)) continue; let best = null, bs = -1;
    for (let j = i + 1; j < rem.length; j++) {
      if (used.has(rem[j].id)) continue;
      if (getAgeCategory(rem[i].age).key !== getAgeCategory(rem[j].age).key) continue; // regla dura: edad World Boxing
      if ((rem[i].sexo || "M") !== (rem[j].sexo || "M")) continue; // regla dura: sexo
      if (sameGym(rem[i], rem[j])) continue; // regla dura: nunca misma escuela
      if (!experienceOk(rem[i], rem[j])) continue; // regla dura: máx 3 peleas (salvo ambos pro 15+)
      const sc = getScore(rem[i], rem[j]); if (sc > bs) { bs = sc; best = rem[j]; }
    }
    if (best && bs >= REST_MIN_SCORE) { used.add(rem[i].id); used.add(best.id); pushPair(matchups, rem[i], best); }
  }
  return matchups;
}

// El "un solo botón": el reparto más justo posible. Toma como base el de Auto VS
// (determinista) y prueba `attempts` corridas aleatorias; se queda con el que
// empareja a más atletas y, a igualdad, con el más parejo. Como Auto VS entra
// como candidato, el resultado nunca empareja a menos atletas ni es menos justo
// que Auto VS.
export function bestMatchAll(fighters, attempts = 250) {
  const byId = {}; fighters.forEach(f => { byId[f.id] = f; });
  let best = autoMatchAll(fighters);
  let bestQ = matchQuality(best, byId);
  for (let i = 0; i < attempts; i++) {
    const cand = randomMatchAll(fighters);
    const q = matchQuality(cand, byId);
    if (q.pairs > bestQ.pairs || (q.pairs === bestQ.pairs && q.score > bestQ.score)) { best = cand; bestQ = q; }
  }
  // Renumerar por prolijidad (el ganador puede venir de una corrida aleatoria).
  return best.map((m, i) => ({ ...m, roundNumber: i + 1 }));
}

// ============================================
// EMPAREJAMIENTO FORZADO — la pestaña "Faltantes"
// ============================================
// Empareja OBLIGATORIAMENTE a los atletas que quedaron sin pelea, aunque el
// cruce rompa las reglas World Boxing / FECHIBOX. No es para armar la cartelera
// (para eso está bestMatchAll, que NUNCA rompe una regla): es el último recurso
// para que nadie se quede sin subir al ring, dejando cada incumplimiento
// escrito en rojo para que el organizador lo negocie o lo corrija.

// División de peso oficial recomputada desde peso+sexo (no se confía en el
// campo guardado, que en registros viejos puede traer una clave que ya no
// existe), igual que hace la planilla impresa.
function divisionInfo(f) {
  const kg = Number(f.weightKg);
  return Number.isFinite(kg) ? getCategoryInfo(getWeightCategory(kg, f.sexo)) : null;
}

// Condiciones que FALTARÍAN para que un cruce cumpla la norma. Devuelve una
// lista de textos claros, cada uno con el desajuste real entre paréntesis. Si
// la lista está vacía, el cruce SÍ es válido (no hubo que forzarlo). Es la
// explicación en rojo de una pelea forzada; la comparten la tarjeta VS y la
// planilla impresa para que nunca se desincronicen. El orden va de lo más grave
// (sexo, edad) a lo más leve (escuela).
export function forcedPairingReasons(a, b) {
  const out = [];
  const acA = getAgeCategory(a.age), acB = getAgeCategory(b.age);
  if ((a.sexo || "M") !== (b.sexo || "M")) {
    const s = x => (x.sexo || "M") === "F" ? "femenino" : "masculino";
    out.push(`mismo sexo (${s(a)} vs ${s(b)})`);
  }
  if (acA.key !== acB.key) {
    out.push(`misma categoría de edad World Boxing (${acA.label} · ${a.age}a vs ${acB.label} · ${b.age}a)`);
  } else if (acA.key === "infantil" || acA.key === "veterano") {
    // Coinciden de categoría, pero ambos están fuera del rango oficial 13-40.
    out.push(`edad dentro del rango oficial 13-40 (ambos ${acA.label})`);
  }
  const dA = divisionInfo(a), dB = divisionInfo(b);
  if (dA && dB && dA.key !== dB.key) {
    const wd = Math.abs(Number(a.weightKg) - Number(b.weightKg)).toFixed(1).replace(".", ",");
    out.push(`misma división de peso (${dA.label} vs ${dB.label}, dif. ${wd}kg)`);
  }
  if (!experienceOk(a, b)) {
    out.push(`diferencia de experiencia de máximo 3 peleas (${a.fightCount || 0} vs ${b.fightCount || 0})`);
  }
  if ((a.gym || "").trim().toLowerCase() === (b.gym || "").trim().toLowerCase()) {
    out.push(`escuelas distintas (ambos de ${(a.gym || "—").trim()})`);
  }
  return out;
}

// Penalización de un cruce forzado: 0 = ideal, más alto = peor. Ordena TODAS
// las parejas posibles para emparejar primero a las MENOS conflictivas y dejar
// los cruces más forzados (o el impar suelto) para el final. Cruzar sexos pesa
// muchísimo: solo ocurre si de verdad no queda alternativa del mismo sexo.
function pairPenalty(a, b) {
  let p = 0;
  const acA = getAgeCategory(a.age), acB = getAgeCategory(b.age);
  if ((a.sexo || "M") !== (b.sexo || "M")) p += 1000;
  if (acA.key !== acB.key) p += 300; else p += Math.max(0, Math.abs(a.age - b.age) - 6) * 2;
  if (acA.key === "infantil" || acA.key === "veterano" || acB.key === "infantil" || acB.key === "veterano") p += 40;
  const dA = divisionInfo(a), dB = divisionInfo(b);
  if (dA && dB && dA.key !== dB.key) p += 120;
  p += Math.abs(Number(a.weightKg) - Number(b.weightKg)) * 3;
  const lvls = ["debutante", "principiante", "amateur", "profesional"];
  p += Math.abs(lvls.indexOf(a.experienceLevel) - lvls.indexOf(b.experienceLevel)) * 25;
  if (!experienceOk(a, b)) p += 80;
  if ((a.gym || "").trim().toLowerCase() === (b.gym || "").trim().toLowerCase()) p += 40;
  return p;
}

// Empareja a TODOS los faltantes (los que no tienen pelea ni están en el Super
// 4). Recorre las parejas de menos a más conflictivas tomando la mejor pareja
// disponible en cada paso (emparejamiento voraz por menor penalización). Cada
// pelea sale marcada `forced: true` y con sus `warnings` para la tarjeta. Si el
// número de faltantes es IMPAR, uno queda sin rival: se devuelve en `leftover`
// (la app avisa por su nombre). `startRound` continúa la numeración de la
// cartelera existente (las forzadas se AGREGAN, no reemplazan). Determinista.
export function forcedMatchAll(faltantes, startRound = 1) {
  const pool = (faltantes || []).filter(Boolean);
  const pairs = [];
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++)
      pairs.push({ a: pool[i], b: pool[j], p: pairPenalty(pool[i], pool[j]) });
  pairs.sort((x, y) => x.p - y.p);
  const used = new Set();
  const matchups = [];
  for (const { a, b } of pairs) {
    if (used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id); used.add(b.id);
    matchups.push({
      id: genId(), fighterRedId: a.id, fighterBlueId: b.id,
      roundNumber: startRound + matchups.length,
      warnings: analyzeMatch(a, b), forced: true, createdAt: new Date().toISOString(),
    });
  }
  const leftover = pool.filter(f => !used.has(f.id)); // 0 o 1 (número impar)
  return { matchups, leftover };
}
