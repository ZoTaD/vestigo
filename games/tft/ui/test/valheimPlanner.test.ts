import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addPick, decodePlan, EMPTY_PLAN, encodePlan, plan, sanitize, setPick, tree,
  type PlannerData, type PlanState,
} from "../src/valheimPlanner";

const T = (en: string) => ({ en, es: en });
const it0 = (en: string, weight = 1, extra: object = {}) => ({ name: T(en), icon: null, weight, tier: null, slug: en.toLowerCase(), tab: "materials", ...extra });
const st = (t: string) => ({ name: T(t), icon: null, slug: t, tab: "building" });

const D: PlannerData = {
  items: {
    HelmetIron: it0("Iron Helmet", 3, { cat: "armor", maxQ: 4 }),
    Sausages: it0("Sausages", 0.5, { cat: "foods" }),
    FishWraps: it0("Fish wraps", 1, { cat: "foods" }),
    Iron: it0("Iron", 12), IronScrap: it0("Scrap iron", 10, { tier: "swamp" }), IronOre: it0("Iron ore", 10),
    Coal: it0("Coal", 2), Wood: it0("Wood", 2, { tier: "meadows" }), DeerHide: it0("Deer hide", 1, { tier: "meadows" }),
    Entrails: it0("Entrails", 0.5, { tier: "swamp" }), RawMeat: it0("Boar meat", 1, { tier: "meadows" }), Thistle: it0("Thistle", 0.1, { tier: "blackforest" }),
    Fish1: it0("Perch", 2), Fish2: it0("Pike", 2),
  },
  recipes: {
    HelmetIron: { st: "piece_forge", lv: 1, n: 1, req: [["Iron", 20, 5], ["DeerHide", 2, 0]] },
    Sausages: { st: "piece_cauldron", lv: 2, n: 4, req: [["Entrails", 4, 1], ["RawMeat", 1, 1], ["Thistle", 1, 1]] },
    FishWraps: { st: "piece_cauldron", lv: 1, n: 1, req: [["Fish1", 1, 0], ["Fish2", 1, 0]], any: true },
  },
  convert: {
    Iron: [{ st: "piece_smelter", from: "IronOre", time: 30, n: 1, fuel: ["Coal", 2] }, { st: "piece_smelter", from: "IronScrap", time: 30, n: 1, fuel: ["Coal", 2] }],
    Coal: [{ st: "piece_charcoalkiln", from: "Wood", time: 15, n: 1 }],
  },
  sources: {
    IronScrap: [{ how: "mine", biomes: ["swamp"], name: T("Muddy scrap pile") }],
    IronOre: [{ how: "location", biomes: [], name: null }],
    Coal: [{ how: "drop", biomes: [], name: T("Surtling"), min: 4, max: 5 }],
  },
  stations: { piece_forge: st("forge"), piece_cauldron: st("cauldron"), piece_smelter: st("smelter"), piece_charcoalkiln: st("kiln") },
  prefer: { Iron: "from:IronScrap" },
};
const S = (picks: PlanState["picks"], extra: Partial<PlanState> = {}): PlanState => ({ ...EMPTY_PLAN, picks, ...extra });
const qty = (rows: { id: string; qty: number }[], id: string) => rows.find((r) => r.id === id)?.qty;

describe("el Planificador de Valheim", () => {
  it("cada nivel cuesta más, como en el juego, y pide la estación más alta", () => {
    const p = plan(D, S([{ id: "HelmetIron", qty: 1, level: 3 }]));
    expect(qty(p.table, "Iron")).toBe(20 + 5 * 1 + 5 * 2);
    expect(qty(p.table, "DeerHide")).toBe(2);
    expect(p.stations).toContainEqual(["piece_forge", 3]);
  });

  it("baja hasta lo crudo con el combustible, el peso y los minutos de fundición", () => {
    const p = plan(D, S([{ id: "HelmetIron", qty: 3, level: 2 }]));
    expect(qty(p.table, "Iron")).toBe(75);
    expect(qty(p.raw, "IronScrap")).toBe(75);
    expect(qty(p.raw, "Wood")).toBe(150);
    expect(qty(p.raw, "DeerHide")).toBe(6);
    expect(qty(p.raw, "Coal")).toBeUndefined();
    expect(p.weight).toBe(75 * 10 + 150 * 2 + 6);
    expect(p.trips).toBe(4);
    expect(p.fuelMinutes).toBe(38);
    expect(p.biomes).toEqual(["meadows", "swamp"]);
  });

  it("redondea las tandas para arriba y avisa lo que sobra", () => {
    const p = plan(D, S([{ id: "Sausages", qty: 10, level: 1 }]));
    expect(qty(p.table, "Entrails")).toBe(12);
    expect(qty(p.table, "RawMeat")).toBe(3);
    expect(p.leftovers).toEqual([{ id: "Sausages", asked: 10, made: 12 }]);
    expect(p.stations).toContainEqual(["piece_cauldron", 2]);
  });

  it("respeta el camino elegido e ignora uno que no existe", () => {
    expect(qty(plan(D, S([{ id: "HelmetIron", qty: 1, level: 1 }], { via: { Iron: "from:IronOre" } })).raw, "IronOre")).toBe(20);
    expect(qty(plan(D, S([{ id: "HelmetIron", qty: 1, level: 1 }], { via: { Iron: "from:Gold" } })).raw, "IronScrap")).toBe(20);
    const coalRaw = plan(D, S([{ id: "HelmetIron", qty: 1, level: 1 }], { via: { Coal: "raw" } }));
    expect(qty(coalRaw.raw, "Coal")).toBe(40);
    expect(qty(coalRaw.raw, "Wood")).toBeUndefined();
  });

  it("en las recetas de uno cualquiera usa el primero o el elegido", () => {
    expect(qty(plan(D, S([{ id: "FishWraps", qty: 2, level: 1 }])).table, "Fish1")).toBe(2);
    const p = plan(D, S([{ id: "FishWraps", qty: 2, level: 1 }], { any: { FishWraps: "Fish2" } }));
    expect(qty(p.table, "Fish2")).toBe(2);
    expect(qty(p.table, "Fish1")).toBeUndefined();
  });

  it("arma el árbol de un material", () => {
    const t = tree(D, EMPTY_PLAN, "Iron", 105);
    expect(t.st).toBe("piece_smelter");
    expect(t.kids.map((k) => [k.id, k.qty])).toEqual([["IronScrap", 105], ["Coal", 210]]);
    expect(t.kids[1].kids.map((k) => [k.id, k.qty])).toEqual([["Wood", 210]]);
  });

  it("corta un ciclo sin colgarse", () => {
    const C: PlannerData = { ...D, items: { ...D.items, A: it0("A", 1, { cat: "materials" }), B: it0("B") },
      convert: { A: [{ st: "x", from: "B", time: 1, n: 1 }], B: [{ st: "x", from: "A", time: 1, n: 1 }] } };
    const p = plan(C, S([{ id: "A", qty: 1, level: 1 }]));
    expect(p.raw.length).toBeGreaterThan(0);
    expect(tree(C, EMPTY_PLAN, "A", 1).kids[0].kids[0].kids).toEqual([]);
  });

  it("guarda la lista en la dirección y la vuelve a leer", () => {
    const s = S([{ id: "HelmetIron", qty: 1, level: 2 }, { id: "Sausages", qty: 10, level: 1 }, { id: "piece:forge", qty: 1, level: 1 }],
      { via: { Iron: "from:IronOre" }, any: { FishWraps: "Fish2" } });
    const q = encodePlan(s);
    expect(q).toBe("l=HelmetIron.2,Sausages*10,piece:forge&via=Iron~from:IronOre&any=FishWraps~Fish2");
    expect(decodePlan(`?${q}`)).toEqual(s);
    expect(decodePlan("")).toEqual(EMPTY_PLAN);
  });

  it("limpia lo que no está en el catálogo y acota nivel y cantidad", () => {
    const s = sanitize(D, S([{ id: "HelmetIron", qty: 5000, level: 9 }, { id: "Iron", qty: 1, level: 1 }, { id: "Nope", qty: 1, level: 1 }]));
    expect(s.picks).toEqual([{ id: "HelmetIron", qty: 999, level: 4 }]);
  });

  it("agregar suma uno y cantidad cero lo saca", () => {
    const a = addPick(addPick(EMPTY_PLAN, "Sausages"), "Sausages");
    expect(a.picks).toEqual([{ id: "Sausages", qty: 2, level: 1 }]);
    expect(setPick(a, 0, { qty: 0 }).picks).toEqual([]);
    expect(setPick(a, 0, { level: 3 }).picks[0].level).toBe(3);
  });
});

describe("con los datos del juego", () => {
  const real = JSON.parse(readFileSync(new URL("../../../valheim/data/site/planner.json", import.meta.url), "utf-8")) as PlannerData;

  it("la armadura de hierro a nivel 2, Krom y 10 salchichas dan lo de la maqueta", () => {
    const p = plan(real, decodePlan("?l=HelmetIron.2,ArmorIronChest.2,ArmorIronLegs.2,THSwordKrom,Sausages*10"));
    expect(Object.fromEntries(p.table.map((n) => [n.id, n.qty]))).toEqual({
      Iron: 105, DeerHide: 6, Bronze: 20, ScaleHide: 5, Entrails: 12, RawMeat: 3, Thistle: 3,
    });
    expect(qty(p.raw, "IronScrap")).toBe(105);
    expect(qty(p.raw, "CopperOre")).toBe(40);
    expect(qty(p.raw, "TinOre")).toBe(20);
    expect(qty(p.raw, "Wood")).toBe(330);
    expect(p.stations).toContainEqual(["piece_forge", 3]);
    expect(JSON.stringify(p)).not.toContain("Upgrader");
  });

  it("lo nord del Norte profundo se termina en la fundición helada", () => {
    const p = plan(real, decodePlan("?l=SwordGold"));
    expect(p.stations.map(([s]) => s)).toEqual(expect.arrayContaining(["piece_blackforge", "piece_frostfoundry"]));
  });
});
