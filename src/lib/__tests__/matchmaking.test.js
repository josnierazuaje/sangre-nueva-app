import { describe, it, expect, vi } from "vitest";
import { analyzeMatch, getScore, autoMatchAll, sorteoMatch } from "../matchmaking.js";

function makeFighter(overrides) {
  return {
    id: overrides.id,
    fullName: overrides.fullName || overrides.id,
    phone: "",
    gym: overrides.gym || "Gimnasio A",
    age: overrides.age ?? 25,
    weightKg: overrides.weightKg ?? 60,
    weightCategory: overrides.weightCategory || "ligero",
    experienceLevel: overrides.experienceLevel || "principiante",
    fightCount: overrides.fightCount ?? 2,
    sexo: overrides.sexo || "M",
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

  it("respeta la tolerancia de peso de la categoría (sin advertencia dentro de tolerancia)", () => {
    // "ligero": tolerancia 3kg
    const f1 = makeFighter({ id: "a", weightKg: 60, weightCategory: "ligero" });
    const f2 = makeFighter({ id: "b", weightKg: 62, weightCategory: "ligero" });
    const warnings = analyzeMatch(f1, f2);
    expect(warnings.find(w => w.type === "weight")).toBeUndefined();
  });

  it("marca severidad 'medium' cuando la diferencia de peso supera la tolerancia pero no el doble", () => {
    const f1 = makeFighter({ id: "a", weightKg: 60, weightCategory: "ligero" });
    const f2 = makeFighter({ id: "b", weightKg: 64, weightCategory: "ligero" }); // Δ4, tol 3, 2×tol=6
    const w = analyzeMatch(f1, f2).find(x => x.type === "weight");
    expect(w.severity).toBe("medium");
  });

  it("marca severidad 'high' cuando la diferencia de peso excede el doble de la tolerancia", () => {
    const f1 = makeFighter({ id: "a", weightKg: 60, weightCategory: "ligero" });
    const f2 = makeFighter({ id: "b", weightKg: 67, weightCategory: "ligero" }); // Δ7 > 2×tol(6)
    const w = analyzeMatch(f1, f2).find(x => x.type === "weight");
    expect(w.severity).toBe("high");
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

  it("evita la misma escuela cuando hay una alternativa disponible en el grupo", () => {
    const fighters = [
      makeFighter({ id: "a", weightKg: 60, gym: "Barrio Franklin" }),
      makeFighter({ id: "b", weightKg: 61, gym: "Barrio Franklin" }),
      makeFighter({ id: "c", weightKg: 62, gym: "Otro Gimnasio" }),
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
});
