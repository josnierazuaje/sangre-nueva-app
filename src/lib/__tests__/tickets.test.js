import { describe, it, expect } from "vitest";
import { extractTicketData, extractTicketCode, verifyTicketToken, genTicketToken, clampTicketQty, ticketUnitPrice, ticketQty, MAX_TICKET_QTY } from "../../constants.js";

const ORIGIN = "https://sangre-nueva-la-velada.pages.dev/";

describe("extractTicketData", () => {
  it("URL con ticket y token", () => {
    expect(extractTicketData(ORIGIN + "?ticket=PRE-0042&t=K7QX9M")).toEqual({ id: "PRE-0042", token: "K7QX9M" });
  });
  it("URL solo con ticket (boleta vieja sin token)", () => {
    expect(extractTicketData(ORIGIN + "?ticket=PRE-0042")).toEqual({ id: "PRE-0042", token: null });
  });
  it("URL con token url-encoded", () => {
    expect(extractTicketData(ORIGIN + "?ticket=PUE-0003&t=" + encodeURIComponent("A B"))).toEqual({ id: "PUE-0003", token: "A B" });
  });
  it("JSON con id y token", () => {
    expect(extractTicketData('{"id":"PUE-0002","token":"ZZ12QW"}')).toEqual({ id: "PUE-0002", token: "ZZ12QW" });
  });
  it("JSON solo con id", () => {
    expect(extractTicketData('{"id":"INS-0001"}')).toEqual({ id: "INS-0001", token: null });
  });
  it("texto plano (id tecleado a mano)", () => {
    expect(extractTicketData("pre-0003")).toEqual({ id: "pre-0003", token: null });
  });
});

describe("extractTicketCode (compat, solo id)", () => {
  it("saca el id de una URL con token", () => {
    expect(extractTicketCode(ORIGIN + "?ticket=PRE-0042&t=K7QX9M")).toBe("PRE-0042");
  });
  it("devuelve el texto plano tal cual", () => {
    expect(extractTicketCode("PRE-0003")).toBe("PRE-0003");
  });
});

describe("verifyTicketToken", () => {
  const conToken = { id: "PRE-0042", token: "K7QX9M" };
  const sinToken = { id: "PRE-0001" }; // boleta emitida antes de los tokens

  it("token correcto en escaneo → ok", () => {
    expect(verifyTicketToken(conToken, "K7QX9M", false)).toBe("ok");
  });
  it("token correcto sin importar mayúsculas → ok", () => {
    expect(verifyTicketToken(conToken, "k7qx9m", false)).toBe("ok");
  });
  it("token incorrecto en escaneo → bad (falsificado)", () => {
    expect(verifyTicketToken(conToken, "WRONG1", false)).toBe("bad");
  });
  it("escaneo sin token de una boleta que sí tiene → bad", () => {
    expect(verifyTicketToken(conToken, null, false)).toBe("bad");
  });
  it("token incorrecto pero tecleado a mano → warn (staff decide)", () => {
    expect(verifyTicketToken(conToken, "WRONG1", true)).toBe("warn");
  });
  it("boleta vieja sin token, escaneada → warn", () => {
    expect(verifyTicketToken(sinToken, null, false)).toBe("warn");
  });
  it("boleta vieja sin token, tecleada a mano → ok", () => {
    expect(verifyTicketToken(sinToken, null, true)).toBe("ok");
  });
  it("boleta inexistente → bad", () => {
    expect(verifyTicketToken(null, "K7QX9M", false)).toBe("bad");
  });
});

describe("clampTicketQty (cantidad de entradas por boleta)", () => {
  it("acota por debajo a 1", () => {
    expect(clampTicketQty(0)).toBe(1);
    expect(clampTicketQty(-5)).toBe(1);
  });
  it("acota por arriba al máximo", () => {
    expect(clampTicketQty(MAX_TICKET_QTY + 10)).toBe(MAX_TICKET_QTY);
  });
  it("redondea decimales", () => {
    expect(clampTicketQty(2.4)).toBe(2);
    expect(clampTicketQty(2.6)).toBe(3);
  });
  it("valores inválidos → 1", () => {
    expect(clampTicketQty(undefined)).toBe(1);
    expect(clampTicketQty(null)).toBe(1);
    expect(clampTicketQty("abc")).toBe(1);
    expect(clampTicketQty(NaN)).toBe(1);
  });
  it("deja pasar un valor válido intermedio", () => {
    expect(clampTicketQty(3)).toBe(3);
  });
});

describe("ticketQty / ticketUnitPrice (compat con boletas viejas)", () => {
  it("boleta sin quantity → 1 entrada, precio unitario = price", () => {
    const t = { price: 7000 };
    expect(ticketQty(t)).toBe(1);
    expect(ticketUnitPrice(t)).toBe(7000);
  });
  it("boleta con quantity → precio unitario derivado del total", () => {
    const t = { price: 21000, quantity: 3 };
    expect(ticketQty(t)).toBe(3);
    expect(ticketUnitPrice(t)).toBe(7000);
  });
  it("no divide por cero si quantity fuese 0 (defensivo)", () => {
    const t = { price: 5000, quantity: 0 };
    expect(ticketQty(t)).toBe(1);        // 0 → compat, cuenta como 1
    expect(ticketUnitPrice(t)).toBe(5000);
  });
});

describe("genTicketToken", () => {
  it("6 caracteres A-Z0-9", () => {
    for (let i = 0; i < 50; i++) expect(genTicketToken()).toMatch(/^[0-9A-Z]{6}$/);
  });
  it("no repite en un lote razonable (aleatorio)", () => {
    const set = new Set();
    for (let i = 0; i < 500; i++) set.add(genTicketToken());
    // 500 tokens de 36^6 ≈ 2.2e9: colisiones prácticamente imposibles
    expect(set.size).toBeGreaterThan(495);
  });
});
