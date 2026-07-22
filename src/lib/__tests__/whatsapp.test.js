import { describe, it, expect } from "vitest";
import { waPhone, waChatUrl } from "../whatsapp.js";

// El teléfono de la venta es texto libre: si waPhone se equivoca, el botón
// "Compartir al WhatsApp" abre una pantalla de error en vez del chat.
describe("waPhone — teléfono en el formato que exige wa.me", () => {
  it("acepta las formas en que se escribe un móvil chileno y todas dan el mismo número", () => {
    const esperado = "56912345678";
    for (const entrada of [
      "+56 9 1234 5678",
      "56912345678",
      "+56-9-1234-5678",
      "9 1234 5678",
      "912345678",
      "09 1234 5678",      // cero de larga distancia (muy común)
      "(9) 1234-5678",
      "0056 9 1234 5678",  // prefijo internacional escrito a mano
    ]) {
      expect(waPhone(entrada), entrada).toBe(esperado);
    }
  });

  it("sin teléfono devuelve cadena vacía (wa.me abre el selector de contactos)", () => {
    expect(waPhone("")).toBe("");
    expect(waPhone(null)).toBe("");
    expect(waPhone(undefined)).toBe("");
    expect(waPhone("sin datos")).toBe("");
  });

  it("deja pasar un número extranjero ya completo en vez de descartarlo", () => {
    expect(waPhone("+54 9 11 2345 6789")).toBe("5491123456789");
    expect(waPhone("+1 415 555 0132")).toBe("14155550132");
  });

  it("no inventa el código de país en un fijo chileno (no es móvil)", () => {
    // 8 dígitos: no cumple la regla del móvil, se manda tal cual.
    expect(waPhone("2 2345 6789")).toBe("223456789");
  });
});

describe("waChatUrl — enlace al chat, siempre vacío", () => {
  // La entrada viaja como imagen. Si el enlace llevara texto pre-escrito, un
  // Enter de más manda el mensaje SIN el voucher: es el error que se arregló.
  it("nunca lleva texto pre-escrito", () => {
    for (const u of [waChatUrl("9 1234 5678"), waChatUrl("9 1234 5678", { escritorio: true }), waChatUrl("")]) {
      expect(u).not.toContain("text=");
    }
  });

  it("en el celular abre la app de WhatsApp con el número normalizado", () => {
    expect(waChatUrl("+56 9 1234 5678")).toBe("https://wa.me/56912345678");
  });

  it("en el computador va directo a WhatsApp Web, sin la pantalla intermedia de wa.me", () => {
    expect(waChatUrl("09 1234 5678", { escritorio: true })).toBe("https://web.whatsapp.com/send?phone=56912345678");
  });

  it("sin teléfono deja abierto el selector de contactos en los dos casos", () => {
    expect(waChatUrl("")).toBe("https://wa.me/");
    expect(waChatUrl("", { escritorio: true })).toBe("https://web.whatsapp.com/");
  });
});
