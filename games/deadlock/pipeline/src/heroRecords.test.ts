import { describe, expect, it } from "vitest";
import { retryDelay, seasonsToBuild, uniqueIds, type RecordsFile } from "./heroRecords";

describe("retryDelay", () => {
  it("el 429 duplica la espera desde 30 s y corta a los 12 intentos", () => {
    expect(retryDelay(429, 0, null)).toBe(30_000);
    expect(retryDelay(429, 2, null)).toBe(120_000);
    expect(retryDelay(429, 6, null)).toBe(300_000);
    expect(retryDelay(429, 11, "4")).toBe(5_000);
    expect(retryDelay(429, 12, null)).toBeNull();
  });

  it("el 503/504 de la cola respeta su Retry-After", () => {
    expect(retryDelay(503, 0, "40")).toBe(41_000);
    expect(retryDelay(504, 1, "")).toBe(30_000);
  });

  it("el 429 respeta Retry-After", () => {
    expect(retryDelay(429, 0, "12")).toBe(13_000);
    expect(retryDelay(429, 0, "9999")).toBe(300_000);
    expect(retryDelay(429, 0, "Wed, 21 Oct 2026 07:28:00 GMT")).toBe(30_000);
  });

  it("los 5xx y los cortes de red reintentan menos; los 4xx no", () => {
    expect(retryDelay(504, 0, null)).toBe(15_000);
    expect(retryDelay(0, 1, null)).toBe(30_000);
    expect(retryDelay(503, 5, null)).toBeNull();
    expect(retryDelay(400, 0, null)).toBeNull();
    expect(retryDelay(404, 0, null)).toBeNull();
  });
});

const S1 = { id: 1, start: 0, end: 100 * 86400 };
const S2 = { id: 2, start: 100 * 86400, end: 200 * 86400 };

describe("seasonsToBuild", () => {
  it("baja la vigente y no la que todavía no tiene un día", () => {
    const r = seasonsToBuild([S1, S2], null, 100 * 86400 + 3600);
    expect(r.map((x) => x.season.id)).toEqual([1]);
    expect(r[0].final).toBe(false);
  });

  it("congela la cerrada después de dos días", () => {
    const r = seasonsToBuild([S1, S2], null, 103 * 86400);
    expect(r).toEqual([
      { season: S1, final: true },
      { season: S2, final: false },
    ]);
  });

  it("no vuelve a pedir una temporada congelada", () => {
    const prev: RecordsFile = {
      generatedAt: "",
      metrics: [],
      seasons: { "1": { final: true, heroes: {}, world: {} } },
    };
    expect(seasonsToBuild([S1, S2], prev, 150 * 86400).map((x) => x.season.id)).toEqual([2]);
  });
});

it("uniqueIds conserva el orden y saca repetidos", () => {
  expect(uniqueIds([{ account_id: 3 }, { account_id: 1 }, { account_id: 3 }])).toEqual([3, 1]);
});

describe("countAtLeast", () => {
  const lista = [90, 70, 70, 50, 30, 10, 10, 5];
  const at = async (i: number) => (i < lista.length ? { rank: i + 1, value: lista[i], matches: 1 } : null);
  it("cuenta los que llegan al umbral", async () => {
    const { countAtLeast } = await import("./heroRecords");
    expect(await countAtLeast(at, 50)).toBe(4);
    expect(await countAtLeast(at, 1)).toBe(8);
    expect(await countAtLeast(at, 100)).toBe(0);
    expect(await countAtLeast(at, 90)).toBe(1);
  });
});
