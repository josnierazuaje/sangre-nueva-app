import { genId, getCategoryInfo, getExperienceInfo } from "../constants.js";

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
  const minor1 = f1.age < 18, minor2 = f2.age < 18;
  if (minor1 !== minor2) w.push({ type: "age", severity: "high", message: `Menor (${minor1 ? f1.age : f2.age}a) vs adulto (${minor1 ? f2.age : f1.age}a) - PELIGROSO` });
  else if (Math.abs(f1.age - f2.age) > 10) w.push({ type: "age", severity: "medium", message: `Δ${Math.abs(f1.age - f2.age)} años de edad` });
  if (f1.gym.toLowerCase() === f2.gym.toLowerCase()) w.push({ type: "same_gym", severity: "low", message: `Misma escuela: ${f1.gym}` });
  return w;
}

export function getScore(f1, f2) {
  let s = 100;
  if (f1.weightCategory !== f2.weightCategory) s -= 50;
  s -= Math.abs(f1.weightKg - f2.weightKg) * 3;
  const lvls = ["debutante", "principiante", "amateur", "profesional"];
  s -= Math.abs(lvls.indexOf(f1.experienceLevel) - lvls.indexOf(f2.experienceLevel)) * 25;
  if (f1.gym.toLowerCase() === f2.gym.toLowerCase()) s -= 15;
  if ((f1.sexo || "M") !== (f2.sexo || "M")) s -= 100;
  if ((f1.age < 18) !== (f2.age < 18)) s -= 60;
  else s -= Math.max(0, Math.abs(f1.age - f2.age) - 6) * 2;
  return Math.max(0, Math.round(s));
}

export function autoMatchAll(fighters) {
  const used = new Set(); const matchups = [];
  const groups = {};
  fighters.forEach(f => { const k = (f.sexo || "M") + "_" + f.weightCategory + "_" + f.experienceLevel + "_" + (f.age < 18 ? "jr" : "ad"); if (!groups[k]) groups[k] = []; groups[k].push(f); });
  Object.values(groups).forEach(g => {
    g.sort((a, b) => a.weightKg - b.weightKg);
    for (let i = 0; i < g.length - 1; i += 2) {
      if (used.has(g[i].id) || used.has(g[i + 1].id)) continue;
      let f1 = g[i], f2 = g[i + 1];
      if (f1.gym.toLowerCase() === f2.gym.toLowerCase() && g.length > i + 2) {
        for (let j = i + 2; j < g.length; j++) { if (!used.has(g[j].id) && g[j].gym.toLowerCase() !== f1.gym.toLowerCase()) { f2 = g[j]; break; } }
      }
      used.add(f1.id); used.add(f2.id);
      matchups.push({ id: genId(), fighterRedId: f1.id, fighterBlueId: f2.id, roundNumber: matchups.length + 1, warnings: analyzeMatch(f1, f2), createdAt: new Date().toISOString() });
    }
  });
  const rem = fighters.filter(f => !used.has(f.id)).sort((a, b) => a.weightKg - b.weightKg);
  for (let i = 0; i < rem.length; i++) {
    if (used.has(rem[i].id)) continue; let best = null, bs = -1;
    for (let j = i + 1; j < rem.length; j++) { if (used.has(rem[j].id)) continue; const sc = getScore(rem[i], rem[j]); if (sc > bs) { bs = sc; best = rem[j]; } }
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
  fighters.forEach(f => { const k = (f.sexo || "M") + "_" + f.weightCategory + "_" + f.experienceLevel + "_" + (f.age < 18 ? "jr" : "ad"); if (!groups[k]) groups[k] = []; groups[k].push(f); });
  Object.values(groups).forEach(g => {
    const sh = shuffle(g.filter(f => !used.has(f.id)));
    for (let i = 0; i < sh.length - 1; i += 2) {
      let f1 = sh[i], f2 = sh[i + 1];
      if (f1.gym.toLowerCase() === f2.gym.toLowerCase()) {
        for (let j = i + 2; j < sh.length; j++) { if (!used.has(sh[j].id) && sh[j].gym.toLowerCase() !== f1.gym.toLowerCase()) { [sh[i + 1], sh[j]] = [sh[j], sh[i + 1]]; f2 = sh[i + 1]; break; } }
      }
      used.add(f1.id); used.add(f2.id);
      matchups.push({ id: genId(), fighterRedId: f1.id, fighterBlueId: f2.id, roundNumber: matchups.length + 1, warnings: analyzeMatch(f1, f2), createdAt: new Date().toISOString() });
    }
  });
  const rem = shuffle(fighters.filter(f => !used.has(f.id)));
  for (let i = 0; i < rem.length - 1; i += 2) {
    if (used.has(rem[i].id) || used.has(rem[i + 1].id)) continue;
    const sc = getScore(rem[i], rem[i + 1]);
    if (sc >= 20) {
      used.add(rem[i].id); used.add(rem[i + 1].id);
      matchups.push({ id: genId(), fighterRedId: rem[i].id, fighterBlueId: rem[i + 1].id, roundNumber: matchups.length + 1, warnings: analyzeMatch(rem[i], rem[i + 1]), createdAt: new Date().toISOString() });
    }
  }
  return matchups;
}
