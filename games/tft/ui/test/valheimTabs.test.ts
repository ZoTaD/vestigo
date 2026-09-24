import { describe, it, expect } from "vitest";
import { applyFilters, filterOptions, FILTERS, LIST_TABS, mainDamage, matchesQuery } from "../src/valheimTabs";
import type { AnyRow } from "../src/valheimData";

const row = (en: string, es: string, extra: object) => ({ name: { en, es }, ...extra }) as unknown as AnyRow;
const ROWS = [
  row("Bonemass", "Tuétano", { boss: true, biomes: ["swamp"], weak: ["blunt"] }),
  row("Troll", "Trol", { boss: false, biomes: ["blackforest"], weak: ["pierce"] }),
  row("Draugr", "Draugr", { boss: false, biomes: ["swamp", "mountain"], weak: ["fire"] }),
];
const DEFS = FILTERS.creatures;

describe("filtros de Valheim", () => {
  it("el buscador ignora tildes y busca en los dos idiomas", () => {
    expect(matchesQuery(ROWS[0], "tuetano")).toBe(true);
    expect(matchesQuery(ROWS[0], "bone")).toBe(true);
    expect(matchesQuery(ROWS[1], "tuetano")).toBe(false);
  });

  it("los filtros se combinan con Y", () => {
    expect(applyFilters(ROWS, DEFS, { biome: "swamp" }, "").map((r) => r.name.en)).toEqual(["Bonemass", "Draugr"]);
    expect(applyFilters(ROWS, DEFS, { biome: "swamp", type: "normal" }, "").map((r) => r.name.en)).toEqual(["Draugr"]);
  });

  it("cada opción cuenta con los demás filtros aplicados", () => {
    const biome = DEFS.find((d) => d.key === "biome")!;
    expect(filterOptions(ROWS, biome, DEFS, { type: "normal" }, "")).toEqual([["blackforest", 1], ["swamp", 1], ["mountain", 1]]);
  });

  it("cada pestaña tiene al menos dos filtros además del buscador", () => {
    for (const t of LIST_TABS) expect(FILTERS[t].length).toBeGreaterThanOrEqual(2);
  });

  it("el daño principal agrupa lo elemental", () => {
    expect(mainDamage({ slash: 30, chop: 10 })).toBe("slash");
    expect(mainDamage({ blunt: 10, fire: 20, frost: 15 })).toBe("elemental");
    expect(mainDamage(null)).toBeNull();
  });
});
