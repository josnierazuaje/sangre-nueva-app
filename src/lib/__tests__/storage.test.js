import { describe, it, expect } from "vitest";
import { nodeToArray, applyUpsertFighter, applyRemoveFighter, buildTicketRestore, stripLocalGhosts } from "../storage.js";

const A = { id: "a", fullName: "Ana" };
const B = { id: "b", fullName: "Beto" };
const C = { id: "c", fullName: "Caro" };

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
