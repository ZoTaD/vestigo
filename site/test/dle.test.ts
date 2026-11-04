import { afterEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../src/dle/api";
import { loadLocal, saveLocal } from "../src/dle/local";
import { shareText } from "../src/dle/share";

const row = (marks: ("ok" | "near" | "no")[]): Row => ({
  guess: { id: "hero:1", name: "Haze", img: "/x.webp" },
  cells: marks.map((mark, i) => ({ key: `k${i}`, value: 1, mark })),
});

describe("shareText", () => {
  it("una línea por intento, del primero al último, sin nombres", () => {
    const rows = [row(["ok", "ok", "ok"]), row(["near", "no", "ok"]), row(["no", "no", "near"])];
    expect(shareText({ number: 12, mode: "heroes", rows, max: 6, solved: true })).toBe(
      "Deadlockdle #12 · Heroes · 3/6\n🟥🟥🟨\n🟨🟥🟩\n🟩🟩🟩\nvestigo.gg/deadlock/dle",
    );
    expect(shareText({ number: 1, mode: "items", rows: [row(["ok"])], max: 9, solved: true })).toBe("Deadlockdle #1 · Items · 1/9\n🟩\nvestigo.gg/deadlock/dle");
    // Si se acabaron los intentos, como Wordle: X.
    expect(shareText({ number: 2, mode: "heroes", rows, max: 6, solved: false }).split("\n")[0]).toBe("Deadlockdle #2 · Heroes · X/6");
    expect(shareText({ number: 1, mode: "items", rows, max: 9, solved: true })).not.toContain("Haze");
  });
});

describe("la partida sin cuenta", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("guarda y lee por modo y día", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    saveLocal("heroes", { date: "2026-11-05", rows: [row(["no"])], hints: [], solved: false });
    expect(loadLocal("heroes", "2026-11-05")?.rows).toHaveLength(1);
    expect(loadLocal("items", "2026-11-05")).toBeNull();
    expect(loadLocal("heroes", "2026-11-06")).toBeNull();
  });

  it("sin localStorage no rompe", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(() => saveLocal("heroes", { date: "2026-11-05", rows: [], hints: [], solved: false })).not.toThrow();
    expect(loadLocal("heroes", "2026-11-05")).toBeNull();
  });
});
