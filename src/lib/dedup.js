// ============================================
// DEDUPLICACIÓN AUTOMÁTICA — peleadores y peleas
// ============================================
// Detecta y elimina duplicados que se generan cuando un mismo atleta se
// registra dos veces (ej. una vez en la carga inicial y otra a mano). El
// criterio es CONSERVADOR a propósito: dos registros se consideran la misma
// persona solo si coinciden nombre normalizado + sexo + peso exacto. Así se
// evita borrar por error a dos personas distintas que casualmente comparten
// nombre (la escuela y la edad pueden variar por errores de tipeo, así que
// NO se exigen iguales — pero tampoco se usa la edad para separar).

export function normName(s) {
  return (s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function dupKey(f) {
  // Un registro sin peso numérico válido nunca se agrupa con nadie (clave
  // única por id): dos homónimos sin peso NO son demostrablemente la misma
  // persona, y fusionarlos borraría a una persona real.
  const w = Number(f.weightKg);
  if (!Number.isFinite(w) || w <= 0) return "__nodup__|" + f.id;
  return normName(f.fullName) + "|" + (f.sexo || "M") + "|" + w;
}

// Colapsa registros duplicados de peleadores a uno solo por grupo.
// Se conserva el registro que ya está en una pelea (para no romper el VS);
// si ninguno o ambos lo están, el más antiguo (createdAt). Devuelve:
//   { fighters: lista sin duplicados (orden original preservado),
//     idMap: { idEliminado -> idConservado, idConservado -> idConservado },
//     removed: cuántos registros se quitaron }
export function dedupeFighters(fighters, matchups = []) {
  const list = Array.isArray(fighters) ? fighters : [];
  const referenced = new Set();
  (matchups || []).forEach(m => { referenced.add(m.fighterRedId); referenced.add(m.fighterBlueId); });

  const groups = new Map();
  list.forEach(f => {
    const k = dupKey(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  });

  const idMap = {};
  const keptIds = new Set();
  for (const arr of groups.values()) {
    const keeper = [...arr].sort((a, b) => {
      const ra = referenced.has(a.id) ? 0 : 1;
      const rb = referenced.has(b.id) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    })[0];
    keptIds.add(keeper.id);
    arr.forEach(f => { idMap[f.id] = keeper.id; });
  }

  const deduped = list.filter(f => keptIds.has(f.id));
  return { fighters: deduped, idMap, removed: list.length - deduped.length };
}

// Limpia las peleas: reapunta ids de peleadores eliminados a su reemplazo,
// descarta peleas inválidas (mismo peleador de ambos lados tras el remapeo)
// y las duplicadas (misma pareja repetida, sin importar el lado). Renumera
// de forma secuencial. `idMap` viene de dedupeFighters.
//
// IMPORTANTE: a propósito NO se eliminan peleas cuyo peleador "no existe".
// Peleadores y peleas se sincronizan por canales separados de Firebase sin
// orden garantizado; podar por existencia durante un estado parcial de
// sync borraría peleas válidas y propagaría el borrado a la nube (pérdida
// total). Una pelea huérfana es inofensiva: la UI ya la oculta (VSCard
// devuelve null) y la planilla la filtra.
export function cleanMatchups(matchups, idMap = {}) {
  const list = Array.isArray(matchups) ? matchups : [];
  const seenPairs = new Set();
  const out = [];
  for (const m of list) {
    const red = idMap[m.fighterRedId] || m.fighterRedId;
    const blue = idMap[m.fighterBlueId] || m.fighterBlueId;
    if (red === blue) continue;                                   // misma persona a ambos lados
    const pairKey = [red, blue].slice().sort().join("|");
    if (seenPairs.has(pairKey)) continue;                          // pareja repetida
    seenPairs.add(pairKey);
    out.push({ ...m, fighterRedId: red, fighterBlueId: blue });
  }
  return out.map((m, i) => ({ ...m, roundNumber: i + 1 }));
}

// Reconciliación combinada e idempotente: dado el estado actual de
// peleadores y peleas, devuelve las versiones limpias y banderas de si
// cambió algo (para persistir solo cuando corresponde y evitar bucles).
// Con la lista de peleadores vacía no se toca nada: ese estado es ambiguo
// (puede ser una carga parcial de la sincronización) y actuar sobre él
// podría destruir datos válidos.
export function reconcileData(fighters, matchups) {
  const list = Array.isArray(fighters) ? fighters : [];
  if (!list.length) {
    return { dedupedFighters: list, cleanedMatchups: matchups || [], fightersChanged: false, matchupsChanged: false, removedFighters: 0 };
  }
  const { fighters: dedupedFighters, idMap, removed } = dedupeFighters(list, matchups);
  const cleanedMatchups = cleanMatchups(matchups, idMap);
  const fightersChanged = removed > 0;
  const matchupsChanged = JSON.stringify(cleanedMatchups) !== JSON.stringify(matchups || []);
  return { dedupedFighters, cleanedMatchups, fightersChanged, matchupsChanged, removedFighters: removed };
}
