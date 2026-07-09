import { describe, it, expect } from "vitest";
import { normName, dedupeFighters, cleanMatchups, reconcileData } from "../dedup.js";

function f(id, name, extra = {}) {
  return { id, fullName: name, sexo: "M", weightKg: 70, age: 25, gym: "Gym", createdAt: "2026-01-01T00:00:00.000Z", ...extra };
}

describe("normName", () => {
  it("ignora mayúsculas, acentos y espacios extra", () => {
    expect(normName("  Andrés   Pérez ")).toBe("andres perez");
    expect(normName("ANDRES PEREZ")).toBe("andres perez");
  });
});

describe("dedupeFighters", () => {
  it("colapsa dos registros con mismo nombre+sexo+peso (aunque la escuela difiera)", () => {
    const fighters = [
      f("sn8", "Gabriela Valencia", { sexo: "F", weightKg: 98, gym: "ACUÑA", createdAt: "2026-01-01T00:00:00Z" }),
      f("dup", "Gabriela Valencia", { sexo: "F", weightKg: 98, gym: "pablo acuña boxeo", createdAt: "2026-06-01T00:00:00Z" }),
    ];
    const { fighters: out, removed, idMap } = dedupeFighters(fighters, []);
    expect(removed).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("sn8"); // conserva el más antiguo
    expect(idMap["dup"]).toBe("sn8");
  });

  it("NO colapsa dos personas con mismo nombre pero distinto peso", () => {
    const fighters = [
      f("a", "Cristobal Lopez", { weightKg: 48 }),
      f("b", "Cristobal Lopez", { weightKg: 60 }),
    ];
    expect(dedupeFighters(fighters, []).removed).toBe(0);
  });

  it("NO colapsa dos personas con mismo nombre+peso pero distinto sexo", () => {
    const fighters = [
      f("a", "Alexis Soto", { sexo: "M", weightKg: 60 }),
      f("b", "Alexis Soto", { sexo: "F", weightKg: 60 }),
    ];
    expect(dedupeFighters(fighters, []).removed).toBe(0);
  });

  it("NO colapsa homónimos sin peso numérico válido (undefined/null/NaN/0)", () => {
    // Dos personas sin peso registrado no son demostrablemente la misma:
    // fusionarlas borraría a una persona real.
    for (const w of [undefined, null, NaN, "abc", 0]) {
      const fighters = [
        f("a", "Pedro Rojas", { weightKg: w }),
        f("b", "Pedro Rojas", { weightKg: w }),
      ];
      expect(dedupeFighters(fighters, []).removed).toBe(0);
    }
  });

  it("conserva el registro que ya está en una pelea, no el más antiguo", () => {
    const fighters = [
      f("viejo", "Juan Perez", { createdAt: "2026-01-01T00:00:00Z" }),
      f("enpelea", "Juan Perez", { createdAt: "2026-06-01T00:00:00Z" }),
    ];
    const matchups = [{ id: "m1", fighterRedId: "enpelea", fighterBlueId: "otro", roundNumber: 1 }];
    const { fighters: out, idMap } = dedupeFighters(fighters, matchups);
    expect(out[0].id).toBe("enpelea");
    expect(idMap["viejo"]).toBe("enpelea");
  });

  it("preserva el orden original de los peleadores conservados", () => {
    const fighters = [f("a", "Ana", { sexo: "F", weightKg: 55 }), f("b", "Beto", { weightKg: 70 }), f("adup", "Ana", { sexo: "F", weightKg: 55 })];
    const { fighters: out } = dedupeFighters(fighters, []);
    expect(out.map(x => x.id)).toEqual(["a", "b"]);
  });

  it("no rompe con lista vacía o nula", () => {
    expect(dedupeFighters([], []).removed).toBe(0);
    expect(dedupeFighters(null, null).fighters).toEqual([]);
  });
});

describe("cleanMatchups", () => {
  it("elimina una pelea de la misma persona a ambos lados tras el remapeo", () => {
    const idMap = { sn8: "sn8", dup: "sn8" };
    const matchups = [
      { id: "m1", fighterRedId: "sn8", fighterBlueId: "dup", roundNumber: 1 }, // Gabriela vs Gabriela
      { id: "m2", fighterRedId: "sn8", fighterBlueId: "otro", roundNumber: 2 },
    ];
    const out = cleanMatchups(matchups, idMap);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m2");
    expect(out[0].roundNumber).toBe(1); // renumerada
  });

  it("CONSERVA peleas cuyo peleador no existe (huérfanas) — podarlas bajo un sync parcial destruiría datos válidos", () => {
    const matchups = [
      { id: "m1", fighterRedId: "a", fighterBlueId: "b", roundNumber: 1 },
      { id: "m2", fighterRedId: "a", fighterBlueId: "borrado", roundNumber: 2 },
    ];
    const out = cleanMatchups(matchups, {});
    expect(out.map(m => m.id)).toEqual(["m1", "m2"]);
  });

  it("elimina parejas repetidas sin importar el lado (rojo/azul invertido)", () => {
    const matchups = [
      { id: "m1", fighterRedId: "a", fighterBlueId: "b", roundNumber: 1 },
      { id: "m2", fighterRedId: "b", fighterBlueId: "a", roundNumber: 2 }, // misma pareja
    ];
    const out = cleanMatchups(matchups, {});
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m1");
  });

  it("renumera secuencialmente los roundNumber", () => {
    const matchups = [
      { id: "m1", fighterRedId: "a", fighterBlueId: "b", roundNumber: 5 },
      { id: "m2", fighterRedId: "c", fighterBlueId: "d", roundNumber: 9 },
    ];
    const out = cleanMatchups(matchups, {});
    expect(out.map(m => m.roundNumber)).toEqual([1, 2]);
  });
});

describe("reconcileData — idempotencia", () => {
  it("segunda pasada sobre datos ya limpios no reporta cambios", () => {
    const fighters = [
      f("sn8", "Gabriela Valencia", { sexo: "F", weightKg: 98, createdAt: "2026-01-01T00:00:00Z" }),
      f("dup", "Gabriela Valencia", { sexo: "F", weightKg: 98, createdAt: "2026-06-01T00:00:00Z" }),
      f("otro", "Pedro Soto", { weightKg: 70 }),
    ];
    const matchups = [{ id: "m1", fighterRedId: "sn8", fighterBlueId: "dup", roundNumber: 1 }];
    const r1 = reconcileData(fighters, matchups);
    expect(r1.fightersChanged).toBe(true);
    expect(r1.removedFighters).toBe(1);
    expect(r1.matchupsChanged).toBe(true);
    expect(r1.cleanedMatchups).toHaveLength(0); // la única pelea era Gabriela vs Gabriela

    const r2 = reconcileData(r1.dedupedFighters, r1.cleanedMatchups);
    expect(r2.fightersChanged).toBe(false);
    expect(r2.matchupsChanged).toBe(false);
  });

  it("datos sin duplicados no cambian nada", () => {
    const fighters = [f("a", "Ana", { sexo: "F", weightKg: 55 }), f("b", "Beto", { weightKg: 70 })];
    const matchups = [{ id: "m1", fighterRedId: "a", fighterBlueId: "b", roundNumber: 1 }];
    const r = reconcileData(fighters, matchups);
    expect(r.fightersChanged).toBe(false);
    expect(r.matchupsChanged).toBe(false);
  });

  it("CRÍTICO: con peleadores vacíos (sync parcial) NO toca las peleas", () => {
    // Carrera de sincronización: en un dispositivo recién instalado las
    // peleas pueden llegar de la nube ANTES que los peleadores. En ese
    // instante fighters=[] y matchups tiene datos válidos — reconciliar
    // ahí borraría toda la cartelera y lo propagaría a la nube.
    const matchups = [
      { id: "m1", fighterRedId: "a", fighterBlueId: "b", roundNumber: 1 },
      { id: "m2", fighterRedId: "c", fighterBlueId: "d", roundNumber: 2 },
    ];
    const r = reconcileData([], matchups);
    expect(r.fightersChanged).toBe(false);
    expect(r.matchupsChanged).toBe(false);
    expect(r.cleanedMatchups).toEqual(matchups);
  });

  it("las peleas huérfanas sobreviven a la reconciliación completa", () => {
    const fighters = [f("a", "Ana", { sexo: "F", weightKg: 55 }), f("b", "Beto", { weightKg: 70 })];
    const matchups = [
      { id: "m1", fighterRedId: "a", fighterBlueId: "b", roundNumber: 1 },
      { id: "m2", fighterRedId: "x-aun-no-sincronizado", fighterBlueId: "y-aun-no-sincronizado", roundNumber: 2 },
    ];
    const r = reconcileData(fighters, matchups);
    expect(r.matchupsChanged).toBe(false);
    expect(r.cleanedMatchups).toHaveLength(2);
  });
});
