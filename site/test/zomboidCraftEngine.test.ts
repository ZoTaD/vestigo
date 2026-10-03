import { describe, expect, it } from "vitest";
import craftJson from "../../games/zomboid/data/craft.json";
import type { CraftData } from "../src/zomboid/crafting/data";
import { context, plan, tree, totals, asItems, viaOf } from "../src/zomboid/crafting/engine";
import { decodeState, EMPTY, sanitize, type CraftState } from "../src/zomboid/crafting/state";

const sinBotin = (d: CraftData): CraftData => ({
  ...d, loot: false,
  items: Object.fromEntries(Object.entries(d.items).map(([k, { f: _f, w: _w, ...v }]) => [k, v])),
});
const D = sinBotin(craftJson as unknown as CraftData);
const st = (p: Partial<CraftState>): CraftState => ({ ...EMPTY, ...p });
const tot = (s: CraftState) => totals(D, s, context(D, s));
const raw = (s: CraftState) => Object.fromEntries(tot(s).raw.map((r) => [r.id, asItems(D, r.id, r.units)]));

describe("tablas", () => {
  it("10 tablas: aserrar troncos (3 por tanda) → 4 tandas, 4 troncos, una sierra, sobran 2", () => {
    // saw-log cuesta 1/3 + 0,01 por tabla; saw-large-branch y carve-plank, 1 + 0,01. 10/3 → 4 tandas.
    const t = tot(st({ q: [{ id: "plank", qty: 10 }] }));
    expect(t.steps).toEqual([{ id: "plank", recipe: "saw-log", crafts: 4 }]);
    expect(t.raw).toEqual([{ id: "log", units: 4, why: "undo" }]); // los troncos sólo salen de desarmar pilas
    // Una herramienta: la primera de las sierras que no se fabrica (sin botín no hay `f`); cuál es depende de `makes`.
    expect(t.tools).toHaveLength(1);
    expect(t.tools[0].opts).toEqual(["hacksaw", "simple-wood-saw", "wood-saw"]);
    expect(t.tools[0].opts).toContain(t.tools[0].pick);
    expect(t.left).toEqual([{ id: "plank", units: 2 }]);
    expect(t.xp).toEqual([["carpentry", 20]]); // 5 XP × 4 tandas
    expect(t.skills).toEqual([]);
    expect(t.learn).toEqual([]);
  });
  it("cambiando la receta a aserrar rama grande: 10 tandas de 1", () => {
    expect(raw(st({ q: [{ id: "plank", qty: 10 }], r: { plank: "saw-large-branch" } }))).toEqual({ "large-branch": 10 });
  });
  it("con 4 tablas y 1 tronco en la mochila: faltan 6 → 2 tandas → 2 troncos, tenés 1 → juntás 1", () => {
    expect(raw(st({ q: [{ id: "plank", qty: 10 }], have: { plank: 4, log: 1 } }))).toEqual({ log: 1 });
  });
});

describe("estante grande de secado (construcción)", () => {
  const s = st({ q: [{ id: "c:large-plant-drying-rack", qty: 1 }] });
  it("lo que hay que juntar", () => {
    // 6 palos largos: tallar palo largo (1 retoño, cuesta 1 + 0,01). Sacarlo de una escoba y desarmar una lanza
    //   deshacen otra receta (x: "undo"); si alguna no quedara marcada, empata en costo y pierde por slug.
    // 8 usos de cordel = 2 cordeles (5 usos cada uno): 2 tandas de elaborar cordel, cada una 1 acónito (cuesta 1;
    //   el cáñamo espadillado cuesta 1 + 0,01 o más, el hilo de tendón 25/10 = 2,5).
    // 2 clavos: sus 4 recetas o se aprenden (forjar) o son de abrir cajas (pack): se consiguen.
    expect(raw(s)).toEqual({ sapling: 6, "hemp-dogbane": 2, nails: 2 });
    expect(tot(s).raw.find((r) => r.id === "nails")?.why).toBe("learn");
  });
  it("pasos, sobrantes, herramientas y habilidad", () => {
    const t = tot(s);
    expect(t.steps.map((x) => [x.id, x.recipe, x.crafts])).toEqual([
      ["long-stick", "carve-long-stick", 6],
      ["twine", "craft-twine", 2],
      ["c:large-plant-drying-rack", "large-plant-drying-rack", 1],
    ]); // de lo primero que se hace a lo último (entre hermanos, el orden de las líneas de la receta)
    expect(t.left).toEqual([{ id: "twine", units: 2 }]); // 10 usos hechos − 8 pedidos
    expect(t.tools).toHaveLength(5); // martillo, sierra, cuchillo (tallar), cuchillo o tijera (cordel), palito (cordel)
    expect(t.skills).toEqual([["carpentry", 1]]);
    expect(t.xp).toEqual([["carpentry", 10], ["carving", 30]]); // 10 de construir + 5 × 6 de tallar
  });
  it("con el herrero, los clavos se forjan: 1 tanda de 10, sobran 8, en la forja primitiva o mejor", () => {
    const t = tot({ ...s, b: "blacksmith" });
    const step = t.steps.find((x) => x.id === "nails");
    expect(step?.crafts).toBe(1);
    expect(t.left).toContainEqual({ id: "nails", units: 8 });
    expect(t.stations).toContain("PrimitiveForge");
    expect(t.skills).toContainEqual(["blacksmithing", 1]);
  });
  it("si te lo encontrás, el cordel no se fabrica", () => {
    const d2 = { ...D, items: { ...D.items, twine: { ...D.items.twine, f: 1 as const } } };
    const t = totals(d2, s, context(d2, s));
    expect(t.raw).toContainEqual({ id: "twine", units: 8, why: "found" });
    expect(asItems(d2, "twine", 8)).toBe(2);
  });
});

describe("resultado según el ingrediente", () => {
  it("3 de cáñamo espadillado sólo aceptan cáñamo seco, nunca lino", () => {
    const tr = tree(D, st({ q: [{ id: "hemp-scutched", qty: 3 }] }), context(D, EMPTY), "hemp-scutched", 3);
    expect(tr.recipe).toBe("scutch-fibre");
    expect(tr.lines[0].opts).toEqual(["hemp-dried"]);
    expect(tr.lines[0].qty).toBe(3);
  });
});

describe("líquidos", () => {
  it("2 mantecas: 2 tandas, 10 L de leche, en la mantequera", () => {
    const t = tot(st({ q: [{ id: "butter", qty: 2 }] }));
    expect(t.fluids).toEqual([{ name: { en: "Cow's Milk / Sheep's Milk", es: "Leche de vaca / Leche de oveja" }, liters: 10 }]);
    expect(t.stations).toEqual(["ChurnBucket"]);
    expect(t.raw).toEqual([]); // el recipiente `[*]` no se junta: es el de la leche
  });
});

describe("ciclos", () => {
  it("cuerda por desatar un cinturón: el cinturón se consigue (atarlo es deshacer)", () => {
    expect(tot(st({ q: [{ id: "rope", qty: 1 }], r: { rope: "untie-rope-belt" } })).raw).toEqual([{ id: "rope-belt", units: 1, why: "undo" }]);
  });
  it("…y si lo querés fabricar, el árbol corta la vuelta a la cuerda", () => {
    const s = st({ q: [{ id: "rope", qty: 1 }], r: { rope: "untie-rope-belt" }, make: ["rope-belt"] });
    const tr = tree(D, s, context(D, s), "rope", 1);
    const belt = tr.lines[0].child!;
    expect(belt.recipe).toBe("tie-rope-belt");
    expect(belt.lines[0].child).toMatchObject({ id: "rope", why: "cycle" });
    expect(tot(s).raw).toEqual([{ id: "rope", units: 1, why: "cycle" }]);
  });
});

describe("lo pedido siempre se fabrica, aunque haya que aprender", () => {
  it("bragueta de metal: libro, nivel e investigar; herrería 4 y sastrería 3; forja", () => {
    const t = tot(st({ q: [{ id: "metal-codpiece", qty: 1 }] }));
    expect(t.steps.at(-1)).toMatchObject({ id: "metal-codpiece", recipe: "forge-codpiece", crafts: 1 });
    expect(t.learn).toEqual(["forge-codpiece"]);
    expect(t.skills).toEqual(expect.arrayContaining([["blacksmithing", 4], ["tailoring", 3]]));
    expect(t.stations).toContain("Forge");
    expect(t.tools.length).toBeGreaterThanOrEqual(7);
  });
});

it("plan junta un árbol por objetivo y los totales", () => {
  const s = st({ q: [{ id: "plank", qty: 10 }, { id: "c:large-plant-drying-rack", qty: 1 }] });
  const p = plan(D, s);
  expect(p.trees.map((t) => t.id)).toEqual(["plank", "c:large-plant-drying-rack"]);
  expect(p.totals.steps.at(-1)?.id).toBe("c:large-plant-drying-rack");
});

describe("lo que sólo sale de abrir, deshacer o recargar (todas sus recetas con x) y no se encuentra", () => {
  // ~156 objetos: semillas sueltas, sobres vacíos, carpas, cuarto de varilla de acero… Como paso intermedio se consiguen
  // (no hay camino "normal"); pedidos, se fabrican con la más barata de todas.
  const ctx = context(D, EMPTY);
  it("en el medio de un árbol son una hoja", () => {
    expect(viaOf(D, EMPTY, ctx, "carrot-seeds", false)).toEqual({ why: "undo" });
    expect(viaOf(D, EMPTY, ctx, "steel-rod-quarter", false)).toEqual({ why: "undo" });
  });
  it("pedidos, se fabrican igual", () => {
    const s = st({ q: [{ id: "steel-rod-quarter", qty: 2 }] });
    const t = tot(s);
    // saw-bar-half: 1 media varilla → 2 cuartos (la única receta, con x: "undo"). La media varilla sí tiene una receta
    // normal (forjarla de una barra), así que el plan sigue para abajo.
    expect(t.steps.at(-1)).toEqual({ id: "steel-rod-quarter", recipe: "saw-bar-half", crafts: 1 });
    expect(t.steps.map((x) => x.id)).toContain("steel-rod-half");
    expect(tree(D, s, ctx, "carrot-seeds", 1).recipe).toBeTruthy();
  });
  it("con 'lo fabrico' en el medio, también", () => {
    const s = st({ make: ["carrot-seeds"] });
    expect("recipe" in viaOf(D, s, ctx, "carrot-seeds", false)).toBe(true);
  });
});

describe("todo lo que se fabrica tiene un plan", () => {
  // Cada objeto con receta y cada construcción, pedidos solos: ni se cuelga ni queda sin receta, con y sin botín y con
  // un personaje que sabe cosas (el herrero).
  const real = craftJson as unknown as CraftData;
  for (const [name, d, b] of [["sin botín", D, null], ["con botín", real, null], ["herrero", real, "blacksmith"]] as const) {
    it(name, () => {
      const ids = [...Object.keys(d.makes), ...Object.keys(d.recipes).filter((r) => d.recipes[r].kind === "build").map((r) => "c:" + r)];
      expect(ids.length).toBeGreaterThan(1700); // 1584 objetos + 201 construcciones
      const bad: string[] = [];
      for (const id of ids) {
        const p = plan(d, st({ q: [{ id, qty: 3 }], b }));
        if (!p.trees[0].recipe || p.totals.steps.at(-1)?.id !== id) bad.push(id);
      }
      expect(bad).toEqual([]);
    });
  }
});

describe("ciclos de mentira, para que nunca se cuelgue", () => {
  // a se hace con b, b con a, y nada se encuentra: el punto fijo no baja de infinito y los dos quedan como hoja; el
  // árbol corta la vuelta y los totales mandan la demanda que vuelve a "para juntar".
  const L = { en: "", es: "" };
  const item = { ...L, icon: null, c: "" };
  const rec = (inp: string, out: string) => ({ ...L, kind: "craft" as const, cat: "", icon: null, in: [{ n: 2, o: [inp] }], out: [{ n: 1, i: out }] });
  const d: CraftData = {
    v: "", loot: false, cats: {}, items: { a: item, b: item }, recipes: { "a-from-b": rec("b", "a"), "b-from-a": rec("a", "b") },
    makes: { a: ["a-from-b"], b: ["b-from-a"] }, stations: {}, skills: {}, traits: {}, profs: {},
    counts: { craftable: 2, builds: 0, multi: 0, recipes: 2 },
  };
  it("costos, árbol y totales terminan", () => {
    const s = st({ q: [{ id: "a", qty: 1 }], make: ["b"] });
    const ctx = context(d, s);
    expect(ctx.c.get("a")).toBe(1);
    const tr = tree(d, s, ctx, "a", 1);
    expect(tr.lines[0].child).toMatchObject({ id: "b", recipe: "b-from-a" });
    expect(tr.lines[0].child!.lines[0].child).toMatchObject({ id: "a", why: "cycle" });
    expect(totals(d, s, ctx).raw).toEqual([{ id: "a", units: 4, why: "cycle" }]);
  });
});

it("context en frío tarda poco", () => {
  const fresh = JSON.parse(JSON.stringify(craftJson)) as CraftData; // otra instancia: sin caché
  const t0 = performance.now();
  context(fresh, EMPTY);
  const ms = performance.now() - t0;
  console.log(`context() en frío: ${ms.toFixed(1)} ms`);
  expect(ms).toBeLessThan(150);
});

describe("un link hostil no rompe el plan, ni siquiera sin sanitize", () => {
  const BAD = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];
  for (const k of BAD) {
    it(k, () => {
      const link = `?q=${k},c:${k},plank*2&r=${k}~${k},plank~${k}&o=${k}.0~${k},saw-log.0~${k}&x=${k}&f=${k}&t=plank*1&b=${k}`;
      const raw = decodeState(link);
      const p = plan(D, raw);
      // Sin sanitize, lo que no existe queda como hoja de 1 (nunca `null` ni NaN) y las tablas se planifican igual.
      for (const r of p.totals.raw) expect(Number.isFinite(r.units)).toBe(true);
      expect(p.totals.raw).toContainEqual({ id: k, units: 1, why: "raw" });
      expect(p.totals.steps.find((x) => x.id === "plank")).toEqual({ id: "plank", recipe: "saw-log", crafts: 1 });
      // Con sanitize (lo que hace la página), sólo quedan las tablas.
      expect(plan(D, sanitize(D, raw)).trees.map((t) => t.id)).toEqual(["plank"]);
    });
  }
});

describe("árbol y totales dicen lo mismo con varios objetivos", () => {
  // Cada objeto que aparece en los árboles y en los totales tiene la misma decisión en los dos: la misma receta, o la
  // misma razón de hoja (los cortes por ciclo no cuentan: el árbol corta por rama y los totales por lo ya procesado).
  const decisions = (d: CraftData, s: CraftState) => {
    const p = plan(d, s);
    const fromTree = new Map<string, string>();
    const walk = (n: ReturnType<typeof tree>) => {
      if (n.why !== "cycle") fromTree.set(n.id, n.recipe ?? `hoja:${n.why}`);
      for (const l of n.lines) if (l.child) walk(l.child);
    };
    p.trees.forEach(walk);
    const fromTotals = new Map<string, string>();
    for (const x of p.totals.steps) fromTotals.set(x.id, x.recipe);
    for (const x of p.totals.raw) if (x.why !== "cycle") fromTotals.set(x.id, `hoja:${x.why}`);
    return { fromTree, fromTotals };
  };
  const real = craftJson as unknown as CraftData;
  it("estante de secado + clavos (con botín): los clavos del estante se forjan en el árbol, como en la lista", () => {
    // Con botín los clavos se encuentran (`f`): solos, en el estante, son hoja. Pedidos aparte, se forjan, y los totales
    // juntan las dos demandas en una tanda de `forge-10-nails`: el árbol del estante tiene que decir lo mismo.
    const s = st({ q: [{ id: "c:large-plant-drying-rack", qty: 1 }, { id: "nails", qty: 1 }] });
    const p = plan(real, s);
    const nails = p.trees[0].lines.map((l) => l.child).find((c) => c?.id === "nails");
    expect(nails?.recipe).toBe("forge-10-nails");
    expect(p.totals.steps.find((x) => x.id === "nails")).toEqual({ id: "nails", recipe: "forge-10-nails", crafts: 1 });
    const { fromTree, fromTotals } = decisions(real, s);
    for (const [id, v] of fromTree) if (fromTotals.has(id)) expect([id, fromTotals.get(id)]).toEqual([id, v]);
  });
  it("y lo mismo para muchos pares de objetivos", () => {
    const ids = Object.keys(real.makes).filter((_, i) => i % 23 === 0);
    const bad: string[] = [];
    for (let i = 0; i + 1 < ids.length; i++) {
      const s = st({ q: [{ id: ids[i], qty: 2 }, { id: ids[i + 1], qty: 1 }] });
      const { fromTree, fromTotals } = decisions(real, s);
      for (const [id, v] of fromTree) if (fromTotals.has(id) && fromTotals.get(id) !== v) bad.push(`${ids[i]}+${ids[i + 1]}: ${id}`);
    }
    expect(bad).toEqual([]);
  });
});
