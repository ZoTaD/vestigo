/** El circuito en el link y "explicar" (2026-10-09). */
import { describe, expect, it } from "vitest";
import data from "@rust/electricity.json";
import { decode, encode, fromBytes, toBytes } from "../src/rust/electric/codec";
import { buildWorld, Catalog, type Circuit } from "../src/rust/electric/engine";
import { explainPart, explainWire, issues } from "../src/rust/electric/engine/explain";
import type { ElectricityData } from "../src/rust/electric/engine/types";

const cat = new Catalog(data as unknown as ElectricityData);

const CIRCUIT: Circuit = {
  parts: [
    { id: "p0", type: "electric.battery.rechargable.medium", x: 0, y: -40, cfg: { charge: 9000 } },
    { id: "p1", type: "electric.switch", x: 160, y: 0, cfg: { on: 1 } },
    { id: "p2", type: "electric.splitter", x: 320, y: 0 },
    { id: "p3", type: "autoturret", x: 480, y: -80, cfg: { target: 1, ammo: 40 } },
    { id: "p4", type: "electric.simplelight", x: 480, y: 80 },
    { id: "p5", type: "electric.timer", x: 0, y: 200, cfg: { timerLength: 2.25 } },
  ],
  wires: [
    { from: ["p0", 0], to: ["p1", 0] },
    { from: ["p1", 0], to: ["p2", 0] },
    { from: ["p2", 0], to: ["p3", 0] },
    { from: ["p2", 1], to: ["p4", 0] },
  ],
  env: { hour: 18.5, gust: 0.35, height: 12 },
};

describe("codec", () => {
  it("ida y vuelta en bytes", () => {
    expect(fromBytes(toBytes(CIRCUIT))).toEqual(CIRCUIT);
  });

  it("ida y vuelta comprimido, y el texto es apto para un #hash", async () => {
    const s = await encode(CIRCUIT);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeLessThan(260);
    expect(await decode(s)).toEqual(CIRCUIT);
  });

  it("un link roto no rompe: da null", async () => {
    expect(await decode("no-es-un-circuito")).toBeNull();
    expect(await decode("")).toBeNull();
  });

  it("los bytes de la v1 no cambian (un link viejo tiene que seguir abriendo)", () => {
    const v1 = Uint8Array.from([1, 2, 17, 101, 108, 101, 99, 116, 114, 105, 99, 46, 115, 112, 108, 105, 116, 116, 101, 114, 20, 101, 108, 101, 99, 116, 114, 105, 99, 46, 115, 105, 109, 112, 108, 101, 108, 105, 103, 104, 116, 120, 50, 20, 2, 0, 0, 0, 0, 1, 200, 1, 3, 1, 3, 200, 1, 1, 0, 0, 1, 0]);
    expect(fromBytes(v1)).toEqual({
      parts: [
        { id: "p0", type: "electric.splitter", x: 0, y: 0 },
        { id: "p1", type: "electric.simplelight", x: 100, y: -2, cfg: { branchAmount: 1 } },
      ],
      wires: [{ from: ["p0", 0], to: ["p1", 0] }],
      env: { hour: 12, gust: 0.5, height: 20 },
    });
  });
});

describe("explicar", () => {
  const world = buildWorld(cat, structuredClone(CIRCUIT));
  world.env.hour = 12;
  world.tick(5);

  it("la batería dice cuánto empuja y cuánto gasta", () => {
    const es = explainPart(world, "p0", "es").join(" ");
    expect(es).toContain("empuja 50");
    expect(es).toContain("11 por segundo");
    expect(explainPart(world, "p0", "en").join(" ")).toContain("pushes 50");
  });

  it("el splitter dice que no mira lo que piden", () => {
    expect(explainPart(world, "p2", "en").join(" ")).toContain("without looking at what each one needs");
  });

  it("la torreta dice si le alcanza", () => {
    expect(explainPart(world, "p3", "es")[0]).toBe("Necesita 10 y le llegan 25: funciona.");
  });

  it("un cable dice cuánto lleva", () => {
    expect(explainWire(world, CIRCUIT.wires[3], "en")[0]).toBe('It carries 25 from "Power Out 2" (Splitter) to "Power In" (Simple Light).');
  });

  it("avisos: el temporizador suelto no es un error; una luz sin cable sí", () => {
    const c: Circuit = { parts: [{ id: "a", type: "electric.simplelight", x: 0, y: 0 }, { id: "b", type: "electric.timer", x: 0, y: 0 }], wires: [] };
    const w = buildWorld(cat, c);
    w.tick(1);
    expect(issues(w, c)).toEqual([{ id: "a", kind: "unwired" }]);
  });
});
