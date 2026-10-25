import { describe, expect, it } from "vitest";
import {
  DotNetRandom,
  createRandom,
  createRandomSeed,
  daySaveRandom,
  daysPlayed,
  hashInts,
  hashString,
  syncedRandom,
  xxh32,
} from "../src/stardew/predict/rng";
import fx from "./fixtures/stardew-predict/rng.json";

// Los valores esperados salen de games/stardew/tools/oracle (el juego real,
// 1.6.15): cada igualdad es exacta.

describe("DotNetRandom contra System.Random", () => {
  for (const c of fx.random) {
    it(`semilla ${c.seed}`, () => {
      let r = new DotNetRandom(c.seed);
      expect(c.next.map(() => r.next())).toEqual(c.next);
      r = new DotNetRandom(c.seed);
      // Los double van como texto "R": se comparan exactos, sin tolerancia.
      expect(c.doubles.map(() => r.nextDouble())).toEqual(c.doubles.map(Number));
      r = new DotNetRandom(c.seed);
      expect(c.nextMax.map((_, i) => r.next(i % 2 === 0 ? 6 : 1000000))).toEqual(c.nextMax);
      for (const g of c.ranges) {
        r = new DotNetRandom(c.seed);
        expect(g.values.map(() => r.next(g.min, g.max))).toEqual(g.values);
      }
    });
  }

  it("nextBool y choose", () => {
    const a = new DotNetRandom(7);
    const b = new DotNetRandom(7);
    expect(a.nextBool()).toBe(b.nextDouble() < 0.5);
    expect(a.nextBool(0.3)).toBe(b.nextDouble() < 0.3);
    // chance >= 1 es siempre verdadero y no consume (RandomExtensions.NextBool).
    expect(a.nextBool(1)).toBe(true);
    expect(a.nextDouble()).toBe(b.nextDouble());
    const c = new DotNetRandom(9);
    const d = new DotNetRandom(9);
    expect(c.choose("a", "b", "c")).toBe(["a", "b", "c"][d.next(3)]);
  });

  it("rechaza argumentos que .NET rechaza", () => {
    const r = new DotNetRandom(1);
    expect(() => r.next(-1)).toThrow();
    expect(() => r.next(5, 4)).toThrow();
  });
});

describe("hash del juego (xxHash32, semilla 0)", () => {
  for (const c of fx.hashStrings) {
    it(`texto ${JSON.stringify(c.text)}`, () => {
      expect(hashString(c.text)).toBe(c.hash);
    });
  }
  for (const c of fx.hashInts) {
    it(`enteros [${c.values.join(", ")}]`, () => {
      expect(hashInts(...c.values)).toBe(c.hash);
    });
  }
  it("xxh32 de bytes sueltos", () => {
    expect(xxh32(new TextEncoder().encode("location_weather"))).toBe(hashString("location_weather"));
  });
});

describe("Utility.CreateRandomSeed", () => {
  for (const c of fx.seeds) {
    it(`(${c.args.join(", ")})`, () => {
      const [a, b, c1, d, e] = c.args;
      expect(createRandomSeed(false, a, b, c1, d, e)).toBe(c.modern);
      expect(createRandomSeed(true, a, b, c1, d, e)).toBe(c.legacy);
    });
  }
});

const muestra = (r: DotNetRandom) => ({ next: r.next(), nextMax: r.next(100), nextDouble: r.nextDouble() });

describe("Utility.CreateDaySaveRandom", () => {
  for (const c of fx.daySave) {
    it(`partida ${c.gameId}, día ${c.daysPlayed}, legacy ${c.legacy}, extras ${c.a}/${c.b}/${c.c}`, () => {
      const r = daySaveRandom({ gameId: c.gameId, legacy: c.legacy }, c.daysPlayed, c.a, c.b, c.c);
      expect(muestra(r)).toEqual({ next: c.next, nextMax: c.nextMax, nextDouble: Number(c.nextDouble) });
    });
  }
});

describe("Utility.TryCreateIntervalRandom", () => {
  for (const c of fx.interval) {
    it(`${c.interval} "${c.key}" partida ${c.gameId}, ${c.season} año ${c.year}, legacy ${c.legacy}`, () => {
      const r = syncedRandom(
        { gameId: c.gameId, legacy: c.legacy },
        c.interval as "day" | "season" | "year",
        c.key,
        c.daysPlayed,
        c.season,
        c.year,
      );
      expect(muestra(r)).toEqual({ next: c.next, nextMax: c.nextMax, nextDouble: Number(c.nextDouble) });
    });
  }
});

describe("daysPlayed", () => {
  it("cuenta desde el día 1 del año 1", () => {
    expect(daysPlayed(0, 1, 1)).toBe(1);
    expect(daysPlayed(1, 1, 1)).toBe(29);
    expect(daysPlayed(3, 28, 1)).toBe(112);
    expect(daysPlayed(0, 1, 2)).toBe(113);
  });
  it("createRandom usa la misma semilla que createRandomSeed", () => {
    expect(createRandom(false, 1, 2, 3).next()).toBe(new DotNetRandom(createRandomSeed(false, 1, 2, 3)).next());
  });
});
