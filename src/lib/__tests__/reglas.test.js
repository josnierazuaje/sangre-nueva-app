import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ============================================
// PRUEBAS DE database.rules.json
// ============================================
// Sin servidor propio, las reglas de la base son la ÚNICA barrera real: lo que
// la app esconde en pantalla no protege nada (quien tenga la clave de la puerta
// puede hablar con la base directamente desde un navegador). Aun así eran lo
// único del proyecto sin una sola prueba.
//
// Estas pruebas EVALÚAN EL TEXTO REAL del archivo de reglas —no una copia ni un
// resumen—, con un pequeño intérprete de las primitivas de RTDB (data, newData,
// root, auth y los métodos .val() / .exists() / .isNumber() / .matches()). Así,
// si alguien cambia un `!==` por un `===` en las reglas, esto falla.
//
// No sustituye al simulador de la consola de Firebase (que es el motor de
// verdad), pero sí atrapa los errores de lógica, que son los que se cuelan.

const REGLAS = JSON.parse(readFileSync(fileURLToPath(new URL("../../../database.rules.json", import.meta.url)), "utf8")).rules;

// En RTDB, .val() devuelve un valor que además entiende .matches(/re/). En JS
// una cadena normal no tiene ese método, así que se lo añadimos SOLO durante
// estas pruebas para poder evaluar el texto de las reglas tal cual está escrito.
beforeAll(() => {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(String.prototype, "matches", {
    value(re) { return re.test(String(this)); }, configurable: true, writable: true,
  });
});

// Instantánea al estilo RTDB sobre un valor plano.
function snap(value) {
  const existe = value !== undefined && value !== null;
  return {
    val: () => (existe ? value : null),
    exists: () => existe,
    isNumber: () => typeof value === "number",
    isString: () => typeof value === "string",
    hasChildren: () => existe && typeof value === "object" && Object.keys(value).length > 0,
    child: k => snap(existe && typeof value === "object" ? value[k] : undefined),
  };
}

const OWNER = "josnier.azuaje@gmail.com";
// Cómo se ve cada rol: el dueño va por correo; los demás por su UID en /staff.
// Un UID con el valor "puerta" es el personal de la puerta; cualquier OTRO
// valor (incluido el `true` que ya está puesto hoy) es staff pleno — así el
// despliegue no rompe nada hasta que se marque a alguien como "puerta".
const ROLES = {
  dueño:  { auth: { uid: "uid-dueño", token: { email: OWNER } }, staff: { "uid-staff": true, "uid-puerta": "puerta" } },
  staff:  { auth: { uid: "uid-staff", token: { email: "ayudante@ejemplo.com" } }, staff: { "uid-staff": true, "uid-puerta": "puerta" } },
  puerta: { auth: { uid: "uid-puerta", token: { email: "escaner@sangrenueva.app" } }, staff: { "uid-staff": true, "uid-puerta": "puerta" } },
  extraño: { auth: { uid: "uid-x", token: { email: "cualquiera@ejemplo.com" } }, staff: { "uid-staff": true, "uid-puerta": "puerta" } },
};

function evaluar(expr, { rol, data, newData, $id }) {
  if (expr === undefined) return undefined;
  if (typeof expr === "boolean") return expr;
  const { auth, staff } = ROLES[rol];
  const root = snap({ staff });
  const fn = new Function("auth", "root", "data", "newData", "$id", `return (${expr});`);
  return !!fn(auth, root, snap(data), snap(newData), $id);
}

const puedeLeer = (nodo, rol) => evaluar(nodo[".read"], { rol });
// Escribir exige pasar .write Y .validate (RTDB no evalúa .validate al borrar).
function puedeEscribir(nodo, rol, { data, newData, $id } = {}) {
  if (!evaluar(nodo[".write"], { rol, data, newData, $id })) return false;
  const borrado = newData === undefined || newData === null;
  if (borrado || nodo[".validate"] === undefined) return true;
  return evaluar(nodo[".validate"], { rol, data, newData, $id });
}

const SN = REGLAS.sangre_nueva;
const DATOS_EVENTO = ["bm_fighters_v4", "bm_matchups_v3", "bm_super4_v1", "bm_event_label"];

describe("reglas: la raíz niega todo por defecto", () => {
  it("nadie lee ni escribe en la raíz sin una regla explícita", () => {
    expect(REGLAS[".read"]).toBe(false);
    expect(REGLAS[".write"]).toBe(false);
  });
});

describe("reglas: datos del evento (peleadores, cartelera, Super 4, nombre)", () => {
  DATOS_EVENTO.forEach(clave => {
    describe(clave, () => {
      const nodo = SN[clave];
      it("el dueño lee y escribe", () => {
        expect(puedeLeer(nodo, "dueño")).toBe(true);
        expect(puedeEscribir(nodo, "dueño", { data: ["a"], newData: ["a", "b"] })).toBe(true);
      });
      it("el staff pleno lee y escribe", () => {
        expect(puedeLeer(nodo, "staff")).toBe(true);
        expect(puedeEscribir(nodo, "staff", { data: ["a"], newData: ["a", "b"] })).toBe(true);
      });
      it("LA PUERTA NO LEE (datos de menores) ni escribe", () => {
        expect(puedeLeer(nodo, "puerta")).toBe(false);
        expect(puedeEscribir(nodo, "puerta", { data: ["a"], newData: ["a", "b"] })).toBe(false);
      });
      it("un desconocido no toca nada", () => {
        expect(puedeLeer(nodo, "extraño")).toBe(false);
        expect(puedeEscribir(nodo, "extraño", { data: ["a"], newData: ["b"] })).toBe(false);
      });
      it("CLAVE: el staff NO puede vaciar el nodo de un golpe; el dueño sí", () => {
        // Un PUT con null borraba el nodo entero (RTDB no evalúa .validate al
        // borrar), dejando la app en blanco en todos los dispositivos.
        expect(puedeEscribir(nodo, "staff", { data: ["a"], newData: null })).toBe(false);
        expect(puedeEscribir(nodo, "dueño", { data: ["a"], newData: null })).toBe(true);
      });
      it("el centinela de vaciado a propósito sigue permitido al staff", () => {
        expect(puedeEscribir(nodo, "staff", { data: ["a"], newData: "__EMPTY__" })).toBe(true);
      });
    });
  });
});

describe("reglas: boletas", () => {
  const nodo = SN.tickets;
  const $id = "PRE-0007";
  const boleta = {
    id: $id, token: "K7QX9M", price: 14000, quantity: 2, ticketType: "preventa",
    attendeeName: "Ana Prueba", phone: "+56911111111", paymentMethod: "Efectivo",
    status: "activo", createdAt: "2026-08-04T12:00:00.000Z", checkedInAt: null,
  };
  const ingresada = { ...boleta, status: "ingresado", checkedInAt: "2026-08-04T20:00:00.000Z" };
  const porId = nodo.$id;

  it("los tres roles pueden LEER las boletas (la puerta las necesita)", () => {
    ["dueño", "staff", "puerta"].forEach(r => expect(puedeLeer(nodo, r)).toBe(true));
    expect(puedeLeer(nodo, "extraño")).toBe(false);
  });
  it("el borrado masivo de la colección es solo del dueño", () => {
    expect(puedeEscribir(nodo, "dueño", { newData: null })).toBe(true);
    expect(puedeEscribir(nodo, "staff", { newData: null })).toBe(false);
    expect(puedeEscribir(nodo, "puerta", { newData: null })).toBe(false);
  });

  describe("la puerta SOLO puede marcar el ingreso", () => {
    it("marca activo → ingresado conservando todo lo demás", () => {
      expect(puedeEscribir(porId, "puerta", { data: boleta, newData: ingresada, $id })).toBe(true);
    });
    it("NO puede crear boletas (entradas gratis)", () => {
      expect(puedeEscribir(porId, "puerta", { data: undefined, newData: boleta, $id })).toBe(false);
    });
    it("NO puede borrar una boleta pagada", () => {
      expect(puedeEscribir(porId, "puerta", { data: boleta, newData: null, $id })).toBe(false);
    });
    it("NO puede devolver una boleta usada a activo (revalidar su QR)", () => {
      expect(puedeEscribir(porId, "puerta", { data: ingresada, newData: boleta, $id })).toBe(false);
    });
    it("NO puede cambiar el precio, ni el nombre, ni la cantidad, ni el token", () => {
      const casos = [
        { ...ingresada, price: 0 },
        { ...ingresada, attendeeName: "Otro" },
        { ...ingresada, quantity: 20 },
        { ...ingresada, token: "AAAAAA" },
        { ...ingresada, ticketType: "vip" },
        { ...ingresada, paymentMethod: "Transferencia" },
        { ...ingresada, createdAt: "2020-01-01T00:00:00.000Z" },
      ];
      casos.forEach(nuevo => expect(puedeEscribir(porId, "puerta", { data: boleta, newData: nuevo, $id })).toBe(false));
    });
    it("NO puede anular una boleta", () => {
      expect(puedeEscribir(porId, "puerta", { data: boleta, newData: { ...boleta, status: "anulado" }, $id })).toBe(false);
    });
  });

  describe("el staff pleno vende con normalidad", () => {
    it("crea, edita y borra boletas", () => {
      expect(puedeEscribir(porId, "staff", { data: undefined, newData: boleta, $id })).toBe(true);
      expect(puedeEscribir(porId, "staff", { data: boleta, newData: ingresada, $id })).toBe(true);
      expect(puedeEscribir(porId, "staff", { data: boleta, newData: null, $id })).toBe(true);
    });
  });

  describe("validación de la forma de la boleta (vale para todos)", () => {
    const malos = {
      "id que no coincide con su nodo": { ...boleta, id: "PRE-9999" },
      "precio negativo": { ...boleta, price: -1 },
      "precio que no es número": { ...boleta, price: "gratis" },
      "estado inventado": { ...boleta, status: "regalada" },
      "cantidad por encima del máximo": { ...boleta, quantity: 21 },
      "cantidad cero": { ...boleta, quantity: 0 },
      "token con formato inválido": { ...boleta, token: "abc" },
    };
    Object.entries(malos).forEach(([caso, nuevo]) => {
      it("rechaza: " + caso, () => {
        expect(puedeEscribir(porId, "dueño", { data: undefined, newData: nuevo, $id })).toBe(false);
      });
    });
    it("acepta una boleta vieja sin token ni cantidad (compatibilidad)", () => {
      const vieja = { id: $id, price: 7000, status: "activo", attendeeName: "Viejo", createdAt: "2025-01-01T00:00:00.000Z" };
      expect(puedeEscribir(porId, "dueño", { data: undefined, newData: vieja, $id })).toBe(true);
    });
  });
});

describe("reglas: contadores de correlativo", () => {
  const nodo = SN.counters.$tipo;
  it("el staff pleno puede subir el contador (vende), la puerta no", () => {
    expect(puedeEscribir(nodo, "staff", { data: 5, newData: 6 })).toBe(true);
    expect(puedeEscribir(nodo, "puerta", { data: 5, newData: 6 })).toBe(false);
  });
  it("el contador nunca baja (no se reasignan correlativos)", () => {
    expect(puedeEscribir(nodo, "dueño", { data: 5, newData: 4 })).toBe(false);
    expect(puedeEscribir(nodo, "staff", { data: 5, newData: 5 })).toBe(true);
  });
});

describe("reglas: lista de staff y respaldos", () => {
  it("solo el dueño edita quién es staff (nadie se auto-asciende)", () => {
    expect(puedeEscribir(REGLAS.staff, "dueño", { newData: { "uid-x": true } })).toBe(true);
    ["staff", "puerta", "extraño"].forEach(r =>
      expect(puedeEscribir(REGLAS.staff, r, { newData: { "uid-x": true } })).toBe(false));
  });
  it("los respaldos son solo del dueño", () => {
    const b = REGLAS.sangre_nueva_backups;
    expect(puedeLeer(b, "dueño")).toBe(true);
    ["staff", "puerta", "extraño"].forEach(r => expect(puedeLeer(b, r)).toBe(false));
  });
});

describe("compatibilidad: hoy nadie está marcado como 'puerta'", () => {
  it("un UID con el valor `true` sigue siendo staff pleno (el despliegue no rompe nada)", () => {
    // Es lo que hace seguro publicar las reglas ANTES de marcar el rol: la
    // cuenta del escáner conserva sus permisos actuales hasta que el dueño
    // cambie su valor a "puerta" en la consola.
    expect(puedeLeer(SN.bm_fighters_v4, "staff")).toBe(true);
    expect(puedeLeer(SN.tickets, "staff")).toBe(true);
  });
});
