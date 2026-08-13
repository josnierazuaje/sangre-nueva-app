import { describe, it, expect } from "vitest";
import { buildCarteleraHtml } from "../printCartelera.js";
import { buildSuper4Html } from "../printSuper4.js";
import { buildEntradasHtml } from "../entradasReporte.js";
import { buildCierreHtml, cierreResumen } from "../cierreEvento.js";

// Las cuatro hojas imprimibles se MIRAN en pantalla antes de mandarlas a la
// impresora. Ninguna declaraba fondo, así que con el navegador en modo oscuro
// el papel salía negro y lo que no tenía fondo propio quedaba ilegible. Este
// test fija ese contrato para las cuatro a la vez: si mañana se agrega una
// hoja nueva copiando otra, el fondo viene incluido.
const fighters = [
  { id: "f1", fullName: "Martin Vargas", age: 20, sexo: "M", weightKg: 65, gym: "Team Azuaje", fightCount: 2 },
  { id: "f2", fullName: "Benjamín Fuentes", age: 21, sexo: "M", weightKg: 67, gym: "HH Arias", fightCount: 1 },
];
const matchups = [{ id: "m1", fighterRedId: "f1", fighterBlueId: "f2" }];
const tickets = [{ id: "PRE-0001", ticketType: "preventa", price: 7000, quantity: 1, paymentMethod: "Efectivo", status: "activo" }];

const HOJAS = [
  ["cartelera", () => buildCarteleraHtml(matchups, fighters)],
  ["super 4", () => buildSuper4Html([], {}, "13-08-2026")],
  ["entradas", () => buildEntradasHtml(tickets, "sábado 01")],
  ["cierre del evento", () => buildCierreHtml(cierreResumen({ fighters, matchups, super4: [], tickets }))],
];

describe("hojas imprimibles: siempre sobre papel blanco", () => {
  HOJAS.forEach(([nombre, build]) => {
    describe(nombre, () => {
      it("declara el fondo blanco del body", () => {
        // Acepta las dos formas de escribirlo que conviven en el proyecto
        // (compacta y con espacios), sin atarse a una.
        expect(build()).toMatch(/body\s*\{[^}]*background:\s*#fff/i);
      });

      it("declara color-scheme light (el navegador no la repinta en oscuro)", () => {
        expect(build()).toMatch(/<meta name="color-scheme" content="light">/);
      });
    });
  });
});
