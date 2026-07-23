import { describe, it, expect } from "vitest";
import { createPdf, F, textWidth, ellipsize, encodeText, mixColor, splitCubic, cubicSegments } from "../pdf.js";
import { buildSuper4Pdf } from "../pdfSuper4.js";
import { pdfFilename } from "../download.js";

// El PDF se escribe SIN comprimir, así que el texto viaja tal cual dentro de
// los bytes. windows-1252 es exactamente la codificación WinAnsi que declara el
// archivo: decodificar así devuelve los acentos y las rayas como se escribieron.
const texto = bytes => new TextDecoder("windows-1252").decode(bytes);

const byId = {
  r1: { id: "r1", fullName: "Sebastián Riquelme", gym: "Team Albino", weightKg: 59, age: 20 },
  b1: { id: "b1", fullName: "Rodrigo Bravo", gym: "O'Higgins Box", weightKg: 60, age: 21 },
  r2: { id: "r2", fullName: "Joaquín Muñoz", gym: "Iron Punches", weightKg: 58, age: 19 },
  b2: { id: "b2", fullName: "Felipe Miranda", gym: "Catedra Boxing", weightKg: 60, age: 22 },
};
function llave(over = {}) {
  return {
    id: "b1", catKey: "adulto__m_ligero", ageKey: "adulto", divKey: "m_ligero",
    catLabel: "Elite · Ligero (M)", regla: "Elite (19-40) · Ligero 55-60kg · Masculino", maxFights: 3,
    semis: [
      { red: "r1", blue: "b1", winner: null },
      { red: "r2", blue: "b2", winner: null },
    ],
    finalWinner: null,
    ...over,
  };
}

// ============================================
// Motor de PDF
// ============================================
describe("medición de texto", () => {
  it("usa los anchos oficiales de las fuentes base (Helvetica a 1000pt)", () => {
    // "AV" = 667 + 667 milésimas de em; a 1000pt son esos mismos puntos.
    expect(textWidth("AV", F.sans, 1000)).toBeCloseTo(1334, 3);
    expect(textWidth(" ", F.sans, 1000)).toBeCloseTo(278, 3);
  });
  it("una letra acentuada mide lo mismo que la letra sin acento", () => {
    expect(textWidth("Muñoz", F.sansBold, 12)).toBeCloseTo(textWidth("Munoz", F.sansBold, 12), 6);
    expect(textWidth("é", F.sans, 12)).toBeCloseTo(textWidth("e", F.sans, 12), 6);
  });
  it("la negrita es más ancha que la redonda", () => {
    expect(textWidth("Sangre Nueva", F.sansBold, 12)).toBeGreaterThan(textWidth("Sangre Nueva", F.sans, 12));
  });
  it("el espaciado entre letras no se cuenta después de la última", () => {
    const base = textWidth("ABC", F.sans, 10);
    expect(textWidth("ABC", F.sans, 10, 2)).toBeCloseTo(base + 4, 6);
  });
  it("mide el punto medio de los títulos (U17 · Cadete)", () => {
    expect(textWidth("·", F.sans, 1000)).toBeCloseTo(278, 3);
  });
});

describe("recorte con puntos suspensivos", () => {
  it("deja intacto lo que cabe", () => {
    expect(ellipsize("Corto", 200, F.sans, 10)).toBe("Corto");
  });
  it("recorta y nunca se pasa del ancho pedido", () => {
    const largo = "Maximiliano Alejandro Fernández Undurraga";
    const r = ellipsize(largo, 60, F.sansBold, 10);
    expect(r).not.toBe(largo);
    expect(r.endsWith("…")).toBe(true);
    expect(textWidth(r, F.sansBold, 10)).toBeLessThanOrEqual(60);
  });
  it("no deja un espacio ni un punto medio colgando antes de los puntos", () => {
    const r = ellipsize("Juan Pablo Rojas", 42, F.sans, 10);
    expect(r).not.toMatch(/[\s·-]…$/);
  });
});

describe("codificación WinAnsi", () => {
  it("conserva los acentos y la eñe", () => {
    expect(encodeText("Muñoz")).toBe("Muñoz");
    expect(encodeText("Sebastián")).toBe("Sebastián");
  });
  it("traduce la raya y los puntos suspensivos al tramo de Windows", () => {
    expect(encodeText("—")).toBe(String.fromCharCode(0x97)); // raya larga
    expect(encodeText("…")).toBe(String.fromCharCode(0x85)); // puntos suspensivos
  });
  it("escapa los paréntesis y la barra, que el formato reserva", () => {
    expect(encodeText("Ligero (M)")).toBe("Ligero \\(M\\)");
    expect(encodeText("a\\b")).toBe("a\\\\b");
  });
  it("descarta lo que no existe en la codificación en vez de romper el archivo", () => {
    expect(encodeText("🏆 Campeón")).toBe(" Campeón");
    expect(encodeText("✓")).toBe("");
  });
});

describe("utilidades de dibujo", () => {
  it("mezcla colores por los extremos y por el medio", () => {
    expect(mixColor("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mixColor("#000000", "#FFFFFF", 1)).toBe("#ffffff");
    expect(mixColor("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
  it("partir una curva conserva sus extremos y encadena los dos tramos", () => {
    const p = [0, 0, 10, 0, 20, 10, 30, 10];
    const [a, b] = splitCubic(p, 0.5);
    expect(a.slice(0, 2)).toEqual([0, 0]);
    expect(b.slice(6)).toEqual([30, 10]);
    expect(a.slice(6)).toEqual(b.slice(0, 2)); // el fin de uno es el inicio del otro
  });
  it("los tramos del degradado cubren la curva entera, sin huecos", () => {
    const p = [0, 0, 10, 0, 20, 10, 30, 10];
    const segs = cubicSegments(p, 7);
    expect(segs).toHaveLength(7);
    expect(segs[0].slice(0, 2)).toEqual([0, 0]);
    expect(segs[6].slice(6)).toEqual([30, 10]);
    segs.forEach((s, i) => { if (i) expect(s.slice(0, 2)).toEqual(segs[i - 1].slice(6)); });
  });
});

describe("estructura del archivo PDF", () => {
  const doc = createPdf({ title: "Prueba — ñ" });
  doc.text("Hola", 10, 20);
  doc.addPage();
  doc.rect(0, 0, 10, 10, { fill: "#FF0000" });
  const bytes = doc.build();
  const t = texto(bytes);

  it("empieza y termina como manda el formato", () => {
    expect(t.startsWith("%PDF-1.4")).toBe(true);
    expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
  });
  it("declara catálogo, páginas y la cantidad correcta", () => {
    expect(t).toContain("/Type /Catalog");
    expect(t).toContain("/Type /Pages");
    expect(t).toContain("/Count 2");
  });
  // La tabla xref es la parte frágil de escribir un PDF a mano: si un
  // desplazamiento se corre un byte, el lector abre el archivo en blanco.
  it("cada entrada de la tabla xref apunta al inicio de su objeto", () => {
    const inicio = t.lastIndexOf("\nxref\n") + 1;
    const lineas = t.slice(inicio).split("\n");
    const total = Number(lineas[1].split(" ")[1]);
    expect(total).toBeGreaterThan(5);
    for (let i = 1; i < total; i++) {
      const off = Number(lineas[2 + i].slice(0, 10));
      expect(t.slice(off, off + String(i).length + 6)).toBe(`${i} 0 obj`);
    }
  });
  it("startxref apunta a la tabla xref", () => {
    const decl = Number(t.slice(t.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
    expect(t.slice(decl, decl + 4)).toBe("xref");
  });
  it("declara las fuentes base sin incrustar tipografías", () => {
    expect(t).toContain("/BaseFont /Helvetica-Bold");
    expect(t).toContain("/Encoding /WinAnsiEncoding");
    expect(t).not.toContain("/FontFile");
  });
  it("el largo declarado de cada stream es el real", () => {
    const re = /<< \/Length (\d+) >>\nstream\n/g;
    let m, encontrados = 0;
    while ((m = re.exec(t))) {
      encontrados++;
      const ini = m.index + m[0].length;
      expect(t.slice(ini + Number(m[1]), ini + Number(m[1]) + 10)).toBe("\nendstream");
    }
    expect(encontrados).toBe(2);
  });
});

// ============================================
// Planilla del Super 4 en PDF
// ============================================
describe("PDF de las llaves del Super 4", () => {
  it("dibuja el título de la llave, las tres fases y los datos de cada atleta", () => {
    const t = texto(buildSuper4Pdf([llave()], byId, "23-07-2026"));
    expect(t).toContain("Elite · Adulto/Elite · Ligero \\(M\\)"); // World Boxing · FECHIBOX · división
    expect(t).toContain("SEMIFINAL 1");
    expect(t).toContain("SEMIFINAL 2");
    expect(t).toContain("FINAL");
    expect(t).toContain("Sebastián Riquelme");
    expect(t).toContain("TEAM ALBINO · 59kg · 20a");
  });

  it("mantiene el cupo de la final como promesa hasta que haya ganador de semi", () => {
    const t = texto(buildSuper4Pdf([llave()], byId, ""));
    expect(t).toContain("Ganador Semifinal 1");
    expect(t).toContain("Ganador Semifinal 2");
  });

  it("marca el cupo vacío de una llave incompleta", () => {
    const incompleta = llave({ semis: [{ red: "r1", blue: "b1", winner: null }, { red: null, blue: "b2", winner: null }] });
    expect(texto(buildSuper4Pdf([incompleta], byId, ""))).toContain("Cupo libre");
  });

  it("corona al campeón cuando la final ya se decidió", () => {
    const cerrada = llave({
      semis: [{ red: "r1", blue: "b1", winner: "r1" }, { red: "r2", blue: "b2", winner: "b2" }],
      finalWinner: "b2",
    });
    const t = texto(buildSuper4Pdf([cerrada], byId, ""));
    expect(t).toContain("CAMPEÓN");
    expect(t).toContain("Felipe Miranda");
  });

  it("anuncia el tope de peleas arriba solo si TODAS las llaves comparten el mismo", () => {
    const iguales = texto(buildSuper4Pdf([llave(), llave({ id: "b2", maxFights: 3 })], byId, ""));
    expect(iguales).toContain("Torneo limitado a peleadores con hasta 3 peleas");
    const distintos = texto(buildSuper4Pdf([llave(), llave({ id: "b2", maxFights: 10 })], byId, ""));
    expect(distintos).not.toContain("Torneo limitado a peleadores");
    expect(distintos).toContain("HASTA 3 PELEAS");  // en la píldora de cada llave
    expect(distintos).toContain("HASTA 10 PELEAS");
  });

  it("las llaves de sobra pasan a la página siguiente", () => {
    const una = texto(buildSuper4Pdf([llave()], byId, ""));
    expect(una).toContain("/Count 1");
    expect(una).toContain("Página 1 de 1");
    const muchas = texto(buildSuper4Pdf(Array.from({ length: 6 }, (_, i) => llave({ id: "b" + i })), byId, ""));
    expect(muchas).toContain("/Count 2");
    expect(muchas).toContain("Página 2 de 2");
  });

  it("no revienta si la llave vuelve de la nube con una sola semifinal", () => {
    // Firebase no guarda las claves en null: una semifinal entera vacía
    // desaparece y `semis` vuelve con largo 1.
    const truncada = llave({ semis: [{ red: "r1", blue: "b1", winner: null }] });
    expect(() => buildSuper4Pdf([truncada], byId, "")).not.toThrow();
    expect(texto(buildSuper4Pdf([truncada], byId, ""))).toContain("SEMIFINAL 2");
  });

  it("aguanta llaves vacías, byId incompleto y cinturones antiguos", () => {
    expect(() => buildSuper4Pdf([], {}, "")).not.toThrow();
    expect(() => buildSuper4Pdf(null, {}, "")).not.toThrow();
    expect(() => buildSuper4Pdf(undefined, undefined, "")).not.toThrow();
    expect(() => buildSuper4Pdf([llave()], {}, "")).not.toThrow();
    // Cinturón "legacy": sin ageKey/divKey, solo catLabel y regla.
    const legacy = { id: "old", catKey: "cadete71", catLabel: "Cadetes 71kg", regla: "Cadete · hasta 71kg", semis: [{ red: "r1", blue: "b1" }, { red: "r2", blue: "b2" }] };
    const t = texto(buildSuper4Pdf([legacy], byId, ""));
    expect(t).toContain("Cadetes 71kg");
    expect(t).toContain("Cadete · hasta 71kg"); // sin píldoras, cae a la regla guardada
  });

  it("no imprime undefined ni NaN cuando a un atleta le falta el peso o la edad", () => {
    const sinDatos = { z: { id: "z", fullName: "Sin Datos" } };
    const t = texto(buildSuper4Pdf([llave({ semis: [{ red: "z", blue: null }, { red: null, blue: null }] })], sinDatos, ""));
    expect(t).toContain("Sin Datos");
    expect(t).not.toContain("undefined");
    expect(t).not.toContain("NaN");
  });

  it("el archivo generado sigue siendo un PDF válido con datos reales", () => {
    const bytes = buildSuper4Pdf([llave()], byId, "23-07-2026");
    expect(bytes).toBeInstanceOf(Uint8Array);
    const t = texto(bytes);
    expect(t.startsWith("%PDF-1.4")).toBe(true);
    expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
    // Ningún byte puede haberse perdido al pasar de texto a bytes.
    expect(bytes.every(b => b >= 0 && b <= 255)).toBe(true);
  });
});

describe("nombre del archivo PDF", () => {
  it("lleva la fecha y la extensión correcta", () => {
    expect(pdfFilename("Super 4 Sangre Nueva", "23-07-2026")).toBe("Super 4 Sangre Nueva 23-07-2026.pdf");
  });
  it("quita los caracteres que rompen la descarga", () => {
    expect(pdfFilename("Super 4: llaves/2026", "01-08-2026")).toBe("Super 4- llaves-2026 01-08-2026.pdf");
  });
});
