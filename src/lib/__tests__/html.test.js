import { describe, it, expect } from "vitest";
import { escapeHtml } from "../html.js";

describe("escapeHtml", () => {
  it("escapa las 5 entidades peligrosas, INCLUIDA la comilla simple", () => {
    expect(escapeHtml(`<a href="x" title='y'>&`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;");
  });
  it("escapa la comilla simple (el bug que tenía la copia de Super4View)", () => {
    expect(escapeHtml("O'Higgins")).toBe("O&#39;Higgins");
  });
  it("null / undefined → cadena vacía", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
  it("texto sin caracteres especiales queda igual", () => {
    expect(escapeHtml("Team Reyes")).toBe("Team Reyes");
  });
  it("convierte no-strings a string", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});
