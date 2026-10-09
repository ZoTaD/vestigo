/** El estado del editor de electricidad (2026-10-09): editar, deshacer y que el mundo acompañe. */
import { describe, expect, it } from "vitest";
import data from "@rust/electricity.json";
import { Catalog } from "../src/rust/electric/engine";
import type { ElectricityData } from "../src/rust/electric/engine/types";
import { EditorStore } from "../src/rust/electric/editor/store";

const cat = new Catalog(data as ElectricityData);

describe("EditorStore", () => {
  it("agregar, cablear y simular", () => {
    const s = new EditorStore(cat, { parts: [], wires: [] });
    const g = s.addPart("electric.generator.small", 0, 0)!;
    const l = s.addPart("electric.simplelight", 200, 0)!;
    expect(s.connect({ from: [g, 0], to: [l, 0] })).toBeNull();
    s.advance(2);
    expect(s.world.get(l)!.received[0]).toBe(100);
  });

  it("la pantalla avanza de a 16 ms y la simulación igual corre", () => {
    const s = new EditorStore(cat, { parts: [{ id: "g", type: "electric.generator.small", x: 0, y: 0 }, { id: "l", type: "electric.simplelight", x: 0, y: 0 }], wires: [{ from: ["g", 0], to: ["l", 0] }] });
    for (let i = 0; i < 90; i++) s.advance(1 / 60);
    expect(s.world.get("l")!.received[0]).toBe(100);
  });

  it("no deja cablear enchufes de distinto tipo ni cablear algo consigo mismo", () => {
    const s = new EditorStore(cat, { parts: [], wires: [] });
    const p = s.addPart("waterpump", 0, 0)!;
    const l = s.addPart("electric.simplelight", 0, 0)!;
    expect(s.connect({ from: [p, 0], to: [l, 0] })).toBe("type");
    expect(s.connect({ from: [l, 0], to: [l, 0] })).toBe("self");
  });

  it("un cable nuevo a una entrada ocupada reemplaza al viejo", () => {
    const s = new EditorStore(cat, { parts: [], wires: [] });
    const a = s.addPart("electric.generator.small", 0, 0)!;
    const b = s.addPart("electric.solarpanel.large", 0, 0)!;
    const l = s.addPart("electric.simplelight", 0, 0)!;
    s.connect({ from: [a, 0], to: [l, 0] });
    s.connect({ from: [b, 0], to: [l, 0] });
    expect(s.circuit.wires).toEqual([{ from: [b, 0], to: [l, 0] }]);
  });

  it("deshacer y rehacer", () => {
    const s = new EditorStore(cat, { parts: [], wires: [] });
    s.addPart("electric.splitter", 0, 0);
    s.addPart("electric.simplelight", 0, 0);
    expect(s.circuit.parts).toHaveLength(2);
    s.undo();
    expect(s.circuit.parts).toHaveLength(1);
    s.redo();
    expect(s.circuit.parts).toHaveLength(2);
    expect(s.canRedo()).toBe(false);
  });

  it("borrar se lleva sus cables; duplicar copia los cables entre las copias", () => {
    const s = new EditorStore(cat, { parts: [], wires: [] });
    const a = s.addPart("electric.splitter", 0, 0)!;
    const b = s.addPart("electric.simplelight", 0, 0)!;
    s.connect({ from: [a, 0], to: [b, 0] });
    s.duplicate([a, b]);
    expect(s.circuit.parts).toHaveLength(4);
    expect(s.circuit.wires).toHaveLength(2);
    s.removeParts([a]);
    expect(s.circuit.wires).toHaveLength(1);
  });

  it("una acción del inspector queda guardada en la parte", () => {
    const s = new EditorStore(cat, { parts: [{ id: "p0", type: "electric.switch", x: 0, y: 0 }], wires: [] });
    s.act("p0", "power");
    expect(s.circuit.parts[0].cfg).toEqual({ on: 1 });
  });
});
