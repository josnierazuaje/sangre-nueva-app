import { describe, it, expect } from "vitest";
import { DEFAULT_EVENT_DATES, isValidISODate, normalizeEventDates, describeEventDate, buildEventLabels } from "../eventDates.js";
import { EVENT_LABELS } from "../../constants.js";

// Las fechas del evento pasaron de estar escritas en el código a ser un dato
// editable que viaja por la nube. Eso abre tres riesgos que estos tests cubren:
// (a) que un valor corrupto deje la app sin fecha o reviente al imprimir,
// (b) que el día se corra al calcular el día de la semana en otra zona horaria,
// (c) que al cambiar de mes o de año la frase de la cartelera quede ambigua.
describe("fechas del evento editables", () => {
  describe("isValidISODate", () => {
    it("acepta una fecha ISO real", () => {
      expect(isValidISODate("2026-08-01")).toBe(true);
      expect(isValidISODate("2024-02-29")).toBe(true); // año bisiesto
    });
    it("rechaza formatos y días que no existen", () => {
      ["", null, undefined, 20260801, "2026-8-1", "01-08-2026", "2026-13-01", "2026-02-30", "2025-02-29", "2026-00-10", "2026-01-00"]
        .forEach(v => expect(isValidISODate(v)).toBe(false));
    });
  });

  describe("normalizeEventDates", () => {
    it("deja pasar un par válido tal cual", () => {
      expect(normalizeEventDates({ semis: "2027-03-06", final: "2027-03-07" })).toEqual({ semis: "2027-03-06", final: "2027-03-07" });
    });
    it("cae al valor por defecto campo por campo ante basura", () => {
      expect(normalizeEventDates({ semis: "ayer", final: "2027-03-07" })).toEqual({ semis: DEFAULT_EVENT_DATES.semis, final: "2027-03-07" });
      expect(normalizeEventDates(null)).toEqual(DEFAULT_EVENT_DATES);
      expect(normalizeEventDates({})).toEqual(DEFAULT_EVENT_DATES);
      expect(normalizeEventDates("2027-03-06")).toEqual(DEFAULT_EVENT_DATES);
    });
  });

  describe("describeEventDate", () => {
    it("saca el día de la semana correcto (en UTC, no en la hora del aparato)", () => {
      const d = describeEventDate("2026-08-01");
      expect(d.weekdayFull).toBe("sábado");
      expect(d.weekdayAbbr).toBe("Sáb");
      expect(d.day).toBe("01");
      expect(d.monthName).toBe("agosto");
      expect(d.year).toBe(2026);
    });
    it("conserva el cero a la izquierda del día", () => {
      expect(describeEventDate("2027-01-09").day).toBe("09");
      expect(describeEventDate("2027-01-19").day).toBe("19");
    });
    it("una fecha imposible cae al valor por defecto en vez de reventar", () => {
      expect(describeEventDate("2026-02-30").iso).toBe(DEFAULT_EVENT_DATES.semis);
    });
  });

  describe("buildEventLabels", () => {
    it("con la fecha por defecto da exactamente las etiquetas de siempre", () => {
      expect(buildEventLabels(DEFAULT_EVENT_DATES)).toEqual(EVENT_LABELS);
    });

    it("dos días del mismo mes: nombra el mes y el año una sola vez", () => {
      const l = buildEventLabels({ semis: "2026-08-01", final: "2026-08-02" });
      expect(l.semiAbbr).toBe("Sáb 01");
      expect(l.finalAbbr).toBe("Dom 02");
      expect(l.semiLong).toBe("sábado 01 de agosto");
      expect(l.rango).toBe("sábado 01 y domingo 02 de agosto de 2026");
    });

    it("un solo día: no dice 'y' ni repite la fecha", () => {
      const l = buildEventLabels({ semis: "2027-05-15", final: "2027-05-15" });
      expect(l.rango).toBe("sábado 15 de mayo de 2027");
      expect(l.rango).not.toContain(" y ");
    });

    it("a caballo entre dos meses: nombra los dos meses", () => {
      const l = buildEventLabels({ semis: "2026-08-30", final: "2026-09-01" });
      expect(l.rango).toBe("domingo 30 de agosto y martes 01 de septiembre de 2026");
    });

    it("a caballo entre dos años: nombra los dos años", () => {
      const l = buildEventLabels({ semis: "2026-12-31", final: "2027-01-01" });
      expect(l.rango).toBe("jueves 31 de diciembre de 2026 y viernes 01 de enero de 2027");
    });

    it("con fechas corruptas devuelve igual las 7 etiquetas (la app nunca queda sin fecha)", () => {
      const l = buildEventLabels({ semis: "🥊", final: null });
      ["semiAbbr", "finalAbbr", "semiWd", "finalWd", "semiLong", "finalLong", "rango"]
        .forEach(k => expect(typeof l[k]).toBe("string"));
      expect(l).toEqual(EVENT_LABELS);
    });
  });
});
