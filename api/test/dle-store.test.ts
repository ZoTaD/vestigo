import { describe, expect, it } from "vitest";
import { memStore } from "../src/dle/store";
import type { Entry } from "../src/dle/types";

const entry = (id: string): Entry => ({ id, name: id, img: "/x.webp", cols: {}, hints: [{ kind: "text", text: "a" }, { kind: "text", text: "b" }], link: "deadlock" });

describe("memStore", () => {
  it("guarda el día una sola vez", async () => {
    const s = memStore();
    const first = await s.saveDay({ date: "2026-11-05", mode: "heroes", answer: entry("hero:1") });
    const second = await s.saveDay({ date: "2026-11-05", mode: "heroes", answer: entry("hero:2") });
    expect(second.answer.id).toBe("hero:1");
    expect(first.answer.id).toBe("hero:1");
    expect((await s.day("2026-11-05", "heroes"))?.answer.id).toBe("hero:1");
    expect(await s.day("2026-11-05", "items")).toBeNull();
  });

  it("recuerda la última vez que salió cada respuesta", async () => {
    const s = memStore();
    await s.saveDay({ date: "2026-11-01", mode: "heroes", answer: entry("hero:1") });
    await s.saveDay({ date: "2026-11-03", mode: "heroes", answer: entry("hero:1") });
    await s.saveDay({ date: "2026-11-04", mode: "heroes", answer: entry("hero:2") });
    await s.saveDay({ date: "2026-11-04", mode: "items", answer: entry("item:9") });
    const seen = await s.lastSeen("heroes", "2026-11-04");
    expect(seen).toEqual(new Map([["hero:1", "2026-11-03"]]));
  });

  it("el primer intento abre la partida y uno repetido no cuenta", async () => {
    const s = memStore();
    expect(await s.addGuess("u1", "heroes", "2026-11-05", "hero:7", 1000, false)).toBe("ok");
    expect(await s.addGuess("u1", "heroes", "2026-11-05", "hero:7", 2000, false)).toBe("duplicate");
    expect(await s.addGuess("u1", "heroes", "2026-11-05", "hero:3", 9000, true)).toBe("ok");
    expect(await s.play("u1", "heroes", "2026-11-05")).toEqual({ startedAt: 1000, finishedAt: 9000, guesses: ["hero:7", "hero:3"] });
    expect(await s.addGuess("u1", "heroes", "2026-11-05", "hero:4", 9500, false)).toBe("duplicate");
  });

  it("ordena el ranking y sólo cuenta las resueltas", async () => {
    const s = memStore();
    await s.saveUser("a", "Ana", "");
    await s.saveUser("b", "Beto", "");
    await s.saveUser("c", "Caro", "");
    // a: 2 intentos en 8 s; b: 1 intento; c: sin resolver
    await s.addGuess("a", "items", "2026-11-05", "item:1", 0, false);
    await s.addGuess("a", "items", "2026-11-05", "item:2", 8000, true);
    await s.addGuess("b", "items", "2026-11-05", "item:2", 5000, true);
    await s.addGuess("c", "items", "2026-11-05", "item:1", 0, false);
    const top = await s.ranking("2026-11-05", "items", 10);
    expect(top.map((r) => [r.steamId, r.name, r.guesses, r.ms])).toEqual([
      ["b", "Beto", 1, 0],
      ["a", "Ana", 2, 8000],
    ]);
    expect(await s.playerCount("2026-11-05", "items")).toBe(3);
    expect(await s.myRank("a", "2026-11-05", "items")).toBe(2);
    expect(await s.myRank("c", "2026-11-05", "items")).toBeNull();
  });

  it("cuenta la racha de días seguidos resueltos", async () => {
    const s = memStore();
    for (const d of ["2026-11-02", "2026-11-03", "2026-11-04"]) await s.addGuess("u", "heroes", d, "hero:1", 0, true);
    await s.addGuess("u", "heroes", "2026-11-01", "hero:1", 0, false);
    expect(await s.myStats("u", "heroes", "2026-11-04")).toEqual({ streak: 3, played: 4, won: 3 });
    // Si hoy todavía no jugó, la racha sigue viva desde ayer.
    expect((await s.myStats("u", "heroes", "2026-11-05")).streak).toBe(3);
    expect((await s.myStats("u", "heroes", "2026-11-06")).streak).toBe(0);
  });
});
