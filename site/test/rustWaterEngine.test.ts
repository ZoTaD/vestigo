/**
 * La red de agua del simulador (2026-10-09) contra lo que hace el juego (decompilado RustChangelog, 2024-08-03:
 * LiquidContainer, WaterPump, WaterCatcher, PoweredWaterPurifier, Sprinkler, FluidSwitch, IOEntity.AllowLiquidPassthrough).
 */
import { describe, expect, it } from "vitest";
import data from "@rust/electricity.json";
import { buildWorld, Catalog, type Circuit } from "../src/rust/electric/engine";
import type { ElectricityData, PartCfg } from "../src/rust/electric/engine/types";
import type { LiquidContainer, Sprinkler } from "../src/rust/electric/engine/behaviors/water";

const cat = new Catalog(data as unknown as ElectricityData);

function c(parts: [string, string, PartCfg?][], wires = "", env: Circuit["env"] = {}): Circuit {
  return {
    parts: parts.map(([id, type, cfg], i) => ({ id, type, x: i * 100, y: 0, cfg: cfg ? { ...cfg } : undefined })),
    wires: wires
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => {
        const [f, t] = w.split(">");
        const [fa, fs] = f.split(".");
        const [ta, ts] = t.split(".");
        return { from: [fa, Number(fs)] as [string, number], to: [ta, Number(ts)] as [string, number] };
      }),
    env,
  };
}
const run = (circuit: Circuit, s: number) => {
  const w = buildWorld(cat, circuit);
  w.tick(s);
  return w;
};
const liq = (w: ReturnType<typeof run>, id: string) => (w.get(id) as LiquidContainer).liquid;

describe("Bomba", () => {
  it("con energía suma 85 de agua salada cada 10 s; sin energía, nada", () => {
    const w = run(c([["g", "electric.generator.small"], ["p", "waterpump"]], "g.0>p.0"), 12);
    expect(liq(w, "p")).toEqual({ kind: "water.salt", amount: 85 });
    w.tick(10);
    expect(liq(w, "p")!.amount).toBe(170);
    expect(liq(run(c([["p", "waterpump"]]), 30), "p")).toBeNull();
  });

  it("en agua dulce bombea agua dulce", () => {
    const w = run(c([["g", "electric.generator.small"], ["p", "waterpump", { fresh: 1 }]], "g.0>p.0"), 12);
    expect(liq(w, "p")!.kind).toBe("water");
  });

  it("empuja al barril 24 cada 2 s, pero 10 s después de llenar la ranura vacía", () => {
    const w = run(c([["g", "electric.generator.small"], ["p", "waterpump"], ["b", "water.barrel"]], "g.0>p.0 p.0>b.0"), 15);
    // La bomba recibió agua a los ~11 s: hasta los ~21 s no empuja.
    expect(liq(w, "b")).toBeNull();
    w.tick(10);
    expect(liq(w, "b")!.kind).toBe("water.salt");
    expect(liq(w, "b")!.amount % 24).toBe(0);
    expect(liq(w, "b")!.amount).toBeGreaterThan(0);
  });
});

describe("Gravedad", () => {
  const twoBarrels = (h2: number) =>
    c([["a", "water.barrel", { water: 1000 }], ["b", "water.barrel", { height: h2 }]], "a.0>b.0");

  it("dos barriles al mismo nivel: la salida (1,1 m) queda a menos de 1 m de la entrada (2,03 m) y el agua pasa", () => {
    const w = run(twoBarrels(0), 20);
    expect(liq(w, "b")!.amount).toBeGreaterThan(0);
  });

  it("si el segundo está medio metro más alto, ya no sube", () => {
    const w = run(twoBarrels(0.5), 20);
    expect(liq(w, "b")).toBeNull();
    expect(w.get("b")!.received[0]).toBe(0);
  });

  it("más abajo, baja", () => {
    expect(liq(run(twoBarrels(-3), 20), "b")!.amount).toBeGreaterThan(0);
  });

  it("la bomba con energía empuja para arriba (el contenedor con energía no mira la gravedad)", () => {
    const w = run(c([["g", "electric.generator.small"], ["p", "waterpump", { water: 500 }], ["b", "water.barrel", { height: 10 }]], "g.0>p.0 p.0>b.0"), 20);
    expect(liq(w, "b")!.amount).toBeGreaterThan(0);
  });
});

describe("Consumo", () => {
  it("un aspersor recibe el caudal (12), se prende y gasta 2 por segundo", () => {
    const w = run(c([["b", "water.barrel", { water: 1000 }], ["s", "electric.sprinkler"]], "b.0>s.0"), 3);
    expect(w.get("s")!.received[0]).toBe(12);
    expect(w.get("s")!.isOn()).toBe(true);
    const before = liq(w, "b")!.amount;
    w.tick(10);
    expect(Math.abs(before - liq(w, "b")!.amount - 20)).toBeLessThanOrEqual(2);
    expect((w.get("s") as Sprinkler).splashes).toBeGreaterThan(0);
  });

  it("servidor actual: con menos de 2 de caudal el aspersor no pide nada; con 2 o más pide 2", () => {
    const w = run(c([["b", "water.barrel", { water: 1000 }], ["s", "electric.sprinkler"]], "b.0>s.0"), 3);
    const s = w.get("s") as Sprinkler;
    s.currentEnergy = 1;
    expect(s.desiredPower()).toBe(0);
    s.currentEnergy = 12;
    expect(s.desiredPower()).toBe(2);
  });

  it("dos aspersores por splitter: 6 y 6 de caudal, gastan 4 por segundo entre los dos", () => {
    const w = run(c([["b", "water.barrel", { water: 1000 }], ["sp", "fluid.splitter"], ["s1", "electric.sprinkler"], ["s2", "electric.sprinkler"]], "b.0>sp.0 sp.0>s1.0 sp.1>s2.0"), 3);
    expect([w.get("s1")!.received[0], w.get("s2")!.received[0]]).toEqual([6, 6]);
    const before = liq(w, "b")!.amount;
    w.tick(10);
    expect(Math.abs(before - liq(w, "b")!.amount - 40)).toBeLessThanOrEqual(4);
  });
});

describe("Purificador", () => {
  it("con energía convierte la salada en dulce a razón 2:1 y la deja en su depósito, que empuja al barril", () => {
    const w = run(
      c([["g", "electric.generator.small"], ["sp", "electric.splitter"], ["p", "waterpump"], ["u", "powered.water.purifier"], ["b", "water.barrel"]], "g.0>sp.0 sp.0>p.0 sp.1>u.1 p.0>u.0 u.0>b.0"),
      60,
    );
    const store = w.get("u")!.child as LiquidContainer;
    expect(store).toBeTruthy();
    // Agua dulce en el barril y nada de salada.
    const b = liq(w, "b");
    expect(b?.kind).toBe("water");
    expect((b?.amount ?? 0) + store.liquidCount).toBeGreaterThan(0);
  });
});

describe("Interruptor de fluidos y colector", () => {
  it("apagado no deja pasar el agua; prendido, sí", () => {
    const off = run(c([["a", "water.barrel", { water: 1000 }], ["f", "fluid.switch"], ["b", "water.barrel", { height: -2 }]], "a.0>f.0 f.0>b.0"), 20);
    expect(liq(off, "b")).toBeNull();
    const on = run(c([["a", "water.barrel", { water: 1000 }], ["f", "fluid.switch", { on: 1 }], ["b", "water.barrel", { height: -2 }]], "a.0>f.0 f.0>b.0"), 20);
    expect(liq(on, "b")!.amount).toBeGreaterThan(0);
  });

  it("el colector chico arranca con 1 y suma ceil(10 × 0,25) = 3 por minuto sin lluvia; con lluvia, mucho más", () => {
    const dry = run(c([["k", "water.catcher.small"]]), 61);
    expect(liq(dry, "k")!.amount).toBe(4);
    const wet = run(c([["k", "water.catcher.small"]], "", { rain: 0.1 }), 61);
    expect(liq(wet, "k")!.amount).toBe(1 + Math.ceil(10 * (0.25 + 0.1 * 500)));
  });

  it("el colector deja el agua directo en el barril de abajo", () => {
    const w = run(c([["k", "water.catcher.small"], ["b", "water.barrel", { height: -2 }]], "k.0>b.0"), 61);
    expect(liq(w, "b")!.amount).toBeGreaterThanOrEqual(3);
  });

  it("dos tipos de agua no se mezclan: la salada no entra a un barril con dulce", () => {
    const w = run(c([["a", "water.barrel", { water: 500, salt: 1 }], ["b", "water.barrel", { water: 10 }]], "a.0>b.0"), 20);
    expect(liq(w, "b")).toEqual({ kind: "water", amount: 10 });
  });
});

describe("Explicar el agua", () => {
  it("el cable dice que el agua no sube, con la altura de cada enchufe, y aparece el aviso", async () => {
    const { explainWire, explainPart, issues } = await import("../src/rust/electric/engine/explain");
    const circuit = c([["a", "water.barrel", { water: 1000 }], ["b", "water.barrel", { height: 0.5 }]], "a.0>b.0");
    const w = run(circuit, 5);
    expect(explainWire(w, circuit.wires[0], "es")[1]).toBe("El agua no pasa: el enchufe de salida está a 1,1 m y la entrada a 2,53 m. Sin bomba, el agua sólo baja (o sube menos de 1 m).");
    expect(issues(w, circuit)).toContainEqual({ id: "b", kind: "uphill" });
    expect(explainPart(w, "a", "en")[0]).toBe("It holds 1000 fresh water (room for 20000).");
  });

  it("el cable del purificador sale de su depósito", async () => {
    const { explainWire } = await import("../src/rust/electric/engine/explain");
    const circuit = c([["u", "powered.water.purifier"], ["b", "water.barrel", { height: -3 }]], "u.0>b.0");
    const w = run(circuit, 2);
    expect(explainWire(w, circuit.wires[0], "en")[0]).toMatch(/^It carries 0 from "Water Out" \(Powered Water Purifier\)/);
  });
});
