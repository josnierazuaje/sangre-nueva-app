import { describe, it, expect } from "vitest";
import { SUPER4_CATEGORIES, SUPER4_AGE_KEYS, ALL_DIVISION_KEYS, eligibleForCategory, eligibleForDivision, pickFour, pairSemis, buildSuper4Brackets, mergeRegenerated, setSemiWinner, setFinalWinner, replaceFighter, availableReplacements, filterByMaxFights, bracketMaxFights, super4FighterIds, bracketPrintTitle, normalizeSuper4 } from "../super4.js";
import { dupKey } from "../dedup.js";

let n = 0;
function f(over) {
  n++;
  return { id: over.id || "f" + n, fullName: over.fullName || "Peleador " + n, gym: over.gym || "Gimnasio " + n, age: over.age ?? 25, weightKg: over.weightKg ?? 60, sexo: over.sexo || "M", fightCount: 1, createdAt: new Date(2026, 0, 1).toISOString(), ...over };
}

// Divisiones oficiales usadas en los tests (masculinas): m_ligero 55-60,
// m_welter 60-65, m_pesado 85-90. getWeightCategory asigna cada peso a la
// primera división cuyo tope no supere.

const cat71 = SUPER4_CATEGORIES.find(c => c.key === "cadete71"); // llave vieja (compat)
const cat92 = SUPER4_CATEGORIES.find(c => c.key === "adulto92");

// ---------- Funciones legacy (cinturones), aún usadas para compatibilidad ----------
describe("eligibleForCategory (cinturones, compat)", () => {
  it("exige categoría de edad World Boxing, sexo y límite de peso", () => {
    const ok = f({ age: 15, weightKg: 70 });
    const pesado = f({ age: 16, weightKg: 72 });
    const juvenil = f({ age: 17, weightKg: 65 });
    const mujer = f({ age: 15, weightKg: 65, sexo: "F" });
    const sinPeso = f({ age: 15, weightKg: undefined });
    const res = eligibleForCategory(cat71, [ok, pesado, juvenil, mujer, sinPeso]);
    expect(res.map(x => x.id)).toEqual([ok.id]);
  });
  it("la categoría +92 exige peso desde 92 hacia arriba", () => {
    const res = eligibleForCategory(cat92, [f({ weightKg: 91 }), f({ id: "j", weightKg: 92 }), f({ id: "a", weightKg: 120 })]);
    expect(res.map(x => x.id)).toEqual(["j", "a"]);
  });
});

describe("pickFour (cinturones, compat)", () => {
  it("elige a los 4 más cercanos al límite (hasta X)", () => {
    const els = [55, 66, 60, 70, 68, 58].map(w => f({ age: 15, weightKg: w, id: "w" + w }));
    expect(pickFour(cat71, els).map(x => x.weightKg).sort((a, b) => a - b)).toEqual([60, 66, 68, 70]);
  });
});

describe("pairSemis", () => {
  it("evita cruzar compañeros de la misma escuela cuando hay alternativa", () => {
    const four = [
      f({ id: "a", gym: "AZUAJE", weightKg: 70 }), f({ id: "b", gym: "AZUAJE", weightKg: 69 }),
      f({ id: "c", gym: "HH ARIAS", weightKg: 68 }), f({ id: "d", gym: "HH ARIAS", weightKg: 67 }),
    ];
    const [s1, s2] = pairSemis(four);
    expect(new Set(s1.map(x => x.gym)).size).toBe(2);
    expect(new Set(s2.map(x => x.gym)).size).toBe(2);
  });
});

// ---------- Generación por (edad × división de peso oficial) ----------
describe("eligibleForDivision", () => {
  it("exige edad y división correctas (con el sexo implícito en la división)", () => {
    const ok = f({ age: 15, weightKg: 63, sexo: "M" });   // cadete · m_welter
    const otroPeso = f({ age: 15, weightKg: 58, sexo: "M" }); // m_ligero
    const otraEdad = f({ age: 25, weightKg: 63, sexo: "M" }); // adulto
    const mujer = f({ age: 15, weightKg: 63, sexo: "F" });    // f_welter, no m_welter
    const res = eligibleForDivision("cadete", "m_welter", [ok, otroPeso, otraEdad, mujer]);
    expect(res.map(x => x.id)).toEqual([ok.id]);
  });
});

describe("buildSuper4Brackets (edad × división)", () => {
  it("arma la llave con 4 elegibles y reporta la combinación incompleta (1-3)", () => {
    const fighters = [
      // 4 cadetes en m_welter (60-65)
      f({ age: 15, weightKg: 61 }), f({ age: 15, weightKg: 62 }), f({ age: 16, weightKg: 63 }), f({ age: 16, weightKg: 64 }),
      // 2 adultos en m_pesado (85-90) → falta
      f({ age: 25, weightKg: 86 }), f({ age: 30, weightKg: 88 }),
    ];
    const { brackets, faltantes } = buildSuper4Brackets(fighters);
    expect(brackets.map(b => b.catKey)).toEqual(["cadete__m_welter"]);
    const falta = faltantes.find(x => x.catKey === "adulto__m_pesado");
    expect(falta.elegibles).toBe(2);
    expect(falta.faltan).toBe(2);
  });

  it("cada atleta cae en su división; distintas divisiones = distintas llaves sin solape", () => {
    const ligero = [56, 57, 58, 59].map((w, i) => f({ id: "lig" + i, age: 25, weightKg: w }));
    const welter = [61, 62, 63, 64].map((w, i) => f({ id: "wel" + i, age: 25, weightKg: w }));
    const { brackets } = buildSuper4Brackets([...ligero, ...welter]);
    const bLig = brackets.find(b => b.catKey === "adulto__m_ligero");
    const bWel = brackets.find(b => b.catKey === "adulto__m_welter");
    expect(bLig).toBeTruthy();
    expect(bWel).toBeTruthy();
    const idsLig = [bLig.semis[0].red, bLig.semis[0].blue, bLig.semis[1].red, bLig.semis[1].blue].sort();
    const idsWel = [bWel.semis[0].red, bWel.semis[0].blue, bWel.semis[1].red, bWel.semis[1].blue];
    expect(idsLig).toEqual(["lig0", "lig1", "lig2", "lig3"]);
    expect(idsWel.filter(id => idsLig.includes(id))).toEqual([]);
  });

  it("arma llaves separadas por sexo (división masculina y femenina)", () => {
    const fighters = [
      ...[61, 62, 63, 64].map((w, i) => f({ id: "m" + i, age: 25, weightKg: w, sexo: "M" })), // m_welter
      ...[61, 62, 63, 64].map((w, i) => f({ id: "fe" + i, age: 25, weightKg: w, sexo: "F" })), // f_welter
    ];
    const keys = buildSuper4Brackets(fighters).brackets.map(b => b.catKey);
    expect(keys).toContain("adulto__m_welter");
    expect(keys).toContain("adulto__f_welter");
  });

  it("devuelve las llaves en orden determinista (edad y luego peso); cortar las primeras N es seguro", () => {
    // Base para el selector "Cantidad de llaves": el tope arma las primeras N
    // en este orden, y cortar no puede dejar a nadie en dos llaves.
    const fighters = [
      ...[61, 62, 63, 64].map((w, i) => f({ id: "cw" + i, age: 15, weightKg: w })), // cadete m_welter
      ...[56, 57, 58, 59].map((w, i) => f({ id: "al" + i, age: 25, weightKg: w })), // adulto m_ligero
      ...[61, 62, 63, 64].map((w, i) => f({ id: "aw" + i, age: 25, weightKg: w })), // adulto m_welter
    ];
    const { brackets } = buildSuper4Brackets(fighters);
    // Orden: menor edad primero (cadete antes que adulto), luego menor peso.
    expect(brackets.map(b => b.catKey)).toEqual(["cadete__m_welter", "adulto__m_ligero", "adulto__m_welter"]);
    const primeras = brackets.slice(0, 2); // lo que hace el tope de cantidad
    expect(primeras.map(b => b.catKey)).toEqual(["cadete__m_welter", "adulto__m_ligero"]);
    const ids = primeras.flatMap(b => [b.semis[0].red, b.semis[0].blue, b.semis[1].red, b.semis[1].blue]);
    expect(new Set(ids).size).toBe(ids.length); // ningún peleador repetido entre llaves
  });

  it("solo arma llaves de las categorías de edad seleccionadas", () => {
    const fighters = [
      ...[61, 62, 63, 64].map((w, i) => f({ id: "c" + i, age: 15, weightKg: w })), // cadetes m_welter
      ...[61, 62, 63, 64].map((w, i) => f({ id: "a" + i, age: 25, weightKg: w })), // adultos m_welter
    ];
    expect(buildSuper4Brackets(fighters, null, ["cadete"]).brackets.map(b => b.catKey)).toEqual(["cadete__m_welter"]);
    expect(buildSuper4Brackets(fighters, null, ["cadete"]).faltantes.some(x => x.catKey.startsWith("adulto"))).toBe(false);
    expect(buildSuper4Brackets(fighters, null, ["adulto"]).brackets.map(b => b.catKey)).toEqual(["adulto__m_welter"]);
    const todas = buildSuper4Brackets(fighters, null, null).brackets.map(b => b.catKey);
    expect(todas).toContain("cadete__m_welter");
    expect(todas).toContain("adulto__m_welter");
  });

  it("solo arma llaves de las divisiones de peso seleccionadas", () => {
    const fighters = [
      ...[61, 62, 63, 64].map((w, i) => f({ id: "w" + i, age: 25, weightKg: w })), // m_welter
      ...[56, 57, 58, 59].map((w, i) => f({ id: "l" + i, age: 25, weightKg: w })), // m_ligero
    ];
    expect(buildSuper4Brackets(fighters, null, null, ["m_welter"]).brackets.map(b => b.catKey)).toEqual(["adulto__m_welter"]);
    expect(buildSuper4Brackets(fighters, null, null, ["m_welter", "m_ligero"]).brackets.map(b => b.catKey).sort()).toEqual(["adulto__m_ligero", "adulto__m_welter"]);
  });

  it("ALL_DIVISION_KEYS incluye las 10 masculinas y 10 femeninas", () => {
    expect(ALL_DIVISION_KEYS.filter(k => k.startsWith("m_"))).toHaveLength(10);
    expect(ALL_DIVISION_KEYS.filter(k => k.startsWith("f_"))).toHaveLength(10);
  });

  it("divisiones/edades = [] (ninguna) NO cae por error a 'todas'", () => {
    const fighters = [61, 62, 63, 64].map((w, i) => f({ id: "w" + i, age: 25, weightKg: w }));
    expect(buildSuper4Brackets(fighters, null, null, []).brackets).toHaveLength(0); // sin divisiones
    expect(buildSuper4Brackets(fighters, null, [], null).brackets).toHaveLength(0); // sin edades
    // null sigue significando "todas"
    expect(buildSuper4Brackets(fighters, null, null, null).brackets.length).toBeGreaterThan(0);
  });

  it("reservedPersons excluye a quien ya está en otra llave (evita doble-agendamiento)", () => {
    const fighters = [
      f({ id: "a", age: 25, weightKg: 64 }), f({ id: "b", age: 25, weightKg: 63 }),
      f({ id: "c", age: 25, weightKg: 62 }), f({ id: "d", age: 25, weightKg: 61 }),
    ];
    // 'a' y 'b' ya están reservados en otra llave → la división debe quedar con solo 2 y no armarse
    const reserved = new Set([dupKey(fighters[0]), dupKey(fighters[1])]);
    const { brackets, faltantes } = buildSuper4Brackets(fighters, null, null, ["m_welter"], reserved);
    expect(brackets).toHaveLength(0);
    expect(faltantes.find(x => x.catKey === "adulto__m_welter").elegibles).toBe(2);
  });

  it("allowIncomplete arma llaves INCOMPLETAS (1-3 atletas) con los cupos faltantes en null", () => {
    const fighters = [f({ id: "w1", age: 25, weightKg: 61 }), f({ id: "w2", age: 25, weightKg: 63 })]; // 2 en m_welter
    // Sin allowIncomplete: no se arma, va a faltantes.
    const sin = buildSuper4Brackets(fighters, null, ["adulto"], ["m_welter"]);
    expect(sin.brackets).toHaveLength(0);
    expect(sin.faltantes.find(x => x.catKey === "adulto__m_welter").elegibles).toBe(2);
    // Con allowIncomplete: se arma 1 llave con 2 cupos llenos y 2 en null.
    const con = buildSuper4Brackets(fighters, null, ["adulto"], ["m_welter"], null, true);
    expect(con.brackets).toHaveLength(1);
    const ids = [con.brackets[0].semis[0].red, con.brackets[0].semis[0].blue, con.brackets[0].semis[1].red, con.brackets[0].semis[1].blue];
    expect(ids.filter(x => x != null).sort()).toEqual(["w1", "w2"]);
    expect(ids.filter(x => x == null)).toHaveLength(2);
    // No la reporta como faltante (ya está armada, aunque incompleta).
    expect(con.faltantes.some(x => x.catKey === "adulto__m_welter")).toBe(false);
  });

  it("allowIncomplete NO arma llave para una categoría con 0 atletas", () => {
    const fighters = [f({ id: "a", age: 25, weightKg: 61 })]; // adulto m_welter
    const r = buildSuper4Brackets(fighters, null, ["adulto"], ["m_pesado"], null, true); // m_pesado: 0 atletas
    expect(r.brackets).toHaveLength(0);
  });

  it("una llave COMPLETA (4) se arma igual con allowIncomplete, sin cupos null", () => {
    const fighters = [61, 62, 63, 64].map((w, i) => f({ id: "w" + i, age: 25, weightKg: w }));
    const r = buildSuper4Brackets(fighters, null, ["adulto"], ["m_welter"], null, true);
    expect(r.brackets).toHaveLength(1);
    const ids = [r.brackets[0].semis[0].red, r.brackets[0].semis[0].blue, r.brackets[0].semis[1].red, r.brackets[0].semis[1].blue];
    expect(ids.filter(x => x == null)).toHaveLength(0);
  });

  it("NO pone dos peleadores de la misma escuela en la misma llave (elige el más pesado de cada una)", () => {
    const fighters = [
      f({ id: "c1", age: 25, weightKg: 64, gym: "Cayo Boxing" }),
      f({ id: "c2", age: 25, weightKg: 61.5, gym: "Cayo Boxing" }), // misma escuela que c1
      f({ id: "ta", age: 25, weightKg: 63, gym: "Team A" }),
      f({ id: "tb", age: 25, weightKg: 62, gym: "Team B" }),
      f({ id: "td", age: 25, weightKg: 61, gym: "Team D" }),
    ];
    const { brackets } = buildSuper4Brackets(fighters, null, ["adulto"], ["m_welter"]);
    expect(brackets).toHaveLength(1);
    const ids = [brackets[0].semis[0].red, brackets[0].semis[0].blue, brackets[0].semis[1].red, brackets[0].semis[1].blue];
    expect(ids).toContain("c1");         // el más pesado de Cayo entra
    expect(ids).not.toContain("c2");     // el 2º de Cayo NO
    const gyms = ids.map(id => fighters.find(x => x.id === id).gym.toLowerCase());
    expect(new Set(gyms).size).toBe(gyms.length); // todas las escuelas distintas
  });

  it("si no hay 4 escuelas distintas, no completa la llave (faltante); con allowIncomplete queda incompleta", () => {
    const fighters = [
      f({ id: "c1", age: 25, weightKg: 64, gym: "Cayo Boxing" }),
      f({ id: "c2", age: 25, weightKg: 63, gym: "Cayo Boxing" }),
      f({ id: "c3", age: 25, weightKg: 62, gym: "Cayo Boxing" }),
      f({ id: "ta", age: 25, weightKg: 61, gym: "Team A" }),
    ]; // 4 elegibles pero solo 2 escuelas
    const sin = buildSuper4Brackets(fighters, null, ["adulto"], ["m_welter"]);
    expect(sin.brackets).toHaveLength(0);
    expect(sin.faltantes.find(x => x.catKey === "adulto__m_welter").elegibles).toBe(2); // 2 escuelas distintas
    const con = buildSuper4Brackets(fighters, null, ["adulto"], ["m_welter"], null, true);
    expect(con.brackets).toHaveLength(1);
    const ids = [con.brackets[0].semis[0].red, con.brackets[0].semis[0].blue, con.brackets[0].semis[1].red, con.brackets[0].semis[1].blue];
    expect(ids.filter(x => x != null).sort()).toEqual(["c1", "ta"]); // uno por escuela
    expect(ids.filter(x => x == null)).toHaveLength(2);
  });

  it("las escuelas vacías / sin dato NO bloquean (no se puede afirmar que sean la misma)", () => {
    const fighters = [64, 63, 62, 61].map((w, i) => f({ id: "s" + i, age: 25, weightKg: w, gym: "" }));
    const { brackets } = buildSuper4Brackets(fighters, null, ["adulto"], ["m_welter"]);
    expect(brackets).toHaveLength(1);
    const ids = [brackets[0].semis[0].red, brackets[0].semis[0].blue, brackets[0].semis[1].red, brackets[0].semis[1].blue];
    expect(ids.filter(x => x != null)).toHaveLength(4);
  });
});

describe("progresión de ganadores", () => {
  function bracketBase() {
    const fighters = [
      f({ id: "a", age: 15, weightKg: 64 }), f({ id: "b", age: 15, weightKg: 63 }),
      f({ id: "c", age: 16, weightKg: 62 }), f({ id: "d", age: 16, weightKg: 61 }),
    ];
    return buildSuper4Brackets(fighters).brackets;
  }

  it("marcar ganadores de semis habilita la final; cambiar un semifinalista limpia la final", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 1, b.semis[1].red);
    brackets = setFinalWinner(brackets, b.id, b.semis[0].red);
    expect(brackets[0].finalWinner).toBe(b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].blue);
    expect(brackets[0].finalWinner).toBe(null);
  });

  it("NO permite coronar campeón con una sola semifinal decidida", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setFinalWinner(brackets, b.id, b.semis[0].red);
    expect(brackets[0].finalWinner).toBe(null);
  });

  it("no acepta como campeón a alguien que no es finalista", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 1, b.semis[1].red);
    brackets = setFinalWinner(brackets, b.id, b.semis[0].blue);
    expect(brackets[0].finalWinner).toBe(null);
  });

  it("volver a tocar al ganador lo desmarca", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    expect(brackets[0].semis[0].winner).toBe(null);
  });

  it("corregir la OTRA semifinal también destrona al campeón", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 1, b.semis[1].red);
    brackets = setFinalWinner(brackets, b.id, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 1, b.semis[1].blue);
    expect(brackets[0].finalWinner).toBe(null);
  });
});

describe("duplicados en la generación", () => {
  it("un registro con IDENTIDAD EXACTA repetida (nombre+sexo+peso) no ocupa dos cupos", () => {
    const fighters = [
      f({ id: "p1", fullName: "Jose Perez", age: 25, weightKg: 88 }),
      f({ id: "p2", fullName: "JOSE PEREZ", age: 25, weightKg: 88 }), // misma identidad
      f({ id: "q1", fullName: "Rival Uno", age: 25, weightKg: 86 }),
      f({ id: "q2", fullName: "Rival Dos", age: 25, weightKg: 87 }),
      f({ id: "q3", fullName: "Rival Tres", age: 25, weightKg: 89 }),
    ];
    const b = buildSuper4Brackets(fighters).brackets.find(b => b.catKey === "adulto__m_pesado");
    expect(b).toBeTruthy();
    const ids = [b.semis[0].red, b.semis[0].blue, b.semis[1].red, b.semis[1].blue];
    expect(ids.filter(id => id === "p1" || id === "p2")).toHaveLength(1);
  });

  it("dos personas distintas con el mismo nombre pero distinto peso pueden estar ambas en la misma división", () => {
    const fighters = [
      f({ id: "s1", fullName: "Juan Soto", age: 25, weightKg: 62 }),
      f({ id: "s2", fullName: "Juan Soto", age: 25, weightKg: 63 }), // otra persona
      f({ id: "x1", fullName: "Pedro Uno", age: 25, weightKg: 61 }),
      f({ id: "x2", fullName: "Luis Dos", age: 25, weightKg: 64 }),
    ];
    const b = buildSuper4Brackets(fighters).brackets.find(x => x.catKey === "adulto__m_welter");
    expect(b).toBeTruthy();
    const ids = [b.semis[0].red, b.semis[0].blue, b.semis[1].red, b.semis[1].blue].sort();
    expect(ids).toEqual(["s1", "s2", "x1", "x2"]);
  });
});

describe("reemplazo de peleadores (botón ✕)", () => {
  function bracketCadetes() {
    const fighters = [
      f({ id: "a", age: 15, weightKg: 64 }), f({ id: "b", age: 15, weightKg: 63 }),
      f({ id: "c", age: 16, weightKg: 62 }), f({ id: "d", age: 16, weightKg: 61 }),
      f({ id: "e", age: 15, weightKg: 60.5 }), // 5º en m_welter, el más liviano → queda fuera
    ];
    return { fighters, brackets: buildSuper4Brackets(fighters).brackets };
  }

  it("replaceFighter cambia el atleta del cupo y limpia el ganador de esa semi", () => {
    let { brackets } = bracketCadetes();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = replaceFighter(brackets, b.id, 0, "red", "e");
    expect(brackets[0].semis[0].red).toBe("e");
    expect(brackets[0].semis[0].winner).toBe(null);
  });

  it("replaceFighter destrona al campeón si el reemplazado era finalista", () => {
    let { brackets } = bracketCadetes();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 1, b.semis[1].red);
    brackets = setFinalWinner(brackets, b.id, b.semis[0].red);
    brackets = replaceFighter(brackets, b.id, 0, "red", "e");
    expect(brackets[0].finalWinner).toBe(null);
  });

  it("availableReplacements ofrece sólo elegibles que no están en ninguna llave", () => {
    const { fighters, brackets } = bracketCadetes();
    expect(availableReplacements("cadete__m_welter", fighters, brackets).map(x => x.id)).toEqual(["e"]);
  });

  it("availableReplacements excluye un duplicado exacto del presente, pero ofrece a un homónimo de distinto peso", () => {
    const fighters = [
      f({ id: "a", age: 15, weightKg: 64, fullName: "Juan Soto" }),
      f({ id: "b", age: 15, weightKg: 63.5 }),
      f({ id: "c", age: 16, weightKg: 63 }),
      f({ id: "d", age: 16, weightKg: 62.5 }),
      f({ id: "dupExacto", age: 15, weightKg: 64, fullName: "JUAN SOTO" }), // misma identidad que 'a'
      f({ id: "homonimo", age: 15, weightKg: 61, fullName: "juan soto" }),  // otra persona
    ];
    const { brackets } = buildSuper4Brackets(fighters);
    const disp = availableReplacements("cadete__m_welter", fighters, brackets);
    expect(disp.some(x => x.id === "dupExacto")).toBe(false);
    expect(disp.some(x => x.id === "homonimo")).toBe(true);
  });

  it("availableReplacements funciona con una llave VIEJA de cinturón (compat)", () => {
    const fighters = [
      f({ id: "u1", age: 25, weightKg: 66 }), f({ id: "u2", age: 25, weightKg: 65 }),
      f({ id: "libre", age: 25, weightKg: 60 }),
      f({ id: "pesado", age: 25, weightKg: 80 }), // pasa 67 → no elegible para adulto67
    ];
    const bracketViejo = [{ id: "b", catKey: "adulto67", semis: [{ red: "u1", blue: "u2", winner: null }, { red: "x", blue: "y", winner: null }] }];
    const disp = availableReplacements("adulto67", fighters, bracketViejo).map(x => x.id);
    expect(disp).toContain("libre");
    expect(disp).not.toContain("u1");
    expect(disp).not.toContain("pesado");
  });
});

describe("tope por número de peleas (Peleadores hasta con:)", () => {
  it("filterByMaxFights deja solo a los que tienen esa cantidad de peleas o menos", () => {
    const fighters = [f({ id: "a", fightCount: 0 }), f({ id: "b", fightCount: 3 }), f({ id: "c", fightCount: 4 }), f({ id: "d", fightCount: 15 })];
    expect(filterByMaxFights(fighters, 3).map(x => x.id).sort()).toEqual(["a", "b"]);
    expect(filterByMaxFights(fighters, 0).map(x => x.id)).toEqual(["a"]);
    expect(filterByMaxFights(fighters, null)).toHaveLength(4);
  });

  it("fightCount ausente cuenta como 0 peleas", () => {
    const fighters = [f({ id: "x", fightCount: undefined }), f({ id: "y", fightCount: "abc" })];
    expect(filterByMaxFights(fighters, 0).map(x => x.id).sort()).toEqual(["x", "y"]);
  });

  it("buildSuper4Brackets con tope 3 solo arma con peleadores de hasta 3 peleas", () => {
    const fighters = [
      f({ id: "n1", age: 15, weightKg: 64, fightCount: 0 }),
      f({ id: "n2", age: 15, weightKg: 63, fightCount: 2 }),
      f({ id: "n3", age: 16, weightKg: 62, fightCount: 3 }),
      f({ id: "n4", age: 16, weightKg: 61, fightCount: 1 }),
      f({ id: "exp1", age: 15, weightKg: 60.5, fightCount: 12 }),
      f({ id: "exp2", age: 16, weightKg: 64.5, fightCount: 8 }),
    ];
    const b = buildSuper4Brackets(fighters, 3).brackets.find(x => x.catKey === "cadete__m_welter");
    expect(b).toBeTruthy();
    expect([b.semis[0].red, b.semis[0].blue, b.semis[1].red, b.semis[1].blue].sort()).toEqual(["n1", "n2", "n3", "n4"]);
    expect(b.maxFights).toBe(3);
  });

  it("con tope 3 y solo 3 elegibles, la combinación no se arma aunque haya expertos", () => {
    const fighters = [
      f({ id: "n1", age: 15, weightKg: 64, fightCount: 0 }),
      f({ id: "n2", age: 15, weightKg: 63, fightCount: 2 }),
      f({ id: "n3", age: 16, weightKg: 62, fightCount: 3 }),
      f({ id: "e1", age: 16, weightKg: 61, fightCount: 20 }),
      f({ id: "e2", age: 15, weightKg: 60.5, fightCount: 15 }),
    ];
    const { brackets, faltantes } = buildSuper4Brackets(fighters, 3);
    expect(brackets.find(b => b.catKey === "cadete__m_welter")).toBeFalsy();
    expect(faltantes.find(x => x.catKey === "cadete__m_welter").elegibles).toBe(3);
  });

  it("availableReplacements respeta el tope: no ofrece a un experto", () => {
    const fighters = [
      f({ id: "n1", age: 15, weightKg: 64, fightCount: 0 }),
      f({ id: "n2", age: 15, weightKg: 63, fightCount: 2 }),
      f({ id: "n3", age: 16, weightKg: 62, fightCount: 3 }),
      f({ id: "n4", age: 16, weightKg: 61, fightCount: 1 }),
      f({ id: "n5", age: 15, weightKg: 60.5, fightCount: 0 }),
      f({ id: "exp", age: 15, weightKg: 64.5, fightCount: 18 }),
    ];
    const { brackets } = buildSuper4Brackets(fighters, 3);
    const disp = availableReplacements("cadete__m_welter", fighters, brackets, bracketMaxFights(brackets[0])).map(x => x.id);
    expect(disp).toContain("n5");
    expect(disp).not.toContain("exp");
  });

  it("bracketMaxFights lee el número nuevo y convierte el nivel viejo (compat)", () => {
    expect(bracketMaxFights({ maxFights: 3 })).toBe(3);
    expect(bracketMaxFights({ maxFights: 0 })).toBe(0);
    expect(bracketMaxFights({ maxFights: null })).toBe(null);
    expect(bracketMaxFights({ maxExpKey: "principiante" })).toBe(3);
    expect(bracketMaxFights({ maxExpKey: "debutante" })).toBe(0);
    expect(bracketMaxFights({})).toBe(null);
  });
});

describe("mergeRegenerated (no destructivo)", () => {
  it("CONSERVA las llaves que no se regeneraron (no borra campeones)", () => {
    const existing = [
      { catKey: "cadete__m_welter", finalWinner: null },
      { catKey: "adulto__m_pesado", finalWinner: "campeon-x" },
    ];
    const regenerated = [{ catKey: "cadete__m_welter", finalWinner: null, nuevo: true }];
    const merged = mergeRegenerated(existing, regenerated);
    expect(merged.find(b => b.catKey === "adulto__m_pesado").finalWinner).toBe("campeon-x");
    expect(merged.find(b => b.catKey === "cadete__m_welter").nuevo).toBe(true);
  });

  it("conserva también llaves viejas de cinturón (compat)", () => {
    const existing = [{ catKey: "adulto67", finalWinner: "y" }];
    const regenerated = [{ catKey: "cadete__m_welter" }];
    const merged = mergeRegenerated(existing, regenerated);
    expect(merged.map(b => b.catKey).sort()).toEqual(["adulto67", "cadete__m_welter"]);
    expect(merged.find(b => b.catKey === "adulto67").finalWinner).toBe("y");
  });

  it("ordena por edad primero: una llave femenina de cadete va ANTES que una masculina de juvenil", () => {
    const merged = mergeRegenerated([], [{ catKey: "juvenil__m_ligero" }, { catKey: "cadete__f_welter" }]);
    expect(merged.map(b => b.catKey)).toEqual(["cadete__f_welter", "juvenil__m_ligero"]);
  });

  it("con clearKeys (tope de cantidad): limpia las llaves viejas de categorías ELEGIDAS que quedaron fuera del resultado; conserva legacy y no elegidas", () => {
    const existing = [
      { catKey: "adulto__m_ligero", finalWinner: "camp-lig" }, // elegida, fuera del tope → se limpia
      { catKey: "adulto__m_welter", finalWinner: null },       // elegida, regenerada → reemplazada
      { catKey: "adulto67", finalWinner: "camp-legacy" },      // legacy (no elegida) → se conserva
    ];
    const regenerated = [{ catKey: "adulto__m_welter", nuevo: true }];
    const scope = new Set(["adulto__m_ligero", "adulto__m_welter"]); // = regenKeys (toda la selección)
    const merged = mergeRegenerated(existing, regenerated, scope);
    const keys = merged.map(b => b.catKey);
    expect(keys).toContain("adulto__m_welter"); // regenerada
    expect(keys).toContain("adulto67");         // legacy conservado
    expect(keys).not.toContain("adulto__m_ligero"); // elegida pero fuera del tope → limpiada
    expect(merged.find(b => b.catKey === "adulto__m_welter").nuevo).toBe(true);
    expect(merged.find(b => b.catKey === "adulto67").finalWinner).toBe("camp-legacy");
  });
});

describe("SUPER4_AGE_KEYS", () => {
  it("lista las edades que el Super 4 ofrece por defecto, sin repetir", () => {
    expect(SUPER4_AGE_KEYS).toEqual(["cadete", "juvenil", "adulto"]);
  });
});

describe("super4FighterIds", () => {
  it("recolecta los 4 ids (red/blue de ambas semis) de cada bracket", () => {
    const brackets = [
      { id: "k1", semis: [{ red: "a", blue: "b", winner: null }, { red: "c", blue: "d", winner: null }], finalWinner: null },
      { id: "k2", semis: [{ red: "e", blue: "f", winner: null }, { red: "g", blue: null, winner: null }], finalWinner: null },
    ];
    expect([...super4FighterIds(brackets)].sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
  it("tolera nulos, brackets sin semis y lista vacía", () => {
    expect(super4FighterIds(null).size).toBe(0);
    expect(super4FighterIds([]).size).toBe(0);
    expect(super4FighterIds([{ id: "x" }]).size).toBe(0);
    expect(super4FighterIds([{ semis: [{ red: null, blue: null }] }]).size).toBe(0);
  });
});

describe("bracketPrintTitle (World Boxing + FECHIBOX + división)", () => {
  it("desde ageKey/divKey: incluye nombre World Boxing y FECHIBOX de la edad", () => {
    expect(bracketPrintTitle({ ageKey: "cadete", divKey: "m_superwelter" })).toBe("U17 · Cadete · Superwélter (M)");
    expect(bracketPrintTitle({ ageKey: "adulto", divKey: "f_welter" })).toBe("Elite · Adulto/Elite · Wélter (F)");
  });
  it("reconstruye parseando el catKey si faltan ageKey/divKey", () => {
    expect(bracketPrintTitle({ catKey: "adulto__m_ligero" })).toBe("Elite · Adulto/Elite · Ligero (M)");
  });
  it("cae al catLabel guardado si no puede reconstruir (cinturón legacy)", () => {
    expect(bracketPrintTitle({ catKey: "cadete71", catLabel: "Cadetes 71kg" })).toBe("Cadetes 71kg");
  });
  it("tolera bracket nulo o sin datos", () => {
    expect(bracketPrintTitle(null)).toBe("");
    expect(bracketPrintTitle({})).toBe("");
  });
});

// Firebase NO guarda las claves con valor null y un nodo sin hijos deja de
// existir: una semifinal entera vacía desaparecía y `semis` volvía de la nube
// con UN solo elemento, reventando la vista, la impresión y la descarga.
describe("normalizeSuper4 (repara las llaves truncadas por Firebase)", () => {
  const b = { id: "x", catKey: "cadete__m_ligero", semis: [{ red: "a", blue: "b", winner: "a" }], finalWinner: null };
  it("rellena la semifinal que falta con cupos libres", () => {
    const [r] = normalizeSuper4([b]);
    expect(r.semis).toHaveLength(2);
    expect(r.semis[1]).toEqual({ red: null, blue: null, winner: null });
  });
  it("no toca las llaves que ya vienen completas", () => {
    const ok = { ...b, semis: [{ red: "a", blue: "b", winner: "a" }, { red: "c", blue: "d", winner: null }] };
    expect(normalizeSuper4([ok])[0].semis).toEqual(ok.semis);
  });
  it("completa las claves que Firebase borró dentro de una semifinal", () => {
    const [r] = normalizeSuper4([{ ...b, semis: [{ red: "a" }, { blue: "d" }] }]);
    expect(r.semis[0]).toEqual({ red: "a", blue: null, winner: null });
    expect(r.semis[1]).toEqual({ red: null, blue: "d", winner: null });
  });
  it("conserva el resto de los campos del cinturón", () => {
    const [r] = normalizeSuper4([{ ...b, catLabel: "Cadetes 71kg", maxFights: 3, finalWinner: "a" }]);
    expect(r.catLabel).toBe("Cadetes 71kg");
    expect(r.maxFights).toBe(3);
    expect(r.finalWinner).toBe("a");
  });
  it("tolera entradas raras sin reventar", () => {
    expect(normalizeSuper4(null)).toEqual([]);
    expect(normalizeSuper4(undefined)).toEqual([]);
    expect(normalizeSuper4([])).toEqual([]);
    expect(normalizeSuper4([{ id: "y" }])[0].semis).toHaveLength(2);
  });
});
