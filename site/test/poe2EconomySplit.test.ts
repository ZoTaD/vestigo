import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splitEconomy } from "../../games/poe2/pipeline/economy-split.mjs";

/**
 * La economía de cada liga viaja en dos archivos (2026-09-25): la moneda en
 * `<liga>.json` y las filas de los únicos en `<liga>.uniques.json`, que el sitio
 * pide recién cuando hacen falta. Si una liga vuelve a quedar entera (un
 * economy.mjs viejo), la página bajaría los ~950 KB de nuevo: esto lo agarra.
 */
const DIR = join(__dirname, "..", "..", "games", "poe2", "data", "economy");

describe("la economía de PoE2 en dos archivos", () => {
  const leagues = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "leagues.json" && !f.endsWith(".uniques.json"));

  it("hay ligas para revisar", () => {
    expect(leagues.length).toBeGreaterThan(0);
  });

  it.each(leagues)("%s trae sólo las pestañas de únicos, y sus filas están en el otro archivo", (f) => {
    const main = JSON.parse(readFileSync(join(DIR, f), "utf-8"));
    const extra = JSON.parse(readFileSync(join(DIR, f.replace(/\.json$/, ".uniques.json")), "utf-8"));
    for (const head of main.uniques) {
      expect(head).not.toHaveProperty("rows");
      const tab = extra.tabs.find((t: { id: string }) => t.id === head.id);
      expect(tab?.rows.length).toBe(head.count);
    }
  });

  it("splitEconomy separa las filas y deja la cantidad", () => {
    const full = {
      league: "L",
      updated: "2026-09-25",
      exchange: [{ id: "Currency", label: { en: "Currency", es: "Monedas" }, rows: [{ id: "divine" }] }],
      uniques: [{ id: "UniqueWeapons", label: { en: "Weapons", es: "Armas" }, rows: [{ id: "a" }, { id: "b" }] }],
    };
    const { main, uniques } = splitEconomy(full);
    expect(main.exchange).toEqual(full.exchange);
    expect(main.uniques).toEqual([{ id: "UniqueWeapons", label: { en: "Weapons", es: "Armas" }, count: 2 }]);
    expect(uniques).toEqual({ league: "L", updated: "2026-09-25", tabs: [{ id: "UniqueWeapons", rows: [{ id: "a" }, { id: "b" }] }] });
  });
});
