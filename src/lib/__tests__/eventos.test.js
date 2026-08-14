import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  EVENTO_LEGACY_ID, META_LEGACY, slugify, nuevoEventoId, esEventoIdValido,
  rutaEvento, rutaBackups, rutaMeta, rutaStaff, rutaEventosDeUsuario, claveLocal,
  esDuenoDelEvento, eventoActivoId, guardarEventoActivo, _resetEventoActivoCache,
  fbPathEvento, lsKey,
} from "../eventos.js";
import { MONEDAS, formatearImporte, preciosPorDefecto, precioValido } from "../moneda.js";
import { monedaDelEventoActivo, preciosDelEventoActivo, guardarMetaLocal, leerMetaLocal, aforoDelEventoActivo, aforoValido, AFORO_POR_DEFECTO } from "../fichaEvento.js";

// El entorno de pruebas es "node": no hay localStorage. Se monta uno de mentira
// porque justo lo que hay que probar es que las claves de dos veladas NO se
// pisan — sin él, esa prueba no existiría.
function montarLocalStorage() {
  const datos = new Map();
  globalThis.localStorage = {
    getItem: k => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: k => datos.delete(k),
    get length() { return datos.size; },
    key: i => Array.from(datos.keys())[i] ?? null,
    _datos: datos,
  };
  return datos;
}

describe("identificadores de evento", () => {
  it("slugify quita tildes, ñ y símbolos, y deja un id legible", () => {
    expect(slugify("Sangre Nueva Madrid — 1ª edición")).toBe("sangre-nueva-madrid-1-edicion");
    expect(slugify("  Alcorcón / Getafe  ")).toBe("alcorcon-getafe");
    expect(slugify("")).toBe("");
  });
  it("nuevoEventoId cae en 'velada' cuando el nombre no deja letras usables", () => {
    expect(nuevoEventoId("¿¡!", "abc123")).toBe("velada-abc123");
  });
  it("dos veladas del mismo nombre NO comparten id (si no, se pisarían los datos)", () => {
    expect(nuevoEventoId("Velada de Otoño", "aaa")).not.toBe(nuevoEventoId("Velada de Otoño", "bbb"));
  });
  it("esEventoIdValido rechaza lo que Firebase no acepta como tramo de ruta", () => {
    expect(esEventoIdValido("madrid-2026-x7f2k1")).toBe(true);
    expect(esEventoIdValido(EVENTO_LEGACY_ID)).toBe(true);
    expect(esEventoIdValido("con.punto")).toBe(false);
    expect(esEventoIdValido("con/barra")).toBe(false);
    expect(esEventoIdValido("con espacio")).toBe(false);
    expect(esEventoIdValido("Mayúsculas")).toBe(false);
    expect(esEventoIdValido("")).toBe(false);
    expect(esEventoIdValido(null)).toBe(false);
    expect(esEventoIdValido("-empieza-con-guion")).toBe(false);
  });
});

describe("rutas: la velada de Chile no se mueve de sitio", () => {
  it("el evento histórico conserva EXACTAMENTE sus rutas de siempre", () => {
    expect(rutaEvento(EVENTO_LEGACY_ID, "bm_fighters_v4")).toBe("sangre_nueva/bm_fighters_v4");
    expect(rutaEvento(EVENTO_LEGACY_ID, "tickets/PRE-0007")).toBe("sangre_nueva/tickets/PRE-0007");
    expect(rutaEvento(EVENTO_LEGACY_ID, "counters/preventa")).toBe("sangre_nueva/counters/preventa");
    expect(rutaBackups(EVENTO_LEGACY_ID)).toBe("sangre_nueva_backups");
    expect(rutaStaff(EVENTO_LEGACY_ID)).toBe("staff");
    expect(rutaMeta(EVENTO_LEGACY_ID)).toBe(null);
  });
  it("y sus claves locales tampoco cambian (la PWA ya instalada no migra nada)", () => {
    expect(claveLocal(EVENTO_LEGACY_ID, "bm_fighters_v4")).toBe("bm_fighters_v4");
    expect(claveLocal(EVENTO_LEGACY_ID, "bm_tickets_outbox")).toBe("bm_tickets_outbox");
  });
  it("la migración de boletas (clave vacía) apunta a la raíz del evento", () => {
    expect(rutaEvento(EVENTO_LEGACY_ID, "")).toBe("sangre_nueva/");
    expect(rutaEvento("madrid-x1", "")).toBe("eventos/madrid-x1/");
  });
});

describe("rutas: dos veladas nunca comparten datos", () => {
  const A = "madrid-abc123", B = "getafe-def456";
  it("cada velada tiene su propio rincón en la nube", () => {
    expect(rutaEvento(A, "bm_fighters_v4")).toBe("eventos/madrid-abc123/bm_fighters_v4");
    expect(rutaEvento(A, "bm_fighters_v4")).not.toBe(rutaEvento(B, "bm_fighters_v4"));
    expect(rutaEvento(A, "tickets/PUE-0001")).not.toBe(rutaEvento(B, "tickets/PUE-0001"));
    expect(rutaBackups(A)).not.toBe(rutaBackups(B));
    expect(rutaStaff(A)).not.toBe(rutaStaff(B));
  });
  it("y su propia caché en el dispositivo, colas de pendientes incluidas", () => {
    // El caso grave: una venta que quedó sin subir en una velada no puede
    // reaparecer en la boletería de la otra.
    expect(claveLocal(A, "bm_tickets_outbox")).toBe("ev:madrid-abc123:bm_tickets_outbox");
    expect(claveLocal(A, "bm_tickets_outbox")).not.toBe(claveLocal(B, "bm_tickets_outbox"));
    expect(claveLocal(A, "bm_fighters_v4")).not.toBe(claveLocal(EVENTO_LEGACY_ID, "bm_fighters_v4"));
  });
  it("el índice de eventos es por usuario", () => {
    expect(rutaEventosDeUsuario("uid1")).toBe("usuarios/uid1/eventos");
    expect(rutaEventosDeUsuario("uid1")).not.toBe(rutaEventosDeUsuario("uid2"));
  });
});

describe("quién es el dueño de cada velada", () => {
  const SUPER = "josnier.azuaje@gmail.com";
  const josnier = { uid: "u-josnier", email: SUPER };
  const otro = { uid: "u-otro", email: "club@madrid.es" };
  const metaDeOtro = { ownerUid: "u-otro" };

  it("el dueño de la velada manda en la suya", () => {
    expect(esDuenoDelEvento(otro, metaDeOtro, { eventoId: "madrid-x", superEmail: SUPER })).toBe(true);
  });
  it("un colaborador cualquiera NO es dueño", () => {
    expect(esDuenoDelEvento({ uid: "u-staff", email: "staff@x.es" }, metaDeOtro, { eventoId: "madrid-x", superEmail: SUPER })).toBe(false);
  });
  it("el creador de la app sigue siendo superusuario en cualquier velada", () => {
    expect(esDuenoDelEvento(josnier, metaDeOtro, { eventoId: "madrid-x", superEmail: SUPER })).toBe(true);
  });
  it("en el histórico de Chile (sin ficha en la nube) manda el superusuario", () => {
    expect(esDuenoDelEvento(josnier, null, { eventoId: EVENTO_LEGACY_ID, superEmail: SUPER })).toBe(true);
    expect(esDuenoDelEvento(otro, null, { eventoId: EVENTO_LEGACY_ID, superEmail: SUPER })).toBe(false);
  });
  it("sin sesión no manda nadie", () => {
    expect(esDuenoDelEvento(null, metaDeOtro, { eventoId: "madrid-x", superEmail: SUPER })).toBe(false);
  });
  it("una ficha sin ownerUid no convierte a nadie en dueño", () => {
    expect(esDuenoDelEvento(otro, {}, { eventoId: "madrid-x", superEmail: SUPER })).toBe(false);
    expect(esDuenoDelEvento(otro, null, { eventoId: "madrid-x", superEmail: SUPER })).toBe(false);
  });
});

describe("evento activo en este dispositivo", () => {
  beforeEach(() => { montarLocalStorage(); _resetEventoActivoCache(); });
  afterEach(() => { delete globalThis.localStorage; _resetEventoActivoCache(); });

  it("sin nada guardado se abre la velada de siempre (nadie pierde sus datos al actualizar)", () => {
    expect(eventoActivoId()).toBe(EVENTO_LEGACY_ID);
  });
  it("guardar y leer el evento abierto", () => {
    expect(guardarEventoActivo("madrid-abc123")).toBe(true);
    expect(eventoActivoId()).toBe("madrid-abc123");
    expect(fbPathEvento("bm_fighters_v4")).toBe("eventos/madrid-abc123/bm_fighters_v4");
    expect(lsKey("bm_fighters_v4")).toBe("ev:madrid-abc123:bm_fighters_v4");
  });
  it("un id inválido no se guarda (antes de que Firebase reviente a mitad de un alta)", () => {
    expect(guardarEventoActivo("con/barra")).toBe(false);
    expect(eventoActivoId()).toBe(EVENTO_LEGACY_ID);
  });
  it("un valor corrupto en el dispositivo cae a la velada de siempre en vez de romper la app", () => {
    globalThis.localStorage.setItem("bm_evento_activo", "id con espacios");
    _resetEventoActivoCache();
    expect(eventoActivoId()).toBe(EVENTO_LEGACY_ID);
  });
});

describe("moneda y precios por velada", () => {
  beforeEach(() => { montarLocalStorage(); _resetEventoActivoCache(); });
  afterEach(() => { delete globalThis.localStorage; _resetEventoActivoCache(); });

  it("el euro se escribe con el símbolo DETRÁS y con céntimos", () => {
    expect(formatearImporte(15, "EUR")).toBe("15,00 €");
    expect(formatearImporte(12.5, "EUR")).toBe("12,50 €");
  });
  it("el peso chileno se escribe con el símbolo delante y sin decimales", () => {
    expect(formatearImporte(10000, "CLP")).toBe("$10.000");
    expect(formatearImporte(641000, "CLP")).toBe("$641.000");
  });
  it("un importe basura no rompe la boleta: se formatea como cero", () => {
    expect(formatearImporte(undefined, "EUR")).toBe("0,00 €");
    expect(formatearImporte("no es un número", "CLP")).toBe("$0");
  });
  it("una moneda desconocida cae en la de por defecto en vez de dejar la cifra sin símbolo", () => {
    expect(formatearImporte(10, "XYZ")).toBe(formatearImporte(10, "EUR"));
  });

  it("el histórico de Chile sigue cobrando en pesos con sus precios de siempre", () => {
    expect(monedaDelEventoActivo()).toBe("CLP");
    expect(preciosDelEventoActivo()).toEqual({ inscripcion: 5000, preventa: 7000, puerta: 10000 });
  });
  it("una velada nueva sin ficha todavía arranca en euros", () => {
    guardarEventoActivo("madrid-abc123");
    expect(monedaDelEventoActivo()).toBe("EUR");
    expect(preciosDelEventoActivo()).toEqual(preciosPorDefecto("EUR"));
  });
  it("los precios guardados en la ficha de la velada mandan sobre los de por defecto", () => {
    guardarEventoActivo("madrid-abc123");
    guardarMetaLocal({ moneda: "EUR", precios: { inscripcion: 8, preventa: 12, puerta: 18 } });
    expect(preciosDelEventoActivo()).toEqual({ inscripcion: 8, preventa: 12, puerta: 18 });
  });
  it("un precio corrupto en la ficha cae a su valor por defecto (nunca deja la venta en NaN)", () => {
    guardarEventoActivo("madrid-abc123");
    guardarMetaLocal({ moneda: "EUR", precios: { inscripcion: "ocho", preventa: -3, puerta: 18 } });
    const p = preciosDelEventoActivo();
    expect(p.inscripcion).toBe(preciosPorDefecto("EUR").inscripcion);
    expect(p.preventa).toBe(preciosPorDefecto("EUR").preventa);
    expect(p.puerta).toBe(18);
  });
  it("la ficha cacheada es de la velada abierta, no de la de al lado", () => {
    guardarEventoActivo("madrid-abc123");
    guardarMetaLocal({ moneda: "EUR", precios: { inscripcion: 8, preventa: 12, puerta: 18 } });
    _resetEventoActivoCache();
    guardarEventoActivo("santiago-def456");
    expect(leerMetaLocal()).toBe(null);
    expect(preciosDelEventoActivo()).toEqual(preciosPorDefecto("EUR"));
  });
  it("precioValido acepta el cero (una entrada de cortesía es un precio legítimo)", () => {
    expect(precioValido(0, 10)).toBe(0);
    expect(precioValido("15", 10)).toBe(15);
    expect(precioValido(null, 10)).toBe(10);
  });
  it("la ficha del histórico está en el código, con su moneda fijada", () => {
    expect(META_LEGACY.moneda).toBe("CLP");
    expect(MONEDAS.CLP.decimales).toBe(0);
    expect(MONEDAS.EUR.decimales).toBe(2);
  });
});

describe("aforo del recinto por velada", () => {
  beforeEach(() => { montarLocalStorage(); _resetEventoActivoCache(); });
  afterEach(() => { delete globalThis.localStorage; _resetEventoActivoCache(); });

  it("el histórico de Chile conserva el aforo que estaba escrito en el código", () => {
    expect(aforoDelEventoActivo()).toBe(320);
    expect(AFORO_POR_DEFECTO).toBe(320);
  });
  it("cada velada usa el aforo de su ficha", () => {
    guardarEventoActivo("madrid-abc123");
    guardarMetaLocal({ moneda: "EUR", aforo: 180 });
    expect(aforoDelEventoActivo()).toBe(180);
  });
  it("una velada sin aforo en la ficha cae al valor por defecto", () => {
    guardarEventoActivo("madrid-abc123");
    guardarMetaLocal({ moneda: "EUR" });
    expect(aforoDelEventoActivo()).toBe(AFORO_POR_DEFECTO);
  });
  it("un aforo CERO nunca llega a la app: dejaría la barra de entradas dividiendo entre cero", () => {
    guardarEventoActivo("madrid-abc123");
    guardarMetaLocal({ moneda: "EUR", aforo: 0 });
    expect(aforoDelEventoActivo()).toBe(AFORO_POR_DEFECTO);
    expect(Number.isFinite(50 / aforoDelEventoActivo())).toBe(true);
  });
  it("aforoValido redondea, rechaza lo absurdo y acepta lo tecleado como texto", () => {
    expect(aforoValido("180", 320)).toBe(180);
    expect(aforoValido(180.6, 320)).toBe(181);
    expect(aforoValido(-5, 320)).toBe(320);
    expect(aforoValido(999999999, 320)).toBe(320); // un cero de más al teclear
    expect(aforoValido("", 320)).toBe(320);
    expect(aforoValido(null, 320)).toBe(320);
    expect(aforoValido("mucha gente", 320)).toBe(320);
    expect(aforoValido(1, 320)).toBe(1);
  });
});
