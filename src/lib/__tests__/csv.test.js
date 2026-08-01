import { describe, it, expect } from "vitest";
import { csvCell, toCsv, csvDocument } from "../csv.js";
import { buildFightersCsv } from "../csvPlanillas.js";

describe("csvCell (escapado RFC 4180)", () => {
  it("valor simple sin cambios", () => expect(csvCell("Pedro")).toBe("Pedro"));
  it("número → texto", () => expect(csvCell(64)).toBe("64"));
  it("cero → '0' (no vacío)", () => expect(csvCell(0)).toBe("0"));
  it("null/undefined → vacío", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("con coma → entrecomillado", () => expect(csvCell("Pérez, Juan")).toBe('"Pérez, Juan"'));
  it("con comilla → entrecomillado y comillas duplicadas", () => expect(csvCell('Escuela "La Roca"')).toBe('"Escuela ""La Roca"""'));
  it("con salto de línea → entrecomillado", () => expect(csvCell("linea1\nlinea2")).toBe('"linea1\nlinea2"'));
});

describe("toCsv", () => {
  it("filas separadas por CRLF y celdas por coma", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });
  it("respeta el escapado por celda", () => {
    expect(toCsv([["x,y", 3]])).toBe('"x,y",3');
  });
  it("fila vacía → línea en blanco (separador de secciones)", () => {
    expect(toCsv([["a"], [], ["b"]])).toBe("a\r\n\r\nb");
  });
  it("sin filas → cadena vacía", () => {
    expect(toCsv([])).toBe("");
    expect(toCsv(null)).toBe("");
  });
});

describe("csvDocument", () => {
  it("empieza con el BOM de UTF-8 (U+FEFF) para que los acentos salgan bien", () => {
    const doc = csvDocument([["a"]]);
    expect(doc.charCodeAt(0)).toBe(0xFEFF);
    expect(doc.slice(1)).toBe("a");
  });
});

describe("buildFightersCsv (planilla de peleadores)", () => {
  const fighters = [
    { fullName: "José Pérez", sexo: "M", weightKg: 64, weightCategory: "m_welter", age: 17, fightCount: 5, experienceLevel: "amateur", gym: "Catedra Boxing" },
  ];
  it("incluye los encabezados exactos", () => {
    expect(buildFightersCsv(fighters)).toContain("N°,Nombre,Sexo,Peso (kg),División,Edad,Categoría,Peleas,Nivel,Escuela,Rival propuesto");
  });
  it("vuelca los datos del atleta (números reales y escuela en mayúsculas)", () => {
    const doc = buildFightersCsv(fighters);
    expect(doc).toContain("José Pérez");
    expect(doc).toContain(",64,");                 // peso como número
    expect(doc).toContain(",17,");                 // edad como número
    expect(doc).toContain("Wélter (60-65kg)");     // división derivada
    expect(doc).toContain("CATEDRA BOXING");       // escuela en mayúsculas
  });
  it("un nombre con coma queda entrecomillado (no rompe columnas)", () => {
    const doc = buildFightersCsv([{ fullName: "Pérez, Juan", sexo: "M", weightKg: 60, weightCategory: "m_ligero", age: 20, fightCount: 0, experienceLevel: "debutante", gym: "X" }]);
    expect(doc).toContain('"Pérez, Juan"');
  });
});
