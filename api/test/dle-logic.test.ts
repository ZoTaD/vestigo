import { describe, expect, it } from "vitest";
import { compare, dayNumber, findByName, HINT_AT, hintsUnlocked, LAUNCH_DATE, MAX_GUESSES, pickAnswer, rankPlays, utcDate, weightFor } from "../src/dle/logic";
import type { Entry } from "../src/dle/types";

const hero = (id: number, name: string, cols: Entry["cols"]): Entry => ({
  id: `hero:${id}`,
  name,
  img: `/deadlock/game/images/heroes/${id}_card.webp`,
  cols,
  hints: [
    { kind: "img", src: "/deadlock/game/images/abilities/x.webp", blur: false },
    { kind: "text", text: "role" },
  ],
  link: `deadlock/heroes/${name.toLowerCase()}`,
});
const vindicta = hero(3, "Vindicta", { complexity: 1, health: 755, moveSpeed: 7.9, clip: 19, gunDps: 53.4, winRate: 51.7 });
const haze = hero(13, "Haze", { complexity: 1, health: 730, moveSpeed: 8.2, clip: 25, gunDps: 50.1, winRate: 51.2 });
const talon = hero(17, "Grey Talon", { complexity: 2, health: 780, moveSpeed: 6.3, clip: 17, gunDps: 39.2, winRate: 45.7 });
const cell = (cells: ReturnType<typeof compare>, key: string) => cells.find((c) => c.key === key)!;

describe("compare", () => {
  it("marca cerca, lejos y la dirección en los números", () => {
    const c = compare(haze, vindicta, "heroes");
    expect(cell(c, "complexity")).toMatchObject({ mark: "ok" });
    expect(cell(c, "health")).toMatchObject({ mark: "near", dir: "up", value: 730 });
    expect(cell(c, "moveSpeed")).toMatchObject({ mark: "near", dir: "down" });
    expect(cell(c, "clip")).toMatchObject({ mark: "no", dir: "down" });
    expect(cell(c, "gunDps")).toMatchObject({ mark: "near", dir: "up" });
    expect(cell(c, "winRate")).toMatchObject({ mark: "near", dir: "up" });
  });

  it("el límite de cerca es 10 % justo y el winrate va por puntos", () => {
    const c = compare(talon, vindicta, "heroes");
    expect(cell(c, "complexity")).toMatchObject({ mark: "no", dir: "down" });
    expect(cell(c, "moveSpeed")).toMatchObject({ mark: "no", dir: "up" });
    expect(cell(c, "clip")).toMatchObject({ mark: "no", dir: "up" });
    expect(cell(c, "winRate")).toMatchObject({ mark: "no", dir: "up" });
  });

  it("la respuesta contra sí misma es todo verde y sin flechas", () => {
    for (const x of compare(vindicta, vindicta, "heroes")) {
      expect(x.mark).toBe("ok");
      expect(x.dir).toBeUndefined();
    }
  });

  it("compara listas y valores que faltan", () => {
    const item = (gives: string[] | null): Entry => ({ ...vindicta, id: "item:1", cols: { slot: "Spirit", tier: 3, cost: 3200, kind: "Passive", upgradeOf: "Yes", gives } });
    const answer = item(["Health", "Melee damage", "Spirit damage"]);
    expect(cell(compare(item(["Health", "Melee damage", "Spirit damage"]), answer, "items"), "gives").mark).toBe("ok");
    expect(cell(compare(item(["Healing", "Spirit damage"]), answer, "items"), "gives").mark).toBe("near");
    expect(cell(compare(item(["Bullet damage"]), answer, "items"), "gives").mark).toBe("no");
    expect(cell(compare(item(null), item(null), "items"), "gives").mark).toBe("ok");
    expect(cell(compare(item(null), answer, "items"), "gives").mark).toBe("no");
  });
});

describe("findByName", () => {
  it("acepta mayúsculas y espacios de más, no medio nombre", () => {
    const list = [vindicta, haze, talon];
    expect(findByName(list, "  grey   talon ")?.id).toBe("hero:17");
    expect(findByName(list, "Grey Talo")).toBeNull();
  });
});

describe("el día", () => {
  it("cuenta desde el lanzamiento en UTC", () => {
    expect(utcDate(Date.UTC(2026, 10, 5, 23, 59, 59))).toBe("2026-11-05");
    expect(utcDate(Date.UTC(2026, 10, 6, 0, 0, 1))).toBe("2026-11-06");
    expect(dayNumber(LAUNCH_DATE)).toBe(1);
    const next = new Date(Date.parse(`${LAUNCH_DATE}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect(dayNumber(next)).toBe(2);
  });
});

describe("pesos", () => {
  it("bajan a casi nada al día siguiente y vuelven a 1 en la ventana", () => {
    expect(weightFor(null, 44)).toBe(1);
    expect(weightFor(1, 44)).toBeCloseTo(1 / 484, 6);
    expect(weightFor(7, 44)).toBeCloseTo(49 / 484, 6);
    expect(weightFor(22, 44)).toBe(1);
    expect(weightFor(40, 44)).toBe(1);
  });

  it("elige siempre lo mismo para el mismo día y casi nunca repite lo de ayer", async () => {
    const pool = Array.from({ length: 44 }, (_, i) => hero(i + 1, `H${i}`, {}));
    const a = await pickAnswer(pool, new Map(), "2026-11-05", "heroes", "secreto");
    expect((await pickAnswer(pool, new Map(), "2026-11-05", "heroes", "secreto")).id).toBe(a.id);
    let repeats = 0;
    for (let d = 0; d < 1000; d++) {
      const date = new Date(Date.UTC(2027, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const yesterday = new Date(Date.UTC(2027, 0, 1) + (d - 1) * 86_400_000).toISOString().slice(0, 10);
      const pick = await pickAnswer(pool, new Map([[a.id, yesterday]]), date, "heroes", "secreto");
      if (pick.id === a.id) repeats++;
    }
    expect(repeats).toBeLessThan(10);
  });

  it("no elige lo que salió hoy mismo si hay otra opción", async () => {
    const pool = [hero(1, "A", {}), hero(2, "B", {})];
    for (let d = 1; d <= 30; d++) {
      const date = `2027-01-${String(d).padStart(2, "0")}`;
      expect((await pickAnswer(pool, new Map([["hero:1", date]]), date, "heroes", "s")).id).toBe("hero:2");
    }
  });
});

describe("pistas", () => {
  it("son dos, sin retrato borroso, y se abren antes del último intento", () => {
    expect(hintsUnlocked(vindicta, 2, "heroes")).toEqual([]);
    expect(hintsUnlocked(vindicta, 3, "heroes")).toEqual([vindicta.hints[0]]);
    expect(hintsUnlocked(vindicta, 5, "heroes")).toEqual(vindicta.hints);
    expect(hintsUnlocked(vindicta, 3, "items")).toEqual([]);
    expect(hintsUnlocked(vindicta, 7, "abilities")).toEqual(vindicta.hints);
    expect(JSON.stringify(hintsUnlocked(vindicta, 99, "heroes"))).not.toContain(vindicta.img);
    for (const m of ["heroes", "items", "abilities"] as const) expect(HINT_AT[m][1]).toBeLessThan(MAX_GUESSES[m]);
    expect(MAX_GUESSES).toEqual({ heroes: 6, items: 9, abilities: 9 });
  });
});

describe("rankPlays", () => {
  it("ordena por intentos, tiempo y quién terminó antes", () => {
    const rows = [
      { steamId: "a", guesses: 3, ms: 9000, finishedAt: 5 },
      { steamId: "b", guesses: 2, ms: 99000, finishedAt: 9 },
      { steamId: "c", guesses: 3, ms: 9000, finishedAt: 1 },
      { steamId: "d", guesses: 3, ms: 4000, finishedAt: 7 },
    ];
    expect(rankPlays(rows).map((r) => r.steamId)).toEqual(["b", "d", "c", "a"]);
  });
});
