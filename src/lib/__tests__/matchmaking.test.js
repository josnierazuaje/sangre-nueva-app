import { describe, it, expect, vi } from "vitest";
import { analyzeMatch, getScore, autoMatchAll, sorteoMatch, bestMatchAll, experienceOk, forcedMatchAll, forcedPairingReasons } from "../matchmaking.js";
import { getWeightCategory, getCategoryInfo, getAgeCategory } from "../../constants.js";

function makeFighter(overrides) {
  const weightKg = overrides.weightKg ?? 60;
  const sexo = overrides.sexo || "M";
  return {
    id: overrides.id,
    fullName: overrides.fullName || overrides.id,
    phone: "",
    gym: overrides.gym || "Gimnasio A",
    age: overrides.age ?? 25,
    weightKg,
    weightCategory: getWeightCategory(weightKg, sexo),
    experienceLevel: overrides.experienceLevel || "principiante",
    fightCount: overrides.fightCount ?? 2,
    sexo,
    createdAt: new Date(2026, 0, 1).toISOString(),
    ...overrides,
  };
}

function allMatchedPairs(fighters, matchups) {
  return matchups.map(m => [
    fighters.find(f => f.id === m.fighterRedId),
    fighters.find(f => f.id === m.fighterBlueId),
  ]);
}

describe("getScore / analyzeMatch — filtros de seguridad", () => {
  it("penaliza fuertemente (score bajo) un cruce de sexos distintos", () => {
    const m = makeFighter({ id: "m1", sexo: "M" });
    const f = makeFighter({ id: "f1", sexo: "F" });
    expect(getScore(m, f)).toBeLessThan(30);
  });

  it("analyzeMatch marca advertencia severa 'high' cuando los sexos son distintos", () => {
    const m = makeFighter({ id: "m1", sexo: "M" });
    const f = makeFighter({ id: "f1", sexo: "F" });
    const warnings = analyzeMatch(m, f);
    const w = warnings.find(x => x.type === "sexo");
    expect(w).toBeTruthy();
    expect(w.severity).toBe("high");
  });

  it("analyzeMatch marca advertencia severa 'high' cuando uno es menor y el otro adulto", () => {
    const minor = makeFighter({ id: "jr1", age: 16 });
    const adult = makeFighter({ id: "ad1", age: 30 });
    const warnings = analyzeMatch(minor, adult);
    const w = warnings.find(x => x.type === "age");
    expect(w).toBeTruthy();
    expect(w.severity).toBe("high");
  });

  it("analyzeMatch marca 'high' entre categorías World Boxing vecinas (Escolar 14 vs Cadete 15)", () => {
    const escolar = makeFighter({ id: "e1", age: 14 });
    const cadete = makeFighter({ id: "c1", age: 15 });
    const w = analyzeMatch(escolar, cadete).find(x => x.type === "age");
    expect(w).toBeTruthy();
    expect(w.severity).toBe("high");
  });

  it("analyzeMatch NO marca advertencia de edad dentro de la misma categoría World Boxing (13 vs 14)", () => {
    const f1 = makeFighter({ id: "a", age: 13 });
    const f2 = makeFighter({ id: "b", age: 14 });
    expect(analyzeMatch(f1, f2).find(x => x.type === "age")).toBeUndefined();
  });

  it("respeta la tolerancia de peso de la división (sin advertencia dentro de tolerancia)", () => {
    // Wélter hombres (60-65kg): tolerancia 3kg
    const f1 = makeFighter({ id: "a", weightKg: 61 });
    const f2 = makeFighter({ id: "b", weightKg: 63 });
    const warnings = analyzeMatch(f1, f2);
    expect(warnings.find(w => w.type === "weight")).toBeUndefined();
  });

  it("marca severidad 'medium' cuando la diferencia de peso supera la tolerancia pero no el doble", () => {
    const f1 = makeFighter({ id: "a", weightKg: 61 }); // Wélter H (60-65), tol 3
    const f2 = makeFighter({ id: "b", weightKg: 65 }); // Δ4, 2×tol=6
    const w = analyzeMatch(f1, f2).find(x => x.type === "weight");
    expect(w.severity).toBe("medium");
  });

  it("marca severidad 'high' cuando la diferencia de peso excede el doble de la tolerancia", () => {
    // Superpesado hombres (+90kg, división abierta): tolerancia 5kg
    const f1 = makeFighter({ id: "a", weightKg: 92 });
    const f2 = makeFighter({ id: "b", weightKg: 104 }); // Δ12 > 2×tol(10)
    const w = analyzeMatch(f1, f2).find(x => x.type === "weight");
    expect(w.severity).toBe("high");
  });

  it("marca 'high' cuando los atletas caen en divisiones World Boxing distintas", () => {
    const f1 = makeFighter({ id: "a", weightKg: 58 }); // Ligero H (55-60)
    const f2 = makeFighter({ id: "b", weightKg: 62 }); // Wélter H (60-65)
    const w = analyzeMatch(f1, f2).find(x => x.type === "weight");
    expect(w.severity).toBe("high");
    expect(w.message).toContain("Categorías distintas");
  });
});

describe("getWeightCategory — divisiones oficiales World Boxing por género", () => {
  it("asigna divisiones distintas según el género con el mismo peso (83kg)", () => {
    expect(getCategoryInfo(getWeightCategory(83, "M")).label).toBe("Crucero"); // 80-85 H
    expect(getCategoryInfo(getWeightCategory(83, "F")).label).toBe("Pesado"); // +80 M
  });

  it("asigna la división más liviana cuando el peso está bajo el mínimo oficial", () => {
    expect(getCategoryInfo(getWeightCategory(46, "M")).label).toBe("Mosca"); // mínimo H: 47
    expect(getCategoryInfo(getWeightCategory(44, "F")).label).toBe("Minimosca"); // mínimo M: 45
  });

  it("asigna la división abierta por encima del máximo", () => {
    expect(getCategoryInfo(getWeightCategory(97, "M")).label).toBe("Superpesado"); // +90 H
    expect(getCategoryInfo(getWeightCategory(85, "F")).label).toBe("Pesado"); // +80 M
  });

  it("sin sexo definido asume masculino (compatibilidad con datos antiguos)", () => {
    expect(getWeightCategory(58)).toBe(getWeightCategory(58, "M"));
  });
});

describe("autoMatchAll — filtro duro de edad y sexo", () => {
  it("nunca empareja un menor de edad con un adulto, aunque el score lo permitiría", () => {
    // Mismo peso/experiencia/gimnasios distintos → sin el filtro duro, el
    // score de esta pareja sería 100 - 60 (edad) = 40, que sí superaría el
    // umbral (>=30) del fallback. Cada uno queda como único sobrante de su
    // grupo (bracket de edad distinto), forzando la comparación cruzada.
    const fighters = [
      makeFighter({ id: "jr1", age: 16, gym: "Gimnasio Jr" }),
      makeFighter({ id: "ad1", age: 30, gym: "Gimnasio Adulto" }),
    ];
    const matchups = autoMatchAll(fighters);
    expect(matchups.length).toBe(0);
    allMatchedPairs(fighters, matchups).forEach(([a, b]) => {
      expect((a.age < 18) === (b.age < 18)).toBe(true);
    });
  });

  it("nunca empareja sexos distintos", () => {
    const fighters = [
      makeFighter({ id: "m1", sexo: "M", gym: "Gimnasio 1" }),
      makeFighter({ id: "f1", sexo: "F", gym: "Gimnasio 2" }),
      makeFighter({ id: "m2", sexo: "M", weightCategory: "pesado", weightKg: 90, gym: "Gimnasio 3" }),
      makeFighter({ id: "f2", sexo: "F", weightCategory: "pesado", weightKg: 90, gym: "Gimnasio 4" }),
    ];
    const matchups = autoMatchAll(fighters);
    allMatchedPairs(fighters, matchups).forEach(([a, b]) => {
      expect((a.sexo || "M")).toBe(b.sexo || "M");
    });
  });

  it("nunca mezcla categorías World Boxing vecinas (Escolar 14 vs Cadete 15), aunque ambos sean menores", () => {
    // Antes de la regla World Boxing este cruce SÍ se permitía (ambos <18):
    // mismo peso y experiencia, gimnasios distintos → score alto. Ahora el
    // filtro duro por categoría de edad debe descartarlo por completo.
    const fighters = [
      makeFighter({ id: "e1", age: 14, gym: "Gimnasio A" }),
      makeFighter({ id: "c1", age: 15, gym: "Gimnasio B" }),
    ];
    const matchups = autoMatchAll(fighters);
    expect(matchups.length).toBe(0);
  });

  it("nunca mezcla Juvenil (18) con Adulto (19), aunque tengan solo un año de diferencia", () => {
    const fighters = [
      makeFighter({ id: "j1", age: 18, gym: "Gimnasio A" }),
      makeFighter({ id: "a1", age: 19, gym: "Gimnasio B" }),
    ];
    const matchups = autoMatchAll(fighters);
    expect(matchups.length).toBe(0);
  });

  it("sí empareja dentro de la misma categoría World Boxing (dos Cadetes 15 y 16)", () => {
    const fighters = [
      makeFighter({ id: "c1", age: 15, gym: "Gimnasio A" }),
      makeFighter({ id: "c2", age: 16, gym: "Gimnasio B" }),
    ];
    const matchups = autoMatchAll(fighters);
    expect(matchups.length).toBe(1);
  });

  it("evita la misma escuela cuando hay una alternativa disponible en el grupo", () => {
    // Los tres en Wélter hombres (60-65kg) para que compartan grupo.
    const fighters = [
      makeFighter({ id: "a", weightKg: 61, gym: "Barrio Franklin" }),
      makeFighter({ id: "b", weightKg: 62, gym: "Barrio Franklin" }),
      makeFighter({ id: "c", weightKg: 63, gym: "Otro Gimnasio" }),
    ];
    const matchups = autoMatchAll(fighters);
    expect(matchups.length).toBe(1);
    const [red, blue] = allMatchedPairs(fighters, matchups)[0];
    const gyms = [red.gym, blue.gym].sort();
    expect(gyms).toEqual(["Barrio Franklin", "Otro Gimnasio"]);
  });
});

describe("sorteoMatch — filtro duro de edad y sexo", () => {
  it("nunca empareja un menor de edad con un adulto en el sorteo aleatorio", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fighters = [
      makeFighter({ id: "jr1", age: 16, gym: "Gimnasio Jr" }),
      makeFighter({ id: "ad1", age: 30, gym: "Gimnasio Adulto" }),
    ];
    const matchups = sorteoMatch(fighters);
    expect(matchups.length).toBe(0);
    vi.restoreAllMocks();
  });

  it("nunca empareja sexos distintos en el sorteo aleatorio (múltiples corridas)", () => {
    const fighters = [
      makeFighter({ id: "m1", sexo: "M", weightKg: 60, gym: "G1" }),
      makeFighter({ id: "f1", sexo: "F", weightKg: 60, gym: "G2" }),
      makeFighter({ id: "m2", sexo: "M", weightKg: 90, weightCategory: "pesado", gym: "G3" }),
      makeFighter({ id: "f2", sexo: "F", weightKg: 90, weightCategory: "pesado", gym: "G4" }),
    ];
    for (let i = 0; i < 20; i++) {
      const matchups = sorteoMatch(fighters);
      allMatchedPairs(fighters, matchups).forEach(([a, b]) => {
        expect((a.sexo || "M")).toBe(b.sexo || "M");
      });
    }
  });

  it("nunca mezcla categorías World Boxing en el sorteo (Escolar 14 vs Cadete 15, múltiples corridas)", () => {
    const fighters = [
      makeFighter({ id: "e1", age: 14, gym: "Gimnasio A" }),
      makeFighter({ id: "c1", age: 15, gym: "Gimnasio B" }),
    ];
    for (let i = 0; i < 20; i++) {
      expect(sorteoMatch(fighters).length).toBe(0);
    }
  });
});

describe("regla dura: nunca emparejar dos de la misma escuela", () => {
  const noSameGym = (fighters, matchups) =>
    allMatchedPairs(fighters, matchups).forEach(([a, b]) =>
      expect((a.gym || "").toLowerCase()).not.toBe((b.gym || "").toLowerCase()));

  it("Auto VS: dos de la misma escuela sin otro rival → no se emparejan", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela X", weightKg: 61 }),
      makeFighter({ id: "a2", gym: "Escuela X", weightKg: 62 }),
    ];
    expect(autoMatchAll(fighters).length).toBe(0);
  });

  it("Auto VS: con un rival de otra escuela empareja cruzado y deja al compañero sin pelea", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela X", weightKg: 61 }),
      makeFighter({ id: "a2", gym: "Escuela X", weightKg: 62 }),
      makeFighter({ id: "b1", gym: "Escuela Y", weightKg: 63 }),
    ];
    const m = autoMatchAll(fighters);
    expect(m.length).toBe(1);
    noSameGym(fighters, m);
  });

  it("Auto VS: 2 de Escuela A + 2 de Escuela B → 2 peleas, todas cruzadas", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela A", weightKg: 61 }),
      makeFighter({ id: "a2", gym: "Escuela A", weightKg: 62 }),
      makeFighter({ id: "b1", gym: "Escuela B", weightKg: 63 }),
      makeFighter({ id: "b2", gym: "Escuela B", weightKg: 64 }),
    ];
    const m = autoMatchAll(fighters);
    expect(m.length).toBe(2);
    noSameGym(fighters, m);
  });

  it("compara escuela sin importar mayúsculas/espacios", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela X", weightKg: 61 }),
      makeFighter({ id: "a2", gym: " escuela x ", weightKg: 62 }),
    ];
    expect(autoMatchAll(fighters).length).toBe(0);
  });

  it("Sorteo: 2+2 escuelas → siempre cruzado (múltiples corridas)", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela A", weightKg: 61 }),
      makeFighter({ id: "a2", gym: "Escuela A", weightKg: 62 }),
      makeFighter({ id: "b1", gym: "Escuela B", weightKg: 63 }),
      makeFighter({ id: "b2", gym: "Escuela B", weightKg: 64 }),
    ];
    for (let i = 0; i < 30; i++) noSameGym(fighters, sorteoMatch(fighters));
  });

  it("Sorteo: dos de la misma escuela no se sortean juntos aunque sean el único par (múltiples corridas)", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela X", weightKg: 61 }),
      makeFighter({ id: "a2", gym: "Escuela X", weightKg: 62 }),
    ];
    for (let i = 0; i < 30; i++) expect(sorteoMatch(fighters).length).toBe(0);
  });
});

describe("regla dura: diferencia de experiencia (máx 3 peleas, salvo ambos pro 15+)", () => {
  it("experienceOk: diferencia de 3 o menos → permitido", () => {
    expect(experienceOk({ fightCount: 2 }, { fightCount: 5 })).toBe(true);
    expect(experienceOk({ fightCount: 0 }, { fightCount: 3 })).toBe(true);
  });
  it("experienceOk: diferencia mayor a 3 sin ser ambos pro → bloqueado", () => {
    expect(experienceOk({ fightCount: 3 }, { fightCount: 15 })).toBe(false);
    expect(experienceOk({ fightCount: 4 }, { fightCount: 10 })).toBe(false);
  });
  it("experienceOk: ambos con 15+ peleas → permitido aunque la diferencia sea grande", () => {
    expect(experienceOk({ fightCount: 15 }, { fightCount: 25 })).toBe(true);
    expect(experienceOk({ fightCount: 40 }, { fightCount: 16 })).toBe(true);
  });
  it("experienceOk: 12 peleas NO cuenta como pro", () => {
    expect(experienceOk({ fightCount: 12 }, { fightCount: 20 })).toBe(false);
  });

  it("Auto VS: NO empareja un principiante (3 peleas) con un pro (15) — el caso de la captura", () => {
    const fighters = [
      makeFighter({ id: "prin", age: 18, weightKg: 60, gym: "Iron Punches", fightCount: 3, experienceLevel: "principiante" }),
      makeFighter({ id: "pro", age: 18, weightKg: 60, gym: "Carlos Molina", fightCount: 15, experienceLevel: "profesional" }),
    ];
    expect(autoMatchAll(fighters).length).toBe(0);
  });

  it("Auto VS: dos amateurs de la misma categoría pero con 6 peleas de diferencia → no se emparejan", () => {
    const fighters = [
      makeFighter({ id: "a4", age: 25, weightKg: 60, gym: "Gym A", fightCount: 4, experienceLevel: "amateur" }),
      makeFighter({ id: "a10", age: 25, weightKg: 60, gym: "Gym B", fightCount: 10, experienceLevel: "amateur" }),
    ];
    expect(autoMatchAll(fighters).length).toBe(0);
  });

  it("Auto VS: dos pros (20 vs 25 peleas) SÍ se emparejan pese a los 5 de diferencia", () => {
    const fighters = [
      makeFighter({ id: "p20", age: 25, weightKg: 60, gym: "Gym A", fightCount: 20, experienceLevel: "profesional" }),
      makeFighter({ id: "p25", age: 25, weightKg: 60, gym: "Gym B", fightCount: 25, experienceLevel: "profesional" }),
    ];
    expect(autoMatchAll(fighters).length).toBe(1);
  });

  it("Sorteo: tampoco cruza principiante con pro (múltiples corridas)", () => {
    const fighters = [
      makeFighter({ id: "prin", age: 18, weightKg: 60, gym: "Iron Punches", fightCount: 3, experienceLevel: "principiante" }),
      makeFighter({ id: "pro", age: 18, weightKg: 60, gym: "Carlos Molina", fightCount: 15, experienceLevel: "profesional" }),
    ];
    for (let i = 0; i < 30; i++) expect(sorteoMatch(fighters).length).toBe(0);
  });
});

describe("bestMatchAll — el único botón (fusión justa de Auto VS + sorteo)", () => {
  // Verificador de que un reparto NUNCA rompe una regla dura. Vale para
  // cualquier salida, sea del pase determinista o de una corrida aleatoria.
  const noHardRuleViolations = (fighters, matchups) => {
    allMatchedPairs(fighters, matchups).forEach(([a, b]) => {
      expect(a && b).toBeTruthy();
      expect(getAgeCategory(a.age).key).toBe(getAgeCategory(b.age).key); // edad World Boxing
      expect(a.sexo || "M").toBe(b.sexo || "M"); // sexo
      expect((a.gym || "").trim().toLowerCase()).not.toBe((b.gym || "").trim().toLowerCase()); // escuela
      expect(experienceOk(a, b)).toBe(true); // máx 3 peleas (salvo ambos pro 15+)
    });
  };

  it("nunca rompe una regla dura, sobre un universo variado y en muchas corridas", () => {
    const fighters = [
      makeFighter({ id: "a", age: 15, weightKg: 50, gym: "Escuela A", fightCount: 2, experienceLevel: "principiante" }),
      makeFighter({ id: "b", age: 16, weightKg: 51, gym: "Escuela B", fightCount: 3, experienceLevel: "principiante" }),
      makeFighter({ id: "c", age: 16, weightKg: 52, gym: "Escuela A", fightCount: 4, experienceLevel: "amateur" }),
      makeFighter({ id: "d", age: 15, weightKg: 53, gym: "Escuela C", fightCount: 2, experienceLevel: "principiante" }),
      makeFighter({ id: "e", age: 30, weightKg: 70, gym: "Escuela A", fightCount: 10, experienceLevel: "amateur" }),
      makeFighter({ id: "f", age: 31, weightKg: 71, gym: "Escuela B", fightCount: 12, experienceLevel: "amateur" }),
      makeFighter({ id: "g", age: 30, weightKg: 72, gym: "Escuela D", fightCount: 20, experienceLevel: "profesional" }),
      makeFighter({ id: "h", age: 32, weightKg: 90, gym: "Escuela E", fightCount: 25, experienceLevel: "profesional", weightCategory: "pesado" }),
      makeFighter({ id: "i", age: 25, weightKg: 60, gym: "Escuela F", sexo: "F", fightCount: 1, experienceLevel: "debutante" }),
      makeFighter({ id: "j", age: 26, weightKg: 61, gym: "Escuela G", sexo: "F", fightCount: 2, experienceLevel: "principiante" }),
    ];
    for (let i = 0; i < 25; i++) noHardRuleViolations(fighters, bestMatchAll(fighters, 20));
  });

  it("empareja al menos a tantos atletas como Auto VS (nunca menos cobertura)", () => {
    const fighters = [
      makeFighter({ id: "a", weightKg: 61, gym: "Escuela A" }),
      makeFighter({ id: "b", weightKg: 62, gym: "Escuela B" }),
      makeFighter({ id: "c", weightKg: 63, gym: "Escuela C" }),
      makeFighter({ id: "d", weightKg: 64, gym: "Escuela D" }),
    ];
    for (let i = 0; i < 15; i++) {
      expect(bestMatchAll(fighters, 30).length).toBeGreaterThanOrEqual(autoMatchAll(fighters).length);
    }
  });

  it("empareja a los 4 (2+2 escuelas) siempre cruzado", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela A", weightKg: 61 }),
      makeFighter({ id: "a2", gym: "Escuela A", weightKg: 62 }),
      makeFighter({ id: "b1", gym: "Escuela B", weightKg: 63 }),
      makeFighter({ id: "b2", gym: "Escuela B", weightKg: 64 }),
    ];
    for (let i = 0; i < 15; i++) {
      const m = bestMatchAll(fighters, 30);
      expect(m.length).toBe(2);
      noHardRuleViolations(fighters, m);
    }
  });

  it("dos de la misma escuela sin otro rival → no se emparejan (0 peleas)", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela X", weightKg: 61 }),
      makeFighter({ id: "a2", gym: "Escuela X", weightKg: 62 }),
    ];
    for (let i = 0; i < 15; i++) expect(bestMatchAll(fighters, 20).length).toBe(0);
  });

  it("numera las peleas de forma correlativa desde 1", () => {
    const fighters = [
      makeFighter({ id: "a1", gym: "Escuela A", weightKg: 61 }),
      makeFighter({ id: "b1", gym: "Escuela B", weightKg: 62 }),
      makeFighter({ id: "c1", gym: "Escuela C", weightKg: 63 }),
      makeFighter({ id: "d1", gym: "Escuela D", weightKg: 64 }),
    ];
    const m = bestMatchAll(fighters, 20);
    m.forEach((x, i) => expect(x.roundNumber).toBe(i + 1));
  });

  it("no empareja a nadie cuando hay menos de dos elegibles válidos", () => {
    expect(bestMatchAll([], 10)).toEqual([]);
    expect(bestMatchAll([makeFighter({ id: "solo" })], 10)).toEqual([]);
  });

  it("no revienta si un peleador llega SIN escuela (dato viejo/importado)", () => {
    // getScore/analyzeMatch antes hacían f.gym.toLowerCase() sin guardia y
    // lanzaban TypeError con gym undefined, colgando el botón en 'EMPAREJANDO…'.
    const a = makeFighter({ id: "a", weightKg: 61, fightCount: 2 }); delete a.gym;
    const b = makeFighter({ id: "b", weightKg: 62, gym: "Escuela B", fightCount: 3 });
    expect(() => bestMatchAll([a, b], 20)).not.toThrow();
    expect(() => autoMatchAll([a, b])).not.toThrow();
    // Sin escuela declarada, cumple las 4 reglas duras vs otro de escuela conocida → se empareja.
    const m = bestMatchAll([a, b], 20);
    expect(m.length).toBe(1);
  });
});

// ============================================================
// EMPAREJAMIENTO FORZADO (pestaña Faltantes)
// ============================================================
describe("forcedMatchAll — obliga a emparejar a TODOS los faltantes", () => {
  it("empareja a todos cuando el número es par y marca cada pelea como forzada", () => {
    const fs = [
      makeFighter({ id: "a", weightKg: 60, age: 20 }),
      makeFighter({ id: "b", weightKg: 80, age: 35 }),   // división y edad muy distintas
      makeFighter({ id: "c", weightKg: 61, age: 21 }),
      makeFighter({ id: "d", weightKg: 62, age: 22 }),
    ];
    const { matchups, leftover } = forcedMatchAll(fs, 1);
    expect(matchups.length).toBe(2);
    expect(leftover).toEqual([]);
    expect(matchups.every(m => m.forced === true)).toBe(true);
    // cada atleta aparece EXACTAMENTE una vez
    const ids = matchups.flatMap(m => [m.fighterRedId, m.fighterBlueId]).sort();
    expect(ids).toEqual(["a", "b", "c", "d"]);
    // numeración continúa desde startRound
    expect(matchups.map(m => m.roundNumber)).toEqual([1, 2]);
  });

  it("con número IMPAR deja exactamente 1 en leftover y empareja al resto", () => {
    const fs = [1, 2, 3, 4, 5].map(i => makeFighter({ id: "f" + i, weightKg: 60 + i, age: 20 }));
    const { matchups, leftover } = forcedMatchAll(fs, 1);
    expect(matchups.length).toBe(2);
    expect(leftover.length).toBe(1);
    // el leftover NO está en ninguna pelea
    const ids = new Set(matchups.flatMap(m => [m.fighterRedId, m.fighterBlueId]));
    expect(ids.has(leftover[0].id)).toBe(false);
  });

  it("continúa la numeración de la cartelera existente (startRound)", () => {
    const fs = [makeFighter({ id: "a", weightKg: 60 }), makeFighter({ id: "b", weightKg: 61 })];
    const { matchups } = forcedMatchAll(fs, 8); // ya hay 7 peleas
    expect(matchups[0].roundNumber).toBe(8);
  });

  it("PREFIERE el mismo sexo: no cruza M vs F si hay alternativa del mismo sexo", () => {
    // 2 mujeres + 2 hombres: debe emparejar M-M y F-F, nunca cruzar sexos.
    const fs = [
      makeFighter({ id: "m1", sexo: "M", weightKg: 70, age: 25 }),
      makeFighter({ id: "m2", sexo: "M", weightKg: 71, age: 25 }),
      makeFighter({ id: "f1", sexo: "F", weightKg: 60, age: 25 }),
      makeFighter({ id: "f2", sexo: "F", weightKg: 61, age: 25 }),
    ];
    const { matchups } = forcedMatchAll(fs, 1);
    const sexoDe = id => fs.find(f => f.id === id).sexo;
    for (const m of matchups) expect(sexoDe(m.fighterRedId)).toBe(sexoDe(m.fighterBlueId));
  });

  it("cruza sexos SOLO como último recurso (número impar de un sexo)", () => {
    // 3 mujeres, 1 hombre: 2 mujeres se emparejan; la 3ra no tiene más mujeres,
    // así que se fuerza F vs M. Nadie queda sin pelea (par total).
    const fs = [
      makeFighter({ id: "f1", sexo: "F", weightKg: 60, age: 25 }),
      makeFighter({ id: "f2", sexo: "F", weightKg: 61, age: 25 }),
      makeFighter({ id: "f3", sexo: "F", weightKg: 62, age: 25 }),
      makeFighter({ id: "m1", sexo: "M", weightKg: 63, age: 25 }),
    ];
    const { matchups, leftover } = forcedMatchAll(fs, 1);
    expect(matchups.length).toBe(2);
    expect(leftover).toEqual([]);
    const cruces = matchups.filter(m => {
      const s = id => fs.find(f => f.id === id).sexo;
      return s(m.fighterRedId) !== s(m.fighterBlueId);
    });
    expect(cruces.length).toBe(1); // exactamente un cruce de sexos, el inevitable
  });

  it("tolera lista vacía o de 1 sin reventar", () => {
    expect(forcedMatchAll([], 1)).toEqual({ matchups: [], leftover: [] });
    const uno = [makeFighter({ id: "a", weightKg: 60 })];
    const { matchups, leftover } = forcedMatchAll(uno, 1);
    expect(matchups).toEqual([]);
    expect(leftover.map(f => f.id)).toEqual(["a"]);
  });
});

describe("forcedPairingReasons — qué condiciones faltarían para cumplir la norma", () => {
  it("lista edad, división, experiencia y escuela cuando todo difiere (mismo sexo)", () => {
    const a = makeFighter({ id: "a", sexo: "M", weightKg: 60, age: 17, fightCount: 2, gym: "Iron King", experienceLevel: "debutante" });
    const b = makeFighter({ id: "b", sexo: "M", weightKg: 80, age: 30, fightCount: 12, gym: "Iron King", experienceLevel: "amateur" });
    const joined = forcedPairingReasons(a, b).join(" | ");
    expect(joined).toMatch(/edad/i);
    expect(joined).toMatch(/divisi/i);
    expect(joined).toMatch(/experiencia/i);
    expect(joined).toMatch(/escuela/i);
  });

  it("lista el sexo cuando los sexos difieren", () => {
    const a = makeFighter({ id: "a", sexo: "M", weightKg: 62, age: 25, gym: "A" });
    const b = makeFighter({ id: "b", sexo: "F", weightKg: 62, age: 25, gym: "B" });
    expect(forcedPairingReasons(a, b).join(" | ")).toMatch(/mismo sexo/i);
  });

  it("devuelve [] cuando el cruce SÍ cumple la norma (nada que forzar)", () => {
    // 61 y 63 kg: ambos Wélter H (60-65), misma edad/nivel, escuelas distintas.
    const a = makeFighter({ id: "a", sexo: "M", weightKg: 61, age: 25, fightCount: 3, gym: "A", experienceLevel: "principiante" });
    const b = makeFighter({ id: "b", sexo: "M", weightKg: 63, age: 25, fightCount: 3, gym: "B", experienceLevel: "principiante" });
    expect(forcedPairingReasons(a, b)).toEqual([]);
  });

  it("marca 'fuera de rango oficial' cuando ambos comparten categoría inválida (Sub-13)", () => {
    const a = makeFighter({ id: "a", weightKg: 40, age: 11, gym: "A" });
    const b = makeFighter({ id: "b", weightKg: 41, age: 12, gym: "B" });
    const r = forcedPairingReasons(a, b).join(" | ");
    expect(r).toMatch(/rango oficial/i);
  });
});

describe("forcedPairingReasons — correcciones de la revisión", () => {
  it("marca 'fuera de rango oficial' también con veteranos (+40), como el caso real del evento", () => {
    const a = makeFighter({ id: "a", weightKg: 57, age: 45, gym: "A" });
    const b = makeFighter({ id: "b", weightKg: 58, age: 46, gym: "B" });
    expect(forcedPairingReasons(a, b).join(" | ")).toMatch(/rango oficial/i);
  });

  it("en un cruce de SEXOS distintos no inventa una diferencia de división", () => {
    // Mismo peso exacto: las claves de división llevan prefijo de sexo
    // (m_welter vs f_welter) y antes se reportaba "Wélter vs Wélter, dif. 0,0kg".
    const a = makeFighter({ id: "a", sexo: "M", weightKg: 62, age: 25, gym: "A", fightCount: 3 });
    const b = makeFighter({ id: "b", sexo: "F", weightKg: 62, age: 25, gym: "B", fightCount: 3 });
    const r = forcedPairingReasons(a, b);
    expect(r.join(" | ")).toMatch(/mismo sexo/i);
    expect(r.some(x => /divisi/i.test(x))).toBe(false);
  });

  it("no revienta ni envenena el orden con un peso no numérico (JSON con coma decimal)", () => {
    const a = makeFighter({ id: "a", weightKg: "62,5", age: 25, gym: "A" });
    const b = makeFighter({ id: "b", weightKg: 63, age: 25, gym: "B" });
    expect(() => forcedPairingReasons(a, b)).not.toThrow();
    const { matchups, leftover } = forcedMatchAll([a, b], 1);
    expect(matchups.length).toBe(1); // se empareja igual
    expect(leftover).toEqual([]);
  });
});
