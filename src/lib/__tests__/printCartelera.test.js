import { describe, it, expect } from "vitest";
import { buildCarteleraHtml } from "../printCartelera.js";

// Fixtures mínimos. getAgeCategory usa la edad: 13-14 escolar (U15),
// 15-16 cadete (U17), 17-18 juvenil (U19), 19-40 adulto (Elite).
let n = 0;
function f(over) {
  n++;
  return { id: over.id || "f" + n, fullName: over.fullName || "Peleador " + n, gym: over.gym || "Gym " + n, age: over.age ?? 14, weightKg: over.weightKg ?? 40, ...over };
}
function vs(r, b, over = {}) {
  return { id: over.id || `${r.id}-${b.id}`, fighterRedId: r.id, fighterBlueId: b.id, roundNumber: over.roundNumber ?? 1, nota: over.nota ?? "", ...over };
}

describe("buildCarteleraHtml", () => {
  it("agrupa por categoría de edad y muestra World Boxing · FECHIBOX · formato en mayúsculas", () => {
    const r = f({ id: "r", age: 13 }), b = f({ id: "b", age: 14 });
    const html = buildCarteleraHtml([vs(r, b)], [r, b]);
    expect(html).toContain("U15 · ESCOLAR · 3R × 1,5MIN");
  });

  it("un cruce de categorías distintas cae en el bloque 'mixta' resaltado", () => {
    const r = f({ id: "r", age: 13 }), b = f({ id: "b", age: 17 });
    const html = buildCarteleraHtml([vs(r, b)], [r, b]);
    expect(html).toContain("grupo-alerta");
    expect(html).toContain("CATEGORÍAS DE EDAD MEZCLADAS");
  });

  it("escapa caracteres peligrosos en nombre, escuela y nota", () => {
    const r = f({ id: "r", age: 14, fullName: "<b>Niño</b>", gym: "O'Higgins & Co" });
    const b = f({ id: "b", age: 14 });
    const html = buildCarteleraHtml([vs(r, b, { nota: '"peligro"' })], [r, b]);
    expect(html).toContain("&lt;b&gt;Niño&lt;/b&gt;");
    expect(html).toContain("O&#39;Higgins &amp; Co");
    expect(html).toContain("&quot;peligro&quot;");
    expect(html).not.toContain("<b>Niño</b>");
  });

  it("el peso de cada pelea se muestra de menor a mayor, sin importar la esquina", () => {
    const r = f({ id: "r", age: 14, weightKg: 63 }); // rojo MÁS pesado
    const b = f({ id: "b", age: 14, weightKg: 60 });
    const html = buildCarteleraHtml([vs(r, b)], [r, b]);
    expect(html).toContain("60kg / 63kg");
    expect(html).not.toContain("63kg / 60kg");
  });

  it("el orden de peso es numérico aunque weightKg venga como string (JSON importado)", () => {
    // Lexicográficamente "100" <= "60", el orden debe seguir siendo numérico.
    const r = f({ id: "r", age: 20, weightKg: "100" });
    const b = f({ id: "b", age: 20, weightKg: "60" });
    const html = buildCarteleraHtml([vs(r, b)], [r, b]);
    expect(html).toContain("60kg / 100kg");
    expect(html).not.toContain("100kg / 60kg");
  });

  it("dentro de un bloque ordena de más liviano a más pesado (por suma de pesos)", () => {
    const lr = f({ id: "lr", age: 14, weightKg: 30, fullName: "LivianoRojo" });
    const lb = f({ id: "lb", age: 14, weightKg: 32 });
    const pr = f({ id: "pr", age: 14, weightKg: 45, fullName: "PesadoRojo" });
    const pb = f({ id: "pb", age: 14, weightKg: 46 });
    const html = buildCarteleraHtml([vs(pr, pb), vs(lr, lb)], [lr, lb, pr, pb]);
    expect(html.indexOf("LivianoRojo")).toBeLessThan(html.indexOf("PesadoRojo"));
  });

  it("reinicia la numeración en cada bloque de categoría", () => {
    const e1 = f({ id: "e1", age: 13 }), e2 = f({ id: "e2", age: 13 });
    const c1 = f({ id: "c1", age: 15 }), c2 = f({ id: "c2", age: 15 });
    const html = buildCarteleraHtml([vs(e1, e2), vs(c1, c2)], [e1, e2, c1, c2]);
    // Dos bloques (escolar y cadete), cada uno empieza en N° 1.
    expect((html.match(/<td>1<\/td>/g) || []).length).toBe(2);
  });

  it("descarta los matchups cuyos peleadores no resuelven", () => {
    const r = f({ id: "r", age: 14, fullName: "SiResuelve" }), b = f({ id: "b", age: 14 });
    const html = buildCarteleraHtml(
      [vs(r, b), { id: "x", fighterRedId: "fantasma", fighterBlueId: b.id, roundNumber: 2, nota: "" }],
      [r, b]
    );
    expect(html).toContain("SiResuelve");
    expect((html.match(/<td>1<\/td>/g) || []).length).toBe(1); // un solo bloque, una sola pelea
  });

  it("devuelve un documento HTML completo (doctype, banner y nota final)", () => {
    const r = f({ id: "r", age: 14 }), b = f({ id: "b", age: 14 });
    const html = buildCarteleraHtml([vs(r, b)], [r, b]);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("Sangre Nueva — La Velada");
    expect(html).toContain("La grilla está sujeta a modificaciones.");
  });
});
