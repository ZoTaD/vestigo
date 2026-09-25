import { describe, expect, it } from "vitest";
import { onStaleChunk } from "../src/staleChunks";

/** Un sessionStorage de mentira: alcanza con getItem y setItem. */
function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("una pestaña vieja después de publicar (2026-09-25)", () => {
  it("recarga la página la primera vez que falla un pedazo de código", () => {
    const s = memory();
    let reloads = 0;
    expect(onStaleChunk(1_000_000, s, () => reloads++)).toBe(true);
    expect(reloads).toBe(1);
  });

  it("no entra en un bucle si recién recargó", () => {
    const s = memory();
    let reloads = 0;
    onStaleChunk(1_000_000, s, () => reloads++);
    expect(onStaleChunk(1_005_000, s, () => reloads++)).toBe(false);
    expect(reloads).toBe(1);
  });

  it("vuelve a recargar si pasó un rato (otra publicación)", () => {
    const s = memory();
    let reloads = 0;
    onStaleChunk(1_000_000, s, () => reloads++);
    expect(onStaleChunk(1_000_000 + 60_000, s, () => reloads++)).toBe(true);
    expect(reloads).toBe(2);
  });

  it("sin almacenamiento igual recarga", () => {
    const broken = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    let reloads = 0;
    expect(onStaleChunk(1_000_000, broken, () => reloads++)).toBe(true);
    expect(reloads).toBe(1);
  });
});
