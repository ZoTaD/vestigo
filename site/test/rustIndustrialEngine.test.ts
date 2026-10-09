/**
 * La red industrial del simulador (2026-10-09) contra el código del juego (decompilado RustChangelog, 2024-08-03:
 * IndustrialConveyor, IOEntity.FindContainerSource, BaseOven, ItemModCookable, IndustrialCrafter; ConVar.Server).
 */
import { describe, expect, it } from "vitest";
import data from "@rust/electricity.json";
import items from "@rust/industrial-items.json";
import { buildWorld, Catalog, type Circuit } from "../src/rust/electric/engine";
import type { ElectricityData, IndItem, Part } from "../src/rust/electric/engine/types";
import type { BaseOven, IndustrialConveyor, IndustrialStorage } from "../src/rust/electric/engine/behaviors/industrial";

const cat = new Catalog(data as unknown as ElectricityData);
cat.items = items as unknown as Record<string, IndItem>;

function c(parts: Part[], wires: string): Circuit {
  return {
    parts,
    wires: wires
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => {
        const [f, t] = w.split(">");
        const [fa, fs] = f.split(".");
        const [ta, ts] = t.split(".");
        return { from: [fa, Number(fs)] as [string, number], to: [ta, Number(ts)] as [string, number] };
      }),
  };
}
const P = (id: string, type: string, extra: Partial<Part> = {}): Part => ({ id, type, x: 0, y: 0, ...extra });
const run = (circuit: Circuit, s: number) => {
  const w = buildWorld(cat, circuit);
  w.tick(s);
  return w;
};
const count = (w: ReturnType<typeof run>, id: string, item: string) =>
  (w.get(id) as unknown as IndustrialStorage).container.items.filter((s) => s.id === item && !s.bp).reduce((a, s) => a + s.amount, 0);

describe("Cinta industrial", () => {
  const boxToBox = (filters?: Part["filters"], inv: Part["inv"] = [{ id: "metal.ore", slot: 0, n: 1000 }]) =>
    c(
      [
        P("g", "electric.generator.small"),
        P("a", "box.wooden.large", { inv }),
        P("k", "industrial.conveyor", { cfg: { on: 1 }, filters }),
        P("b", "box.wooden.large"),
        P("l", "electric.simplelight"),
      ],
      "g.0>k.1 a.0>k.0 k.0>b.0 k.3>l.0",
    );

  it("mueve 60 por pila cada 5 s (MaxStackSizePerMove del prefab), y no antes", () => {
    const w = run(boxToBox(), 5.5);
    expect(count(w, "b", "metal.ore")).toBe(0);
    w.tick(1);
    expect(count(w, "b", "metal.ore")).toBe(60);
    w.tick(5);
    expect(count(w, "b", "metal.ore")).toBe(120);
    expect(count(w, "a", "metal.ore")).toBe(880);
  });

  it("sin energía no se prende ni mueve", () => {
    const circuit = boxToBox();
    circuit.wires = circuit.wires.filter((x) => x.from[0] !== "g");
    expect(count(run(circuit, 20), "b", "metal.ore")).toBe(0);
  });

  it("con un filtro de madera mueve sólo la madera, y Filter Pass da 1", () => {
    const w = run(
      boxToBox([{ item: "wood" }], [
        { id: "metal.ore", slot: 0, n: 100 },
        { id: "wood", slot: 1, n: 100 },
      ]),
      12,
    );
    expect(count(w, "b", "wood")).toBe(100);
    expect(count(w, "b", "metal.ore")).toBe(0);
    expect(w.get("l")!.received[0]).toBe(1);
  });

  it("modo No: mueve todo menos lo del filtro", () => {
    const circuit = boxToBox([{ item: "wood" }], [
      { id: "metal.ore", slot: 0, n: 50 },
      { id: "wood", slot: 1, n: 50 },
    ]);
    circuit.parts.find((p) => p.id === "k")!.cfg = { on: 1, mode: 2 };
    const w = run(circuit, 12);
    expect([count(w, "b", "metal.ore"), count(w, "b", "wood")]).toEqual([50, 0]);
  });

  it("con dos salidas reparte de a 30 por pila (60 ÷ 2)", () => {
    const w = run(
      c(
        [
          P("g", "electric.generator.small"),
          P("a", "box.wooden.large", { inv: [{ id: "metal.ore", slot: 0, n: 1000 }] }),
          P("k", "industrial.conveyor", { cfg: { on: 1 } }),
          P("s", "industrial.splitter"),
          P("b1", "box.wooden.large"),
          P("b2", "box.wooden.large"),
        ],
        "g.0>k.1 a.0>k.0 k.0>s.0 s.0>b1.0 s.1>b2.0",
      ),
      6.5,
    );
    expect([count(w, "b1", "metal.ore"), count(w, "b2", "metal.ore")]).toEqual([30, 30]);
    expect((w.get("k") as IndustrialConveyor).outputsFound).toBe(2);
  });

  it("el máximo en el destino corta la cinta", () => {
    const w = run(boxToBox([{ item: "metal.ore", max: 100 }]), 40);
    expect(count(w, "b", "metal.ore")).toBe(100);
  });
});

describe("Horno", () => {
  it("con leña funde mineral de metal (10 s cada uno a velocidad 3, repartido en las pilas que se cocinan) y deja carbón", () => {
    const w = run(
      c([P("f", "furnace", { cfg: { on: 1 }, inv: [{ id: "wood", slot: 0, n: 100 }, { id: "metal.ore", slot: 1, n: 100 }] })], ""),
      60.6,
    );
    const frags = count(w, "f", "metal.fragments");
    // 60 s encendido: 120 ciclos de 0,5 s × 1,5 = 180 s de cocción para una sola pila → 18 fragmentos.
    expect(frags).toBe(18);
    // La leña dura 10 ÷ 2,5 = 4 ciclos (2 s): 30 leños en 60 s, y carbón en 3 de cada 4.
    expect(count(w, "f", "wood")).toBe(70);
    expect(count(w, "f", "charcoal")).toBe(22);
    expect((w.get("f") as BaseOven).isOn()).toBe(true);
  });

  it("sin combustible no prende", () => {
    const w = run(c([P("f", "furnace", { cfg: { on: 1 }, inv: [{ id: "metal.ore", slot: 1, n: 100 }] })], ""), 10);
    expect((w.get("f") as BaseOven).isOn()).toBe(false);
  });

  it("la cinta pone la leña en la ranura de combustible y el mineral en las de entrada, y saca de las de salida", () => {
    const w = run(
      c(
        [
          P("g", "electric.generator.small"),
          P("sp", "electric.splitter"),
          P("a", "box.wooden.large", { inv: [{ id: "wood", slot: 0, n: 200 }, { id: "metal.ore", slot: 1, n: 200 }] }),
          P("k1", "industrial.conveyor", { cfg: { on: 1 } }),
          // El horno no se prende vacío (`StartCooking` pide combustible): arranca con un poco de leña.
          P("f", "furnace", { cfg: { on: 1 }, inv: [{ id: "wood", slot: 0, n: 10 }] }),
          P("k2", "industrial.conveyor", { cfg: { on: 1 } }),
          P("b", "box.wooden.large"),
        ],
        "g.0>sp.0 sp.0>k1.1 sp.1>k2.1 a.0>k1.0 k1.0>f.0 f.0>k2.0 k2.0>b.0",
      ),
      90,
    );
    const f = (w.get("f") as unknown as IndustrialStorage).container;
    expect(f.get(0)?.id).toBe("wood");
    expect(count(w, "b", "metal.fragments")).toBeGreaterThan(0);
    expect(count(w, "b", "charcoal")).toBeGreaterThan(0);
  });
});

describe("Crafteador industrial", () => {
  it("con el plano de la pólvora y carbón y azufre en la entrada, fabrica 10 en 2 s", () => {
    const w = run(
      c(
        [
          P("g", "electric.generator.small"),
          P("x", "industrial.crafter", {
            cfg: { on: 1 },
            inv: [
              { id: "bp:gunpowder", slot: 0, n: 1 },
              { id: "charcoal", slot: 4, n: 300 },
              { id: "sulfur", slot: 5, n: 200 },
            ],
          }),
        ],
        "g.0>x.1",
      ),
      12,
    );
    // Prende a ~1 s; prueba a los ~6 s y termina a los ~8 s; la siguiente vuelta, a los ~11 s, termina a los ~13 s.
    expect(count(w, "x", "gunpowder")).toBe(10);
    w.tick(5);
    expect(count(w, "x", "gunpowder")).toBe(20);
  });

  it("sin el banco necesario no fabrica", () => {
    const w = run(
      c(
        [
          P("g", "electric.generator.small"),
          P("x", "industrial.crafter", { cfg: { on: 1, workbench: 1 }, inv: [{ id: "bp:ammo.rifle", slot: 0, n: 1 }, { id: "metal.fragments", slot: 4, n: 100 }, { id: "gunpowder", slot: 5, n: 100 }] }),
        ],
        "g.0>x.1",
      ),
      20,
    );
    expect(count(w, "x", "ammo.rifle")).toBe(0);
  });
});
