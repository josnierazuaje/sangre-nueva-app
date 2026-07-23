import { describe, it, expect } from "vitest";
import { crc32, zipSync } from "../zip.js";
import { buildXlsx, colLetter, cellRef, escapeXml } from "../xlsx.js";
import { buildCarteleraXlsx, buildFightersXlsx, buildFaltantesXlsx } from "../xlsxPlanillas.js";
import { xlsxFilename } from "../download.js";

// El ZIP se escribe SIN comprimir, así que el XML aparece tal cual dentro de
// los bytes: decodificar todo el archivo y buscar el texto es suficiente para
// comprobar el contenido sin tener que implementar un lector de ZIP.
const texto = bytes => new TextDecoder("utf-8", { fatal: false }).decode(bytes);
const enc = s => new TextEncoder().encode(s);

describe("crc32", () => {
  it("da los valores de referencia del estándar", () => {
    expect(crc32(enc(""))).toBe(0);
    expect(crc32(enc("123456789"))).toBe(0xCBF43926);
    expect(crc32(enc("The quick brown fox jumps over the lazy dog"))).toBe(0x414FA339);
  });
  it("nunca devuelve un número negativo (debe ser sin signo de 32 bits)", () => {
    for (const s of ["a", "hola", "ñ", "Sangre Nueva — La Velada"]) {
      expect(crc32(enc(s))).toBeGreaterThanOrEqual(0);
      expect(crc32(enc(s))).toBeLessThanOrEqual(0xFFFFFFFF);
    }
  });
});

describe("zipSync", () => {
  it("escribe las firmas y el número de entradas correctos", () => {
    const z = zipSync([{ name: "a.txt", data: "hola" }, { name: "b/c.xml", data: "<x/>" }]);
    // Firma de cabecera local al principio.
    expect([z[0], z[1], z[2], z[3]]).toEqual([0x50, 0x4B, 0x03, 0x04]);
    // Firma del fin del directorio central (EOCD) en los últimos 22 bytes.
    const eocd = z.length - 22;
    expect([z[eocd], z[eocd + 1], z[eocd + 2], z[eocd + 3]]).toEqual([0x50, 0x4B, 0x05, 0x06]);
    // 2 entradas, en los dos contadores del EOCD.
    expect(z[eocd + 8] | (z[eocd + 9] << 8)).toBe(2);
    expect(z[eocd + 10] | (z[eocd + 11] << 8)).toBe(2);
  });
  it("aguanta archivos vacíos y muchos archivos grandes (crecimiento del buffer)", () => {
    const muchos = Array.from({ length: 60 }, (_, i) => ({ name: `f${i}.txt`, data: "Z".repeat(2000 + i) }));
    const z = zipSync([{ name: "vacio.txt", data: "" }, ...muchos]);
    const eocd = z.length - 22;
    expect(z[eocd + 8] | (z[eocd + 9] << 8)).toBe(61);
    expect(texto(z)).toContain("ZZZZ");
  });
  it("el offset del directorio central apunta de verdad a su firma", () => {
    const z = zipSync([{ name: "a.txt", data: "hola" }]);
    const eocd = z.length - 22;
    const off = z[eocd + 16] | (z[eocd + 17] << 8) | (z[eocd + 18] << 16) | (z[eocd + 19] << 24);
    expect([z[off], z[off + 1], z[off + 2], z[off + 3]]).toEqual([0x50, 0x4B, 0x01, 0x02]);
  });
});

describe("ayudantes de xlsx", () => {
  it("traduce el índice de columna a letra", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(25)).toBe("Z");
    expect(colLetter(26)).toBe("AA");
    expect(colLetter(51)).toBe("AZ");
    expect(colLetter(701)).toBe("ZZ");
    expect(colLetter(702)).toBe("AAA");
  });
  it("arma la referencia de celda con la fila desde 1", () => {
    expect(cellRef(0, 0)).toBe("A1");
    expect(cellRef(11, 8)).toBe("I12");
  });
  it("escapa XML y elimina los caracteres de control que romperían el libro", () => {
    expect(escapeXml('a & b < c > d " e \' f')).toBe("a &amp; b &lt; c &gt; d &quot; e &apos; f");
    expect(escapeXml("hola\x07mundo\x00")).toBe("holamundo");
    // Los saltos de línea y tabuladores SÍ son válidos en XML: no se tocan.
    expect(escapeXml("a\nb\tc")).toBe("a\nb\tc");
  });
});

describe("buildXlsx", () => {
  it("incluye todas las partes obligatorias del formato", () => {
    const t = texto(buildXlsx([{ name: "Hoja", rows: [["hola"]] }]));
    for (const parte of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
      expect(t).toContain(parte);
    }
  });
  it("Excel exige que el relleno 0 sea 'none' y el 1 'gray125'", () => {
    const t = texto(buildXlsx([{ name: "Hoja", rows: [[{ v: "x", s: { fill: "FF0000" } }]] }]));
    expect(t).toContain('<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>');
    expect(t).toContain('<fgColor rgb="FFFF0000"/>');
  });
  it("escribe los números como número y el texto como cadena en línea", () => {
    const t = texto(buildXlsx([{ name: "Hoja", rows: [[55, "55kg"]] }]));
    expect(t).toContain("<v>55</v>");
    expect(t).toContain('t="inlineStr"><is><t xml:space="preserve">55kg</t>');
  });
  it("nunca escribe NaN ni Infinity (romperían el libro)", () => {
    const t = texto(buildXlsx([{ name: "Hoja", rows: [[NaN, Infinity, Number("abc")]] }]));
    expect(t).not.toContain("NaN");
    expect(t).not.toContain("Infinity");
  });
  it("sanea el nombre de hoja (Excel prohíbe : \\ / ? * [ ] y más de 31 caracteres)", () => {
    const t = texto(buildXlsx([{ name: "Peleadores/2026: [final]", rows: [["x"]] }]));
    expect(t).toContain('<sheet name="Peleadores 2026   final"');
    const largo = texto(buildXlsx([{ name: "P".repeat(50), rows: [["x"]] }]));
    expect(largo).toContain(`<sheet name="${"P".repeat(31)}"`);
  });
  it("declara una relación por hoja más la de estilos", () => {
    const t = texto(buildXlsx([{ name: "A", rows: [["x"]] }, { name: "B", rows: [["y"]] }]));
    expect(t).toContain('Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"');
    expect(t).toContain('Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"');
    expect(t).toContain('Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"');
  });
  it("activa 'ajustar a la página' (si no, Excel ignora fitToWidth y corta columnas)", () => {
    const t = texto(buildXlsx([{ name: "H", rows: [["a"]], landscape: true }]));
    expect(t).toContain('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    expect(t).toContain('<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
  });
  it("respeta el orden de elementos que exige el esquema (si no, Excel pide reparar)", () => {
    const t = texto(buildXlsx([{ name: "H", rows: [["a", "b"], ["c", "d"]], cols: [10, 10], merges: [[0, 0, 0, 1]], freeze: 1, autoFilter: 0 }]));
    const orden = ["<sheetPr>", "<dimension", "<sheetViews", "<sheetFormatPr", "<cols>", "<sheetData>", "<autoFilter", "<mergeCells", "<pageMargins", "<pageSetup"];
    const posiciones = orden.map(e => t.indexOf(e));
    expect(posiciones.every(p => p > -1)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });
});

// ============================================
// PLANILLAS DEL EVENTO
// ============================================
const F = (id, nombre, gym, kg, edad, extra = {}) => ({
  id, fullName: nombre, gym, weightKg: kg, age: edad, sexo: "M",
  weightCategory: "m_ligero", fightCount: 2, experienceLevel: "principiante", ...extra,
});
const fighters = [
  F("1", "Amaro Velazquez", "Catedra Boxing", 55, 14),
  F("2", "Demian Ramirez", "Carlos Molina", 55, 14),
  F("3", "Benjamin Lobos", "Anticoy & Cía <Boxeo>", 57, 13),
  F("4", "Matias Jofre", "Bloody Training", 60, 14),
  F("5", "Amaro Contreras", "Team Reyes", 59, 16),
  F("6", "Alfonso Soles", "Bloody Training", 63, 16),
];
const byId = Object.fromEntries(fighters.map(f => [f.id, f]));

describe("planilla de cartelera en Excel", () => {
  const matchups = [
    { id: "a", roundNumber: 1, fighterRedId: "5", fighterBlueId: "6", nota: "" },   // U17
    { id: "b", roundNumber: 2, fighterRedId: "1", fighterBlueId: "2", nota: "" },   // U15
    { id: "c", roundNumber: 3, fighterRedId: "3", fighterBlueId: "4", nota: "Pesar" },
    { id: "d", roundNumber: 4, fighterRedId: "1", fighterBlueId: "borrado", nota: "" },
  ];
  const t = texto(buildCarteleraXlsx(matchups, fighters));

  it("lleva el título, los encabezados y el pie de la planilla impresa", () => {
    expect(t).toContain("Sangre Nueva — La Velada");
    for (const h of ["N°", "Escuela", "Atleta", "VS", "Peso", "Categoría", "Nota"]) expect(t).toContain(h);
    expect(t).toContain("La grilla está sujeta a modificaciones.");
  });
  it("agrupa por categoría de edad, U15 antes que U17 (igual que el PDF)", () => {
    expect(t.indexOf("U15 · ESCOLAR · 3R × 1,5MIN")).toBeGreaterThan(-1);
    expect(t.indexOf("U15 · ESCOLAR · 3R × 1,5MIN")).toBeLessThan(t.indexOf("U17 · CADETE · 3R × 2MIN"));
  });
  it("ignora las peleas con el rival eliminado, igual que la impresa", () => {
    // El peleador 1 aparece solo una vez (en su pelea válida contra el 2).
    expect(t.split("Amaro Velazquez").length - 1).toBe(1);
  });
  it("escapa los nombres con & y <> sin romper el XML", () => {
    expect(t).toContain("ANTICOY &amp; CÍA &lt;BOXEO&gt;");
    expect(t).not.toContain("<Boxeo>");
  });
  it("pinta las esquinas con los mismos colores que el PDF", () => {
    expect(t).toContain('<fgColor rgb="FFFCA5A5"/>'); // atleta rojo
    expect(t).toContain('<fgColor rgb="FF93C5FD"/>'); // atleta azul
    expect(t).toContain('<fgColor rgb="FFEF4444"/>'); // encabezado rojo
    expect(t).toContain('<fgColor rgb="FF2563EB"/>'); // encabezado azul
  });
  it("congela el título y los encabezados", () => {
    expect(t).toContain('<pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>');
  });
  it("marca en rojo el cruce de categorías de edad prohibido", () => {
    const mixto = texto(buildCarteleraXlsx([{ id: "x", roundNumber: 1, fighterRedId: "1", fighterBlueId: "5", nota: "" }], fighters));
    expect(mixto).toContain("CATEGORÍAS DE EDAD MEZCLADAS");
    expect(mixto).toContain('<fgColor rgb="FFFEE2E2"/>');
  });
  it("no revienta sin peleas", () => {
    expect(() => buildCarteleraXlsx([], fighters)).not.toThrow();
    expect(() => buildCarteleraXlsx(null, fighters)).not.toThrow();
  });
});

describe("planilla de peleadores en Excel", () => {
  const t = texto(buildFightersXlsx(fighters, "Todos los peleadores — 6 peleadores"));
  it("guarda peso, edad y peleas como NÚMERO para poder ordenar y filtrar", () => {
    expect(t).toContain("<v>55</v>");
    expect(t).toContain("<v>14</v>");
    expect(t).not.toContain("55kg</t>");
  });
  it("deja los menús de filtro en la fila de encabezados", () => {
    expect(t).toContain('<autoFilter ref="A3:K9"/>');
  });
  it("convierte a número los datos que vengan como texto desde un JSON importado", () => {
    const raro = texto(buildFightersXlsx([F("9", "Test", "Gym", "72", "19", { fightCount: "4" })], "x"));
    expect(raro).toContain("<v>72</v>");
    expect(raro).toContain("<v>19</v>");
    expect(raro).toContain("<v>4</v>");
  });
  it("no escribe NaN si a un peleador le falta el peso o la edad", () => {
    const roto = texto(buildFightersXlsx([{ id: "z", fullName: "Sin datos", gym: "X" }], "x"));
    expect(roto).not.toContain("NaN");
    expect(roto).toContain("Sin datos");
  });
  it("no revienta con la lista vacía", () => {
    expect(() => buildFightersXlsx([], "Sin peleadores — 0 peleadores")).not.toThrow();
  });
});

describe("nombre del archivo descargado", () => {
  it("agrega la extensión y la fecha", () => {
    expect(xlsxFilename("Cartelera Sangre Nueva", "20-07-2026")).toBe("Cartelera Sangre Nueva 20-07-2026.xlsx");
  });
  it("quita los caracteres que rompen la descarga", () => {
    expect(xlsxFilename("Lista/2026: *final*", "")).toBe("Lista-2026- -final-.xlsx");
  });
});

describe("planilla de FALTANTES / emparejamiento forzado en Excel", () => {
  const F = [
    { id: "a", fullName: "Rojo Uno", gym: "Iron King", age: 25, weightKg: 61, sexo: "M", fightCount: 3, weightCategory: "m_welter", experienceLevel: "principiante" },
    { id: "b", fullName: "Azul Dos", gym: "Iron King", age: 40, weightKg: 82, sexo: "M", fightCount: 20, weightCategory: "m_crucero", experienceLevel: "profesional" },
    { id: "c", fullName: "Sin Rival", gym: "Team C", age: 45, weightKg: 57, sexo: "M", fightCount: 2, weightCategory: "m_ligero", experienceLevel: "principiante" },
  ];
  const forzadas = [{ id: "m1", roundNumber: 1, fighterRedId: "a", fighterBlueId: "b", forced: true, nota: "" }];
  const t = texto(buildFaltantesXlsx(forzadas, [F[2]], F, "1 pelea forzada · 1 sin rival"));

  it("lleva el título, el subtítulo y las columnas propias", () => {
    expect(t).toContain("Emparejamiento forzado");
    expect(t).toContain("1 pelea forzada · 1 sin rival");
    expect(t).toContain("Qué falta para cumplir la norma");
    expect(t).toContain("Corrección");
  });

  it("escribe en su celda lo que le falta a la pelea para ser reglamentaria", () => {
    expect(t).toContain("misma división de peso");
    expect(t).toContain("escuelas distintas (ambos de Iron King)");
    expect(t).toContain("Rojo Uno");
    expect(t).toContain("Azul Dos");
  });

  it("agrega la hoja 'Sin rival' con los que quedaron sueltos", () => {
    expect(t).toContain("Sin rival");
    expect(t).toContain("Sin Rival");        // el atleta
    expect(t).toContain("Rival propuesto");
    // dos hojas de verdad en el libro
    expect(t).toContain("sheet1.xml");
    expect(t).toContain("sheet2.xml");
  });

  it("sin atletas sueltos NO agrega la segunda hoja", () => {
    const solo = texto(buildFaltantesXlsx(forzadas, [], F));
    expect(solo).toContain("sheet1.xml");
    expect(solo).not.toContain("sheet2.xml");
  });

  it("omite una pelea cuyo atleta ya fue eliminado (igual que la impresa)", () => {
    const conRota = [...forzadas, { id: "m2", roundNumber: 2, fighterRedId: "a", fighterBlueId: "borrado", forced: true }];
    expect(() => buildFaltantesXlsx(conRota, [], F)).not.toThrow();
  });

  it("una forzada que sí cumple la norma se marca como tal", () => {
    const ok = [
      { id: "x", fullName: "Ok Uno", gym: "A", age: 25, weightKg: 61, sexo: "M", fightCount: 3, weightCategory: "m_welter", experienceLevel: "principiante" },
      { id: "y", fullName: "Ok Dos", gym: "B", age: 25, weightKg: 63, sexo: "M", fightCount: 3, weightCategory: "m_welter", experienceLevel: "principiante" },
    ];
    const t2 = texto(buildFaltantesXlsx([{ id: "m", roundNumber: 1, fighterRedId: "x", fighterBlueId: "y", forced: true }], [], ok));
    expect(t2).toContain("sí cumple la norma");
  });
});
