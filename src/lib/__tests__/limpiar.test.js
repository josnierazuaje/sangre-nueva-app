import { describe, it, expect } from "vitest";
import { resumenLimpiar, textoLimpiar, textoLimpiado } from "../limpiar.js";

// El botón "Limpiar" borra el padrón entero del evento. Lo único que lo separa
// de una pérdida irreversible es el aviso que se acepta antes, así que lo que
// se prueba aquí es que ese aviso NO pueda mentir: ni en las cifras, ni en el
// alcance (todo el equipo, no este teléfono), ni en lo que promete no tocar.
const peleador = (id) => ({ id, fullName: "Peleador " + id, age: 20, sexo: "M", weightKg: 65, gym: "Team Azuaje", fightCount: 2 });

describe("resumenLimpiar", () => {
  it("cuenta las tres cosas que se borran juntas", () => {
    const r = resumenLimpiar({ fighters: [peleador("a"), peleador("b")], matchups: [{ id: "m1" }], super4: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] });
    expect(r).toEqual({ peleadores: 2, peleas: 1, llaves: 3, vacio: false });
  });

  it("sin datos avisa que no hay nada que limpiar (el botón no debe borrar la nada)", () => {
    expect(resumenLimpiar({ fighters: [], matchups: [], super4: [] }).vacio).toBe(true);
    expect(resumenLimpiar({}).vacio).toBe(true);
    expect(resumenLimpiar().vacio).toBe(true);
  });

  // Puede quedar una cartelera armada aunque el padrón ya se haya vaciado a
  // mano: sigue habiendo algo que limpiar.
  it("con peleas pero sin peleadores NO está vacío", () => {
    expect(resumenLimpiar({ fighters: [], matchups: [{ id: "m1" }] }).vacio).toBe(false);
  });
});

describe("textoLimpiar", () => {
  const r = resumenLimpiar({ fighters: [peleador("a"), peleador("b")], matchups: [{ id: "m1" }, { id: "m2" }], super4: [{ id: "s1" }] });

  it("dice que se borran TODOS los atletas registrados, con las cifras exactas", () => {
    const t = textoLimpiar(r);
    expect(t).toContain("TODOS los datos de los atletas registrados");
    expect(t).toContain("2 peleadores registrados");
    expect(t).toContain("2 peleas de la cartelera");
    expect(t).toContain("1 llave del Super 4"); // singular, no "1 llaves"
  });

  it("avisa que el borrado alcanza a todo el equipo, no solo a este dispositivo", () => {
    expect(textoLimpiar(r)).toContain("TODO el equipo");
  });

  it("promete que las entradas vendidas no se tocan y que queda un respaldo", () => {
    const t = textoLimpiar(r);
    expect(t).toContain("NO se tocan las entradas vendidas");
    expect(t).toContain("Restaurar respaldo de la nube");
  });

  it("recuerda el Cierre del evento antes de borrar los números de la velada", () => {
    expect(textoLimpiar(r)).toContain("CIERRE DEL EVENTO");
  });

  it("no inventa líneas de lo que no existe, pero nunca calla lo que sí", () => {
    const soloPeleadores = textoLimpiar(resumenLimpiar({ fighters: [peleador("a")] }));
    expect(soloPeleadores).toContain("1 peleador registrado");
    expect(soloPeleadores).not.toContain("cartelera");
    expect(soloPeleadores).not.toContain("Super 4");

    const conLlaves = textoLimpiar(resumenLimpiar({ fighters: [], super4: [{ id: "s1" }, { id: "s2" }] }));
    expect(conLlaves).toContain("0 peleadores registrados");
    expect(conLlaves).toContain("2 llaves del Super 4");
  });
});

describe("textoLimpiado", () => {
  it("enumera en castellano lo borrado y dónde quedó el respaldo", () => {
    const r = resumenLimpiar({ fighters: [peleador("a")], matchups: [{ id: "m1" }, { id: "m2" }], super4: [{ id: "s1" }] });
    const t = textoLimpiado(r, { enLaNube: true });
    expect(t).toContain("se borraron 1 peleador, 2 peleas y 1 llave del Super 4");
    expect(t).toContain("Restaurar respaldo de la nube");
  });

  // Sin conexión el archivo descargado es la ÚNICA copia: el aviso no puede
  // dar a entender que hay una en la nube esperando.
  it("sin nube advierte que el archivo descargado es la única copia", () => {
    const t = textoLimpiado(resumenLimpiar({ fighters: [peleador("a")] }), { enLaNube: false });
    expect(t).toContain("única copia");
    expect(t).not.toContain("Restaurar respaldo de la nube");
  });

  // Limpiar no toca la fecha (no es un dato de atletas), así que la cartelera
  // recién vaciada sigue anunciando la velada ANTERIOR hasta que se cambie.
  it("recuerda que la fecha del evento quedó viva y hay que cambiarla", () => {
    [true, false].forEach(enLaNube => {
      const t = textoLimpiado(resumenLimpiar({ fighters: [peleador("a")] }), { enLaNube });
      expect(t).toContain("FECHA");
      expect(t).toContain("Datos del evento");
    });
  });
});
