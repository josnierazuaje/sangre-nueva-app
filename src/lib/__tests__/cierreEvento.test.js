import { describe, it, expect } from "vitest";
import { boleteriaResumen, deportivoResumen, escuelasResumen, cierreResumen, buildCierreHtml } from "../cierreEvento.js";

// El cierre es el documento con el que se rinden cuentas después de la velada:
// si una cifra miente, miente en la reunión con los socios. Estos tests fijan
// las reglas que más fácil se rompen: boletas que cubren a varias personas,
// entradas que se vendieron pero no llegaron, peleas que no salieron de verdad
// en la cartelera, y llaves sin campeón.
const boleta = (o = {}) => ({ id: "PRE-0001", ticketType: "preventa", price: 7000, quantity: 1, paymentMethod: "Efectivo", status: "activo", ...o });
const peleador = (o = {}) => ({ id: "f1", fullName: "Martin Vargas", age: 20, sexo: "M", weightKg: 65, gym: "Team Azuaje", fightCount: 2, ...o });

describe("boleteriaResumen", () => {
  it("distingue boletas de personas (una boleta puede cubrir a varias)", () => {
    const r = boleteriaResumen([
      boleta({ id: "PRE-0001", quantity: 3, price: 21000 }),
      boleta({ id: "PUE-0001", ticketType: "puerta", quantity: 1, price: 10000 }),
    ]);
    expect(r.boletas).toBe(2);
    expect(r.personas).toBe(4);
    expect(r.ingresos).toBe(31000);
  });

  it("una boleta sin cantidad cuenta como una persona", () => {
    const { quantity, ...sinCantidad } = boleta();
    expect(boleteriaResumen([sinCantidad]).personas).toBe(1);
  });

  it("la asistencia cuenta PERSONAS que entraron, no boletas escaneadas", () => {
    const r = boleteriaResumen([
      boleta({ id: "A", quantity: 4, price: 28000, status: "ingresado" }),
      boleta({ id: "B", quantity: 2, price: 14000, status: "activo" }),
    ]);
    expect(r.personasDentro).toBe(4);
    expect(r.boletasDentro).toBe(1);
    expect(r.ausentes).toBe(2);
    expect(r.asistencia).toBeCloseTo(4 / 6);
  });

  it("sin ventas la asistencia es null, no 0% (no vender no es que nadie viniera)", () => {
    const r = boleteriaResumen([]);
    expect(r.asistencia).toBeNull();
    expect(r.ingresos).toBe(0);
  });

  it("una boleta anulada no suma dinero ni personas, y se informa aparte", () => {
    const r = boleteriaResumen([boleta({ id: "A" }), boleta({ id: "B", status: "anulado", price: 7000 })]);
    expect(r.boletas).toBe(1);
    expect(r.personas).toBe(1);
    expect(r.ingresos).toBe(7000);
    expect(r.anuladas).toBe(1);
  });

  it("desglosa por tipo de entrada y por método de pago", () => {
    const r = boleteriaResumen([
      boleta({ id: "A", ticketType: "preventa", price: 7000, paymentMethod: "Efectivo" }),
      boleta({ id: "B", ticketType: "puerta", price: 10000, paymentMethod: "Transferencia", status: "ingresado" }),
      boleta({ id: "C", ticketType: "puerta", price: 10000, paymentMethod: "Efectivo" }),
    ]);
    expect(r.porTipo.puerta).toEqual({ boletas: 2, personas: 2, ingresos: 20000, dentro: 1 });
    expect(r.porPago).toEqual({ Efectivo: 17000, Transferencia: 10000 });
  });

  it("aguanta una lista vacía o ausente", () => {
    expect(boleteriaResumen(null).boletas).toBe(0);
    expect(boleteriaResumen(undefined).personas).toBe(0);
  });
});

describe("deportivoResumen", () => {
  const fighters = [
    peleador({ id: "f1", age: 20, sexo: "M", gym: "Team Azuaje" }),
    peleador({ id: "f2", age: 21, sexo: "M", gym: "HH Arias" }),
    peleador({ id: "f3", age: 16, sexo: "F", gym: "HH Arias" }),
  ];

  it("cuenta solo las peleas que de verdad salen en la cartelera", () => {
    const matchups = [
      { id: "m1", fighterRedId: "f1", fighterBlueId: "f2" },
      { id: "m2", fighterRedId: "f1", fighterBlueId: "borrado" }, // rival eliminado
    ];
    expect(deportivoResumen({ fighters, matchups, super4: [] }).peleas).toBe(1);
  });

  it("reparte peleadores por categoría de edad y por sexo", () => {
    const d = deportivoResumen({ fighters, matchups: [], super4: [] });
    expect(d.peleadores).toBe(3);
    expect(d.porSexo).toEqual({ M: 2, F: 1 });
    expect(d.porEdad.map(e => e.key)).toEqual(["cadete", "adulto"]); // de menor a mayor
    expect(d.porEdad.find(e => e.key === "adulto").n).toBe(2);
  });

  it("una llave sin final decidida queda sin campeón y no se cuenta como definida", () => {
    const super4 = [
      { id: "b1", catLabel: "Elite · Ligero", semis: [{}, {}], finalWinner: "f1" },
      { id: "b2", catLabel: "U17 · Mosca", semis: [{}, {}] },
    ];
    const d = deportivoResumen({ fighters, matchups: [], super4 });
    expect(d.cinturones).toHaveLength(2);
    expect(d.cinturones[0].campeon).toBe("Martin Vargas");
    expect(d.cinturones[0].escuela).toBe("Team Azuaje");
    expect(d.cinturones[1].campeon).toBeNull();
    expect(d.cinturonesDecididos).toBe(1);
  });
});

describe("escuelasResumen", () => {
  it("ordena por cantidad de atletas y agrupa a los que no tienen escuela", () => {
    const r = escuelasResumen([
      peleador({ id: "1", gym: "HH Arias" }),
      peleador({ id: "2", gym: "Team Azuaje" }),
      peleador({ id: "3", gym: "HH Arias" }),
      peleador({ id: "4", gym: "  " }),
    ]);
    expect(r).toEqual([
      { escuela: "HH Arias", atletas: 2 },
      { escuela: "Sin escuela", atletas: 1 },
      { escuela: "Team Azuaje", atletas: 1 },
    ]);
  });
});

describe("buildCierreHtml", () => {
  const datos = {
    fighters: [peleador()],
    matchups: [],
    super4: [{ id: "b1", catLabel: "Elite · Ligero", semis: [{}, {}], finalWinner: "f1" }],
    tickets: [boleta({ quantity: 2, price: 14000, status: "ingresado" })],
  };

  it("incluye las cifras del evento y la fecha real", () => {
    const html = buildCierreHtml(cierreResumen(datos), { titulo: "La Velada", fechaEvento: "sábado 01 y domingo 02 de agosto de 2026", generadoEl: "13-08-2026" });
    expect(html).toContain("CIERRE DEL EVENTO");
    expect(html).toContain("sábado 01 y domingo 02 de agosto de 2026");
    expect(html).toContain("$14.000");
    expect(html).toContain("Martin Vargas");
    expect(html).toContain("Generado el 13-08-2026");
  });

  it("con el evento vacío se genera igual, diciendo que no hay datos", () => {
    const html = buildCierreHtml(cierreResumen({ fighters: [], matchups: [], super4: [], tickets: [] }));
    expect(html).toContain("No se registraron entradas.");
    expect(html).toContain("No se armaron llaves del Super 4.");
    expect(html).toContain("<td class=\"izq vacio\" colspan=\"3\">Sin escuelas registradas.</td>");
  });

  it("escapa el nombre del evento y de las escuelas (no inyecta HTML)", () => {
    const html = buildCierreHtml(cierreResumen({ fighters: [peleador({ gym: "<script>x</script>" })], matchups: [], super4: [], tickets: [] }), { titulo: "<b>hola</b>" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<b>hola</b>");
    expect(html).toContain("&lt;script&gt;");
  });
});
