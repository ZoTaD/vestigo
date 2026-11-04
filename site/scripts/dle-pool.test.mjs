import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { buildPool } from "./dle-pool.mjs";

const data = fileURLToPath(new URL("../../games/deadlock/data", import.meta.url));
const manifest = fileURLToPath(new URL("../public/deadlock/game/manifest.json", import.meta.url));
const pool = buildPool(data, manifest);
const byId = (list, id) => list.find((e) => e.id === id);

describe("el pozo del Deadlockdle", () => {
  it("tiene los tres modos con sus conteos del 4/11", () => {
    expect(pool.heroes).toHaveLength(44);
    expect(pool.items).toHaveLength(156);
    expect(pool.abilities).toHaveLength(176);
  });

  it("no repite ids y todo el arte es local", () => {
    const all = [...pool.heroes, ...pool.items, ...pool.abilities];
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) expect(e.img).toMatch(/^\/deadlock\/game\//);
  });

  it("arma las columnas de un héroe", () => {
    const v = byId(pool.heroes, "hero:3");
    expect(v.name).toBe("Vindicta");
    expect(v.cols).toMatchObject({ complexity: 1, health: 755, moveSpeed: 7.9, clip: 19, gunDps: 53.4 });
    expect(typeof v.cols.winRate).toBe("number");
    expect(v.link).toBe("deadlock/heroes/vindicta");
    expect(v.hints[1]).toEqual({ kind: "text", text: "Snipes the unsuspecting" });
  });

  it("arma las columnas de un objeto", () => {
    const s = byId(pool.items, "item:3190916303");
    expect(s.cols).toMatchObject({ slot: "Spirit", tier: 3, cost: 3200, upgradeOf: "Yes" });
    expect(s.link).toBe("deadlock/items/spirit-snatch");
  });

  it("arma las columnas de una habilidad", () => {
    const a = byId(pool.abilities, "ability:775377419");
    expect(a.cols).toMatchObject({ hero: "Vindicta", slot: 4, ultimate: "Yes", cooldown: 55 });
    expect(a.cols.effects).toContain("Spirit damage");
    expect(pool.abilities.filter((e) => e.cols.cooldown === null)).toHaveLength(10);
  });
});
