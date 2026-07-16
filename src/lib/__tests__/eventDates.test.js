import { describe, it, expect } from "vitest";
import { EVENT_DATES, EVENT_LABELS } from "../../constants.js";

// Estos tests NO fijan la fecha concreta (sáb 01 / dom 02 de agosto): validan
// el CONTRATO de formato para que, si el organizador cambia la fecha editando
// solo EVENT_DATES, las etiquetas sigan bien compuestas y no se rompa el cero
// a la izquierda ni el separador de las planillas.
describe("EVENT_DATES / EVENT_LABELS", () => {
  it("day es string de 2 dígitos (conserva el cero a la izquierda)", () => {
    expect(EVENT_DATES.semis.day).toMatch(/^\d{2}$/);
    expect(EVENT_DATES.final.day).toMatch(/^\d{2}$/);
  });

  it("las etiquetas se derivan de EVENT_DATES (única fuente de verdad)", () => {
    expect(EVENT_LABELS.semiAbbr).toBe(`${EVENT_DATES.semis.weekdayAbbr} ${EVENT_DATES.semis.day}`);
    expect(EVENT_LABELS.finalAbbr).toBe(`${EVENT_DATES.final.weekdayAbbr} ${EVENT_DATES.final.day}`);
    expect(EVENT_LABELS.semiWd).toBe(`${EVENT_DATES.semis.weekdayFull} ${EVENT_DATES.semis.day}`);
    expect(EVENT_LABELS.finalWd).toBe(`${EVENT_DATES.final.weekdayFull} ${EVENT_DATES.final.day}`);
    expect(EVENT_LABELS.semiLong).toBe(`${EVENT_DATES.semis.weekdayFull} ${EVENT_DATES.semis.day} de ${EVENT_DATES.semis.monthName}`);
    expect(EVENT_LABELS.finalLong).toBe(`${EVENT_DATES.final.weekdayFull} ${EVENT_DATES.final.day} de ${EVENT_DATES.final.monthName}`);
  });

  it("formatos: abreviado 'Abrev DD', con día de semana 'diasemana DD', largo '… de mes'", () => {
    expect(EVENT_LABELS.semiAbbr).toMatch(/^\S+ \d{2}$/);
    expect(EVENT_LABELS.semiWd).toMatch(/^\S+ \d{2}$/);
    expect(EVENT_LABELS.semiLong).toMatch(/^\S+ \d{2} de \S+$/);
    expect(EVENT_LABELS.finalLong).toMatch(/^\S+ \d{2} de \S+$/);
  });
});
