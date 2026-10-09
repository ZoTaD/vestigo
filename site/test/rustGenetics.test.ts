import { describe, expect, it } from "vitest";
import farming from "@rust/farming.json";
import {
  cloneCount, crossBreed, findPlans, harvestAmount, marketValue, parseGenes, ripeMinutes, tieOdds, waterUse,
  type CrossWeights, type Gene, type PlantStats,
} from "../src/rust/farming/genetics";

const W = Object.fromEntries(farming.genes.map((g) => [g.letter, g.cross])) as CrossWeights;
const g = (s: string) => parseGenes(s)!;
const cross = (center: string, ...n: string[]) => crossBreed(g(center), n.map(g), W).outcomes;
const plant = (id: string) => farming.plants.find((p) => p.id === id)! as unknown as PlantStats;
const R = farming.rules;

describe("genética de Rust: la cruza", () => {
  it("los pesos son los del juego: rojos 1, verdes 0,6", () => {
    expect(W).toEqual({ X: 1, W: 1, G: 0.6, Y: 0.6, H: 0.6 });
  });

  it("lee los genes como en el juego", () => {
    expect(parseGenes("gggyyy")).toEqual(["G", "G", "G", "Y", "Y", "Y"]);
    expect(parseGenes("GGGYY")).toBeNull();
    expect(parseGenes("GGGYYZ")).toBeNull();
  });

  it("una vecina verde no le gana a un gen rojo, dos sí", () => {
    expect(cross("XXXXXX", "GGGYYY")).toEqual([{ genes: "XXXXXX", p: 1 }]);
    expect(cross("XXXXXX", "GGGYYY", "GGGYYY")).toEqual([{ genes: "GGGYYY", p: 1 }]);
  });

  it("entre verdes hace falta superar 0,6: una sola no cambia nada", () => {
    expect(cross("GGGGGG", "YYYYYY")).toEqual([{ genes: "GGGGGG", p: 1 }]);
    expect(cross("GGGGGG", "YYYYYY", "YYYYYY")).toEqual([{ genes: "YYYYYY", p: 1 }]);
  });

  it("un solo rojo vecino ya pisa un verde", () => {
    expect(cross("YYYYYY", "XXXXXX")).toEqual([{ genes: "XXXXXX", p: 1 }]);
  });

  it("la central no se suma a sí misma, y sin vecinas no cambia", () => {
    expect(cross("GGGYYY")).toEqual([{ genes: "GGGYYY", p: 1 }]);
    expect(cross("GGGYYY", "GGGYYY")).toEqual([{ genes: "GGGYYY", p: 1 }]);
  });

  it("los casilleros se cruzan por separado", () => {
    // Casillero por casillero: dos G contra un Y en los tres primeros, dos Y contra un G en los otros.
    expect(cross("XXXXXX", "GGGYYY", "GGGYYY", "YYYGGG")).toEqual([{ genes: "GGGYYY", p: 1 }]);
  });

  it("un empate se reparte, y el mismo orden de vecinas vale para los seis casilleros", () => {
    // Dos G contra dos Y en todos: o gana G en los seis o Y en los seis, nunca mezclado.
    const out = cross("WWWWWW", "GGGGGG", "GGGGGG", "YYYYYY", "YYYYYY");
    expect(out).toEqual([
      { genes: "GGGGGG", p: 0.5 },
      { genes: "YYYYYY", p: 0.5 },
    ]);
  });

  it("cinco verdes empatan con tres rojos (float de 32 bits) y gana el que completa antes", () => {
    expect(tieOdds([1, 1])).toEqual([0.5, 0.5]);
    const [five, three] = tieOdds([5, 3]);
    expect(five).toBeCloseTo(3 / 8, 10);
    expect(three).toBeCloseTo(5 / 8, 10);
    const out = cross("HHHHHH", ...Array(5).fill("GGGGGG"), ...Array(3).fill("XXXXXX"));
    expect(out.find((o) => o.genes === "GGGGGG")!.p).toBeCloseTo(3 / 8, 10);
    expect(out.find((o) => o.genes === "XXXXXX")!.p).toBeCloseTo(5 / 8, 10);
  });

  it("como mucho cuenta ocho vecinas", () => {
    const nine = cross("XXXXXX", ...Array(9).fill("GGGGGG"));
    expect(nine).toEqual([{ genes: "GGGGGG", p: 1 }]);
  });
});

describe("genética de Rust: lo que cambia cada gen", () => {
  it("G acelera las etapas que dependen de las condiciones", () => {
    const hemp = plant("hemp");
    expect(ripeMinutes(hemp, g("XXXXXX"), R)).toBe(112);
    expect(ripeMinutes(hemp, g("GGGGGG"), R)).toBeCloseTo(111 / 2.5 + 1, 6);
  });

  it("Y sube la cosecha y los clones", () => {
    const hemp = plant("hemp");
    expect(harvestAmount(hemp, g("XXXXXX"), R)).toBe(40);
    expect(harvestAmount(hemp, g("GGGGYY"), R)).toBe(55);
    expect(harvestAmount(hemp, g("YYYYYY"), R)).toBe(85);
    expect(cloneCount(hemp, g("GGGGYY"))).toBe(hemp.clones + 1);
    expect(cloneCount(hemp, g("GGGGGY"))).toBe(hemp.clones);
  });

  it("W pide más agua y el valor de venta sigue a los genes buenos", () => {
    const corn = plant("corn");
    expect(waterUse(corn, g("WWGGGG"), R)).toBeCloseTo(corn.water * 1.2, 6);
    expect(marketValue(corn, g("GGGYYY"), R)).toBe(corn.market + 60);
    expect(marketValue(corn, g("XXXXXX"), R)).toBe(0);
  });
});

describe("genética de Rust: el buscador", () => {
  it("si ya tenés el clon, no hay que cruzar", () => {
    expect(findPlans(g("GGGYYY"), [g("XXXXXX"), g("GGGYYY")], W)).toEqual([{ center: "GGGYYY", neighbours: [], p: 1 }]);
  });

  it("si no se puede llegar, no inventa nada", () => {
    expect(findPlans(g("GGGYYY"), [g("GGGGGG"), g("YYYYYY")], W)).toEqual([]);
  });

  it("encuentra la cruza y su probabilidad es la de la calculadora", () => {
    const owned = [g("XXXGGG"), g("GGGYYY"), g("YYYXXX")].slice(0, 3);
    const target = g("GGGXXX");
    const plans = findPlans(target, owned, W, 4);
    expect(plans.length).toBeGreaterThan(0);
    for (const pl of plans) {
      const out = crossBreed(g(pl.center), pl.neighbours.map(g), W).outcomes;
      expect(out.find((o) => o.genes === "GGGXXX")?.p).toBeCloseTo(pl.p, 10);
    }
    expect(plans[0].p).toBe(1);
  });
});

describe("genética de Rust: el buscador no se cuelga", () => {
  it("con 10 esquejes y hasta 8 vecinas termina rápido, llegue o no", () => {
    const owned = ["GGGXXX", "XXXYYY", "GYGYGY", "YGYGYG", "HHHHHH", "WWWGGG", "YYYWWW", "GGXYYX", "XGGYYH", "GHGYHY"].map(g);
    let t0 = performance.now();
    const plans = findPlans(g("GGGYYY"), owned, W);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(plans[0]).toMatchObject({ p: 1 });
    expect(plans[0].neighbours.length).toBe(2);
    t0 = performance.now();
    findPlans(g("HHHHYY"), owned.slice(0, 9), W);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

// El tipo `Gene` se usa sólo como tipo: que el import no quede colgado si cambia.
export type _G = Gene;
