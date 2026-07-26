import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isChunkLoadError, shouldAutoReload } from "../../components/ErrorBoundary.jsx";

describe("isChunkLoadError (detecta el desajuste de versión de la PWA)", () => {
  it("Chrome: 'Failed to fetch dynamically imported module'", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/TicketsManager-abc.js"))).toBe(true);
  });
  it("Firefox: 'error loading dynamically imported module'", () => {
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true);
  });
  it("Safari: 'Importing a module script failed'", () => {
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
  });
  it("por nombre ChunkLoadError", () => {
    const e = new Error("cualquier cosa"); e.name = "ChunkLoadError";
    expect(isChunkLoadError(e)).toBe(true);
  });
  it("patrón 'Loading chunk … failed'", () => {
    expect(isChunkLoadError(new Error("Loading chunk vendor-123 failed"))).toBe(true);
  });
  it("un error normal de la app NO es chunk error", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });
  it("null/undefined → false", () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("shouldAutoReload (freno anti-bucle)", () => {
  let store;
  beforeEach(() => {
    store = {};
    globalThis.sessionStorage = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    };
  });
  afterEach(() => { delete globalThis.sessionStorage; });

  it("primera vez: recarga", () => {
    expect(shouldAutoReload(1000)).toBe(true);
  });
  it("no recarga dos veces en menos de 15 s", () => {
    expect(shouldAutoReload(1000)).toBe(true);
    expect(shouldAutoReload(5000)).toBe(false); // 4 s después
  });
  it("sí recarga de nuevo pasados 15 s", () => {
    expect(shouldAutoReload(1000)).toBe(true);
    expect(shouldAutoReload(20000)).toBe(true); // 19 s después
  });
  it("tope duro de 3 recargas por pestaña", () => {
    expect(shouldAutoReload(1000)).toBe(true);
    expect(shouldAutoReload(20000)).toBe(true);
    expect(shouldAutoReload(40000)).toBe(true);
    expect(shouldAutoReload(60000)).toBe(false); // 4ª: frenada
  });
  it("sin sessionStorage NO recarga (prudente, no arriesga bucle)", () => {
    delete globalThis.sessionStorage;
    expect(shouldAutoReload(1000)).toBe(false);
  });
});
