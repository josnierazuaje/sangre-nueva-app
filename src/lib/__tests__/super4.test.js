import { describe, it, expect } from "vitest";
import { SUPER4_CATEGORIES, eligibleForCategory, pickFour, pairSemis, buildSuper4Brackets, setSemiWinner, setFinalWinner, replaceFighter, availableReplacements, filterByMaxExperience } from "../super4.js";

let n = 0;
function f(over) {
  n++;
  return { id: over.id || "f" + n, fullName: over.fullName || "Peleador " + n, gym: over.gym || "Gimnasio " + n, age: over.age ?? 25, weightKg: over.weightKg ?? 60, sexo: over.sexo || "M", fightCount: 1, createdAt: new Date(2026, 0, 1).toISOString(), ...over };
}

const cat71 = SUPER4_CATEGORIES.find(c => c.key === "cadete71");
const cat92 = SUPER4_CATEGORIES.find(c => c.key === "adulto92");
const cat60 = SUPER4_CATEGORIES.find(c => c.key === "adulto60");
const cat67 = SUPER4_CATEGORIES.find(c => c.key === "adulto67");

describe("eligibleForCategory", () => {
  it("exige categoría de edad FECHIBOX, sexo y límite de peso", () => {
    const ok = f({ age: 15, weightKg: 70 });          // cadete, ≤71 ✓
    const pesado = f({ age: 16, weightKg: 72 });      // cadete pero pasa 71
    const juvenil = f({ age: 17, weightKg: 65 });     // edad equivocada
    const mujer = f({ age: 15, weightKg: 65, sexo: "F" });
    const sinPeso = f({ age: 15, weightKg: undefined });
    const res = eligibleForCategory(cat71, [ok, pesado, juvenil, mujer, sinPeso]);
    expect(res.map(x => x.id)).toEqual([ok.id]);
  });

  it("la categoría +92 exige peso desde 92 hacia arriba", () => {
    const bajo = f({ age: 25, weightKg: 91 });
    const justo = f({ age: 25, weightKg: 92 });
    const alto = f({ age: 25, weightKg: 120 });
    const res = eligibleForCategory(cat92, [bajo, justo, alto]);
    expect(res.map(x => x.id)).toEqual([justo.id, alto.id]);
  });
});

describe("pickFour", () => {
  it("elige a los 4 más cercanos al límite (desde abajo en categorías 'hasta X')", () => {
    const els = [55, 66, 60, 70, 68, 58].map(w => f({ age: 15, weightKg: w, id: "w" + w }));
    const four = pickFour(cat71, els);
    expect(four.map(x => x.weightKg).sort((a, b) => a - b)).toEqual([60, 66, 68, 70]);
  });

  it("en +92 elige a los 4 más cercanos a 92 (desde arriba)", () => {
    const els = [93, 120, 95, 100, 110].map(w => f({ age: 25, weightKg: w, id: "p" + w }));
    const four = pickFour(cat92, els);
    expect(four.map(x => x.weightKg).sort((a, b) => a - b)).toEqual([93, 95, 100, 110]);
  });
});

describe("pairSemis", () => {
  it("evita cruzar compañeros de la misma escuela cuando hay alternativa", () => {
    const four = [
      f({ id: "a", gym: "AZUAJE", weightKg: 70 }),
      f({ id: "b", gym: "AZUAJE", weightKg: 69 }),
      f({ id: "c", gym: "HH ARIAS", weightKg: 68 }),
      f({ id: "d", gym: "HH ARIAS", weightKg: 67 }),
    ];
    const [s1, s2] = pairSemis(four);
    const gyms = pair => pair.map(x => x.gym);
    expect(new Set(gyms(s1)).size).toBe(2);
    expect(new Set(gyms(s2)).size).toBe(2);
  });
});

describe("buildSuper4Brackets", () => {
  it("arma la llave con 4 elegibles y reporta la categoría incompleta", () => {
    const fighters = [
      // 4 cadetes ≤71 → llave completa
      f({ age: 15, weightKg: 70 }), f({ age: 15, weightKg: 68 }), f({ age: 16, weightKg: 66 }), f({ age: 16, weightKg: 71 }),
      // solo 2 adultos +92 → falta
      f({ age: 25, weightKg: 95 }), f({ age: 30, weightKg: 100 }),
    ];
    const { brackets, faltantes } = buildSuper4Brackets(fighters);
    expect(brackets.map(b => b.catKey)).toEqual(["cadete71"]);
    const f92 = faltantes.find(x => x.catKey === "adulto92");
    expect(f92.elegibles).toBe(2);
    expect(f92.faltan).toBe(2);
  });

  it("un mismo atleta nunca queda en dos llaves (solape 60/67 en adultos)", () => {
    // 4 adultos de ≤60kg: elegibles para 67 y para 60 a la vez.
    // Más 4 de 61-67: solo elegibles para 67.
    const livianos = [58, 59, 60, 57].map(w => f({ age: 25, weightKg: w, id: "L" + w }));
    const medios = [67, 66, 65, 64].map(w => f({ age: 25, weightKg: w, id: "M" + w }));
    const { brackets } = buildSuper4Brackets([...livianos, ...medios]);
    const b67 = brackets.find(b => b.catKey === "adulto67");
    const b60 = brackets.find(b => b.catKey === "adulto60");
    expect(b67).toBeTruthy();
    expect(b60).toBeTruthy();
    const ids67 = [b67.semis[0].red, b67.semis[0].blue, b67.semis[1].red, b67.semis[1].blue];
    const ids60 = [b60.semis[0].red, b60.semis[0].blue, b60.semis[1].red, b60.semis[1].blue];
    expect(ids67.filter(id => ids60.includes(id))).toEqual([]);
    // el 67 se queda con los más pesados; el 60 con los livianos
    expect(ids67.sort()).toEqual(["M64", "M65", "M66", "M67"]);
    expect(ids60.sort()).toEqual(["L57", "L58", "L59", "L60"]);
  });
});

describe("progresión de ganadores", () => {
  function bracketBase() {
    const fighters = [
      f({ id: "a", age: 15, weightKg: 70 }), f({ id: "b", age: 15, weightKg: 68 }),
      f({ id: "c", age: 16, weightKg: 66 }), f({ id: "d", age: 16, weightKg: 71 }),
    ];
    return buildSuper4Brackets(fighters).brackets;
  }

  it("marcar ganadores de semis habilita la final; cambiar un semifinalista limpia el resultado de la final", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    const s1red = b.semis[0].red, s1blue = b.semis[0].blue, s2red = b.semis[1].red;
    brackets = setSemiWinner(brackets, b.id, 0, s1red);
    brackets = setSemiWinner(brackets, b.id, 1, s2red);
    brackets = setFinalWinner(brackets, b.id, s1red);
    expect(brackets[0].finalWinner).toBe(s1red);
    // cambia el ganador de la semi 1 → el campeón anterior ya no es finalista
    brackets = setSemiWinner(brackets, b.id, 0, s1blue);
    expect(brackets[0].semis[0].winner).toBe(s1blue);
    expect(brackets[0].finalWinner).toBe(null);
  });

  it("NO permite coronar campeón con una sola semifinal decidida", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red); // solo la semi 1
    brackets = setFinalWinner(brackets, b.id, b.semis[0].red);   // intenta coronar
    expect(brackets[0].finalWinner).toBe(null);
  });

  it("no acepta como campeón a alguien que no es finalista", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 1, b.semis[1].red);
    brackets = setFinalWinner(brackets, b.id, b.semis[0].blue); // perdió su semi
    expect(brackets[0].finalWinner).toBe(null);
  });

  it("volver a tocar al ganador lo desmarca", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    expect(brackets[0].semis[0].winner).toBe(null);
  });

  it("corregir la OTRA semifinal también destrona al campeón (la final ya no es la misma)", () => {
    let brackets = bracketBase();
    const b = brackets[0];
    const s2blue = b.semis[1].blue;
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 1, b.semis[1].red);
    brackets = setFinalWinner(brackets, b.id, b.semis[0].red); // campeón = ganador semi 1
    // se corrige la semi 2 (cambia el otro finalista) → el campeón cae
    brackets = setSemiWinner(brackets, b.id, 1, s2blue);
    expect(brackets[0].finalWinner).toBe(null);
  });
});

describe("duplicados y orden de categorías en la generación", () => {
  it("un registro con IDENTIDAD EXACTA repetida (mismo nombre+sexo+peso) no ocupa dos cupos", () => {
    const fighters = [
      f({ id: "p1", fullName: "Jose Perez", age: 25, weightKg: 95, gym: "A" }),
      f({ id: "p2", fullName: "JOSE PEREZ", age: 25, weightKg: 95, gym: "B" }), // misma identidad exacta que p1
      f({ id: "q1", fullName: "Rival Uno", age: 25, weightKg: 96, gym: "B" }),
      f({ id: "q2", fullName: "Rival Dos", age: 25, weightKg: 97, gym: "C" }),
      f({ id: "q3", fullName: "Rival Tres", age: 25, weightKg: 98, gym: "D" }),
    ];
    const { brackets } = buildSuper4Brackets(fighters);
    const b92 = brackets.find(b => b.catKey === "adulto92");
    expect(b92).toBeTruthy();
    const ids = [b92.semis[0].red, b92.semis[0].blue, b92.semis[1].red, b92.semis[1].blue];
    // solo una copia de Jose Perez (misma identidad) puede estar en la llave
    expect(ids.filter(id => id === "p1" || id === "p2")).toHaveLength(1);
  });

  it("dos personas DISTINTAS con el mismo nombre pero distinto peso pueden estar ambas (consistente con la dedup)", () => {
    const fighters = [
      f({ id: "s1", fullName: "Juan Soto", age: 15, weightKg: 71 }),
      f({ id: "s2", fullName: "Juan Soto", age: 15, weightKg: 64 }), // otra persona (la dedup los mantiene separados)
      f({ id: "x1", fullName: "Pedro Uno", age: 15, weightKg: 70 }),
      f({ id: "x2", fullName: "Luis Dos", age: 16, weightKg: 69 }),
    ];
    const { brackets } = buildSuper4Brackets(fighters);
    const b = brackets.find(x => x.catKey === "cadete71");
    expect(b).toBeTruthy(); // se arma la llave con los 4 (no se descarta a un Juan Soto)
    const ids = [b.semis[0].red, b.semis[0].blue, b.semis[1].red, b.semis[1].blue].sort();
    expect(ids).toEqual(["s1", "s2", "x1", "x2"]);
  });

  it("la llave de 60 se procesa antes que la de 67 y no le 'roban' al atleta que la completa", () => {
    const fighters = [
      // 4 adultos que completan la llave de 60
      ...[57, 58, 59, 60].map(w => f({ age: 25, weightKg: w, id: "L" + w })),
      // solo 3 de 61-67: la de 67 debe quedar incompleta (sin robarse al de 60)
      ...[65, 66, 67].map(w => f({ age: 25, weightKg: w, id: "M" + w })),
    ];
    const { brackets, faltantes } = buildSuper4Brackets(fighters);
    const b60 = brackets.find(b => b.catKey === "adulto60");
    expect(b60).toBeTruthy();
    const ids60 = [b60.semis[0].red, b60.semis[0].blue, b60.semis[1].red, b60.semis[1].blue].sort();
    expect(ids60).toEqual(["L57", "L58", "L59", "L60"]);
    const f67 = faltantes.find(x => x.catKey === "adulto67");
    expect(f67.elegibles).toBe(3);
  });
});

describe("reemplazo de peleadores (botón ✕)", () => {
  function bracketCadetes() {
    const fighters = [
      f({ id: "a", age: 15, weightKg: 71 }), f({ id: "b", age: 15, weightKg: 70 }),
      f({ id: "c", age: 16, weightKg: 69 }), f({ id: "d", age: 16, weightKg: 68 }),
      f({ id: "e", age: 15, weightKg: 67 }), // 5º elegible, sin cupo
    ];
    return { fighters, brackets: buildSuper4Brackets(fighters).brackets };
  }

  it("replaceFighter cambia el atleta del cupo y limpia el ganador de esa semi", () => {
    let { brackets } = bracketCadetes();
    const b = brackets[0];
    const rojoOriginal = b.semis[0].red;
    brackets = setSemiWinner(brackets, b.id, 0, rojoOriginal); // gana el rojo
    expect(brackets[0].semis[0].winner).toBe(rojoOriginal);
    brackets = replaceFighter(brackets, b.id, 0, "red", "e"); // lo reemplaza
    expect(brackets[0].semis[0].red).toBe("e");
    expect(brackets[0].semis[0].winner).toBe(null); // el cruce cambió → sin ganador
  });

  it("replaceFighter destrona al campeón si el reemplazado era finalista", () => {
    let { brackets } = bracketCadetes();
    const b = brackets[0];
    brackets = setSemiWinner(brackets, b.id, 0, b.semis[0].red);
    brackets = setSemiWinner(brackets, b.id, 1, b.semis[1].red);
    brackets = setFinalWinner(brackets, b.id, b.semis[0].red);
    expect(brackets[0].finalWinner).toBe(b.semis[0].red);
    brackets = replaceFighter(brackets, b.id, 0, "red", "e"); // sale un finalista
    expect(brackets[0].finalWinner).toBe(null);
  });

  it("availableReplacements ofrece sólo elegibles que no están en ninguna llave", () => {
    const { fighters, brackets } = bracketCadetes();
    const disp = availableReplacements("cadete71", fighters, brackets);
    expect(disp.map(x => x.id)).toEqual(["e"]); // a,b,c,d ya están en la llave
  });

  it("availableReplacements excluye un duplicado exacto del presente, pero ofrece a un homónimo de distinto peso", () => {
    const fighters = [
      f({ id: "a", age: 15, weightKg: 71, fullName: "Juan Soto" }), // queda en la llave
      f({ id: "b", age: 15, weightKg: 70 }),
      f({ id: "c", age: 16, weightKg: 69 }),
      f({ id: "d", age: 16, weightKg: 68 }),
      f({ id: "dupExacto", age: 15, weightKg: 71, fullName: "JUAN SOTO" }), // misma identidad que 'a'
      f({ id: "homonimo", age: 15, weightKg: 60, fullName: "juan soto" }), // otra persona (peso distinto)
    ];
    const { brackets } = buildSuper4Brackets(fighters);
    const disp = availableReplacements("cadete71", fighters, brackets);
    expect(disp.some(x => x.id === "dupExacto")).toBe(false); // mismo peso → misma persona → excluido
    expect(disp.some(x => x.id === "homonimo")).toBe(true);   // distinto peso → persona distinta → ofrecido
  });
});

describe("tope de experiencia (Peleadores hasta:)", () => {
  it("filterByMaxExperience deja solo a los de experiencia hasta el tope (0-3 = novatos)", () => {
    const fighters = [
      f({ id: "deb", fightCount: 0 }),   // debutante
      f({ id: "pri", fightCount: 3 }),   // principiante (1-3)
      f({ id: "ama", fightCount: 4 }),   // amateur (4-10)
      f({ id: "pro", fightCount: 15 }),  // pro (11+)
    ];
    const novatos = filterByMaxExperience(fighters, "principiante").map(x => x.id).sort();
    expect(novatos).toEqual(["deb", "pri"]);
    // sin tope: entran todos
    expect(filterByMaxExperience(fighters, null)).toHaveLength(4);
  });

  it("buildSuper4Brackets con tope 'principiante' solo arma con novatos (0-3 peleas)", () => {
    const fighters = [
      f({ id: "n1", age: 15, weightKg: 71, fightCount: 0 }),
      f({ id: "n2", age: 15, weightKg: 70, fightCount: 2 }),
      f({ id: "n3", age: 16, weightKg: 69, fightCount: 3 }),
      f({ id: "n4", age: 16, weightKg: 68, fightCount: 1 }),
      // dos con muchas peleas: NO deben entrar bajo el tope de novatos
      f({ id: "exp1", age: 15, weightKg: 67, fightCount: 12 }),
      f({ id: "exp2", age: 16, weightKg: 66, fightCount: 8 }),
    ];
    const { brackets } = buildSuper4Brackets(fighters, "principiante");
    const b = brackets.find(x => x.catKey === "cadete71");
    expect(b).toBeTruthy();
    const ids = [b.semis[0].red, b.semis[0].blue, b.semis[1].red, b.semis[1].blue].sort();
    expect(ids).toEqual(["n1", "n2", "n3", "n4"]);
    expect(b.maxExpKey).toBe("principiante"); // el tope queda guardado en la llave
  });

  it("con tope de novatos y solo 3 novatos, la categoría no se arma aunque haya expertos de sobra", () => {
    const fighters = [
      f({ id: "n1", age: 15, weightKg: 71, fightCount: 0 }),
      f({ id: "n2", age: 15, weightKg: 70, fightCount: 2 }),
      f({ id: "n3", age: 16, weightKg: 69, fightCount: 3 }),
      f({ id: "e1", age: 16, weightKg: 68, fightCount: 20 }),
      f({ id: "e2", age: 15, weightKg: 67, fightCount: 15 }),
    ];
    const { brackets, faltantes } = buildSuper4Brackets(fighters, "principiante");
    expect(brackets.find(b => b.catKey === "cadete71")).toBeFalsy();
    expect(faltantes.find(x => x.catKey === "cadete71").elegibles).toBe(3);
  });

  it("availableReplacements respeta el tope: no ofrece a un experto para una llave de novatos", () => {
    const fighters = [
      f({ id: "n1", age: 15, weightKg: 71, fightCount: 0 }),
      f({ id: "n2", age: 15, weightKg: 70, fightCount: 2 }),
      f({ id: "n3", age: 16, weightKg: 69, fightCount: 3 }),
      f({ id: "n4", age: 16, weightKg: 68, fightCount: 1 }),
      f({ id: "n5", age: 15, weightKg: 67, fightCount: 0 }), // novato libre → sí se ofrece
      f({ id: "exp", age: 15, weightKg: 66, fightCount: 18 }), // experto → NO se ofrece
    ];
    const { brackets } = buildSuper4Brackets(fighters, "principiante");
    const disp = availableReplacements("cadete71", fighters, brackets, "principiante").map(x => x.id);
    expect(disp).toContain("n5");
    expect(disp).not.toContain("exp");
  });
});
