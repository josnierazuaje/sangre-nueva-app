import { describe, it, expect } from "vitest";
import { EVENT_DATES, EVENT_LABELS } from "../../constants.js";
import { buildEventLabels } from "../eventDates.js";

// Estos tests NO fijan la fecha concreta: validan el CONTRATO de formato para
// que, cuando el organizador cambie la fecha desde la app, las etiquetas sigan
// bien compuestas y no se rompa el cero a la izquierda ni el separador de las
// planillas.
//
// Desde que el valor por defecto es HOY (y no la velada de agosto de 2026 que
// estaba escrita en el código), EVENT_DATES trae dos veces el MISMO día: es
// una velada de un solo día, y su frase no lleva " y " a propósito ("jueves 13
// de agosto de 2026", no "jueves 13 y jueves 13"). Lo de los dos días se prueba
// con un par explícito, que es como hay que probar un formato: con su caso.
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
    const dosDias = EVENT_DATES.semis.day !== EVENT_DATES.final.day || EVENT_DATES.semis.month !== EVENT_DATES.final.month;
    const primerDia = dosDias ? `${EVENT_DATES.semis.weekdayFull} ${EVENT_DATES.semis.day} y ` : "";
    expect(EVENT_LABELS.rango).toBe(`${primerDia}${EVENT_DATES.final.weekdayFull} ${EVENT_DATES.final.day} de ${EVENT_DATES.final.monthName} de ${EVENT_DATES.final.year}`);
  });

  it("rango incluye ambos días, el mes y el año (para encabezado y WhatsApp)", () => {
    const dosDias = buildEventLabels({ semis: "2027-03-06", final: "2027-03-07" });
    expect(dosDias.rango).toBe("sábado 06 y domingo 07 de marzo de 2027");
    expect(dosDias.rango).toMatch(/2027$/);
  });

  // Una velada de una sola noche (semifinales y final el mismo día) no debe
  // decir "el 06 y el 06".
  it("un solo día no se repite en el rango", () => {
    expect(buildEventLabels({ semis: "2027-03-06", final: "2027-03-06" }).rango).toBe("sábado 06 de marzo de 2027");
  });

  it("formatos: abreviado 'Abrev DD', con día de semana 'diasemana DD', largo '… de mes'", () => {
    expect(EVENT_LABELS.semiAbbr).toMatch(/^\S+ \d{2}$/);
    expect(EVENT_LABELS.semiWd).toMatch(/^\S+ \d{2}$/);
    expect(EVENT_LABELS.semiLong).toMatch(/^\S+ \d{2} de \S+$/);
    expect(EVENT_LABELS.finalLong).toMatch(/^\S+ \d{2} de \S+$/);
  });
});
