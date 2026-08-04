import { describe, it, expect } from "vitest";
import { nodeToArray, applyUpsertFighter, applyRemoveFighter, buildTicketRestore, stripLocalGhosts, applyOutboxPut, applyOutboxRemove, pruneOutbox, mergePending, stripUndefined, fighterNodeValue, OUTBOX_TTL_MS, stripLocalFlags, mergePendingTickets, sortTickets, applyCheckIn, interpretCheckIn } from "../storage.js";

const A = { id: "a", fullName: "Ana" };
const B = { id: "b", fullName: "Beto" };
const C = { id: "c", fullName: "Caro" };

describe("outbox de peleadores (escrituras que sobreviven a la recarga)", () => {
  const now = 1_000_000;
  it("applyOutboxPut agrega con marca de tiempo y reemplaza por id (sin duplicar)", () => {
    let l = applyOutboxPut([], A, now);
    expect(l).toHaveLength(1);
    expect(l[0]._queuedAt).toBe(now);
    l = applyOutboxPut(l, { ...A, fullName: "Ana v2" }, now + 5);
    expect(l).toHaveLength(1);
    expect(l[0].fullName).toBe("Ana v2");
    l = applyOutboxPut(l, B, now + 10);
    expect(l).toHaveLength(2);
  });
  it("applyOutboxRemove quita solo el id confirmado", () => {
    const l = applyOutboxPut(applyOutboxPut([], A, now), B, now);
    expect(applyOutboxRemove(l, A.id).map(x => x.id)).toEqual([B.id]);
  });
  it("pruneOutbox descarta pendientes más viejos que el TTL y sin marca", () => {
    const fresh = { ...A, _queuedAt: now };
    const stale = { ...B, _queuedAt: now - OUTBOX_TTL_MS - 1 };
    const sinMarca = { ...C };
    expect(pruneOutbox([fresh, stale, sinMarca], now).map(x => x.id)).toEqual([A.id]);
  });
  it("mergePending fusiona por id sobre la lista (sin _queuedAt) y agrega los nuevos", () => {
    const pending = [{ ...B, fullName: "Beto pendiente", _queuedAt: now }, { ...C, _queuedAt: now }];
    const merged = mergePending([A, B], pending);
    expect(merged).toHaveLength(3);
    const beto = merged.find(x => x.id === B.id);
    expect(beto.fullName).toBe("Beto pendiente");
    expect(beto._queuedAt).toBeUndefined();
  });
  it("SEGURIDAD: mergePending con listas nulas no explota", () => {
    expect(mergePending(null, null)).toEqual([]);
    expect(mergePending([A], null)).toEqual([A]);
  });
});

describe("outbox de BOLETAS (ventas que sobreviven a la recarga)", () => {
  const V1 = { id: "PRE-0001", attendeeName: "Ana", price: 7000, status: "activo", createdAt: "2026-08-04T10:00:00.000Z" };
  const V2 = { id: "PRE-0002", attendeeName: "Beto", price: 7000, status: "activo", createdAt: "2026-08-04T11:00:00.000Z" };

  describe("stripLocalFlags", () => {
    it("quita las marcas internas y deja el resto intacto", () => {
      expect(stripLocalFlags({ ...V1, _queuedAt: 123, _pending: true })).toEqual(V1);
    });
    it("no explota con valores raros", () => {
      expect(stripLocalFlags(null)).toBe(null);
      expect(stripLocalFlags("x")).toBe("x");
    });
  });

  describe("mergePendingTickets", () => {
    it("agrega la venta pendiente que la nube todavía no tiene, marcada", () => {
      const out = mergePendingTickets([V1], [{ ...V2, _queuedAt: 1 }]);
      expect(out).toHaveLength(2);
      const pend = out.find(t => t.id === V2.id);
      expect(pend._pending).toBe(true);
      expect(pend._queuedAt).toBeUndefined();
    });
    it("CLAVE: nunca pisa la versión de la nube — un pendiente viejo NO revierte un check-in", () => {
      const enLaNube = { ...V1, status: "ingresado", checkedInAt: "2026-08-04T20:00:00.000Z" };
      const pendienteViejo = { ...V1, status: "activo", _queuedAt: 1 };
      const out = mergePendingTickets([enLaNube], [pendienteViejo]);
      expect(out).toHaveLength(1);
      expect(out[0].status).toBe("ingresado");
      expect(out[0]._pending).toBeUndefined();
    });
    it("sin pendientes devuelve la lista de la nube tal cual", () => {
      expect(mergePendingTickets([V1, V2], [])).toEqual([V1, V2]);
    });
    it("SEGURIDAD: listas nulas no explotan", () => {
      expect(mergePendingTickets(null, null)).toEqual([]);
      expect(mergePendingTickets(null, [{ ...V1, _queuedAt: 1 }])).toHaveLength(1);
    });
    it("ignora pendientes sin id", () => {
      expect(mergePendingTickets([], [{ attendeeName: "sin id" }])).toEqual([]);
    });
  });

  it("sortTickets ordena por fecha de creación sin mutar la entrada", () => {
    const entrada = [V2, V1];
    expect(sortTickets(entrada).map(t => t.id)).toEqual([V1.id, V2.id]);
    expect(entrada.map(t => t.id)).toEqual([V2.id, V1.id]);
    expect(sortTickets(null)).toEqual([]);
  });

  it("las funciones del outbox de peleadores sirven igual para boletas (por id)", () => {
    const now = 1_000_000;
    let cola = applyOutboxPut([], V1, now);
    cola = applyOutboxPut(cola, V2, now + 1);
    expect(cola).toHaveLength(2);
    // reemplaza por id en vez de duplicar (p.ej. reintento de la misma venta)
    cola = applyOutboxPut(cola, { ...V1, attendeeName: "Ana corregida" }, now + 2);
    expect(cola).toHaveLength(2);
    expect(cola.find(t => t.id === V1.id).attendeeName).toBe("Ana corregida");
    // confirmada en la nube → sale de la cola
    expect(applyOutboxRemove(cola, V1.id).map(t => t.id)).toEqual([V2.id]);
    // un pendiente vencido se descarta
    expect(pruneOutbox([{ ...V1, _queuedAt: now - OUTBOX_TTL_MS - 1 }], now)).toEqual([]);
  });

  it("un respaldo exportado con ventas pendientes no sube `_pending` a la nube", () => {
    const { ticketUpdates } = buildTicketRestore([{ ...V1, _pending: true, _queuedAt: 9 }]);
    expect(ticketUpdates["tickets/" + V1.id]).toEqual(V1);
  });
});

describe("check-in — LA regla que decide si una persona entra al recinto", () => {
  const AHORA = "2026-08-04T20:15:00.000Z";
  const activa = { id: "PRE-0001", status: "activo", checkedInAt: null, quantity: 2 };

  describe("applyCheckIn", () => {
    it("boleta activa → pasa a ingresada con la hora, sin tocar lo demás", () => {
      const out = applyCheckIn(activa, AHORA);
      expect(out).toEqual({ ...activa, status: "ingresado", checkedInAt: AHORA });
    });
    it("CLAVE: una boleta YA ingresada aborta (undefined) — no cuenta doble", () => {
      expect(applyCheckIn({ ...activa, status: "ingresado" }, AHORA)).toBeUndefined();
    });
    it("boleta anulada aborta", () => {
      expect(applyCheckIn({ ...activa, status: "anulado" }, AHORA)).toBeUndefined();
    });
    it("nodo inexistente aborta (no crea boletas de la nada)", () => {
      expect(applyCheckIn(null, AHORA)).toBeUndefined();
      expect(applyCheckIn(undefined, AHORA)).toBeUndefined();
    });
    it("no muta la boleta original", () => {
      const orig = { ...activa };
      applyCheckIn(orig, AHORA);
      expect(orig).toEqual(activa);
    });
  });

  describe("interpretCheckIn (veredicto que ve el portero)", () => {
    const ingresada = { id: "PRE-0001", status: "ingresado", checkedInAt: AHORA };
    it("transacción confirmada y quedó ingresada → ok", () => {
      expect(interpretCheckIn(true, ingresada)).toEqual({ ok: true, ticket: ingresada });
    });
    it("abortada porque otra puerta la marcó antes → already", () => {
      const r = interpretCheckIn(false, ingresada);
      expect(r.already).toBe(true);
      expect(r.ticket).toEqual(ingresada);
    });
    it("boleta inexistente → error", () => {
      expect(interpretCheckIn(false, null).error).toBeInstanceOf(Error);
    });
    it("boleta anulada → error (no la deja entrar)", () => {
      const r = interpretCheckIn(false, { id: "PRE-0001", status: "anulado" });
      expect(r.error).toBeInstanceOf(Error);
      expect(r.ok).toBeUndefined();
    });
  });
});

describe("stripLocalGhosts (auto-reparo)", () => {
  it("quita el registro local cuyo id NO está en la nube (fantasma)", () => {
    const local = [A, B, { id: "ghost", fullName: "Fantasma" }];
    const { cleaned, removedIds } = stripLocalGhosts(local, [A, B, C]);
    expect(cleaned).toEqual([A, B]);
    expect(removedIds).toEqual(["ghost"]);
  });
  it("no quita nada si todos los locales están en la nube", () => {
    const { cleaned, removedIds } = stripLocalGhosts([A, B], [A, B, C]);
    expect(cleaned).toEqual([A, B]);
    expect(removedIds).toEqual([]);
  });
  it("SEGURIDAD: nube vacía → no quita nada (no se vacía por lectura dudosa)", () => {
    const { cleaned, removedIds } = stripLocalGhosts([A, B], []);
    expect(cleaned).toEqual([A, B]);
    expect(removedIds).toEqual([]);
  });
  it("SEGURIDAD: nube nula → no quita nada", () => {
    expect(stripLocalGhosts([A, B], null).removedIds).toEqual([]);
    expect(stripLocalGhosts([A, B], undefined).cleaned).toEqual([A, B]);
  });
  it("varios fantasmas a la vez", () => {
    const local = [A, { id: "g1" }, B, { id: "g2" }];
    const { cleaned, removedIds } = stripLocalGhosts(local, [A, B]);
    expect(cleaned).toEqual([A, B]);
    expect(removedIds).toEqual(["g1", "g2"]);
  });
  it("local vacío → cleaned vacío, nada que quitar", () => {
    expect(stripLocalGhosts([], [A]).cleaned).toEqual([]);
  });
});

describe("nodeToArray", () => {
  it("null y undefined → []", () => {
    expect(nodeToArray(null)).toEqual([]);
    expect(nodeToArray(undefined)).toEqual([]);
  });
  it("centinela __EMPTY__ → []", () => {
    expect(nodeToArray("__EMPTY__")).toEqual([]);
  });
  it("arreglo → el mismo arreglo", () => {
    expect(nodeToArray([A, B])).toEqual([A, B]);
  });
  it("objeto con claves numéricas (como lo devuelve RTDB) → arreglo de valores", () => {
    expect(nodeToArray({ 0: A, 1: B })).toEqual([A, B]);
  });
  it("valor inesperado (string suelto) → []", () => {
    expect(nodeToArray("otro")).toEqual([]);
  });
});

describe("applyUpsertFighter", () => {
  it("agrega a una lista vacía", () => {
    expect(applyUpsertFighter([], A)).toEqual([A]);
  });
  it("agrega al final si el id no existe", () => {
    expect(applyUpsertFighter([A], B)).toEqual([A, B]);
  });
  it("reemplaza en su lugar si el id ya existe (no duplica)", () => {
    const edited = { id: "b", fullName: "Beto editado" };
    expect(applyUpsertFighter([A, B, C], edited)).toEqual([A, edited, C]);
  });
  it("acepta el nodo crudo del servidor (__EMPTY__/null/objeto)", () => {
    expect(applyUpsertFighter("__EMPTY__", A)).toEqual([A]);
    expect(applyUpsertFighter(null, A)).toEqual([A]);
    expect(applyUpsertFighter({ 0: A }, B)).toEqual([A, B]);
  });
  it("ANTI-PISADO: preserva un peleador que el servidor tenía y el local no", () => {
    // El servidor ya tiene a B (registrado por otro dispositivo); este
    // dispositivo agrega A sin saber de B. La fusión conserva ambos.
    expect(applyUpsertFighter([B], A)).toEqual([B, A]);
  });
});

describe("applyRemoveFighter", () => {
  it("quita el peleador por id", () => {
    expect(applyRemoveFighter([A, B, C], "b")).toEqual([A, C]);
  });
  it("id inexistente → sin cambios", () => {
    expect(applyRemoveFighter([A, B], "z")).toEqual([A, B]);
  });
  it("desde nodo vacío/centinela → []", () => {
    expect(applyRemoveFighter("__EMPTY__", "a")).toEqual([]);
    expect(applyRemoveFighter(null, "a")).toEqual([]);
  });
  it("ignora entradas nulas sin romper", () => {
    expect(applyRemoveFighter([A, null, B], "a")).toEqual([B]);
  });
});

describe("buildTicketRestore", () => {
  const t = (id, ticketType) => ({ id, ticketType, price: 7000, status: "activo" });

  it("mapea cada boleta a tickets/{id}", () => {
    const { ticketUpdates } = buildTicketRestore([t("PRE-0001", "preventa"), t("PUE-0002", "puerta")]);
    expect(ticketUpdates).toEqual({
      "tickets/PRE-0001": t("PRE-0001", "preventa"),
      "tickets/PUE-0002": t("PUE-0002", "puerta"),
    });
  });
  it("calcula el máximo correlativo por tipo", () => {
    const { maxByType } = buildTicketRestore([
      t("PRE-0003", "preventa"), t("PRE-0010", "preventa"), t("PRE-0007", "preventa"),
      t("PUE-0002", "puerta"),
    ]);
    expect(maxByType).toEqual({ preventa: 10, puerta: 2 });
  });
  it("ignora ids de emergencia (sin dígitos tras el guion) para el contador", () => {
    const { maxByType, ticketUpdates } = buildTicketRestore([
      t("PRE-0005", "preventa"), t("PRE-XK3J9", "preventa"),
    ]);
    // la boleta de emergencia sí se restaura, pero no cuenta para el correlativo
    expect(ticketUpdates["tickets/PRE-XK3J9"]).toBeTruthy();
    expect(maxByType).toEqual({ preventa: 5 });
  });
  it("ignora entradas nulas o sin id", () => {
    const { ticketUpdates, maxByType } = buildTicketRestore([null, { ticketType: "preventa" }, t("PRE-0001", "preventa")]);
    expect(Object.keys(ticketUpdates)).toEqual(["tickets/PRE-0001"]);
    expect(maxByType).toEqual({ preventa: 1 });
  });
  it("lista vacía o nula → objetos vacíos", () => {
    expect(buildTicketRestore([])).toEqual({ ticketUpdates: {}, maxByType: {} });
    expect(buildTicketRestore(null)).toEqual({ ticketUpdates: {}, maxByType: {} });
  });
});

// Firebase RTDB RECHAZA `undefined` y su validación lanza de forma SÍNCRONA
// desde runTransaction. Un peleador con el campo Notas vacío llegaba con
// `notes: undefined` y hacía que la excepción subiera hasta el onSubmit del
// formulario, saltándose su limpieza: el alta se confirmaba en pantalla pero
// los campos quedaban llenos.
describe("stripUndefined (ningún `undefined` puede llegar a la nube)", () => {
  it("quita la clave cuyo valor es undefined, sin tocar las demás", () => {
    const out = stripUndefined({ id: "a", fullName: "Ana", notes: undefined });
    expect(Object.keys(out)).toEqual(["id", "fullName"]);
    expect("notes" in out).toBe(false);
  });
  it("conserva null, 0, cadena vacía y false (valores legítimos en RTDB)", () => {
    const out = stripUndefined({ weightCategory: null, fightCount: 0, phone: "", pro: false });
    expect(out).toEqual({ weightCategory: null, fightCount: 0, phone: "", pro: false });
  });
  it("limpia dentro de arreglos y en profundidad (la forma real del nodo)", () => {
    const out = stripUndefined([{ id: "a", notes: undefined }, { id: "b", meta: { x: 1, y: undefined } }]);
    expect(out).toEqual([{ id: "a" }, { id: "b", meta: { x: 1 } }]);
  });
  it("descarta ELEMENTOS undefined de un arreglo (hueco de arreglo disperso)", () => {
    // RTDB rechaza un elemento undefined igual que una clave undefined.
    const disperso = [{ id: "a" }, undefined, { id: "b" }];
    expect(stripUndefined(disperso)).toEqual([{ id: "a" }, { id: "b" }]);
    expect(stripUndefined(disperso).some(x => x === undefined)).toBe(false);
  });
  it("deja intacto un peleador ya válido y no rompe primitivos", () => {
    const f = { id: "a", fullName: "Ana", notes: "Oficial" };
    expect(stripUndefined(f)).toEqual(f);
    expect(stripUndefined("x")).toBe("x");
    expect(stripUndefined(7)).toBe(7);
    expect(stripUndefined(null)).toBe(null);
  });
  it("una lista upsertada con notes vacío queda apta para RTDB", () => {
    // Exactamente lo que arma la transacción: applyUpsertFighter + saneado.
    const nuevo = { id: "c", fullName: "Carlos Aviles", weightKg: 77, notes: undefined };
    const listo = stripUndefined(applyUpsertFighter([A], nuevo));
    expect(JSON.stringify(listo)).toBe(JSON.stringify([A, { id: "c", fullName: "Carlos Aviles", weightKg: 77 }]));
    // Ni una sola clave con valor undefined en toda la estructura:
    const hayUndefined = o => o !== null && typeof o === "object"
      ? Object.values(o).some(v => v === undefined || hayUndefined(v))
      : false;
    expect(hayUndefined(listo)).toBe(false);
  });
});

// Fija el valor que la transacción manda a RTDB. Estos tests son la red que
// faltaba: antes el saneado vivía en línea dentro del callback de la
// transacción y se podía borrar sin que fallara ninguna prueba — justo el
// código cuya ausencia rompió el alta de peleadores con el campo Notas vacío.
describe("fighterNodeValue (lo que la transacción manda a RTDB)", () => {
  const sinNotas = { id: "c", fullName: "Carlos Aviles", weightKg: 77, notes: undefined };

  it("REGRESIÓN: sanea el undefined de un alta con Notas vacío", () => {
    const v = fighterNodeValue(applyUpsertFighter([A], sinNotas));
    expect("notes" in v[1]).toBe(false);
    expect(v).toEqual([A, { id: "c", fullName: "Carlos Aviles", weightKg: 77 }]);
  });

  it("REGRESIÓN: editar BORRANDO las notas deja el registro sin la nota vieja", () => {
    const conNotas = { id: "c", fullName: "Carlos Aviles", weightKg: 77, notes: "Oficial" };
    // El formulario omite la clave al guardar con Notas vacío; el upsert
    // reemplaza el registro entero, así que la nota no puede sobrevivir.
    const editado = { id: "c", fullName: "Carlos Aviles", weightKg: 77 };
    const v = fighterNodeValue(applyUpsertFighter([conNotas], editado));
    expect(v).toHaveLength(1);
    expect("notes" in v[0]).toBe(false);
  });

  it("ningún undefined sobrevive en toda la estructura", () => {
    const hay = o => o !== null && typeof o === "object"
      ? Object.values(o).some(x => x === undefined || hay(x))
      : false;
    expect(hay(fighterNodeValue(applyUpsertFighter([A], sinNotas)))).toBe(false);
  });

  it("lista vacía → centinela __EMPTY__ (el nodo no se borra)", () => {
    expect(fighterNodeValue([])).toBe("__EMPTY__");
    expect(fighterNodeValue(applyRemoveFighter([A], "a"))).toBe("__EMPTY__");
  });

  it("ORDEN: sanea ANTES de decidir si está vacío (un hueco no cuenta como peleador)", () => {
    // Si el centinela se evaluara antes del saneado, [undefined] se mandaría
    // como arreglo "no vacío" y RTDB lo rechazaría lanzando.
    expect(fighterNodeValue([undefined])).toBe("__EMPTY__");
  });

  it("una lista normal pasa intacta", () => {
    expect(fighterNodeValue([A, B])).toEqual([A, B]);
  });
});
