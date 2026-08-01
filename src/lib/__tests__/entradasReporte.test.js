import { describe, it, expect } from "vitest";
import { entradasResumen, buildEntradasCsv, buildEntradasHtml } from "../entradasReporte.js";

const tickets = [
  { id: "PRE-0001", attendeeName: "Ana", ticketType: "preventa", paymentMethod: "Efectivo", price: 7000, quantity: 1, status: "ingresado", checkedInAt: "2026-08-01T21:00:00Z" },
  { id: "PRE-0002", attendeeName: "Familia, Pérez", ticketType: "preventa", paymentMethod: "Transferencia", price: 21000, quantity: 3, status: "activo", checkedInAt: null },
  { id: "PUE-0001", attendeeName: "Luis", ticketType: "puerta", paymentMethod: "Efectivo", price: 10000, quantity: 1, status: "activo" },
];

describe("entradasResumen (totales del registro)", () => {
  const r = entradasResumen(tickets);
  it("cuenta boletas y personas (personas = suma de cantidades)", () => {
    expect(r.boletas).toBe(3);
    expect(r.personas).toBe(5); // 1 + 3 + 1
  });
  it("suma ingresos y los desglosa por método de pago", () => {
    expect(r.ingresos).toBe(38000);
    expect(r.byPayment).toEqual({ Efectivo: 17000, Transferencia: 21000 });
  });
  it("check-in en personas y en boletas", () => {
    expect(r.personasDentro).toBe(1); // solo PRE-0001 ingresó (1 persona)
    expect(r.boletasDentro).toBe(1);
  });
  it("lista vacía → todo en cero, sin romperse", () => {
    expect(entradasResumen([])).toEqual({ boletas: 0, personas: 0, ingresos: 0, byPayment: {}, personasDentro: 0, boletasDentro: 0 });
  });
});

describe("buildEntradasCsv", () => {
  const doc = buildEntradasCsv(tickets, "Todas las entradas — impreso 01-08-2026");
  it("empieza con BOM y trae la línea de resumen", () => {
    expect(doc.charCodeAt(0)).toBe(0xFEFF);
    expect(doc).toContain("3 boletas · 5 personas · Ingresos $38.000");
    expect(doc).toContain("Efectivo: $17.000 · Transferencia: $21.000");
    expect(doc).toContain("Check-in: 1 de 5 personas dentro (1 de 3 boletas)");
  });
  it("trae los encabezados y una fila con precio como número", () => {
    expect(doc).toContain("N°,Boleta,Asistente,Tipo,Cant.,Precio,Pago,Estado,Ingreso");
    expect(doc).toContain("1,PRE-0001,Ana,Preventa,1,7000,Efectivo,Ingresado,");
  });
  it("un nombre con coma queda entrecomillado (no rompe columnas)", () => {
    expect(doc).toContain('"Familia, Pérez"');
  });
});

describe("buildEntradasHtml (hoja imprimible)", () => {
  const html = buildEntradasHtml(tickets, "Todas las entradas");
  it("es un documento con título de registro", () => {
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Registro de Entradas");
  });
  it("incluye a los asistentes y el total al pie", () => {
    expect(html).toContain("Ana");
    expect(html).toContain("Luis");
    expect(html).toContain("TOTAL");
    expect(html).toContain("$38.000");
  });
  it("escapa el HTML de un nombre (no inyecta)", () => {
    const h = buildEntradasHtml([{ id: "X", attendeeName: "<b>hack</b>", ticketType: "preventa", paymentMethod: "Efectivo", price: 7000, quantity: 1, status: "activo" }]);
    expect(h).toContain("&lt;b&gt;hack&lt;/b&gt;");
    expect(h).not.toContain("<b>hack</b>");
  });
});
