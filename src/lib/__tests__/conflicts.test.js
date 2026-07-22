import { describe, it, expect } from "vitest";
import { matchupConflicts } from "../conflicts.js";

// Edades: 14 = escolar (U15), 20 = adulto (Elite).
let n = 0;
function f(over) {
  n++;
  return { id: over.id || "f" + n, fullName: over.fullName || "Peleador " + n, gym: over.gym || "Gym " + n, age: over.age ?? 20, weightKg: over.weightKg ?? 60, fightCount: over.fightCount ?? 2, ...over };
}
function vs(r, b, over = {}) {
  return { id: over.id || `m-${r.id}-${b.id}`, fighterRedId: r.id, fighterBlueId: b.id, roundNumber: over.roundNumber ?? 1, ...over };
}
const S4 = ids => new Set(ids);

describe("matchupConflicts", () => {
  it("pelea limpia → sin conflictos", () => {
    const r = f({}), b = f({});
    const c = matchupConflicts([vs(r, b)], [r, b], S4([]));
    expect(c.total).toBe(0);
    expect(c.removibles).toEqual([]);
  });

  it("rival eliminado → huérfana y removible (y no revisa las demás reglas)", () => {
    const r = f({ fullName: "Solo Rojo" });
    const m = { id: "mx", fighterRedId: r.id, fighterBlueId: "fantasma", roundNumber: 7 };
    const c = matchupConflicts([m], [r], S4([]));
    expect(c.huerfanas).toHaveLength(1);
    expect(c.huerfanas[0].texto).toContain("Solo Rojo");
    expect(c.huerfanas[0].n).toBe(7);
    expect(c.removibles).toEqual(["mx"]);
    expect(c.total).toBe(1);
  });

  it("ambos eliminados → huérfana con texto genérico", () => {
    const m = { id: "mx", fighterRedId: "a", fighterBlueId: "b", roundNumber: 1 };
    const c = matchupConflicts([m], [], S4([]));
    expect(c.huerfanas[0].texto).toContain("(ambos eliminados)");
  });

  it("atleta en el Super 4 → conflicto y removible, con el nombre del implicado", () => {
    const r = f({ fullName: "Mateo Godoy" }), b = f({});
    const c = matchupConflicts([vs(r, b, { id: "ms4" })], [r, b], S4([r.id]));
    expect(c.super4).toHaveLength(1);
    expect(c.super4[0].texto).toContain("Mateo Godoy");
    expect(c.removibles).toEqual(["ms4"]);
  });

  it("ambos en el Super 4 → un solo conflicto con los dos nombres (plural)", () => {
    const r = f({ fullName: "Uno" }), b = f({ fullName: "Dos" });
    const c = matchupConflicts([vs(r, b)], [r, b], S4([r.id, b.id]));
    expect(c.super4).toHaveLength(1);
    expect(c.super4[0].texto).toContain("Uno y Dos");
    expect(c.super4[0].texto).toContain("están");
  });

  it("misma escuela (insensible a mayúsculas y espacios) → conflicto NO removible", () => {
    const r = f({ gym: " Team Reyes " }), b = f({ gym: "team reyes" });
    const c = matchupConflicts([vs(r, b)], [r, b], S4([]));
    expect(c.mismaEscuela).toHaveLength(1);
    expect(c.removibles).toEqual([]);
  });

  it("más de 3 peleas de diferencia → conflicto de experiencia; ambos 15+ no", () => {
    const novato = f({ fightCount: 2 }), pro = f({ fightCount: 9 });
    const c1 = matchupConflicts([vs(novato, pro)], [novato, pro], S4([]));
    expect(c1.experiencia).toHaveLength(1);
    expect(c1.experiencia[0].texto).toContain("(2 peleas)");
    const p1 = f({ fightCount: 15 }), p2 = f({ fightCount: 30 });
    const c2 = matchupConflicts([vs(p1, p2)], [p1, p2], S4([]));
    expect(c2.experiencia).toHaveLength(0);
  });

  it("diferencia exactamente 3 → permitida (no es conflicto)", () => {
    const a = f({ fightCount: 9 }), b = f({ fightCount: 6 });
    const c = matchupConflicts([vs(a, b)], [a, b], S4([]));
    expect(c.experiencia).toHaveLength(0);
  });

  it("categorías de edad distintas → edadMixta", () => {
    const nino = f({ age: 14 }), adulto = f({ age: 20 });
    const c = matchupConflicts([vs(nino, adulto)], [nino, adulto], S4([]));
    expect(c.edadMixta).toHaveLength(1);
    expect(c.edadMixta[0].texto).toContain("U15");
    expect(c.edadMixta[0].texto).toContain("Elite");
  });

  it("una pelea con varios problemas cuenta en cada lista pero es removible UNA vez", () => {
    // en Super 4 + misma escuela + experiencia
    const r = f({ gym: "X", fightCount: 0 }), b = f({ gym: "X", fightCount: 10 });
    const c = matchupConflicts([vs(r, b, { id: "multi" })], [r, b], S4([r.id]));
    expect(c.super4).toHaveLength(1);
    expect(c.mismaEscuela).toHaveLength(1);
    expect(c.experiencia).toHaveLength(1);
    expect(c.total).toBe(3);
    expect(c.removibles).toEqual(["multi"]);
  });

  it("total suma todos los tipos y removibles solo huérfanas + Super 4", () => {
    const enS4 = f({}), rival = f({});
    const g1 = f({ gym: "Z" }), g2 = f({ gym: "Z" });
    const huerfano = { id: "h", fighterRedId: "nadie", fighterBlueId: g1.id, roundNumber: 3 };
    const c = matchupConflicts(
      [vs(enS4, rival, { id: "s" }), vs(g1, g2, { id: "g" }), huerfano],
      [enS4, rival, g1, g2],
      S4([enS4.id])
    );
    expect(c.total).toBe(3);
    expect(c.removibles.sort()).toEqual(["h", "s"]);
  });
});

// Las peleas FORZADAS (pestaña Faltantes) rompen reglas a propósito y lo
// explican en su propia nota roja: no deben aparecer como "problemas a
// corregir". Las alertas ESTRUCTURALES sí siguen aplicando.
describe("peleas forzadas — exentas de las reglas blandas, no de las estructurales", () => {
  it("NO reporta edad mixta, misma escuela ni experiencia si la pelea es forzada", () => {
    const r = f({ id: "r", age: 14, gym: "Iron King", fightCount: 1 });
    const b = f({ id: "b", age: 30, gym: "Iron King", fightCount: 20 });
    const c = matchupConflicts([vs(r, b, { forced: true })], [r, b], new Set());
    expect(c.edadMixta).toEqual([]);
    expect(c.mismaEscuela).toEqual([]);
    expect(c.experiencia).toEqual([]);
    expect(c.total).toBe(0);
  });

  it("la MISMA pelea sin la marca forzada SÍ reporta los tres problemas", () => {
    const r = f({ id: "r2", age: 14, gym: "Iron King", fightCount: 1 });
    const b = f({ id: "b2", age: 30, gym: "Iron King", fightCount: 20 });
    const c = matchupConflicts([vs(r, b)], [r, b], new Set());
    expect(c.edadMixta.length).toBe(1);
    expect(c.mismaEscuela.length).toBe(1);
    expect(c.experiencia.length).toBe(1);
  });

  it("una forzada con un atleta ya en el Super 4 SÍ se reporta (estructural)", () => {
    const r = f({ id: "r3" }), b = f({ id: "b3" });
    const c = matchupConflicts([vs(r, b, { forced: true })], [r, b], new Set(["r3"]));
    expect(c.super4.length).toBe(1);
    expect(c.removibles).toContain("m-r3-b3");
  });

  it("una forzada con un rival eliminado SÍ se reporta (estructural)", () => {
    const r = f({ id: "r4" }), b = f({ id: "b4" });
    const c = matchupConflicts([vs(r, b, { forced: true })], [r], new Set()); // b ya no existe
    expect(c.huerfanas.length).toBe(1);
  });
});
