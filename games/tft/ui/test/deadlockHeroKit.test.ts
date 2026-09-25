import { describe, expect, it } from "vitest";
import {
  dailySplit,
  firstDir,
  localNumber,
  metricReads,
  sortRows,
  splitValue,
  standouts,
  valueOf,
  type HeroBaseStats,
  type HeroInsightsFile,
  type TableRow,
} from "../src/deadlockHeroKitData";
import { DEADLOCK_SECTIONS, parseRoute, routePath } from "../src/route";

const stats = (health: number, weapon?: Partial<NonNullable<HeroBaseStats["weapon"]>>): HeroBaseStats => ({
  health,
  healthRegen: 1,
  moveSpeed: 7,
  sprintSpeed: 1.6,
  stamina: 3,
  lightMelee: 50,
  heavyMelee: 116,
  perBoon: { bulletDamage: 0.5, health: 40, spiritPower: 1.1, meleeDamage: 1.5 },
  ...(weapon
    ? {
        weapon: {
          bulletDamage: 10,
          pellets: 1,
          fireRate: 4,
          dps: 40,
          sustainedDps: 30,
          clip: 20,
          reload: 2,
          magazineDamage: 200,
          ...weapon,
        },
      }
    : {}),
});

const rows: TableRow[] = [
  { heroId: 1, name: "Bebop", winRate: 0.48, stats: stats(880, { bulletDamage: 12 }) },
  { heroId: 2, name: "Abrams", winRate: 0.52, stats: stats(930, { bulletDamage: 3.6, pellets: 9 }) },
  { heroId: 3, name: "Celeste", winRate: 0.5, stats: stats(700) },
];

describe("la tabla de héroes", () => {
  it("ordena por cualquier columna, en los dos sentidos", () => {
    expect(sortRows(rows, "health", "desc").map((r) => r.name)).toEqual(["Abrams", "Bebop", "Celeste"]);
    expect(sortRows(rows, "health", "asc").map((r) => r.name)).toEqual(["Celeste", "Bebop", "Abrams"]);
    expect(sortRows(rows, "name", "asc").map((r) => r.name)).toEqual(["Abrams", "Bebop", "Celeste"]);
  });

  it("el daño por disparo multiplica los perdigones: una escopeta no queda última", () => {
    expect(valueOf(rows[1], "bulletDamage")).toBeCloseTo(32.4);
    expect(sortRows(rows, "bulletDamage", "desc")[0].name).toBe("Abrams");
  });

  it("quien no tiene el dato va al final en cualquier sentido", () => {
    expect(sortRows(rows, "dps", "desc").at(-1)!.name).toBe("Celeste");
    expect(sortRows(rows, "dps", "asc").at(-1)!.name).toBe("Celeste");
  });

  it("las cifras arrancan de mayor a menor; el nombre y la recarga, al revés", () => {
    expect(firstDir("health")).toBe("desc");
    expect(firstDir("name")).toBe("asc");
    expect(firstDir("reload")).toBe("asc");
  });
});

const insights: HeroInsightsFile = {
  generatedAt: "",
  band: "phantom-above",
  from: "2026-09-06",
  to: "2026-09-20",
  minPair: 100,
  heroes: {
    "1": { daily: [], perMatch: { assists: 17, kills: 4 }, vs: [], with: [] },
    "2": { daily: [], perMatch: { assists: 12, kills: 6 }, vs: [], with: [] },
    "3": { daily: [], perMatch: { assists: 14, kills: 8 }, vs: [], with: [] },
  },
};

describe("la página del héroe", () => {
  it("ubica cada promedio contra los otros héroes", () => {
    const reads = metricReads(insights, 1);
    expect(reads.find((r) => r.metric === "assists")).toMatchObject({ value: 17, below: 1 });
    expect(reads.find((r) => r.metric === "kills")).toMatchObject({ value: 4, below: 0, avg: 6 });
  });

  it("destaca lo que más se aleja del medio", () => {
    expect(standouts(metricReads(insights, 3), 1)[0].metric).toBe("kills");
  });

  it("promedia antes y después del parche por partidas, sin el día del parche", () => {
    const daily: [string, number, number][] = [
      ["2026-09-15", 100, 50],
      ["2026-09-16", 1000, 900],
      ["2026-09-17", 300, 180],
      ["2026-09-18", 100, 40],
    ];
    expect(dailySplit(daily, "2026-09-16T22:41:46Z")).toEqual({ before: 0.5, after: 0.55 });
  });

  it("separa la cifra de la unidad y pone la coma del idioma", () => {
    expect(splitValue("16m", "")).toEqual({ n: "16", u: "m" });
    expect(splitValue("30", "/s")).toEqual({ n: "30", u: "/s" });
    expect(localNumber("5.5", "es")).toBe("5,5");
    expect(localNumber("5.5", "en")).toBe("5.5");
  });
});

describe("la ruta de la pestaña", () => {
  it("existe al lado de la tier list y no choca con un héroe", () => {
    expect(DEADLOCK_SECTIONS.slice(0, 2)).toEqual(["meta", "heroes"]);
    expect(parseRoute("/es/deadlock/heroes")).toMatchObject({ dlSection: "heroes", detail: undefined });
    // La tier list abre la build; la pestaña Héroes, la ficha entera: dos páginas.
    expect(parseRoute("/es/deadlock/dynamo")).toMatchObject({ dlSection: "meta", detail: "dynamo" });
    expect(parseRoute("/es/deadlock/heroes/dynamo")).toMatchObject({ dlSection: "heroes", detail: "dynamo" });
    expect(routePath({ lang: "es", view: "deadlock", dlSection: "heroes", detail: "dynamo" })).toBe(
      "/es/deadlock/heroes/dynamo"
    );
    expect(routePath({ lang: "en", view: "deadlock", dlSection: "heroes" })).toBe("/en/deadlock/heroes");
  });
});
