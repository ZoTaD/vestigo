import { describe, expect, it } from "vitest";
import craftJson from "../../games/zomboid/data/craft.json";

/**
 * El grafo de fabricación de Project Zomboid que arma `games/zomboid/tools/craft.py` (2026-10-02): todas las recetas,
 * qué objetos da cada una y cómo se aprende, en un archivo para el planificador. Se prueba con el archivo real y contra
 * las fichas de receta del sitio: si un parche desarma la relación entre las dos, salta acá.
 */
const craft = craftJson as any;
const fichas = Object.assign({}, ...Object.values(import.meta.glob("../../games/zomboid/data/site/recipes/*.json", { eager: true, import: "default" }))) as Record<string, any>;

describe("craft.json", () => {
  it("tiene las 1.170 recetas, con las mismas opciones que su ficha", () => {
    expect(Object.keys(craft.recipes)).toHaveLength(1170);
    for (const [id, r] of Object.entries<any>(craft.recipes)) {
      const f = fichas[id];
      expect(f, id).toBeTruthy();
      expect(r.in.map((l: any) => l.o), id).toEqual(f.inputs.map((i: any) => i.opts.map((o: any) => o.id)));
    }
  });
  it("todo slug que nombra existe en items, y makes es simétrico con las salidas", () => {
    for (const [rid, r] of Object.entries<any>(craft.recipes)) {
      for (const l of r.in) for (const o of l.o) expect(craft.items[o], `${rid} → ${o}`).toBeTruthy();
      for (const o of r.out) {
        const outs = "i" in o ? [o.i] : "m" in o ? o.m.map((x: any) => x[0]) : [];
        for (const s of outs) expect(craft.makes[s], `${s} ← ${rid}`).toContain(rid);
      }
    }
  });
  it("las cifras", () => {
    expect(craft.counts).toMatchObject({ craftable: 1584, builds: 201, multi: 242, recipes: 1170 });
  });
  it("aserrar troncos: 1 tronco y una sierra dan 3 tablas", () => {
    const r = craft.recipes["saw-log"];
    expect(r.in[0]).toEqual({ n: 1, o: ["log"] });
    expect(r.in[1]).toMatchObject({ n: 1, k: 1, o: ["hacksaw", "simple-wood-saw", "wood-saw"] });
    expect(r.out).toEqual([{ n: 3, i: "plank" }]);
    expect(r.x).toBeUndefined();
  });
  it("el estante grande de secado pide 8 usos de cordel, y el cordel tiene 5", () => {
    const r = craft.recipes["large-plant-drying-rack"];
    expect(r.kind).toBe("build");
    expect(r.in[1]).toEqual({ n: 8, o: ["twine"] });
    expect(craft.items.twine.u).toBe(5);
    expect(r.sk).toEqual([["carpentry", 1]]);
    expect(r.out).toEqual([{ e: 1 }]);
  });
  it("cordel: 1 de cáñamo, o 25 usos de hilo de tendón", () => {
    expect(craft.recipes["craft-twine"].in[0]).toMatchObject({ n: 1, on: { "sinew-thread": 25 } });
    expect(craft.items["sinew-thread"].u).toBe(10);
  });
  it("secar maíz cuenta mazorcas enteras (ItemCount) y espadillar decide el resultado por la primera línea", () => {
    const dry = Object.values<any>(craft.recipes).find((r) => r.en === "Dry Corn");
    expect(dry.in[0].ic).toBe(1);
    const sc = craft.recipes["scutch-fibre"];
    const m = sc.out[0];
    expect(m.mi).toEqual([0]);
    expect(m.m).toContainEqual(["flax-scutched", ["flax-rippled"]]);
    expect(sc.st).toEqual(["Scutching"]);
  });
  it("batir manteca: 5 L de leche en cualquier recipiente, en la mantequera", () => {
    const r = craft.recipes["churn-butter"];
    expect(r.in[0]).toMatchObject({ any: 1, o: [] });
    expect(r.in[1]).toMatchObject({ n: 5, o: [] });
    expect(r.in[1].fl.en).toBe("Cow's Milk / Sheep's Milk");
    expect(craft.stations.ChurnBucket.builds).toEqual(["butter-churn"]);
  });
  it("forjar 10 clavos se aprende y lo sabe el herrero", () => {
    const l = craft.recipes["forge-10-nails"].learn;
    expect(l.books).toEqual(["magazine-everyday-smithing-june-1993"]);
    expect(l.lv).toEqual([["blacksmithing", 3]]);
    expect(l.profs).toContain("blacksmith");
    expect(craft.recipes["forge-10-nails"].st).toEqual(["PrimitiveForge"]);
    expect(craft.stations.PrimitiveForge.builds[0]).toBe("primitive-forge");
  });
  it("las que no se eligen solas", () => {
    expect(craft.recipes["open-box-100-items"].x).toBe("pack");
    expect(craft.recipes["untie-rope-belt"].x).toBe("undo");
    expect(craft.recipes["unstack-3-logs"].x).toBe("undo");
    expect(craft.recipes["open-egg-carton"].x).toBe("undo");
    for (const id of ["saw-log", "craft-twine", "twist-rope-from-dogbane", "forge-10-nails", "carve-long-stick"]) expect(craft.recipes[id].x, id).toBeUndefined();
  });
  it("`self` es sólo lo que devuelve todo lo que gasta: reforjar no frena a forjar una hoja, rellenar el farol sí", () => {
    // Forjar una hoja acepta la misma hoja para reforjarla, pero la opción de verdad es la barra: se elige sola.
    const blades = Object.keys(craft.recipes).filter((id) => /^forge-.*-blade$/.test(id));
    expect(blades.length).toBeGreaterThan(5);
    for (const id of blades) expect(craft.recipes[id].x, id).toBeUndefined();
    expect(craft.recipes["cut-bar-cutbar"].x).toBeUndefined();
    expect(craft.recipes["refill-hurricane-lantern"].x).toBe("self");
    expect(craft.recipes["refill-welding-torch"].x).toBe("self");
  });
  it.skipIf(!craft.loot)("con botín, los clavos se encuentran y dicen dónde", () => {
    expect(craft.items.nails.f).toBe(1);
    expect(craft.items.nails.w[2]).toBeGreaterThan(0);
  });
  // Lo real + 15 % (2026-10-02: 1.276.786 caracteres y 200.163 bytes con gzip). Juntar las listas de opciones repetidas
  // bajaba el crudo a ~1.018 KB pero el gzip apenas (196 → 189 KB): no valía reabrirlas al cargar.
  it("pesa lo que tiene que pesar", async () => {
    const { gzipSync } = await import("node:zlib");
    const raw = JSON.stringify(craftJson);
    expect(raw.length).toBeLessThan(1_470_000);
    expect(gzipSync(raw).length).toBeLessThan(231_000);
  });
});
