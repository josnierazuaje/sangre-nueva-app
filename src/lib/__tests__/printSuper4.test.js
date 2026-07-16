import { describe, it, expect } from "vitest";
import { buildSuper4Html } from "../printSuper4.js";

// Índice de peleadores (byId). El bracket referencia ids en semis/finalWinner.
const byId = {
  r1: { fullName: "Rojo Uno", gym: "Gym A", weightKg: 62, age: 15 },
  b1: { fullName: "Azul Uno", gym: "O'Higgins", weightKg: 63, age: 16 },
  r2: { fullName: "Rojo Dos", gym: "Gym C", weightKg: 61, age: 15 },
  b2: { fullName: "Azul Dos", gym: "Gym D", weightKg: 64, age: 16 },
};
function bracket(over = {}) {
  return {
    ageKey: "cadete", divKey: "m_welter", regla: "Tope 3 peleas", maxFights: 3,
    semis: [
      { red: "r1", blue: "b1", winner: null },
      { red: "r2", blue: "b2", winner: null },
    ],
    finalWinner: null,
    ...over,
  };
}

describe("buildSuper4Html", () => {
  it("título de la llave = World Boxing · FECHIBOX · división (género)", () => {
    const html = buildSuper4Html([bracket()], byId, "16-07-2026");
    expect(html).toContain("U17 · Cadete · Wélter (M)");
  });

  it("nombre de esquina con su clase de color (rn rojo / rn azul)", () => {
    const html = buildSuper4Html([bracket()], byId, "16-07-2026");
    expect(html).toContain('<span class="rn rojo">Rojo Uno</span>');
    expect(html).toContain('<span class="rn azul">Azul Uno</span>');
  });

  it("detalle de esquina: escuela en MAYÚSCULA · peso · edad", () => {
    const html = buildSuper4Html([bracket()], byId, "16-07-2026");
    expect(html).toContain("GYM A · 62kg · 15a");
  });

  it("escapa la comilla simple en la escuela (bug histórico de la copia local)", () => {
    const html = buildSuper4Html([bracket()], byId, "16-07-2026");
    expect(html).toContain("O&#39;HIGGINS · 63kg · 16a");
    expect(html).not.toContain("O'HIGGINS");
  });

  it("muestra la nota del tope de peleas (plural / singular)", () => {
    expect(buildSuper4Html([bracket({ maxFights: 3 })], byId, "x")).toContain("hasta <b>3 peleas</b>");
    expect(buildSuper4Html([bracket({ maxFights: 1 })], byId, "x")).toContain("hasta <b>1 pelea</b>");
  });

  it("usa la fecha recibida en el pie (función pura, sin new Date interno)", () => {
    const html = buildSuper4Html([bracket()], byId, "16-07-2026");
    expect(html).toContain("Generado el 16-07-2026");
  });

  it("cuando la final no tiene finalistas, muestra placeholders", () => {
    const html = buildSuper4Html([bracket()], byId, "x");
    expect(html).toContain("Ganador Semifinal 1");
    expect(html).toContain("Ganador Semifinal 2");
  });

  it("muestra el campeón cuando hay finalWinner", () => {
    const html = buildSuper4Html([bracket({ finalWinner: "r1" })], byId, "x");
    expect(html).toContain("🏆 Campeón: Rojo Uno");
  });

  it("devuelve un documento HTML completo (doctype y encabezado del torneo)", () => {
    const html = buildSuper4Html([bracket()], byId, "x");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("TORNEO SUPER 4 — SANGRE NUEVA");
  });
});
