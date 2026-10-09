/** Los circuitos listos (2026-10-09): cada uno hace lo que dice su texto. */
import { describe, expect, it } from "vitest";
import data from "@rust/electricity.json";
import { CIRCUITS } from "../src/rust/electric/circuits";
import { buildWorld, Catalog, wireError } from "../src/rust/electric/engine";
import type { Circuit, ElectricityData } from "../src/rust/electric/engine/types";

const cat = new Catalog(data as ElectricityData);
const get = (slug: string): Circuit => structuredClone(CIRCUITS.find((c) => c.slug === slug)!.circuit);
const start = (c: Circuit, s = 5) => {
  const w = buildWorld(cat, c);
  w.tick(s);
  return w;
};
const on = (w: ReturnType<typeof start>, id: string) => w.get(id)!.isPowered();

describe("circuitos listos", () => {
  it("entre 12 y 20, con slugs únicos en los dos idiomas y textos en los dos", () => {
    expect(CIRCUITS.length).toBeGreaterThanOrEqual(12);
    expect(CIRCUITS.length).toBeLessThanOrEqual(20);
    expect(new Set(CIRCUITS.map((c) => c.slug)).size).toBe(CIRCUITS.length);
    expect(new Set(CIRCUITS.map((c) => c.slugEs)).size).toBe(CIRCUITS.length);
    for (const c of CIRCUITS) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.slugEs).toMatch(/^[a-z0-9-]+$/);
      expect(c.about.en.length).toBeGreaterThan(40);
      expect(c.about.es.length).toBeGreaterThan(40);
    }
  });

  it("todos los componentes existen y todos los cables son válidos", () => {
    for (const c of CIRCUITS) {
      for (const p of c.circuit.parts) expect(cat.get(p.type), `${c.slug}: ${p.type}`).toBeDefined();
      for (const w of c.circuit.wires) expect(wireError(cat, c.circuit, w), `${c.slug}: ${JSON.stringify(w)}`).toBeNull();
    }
  });

  it("torreta solar: anda de día y sigue de noche con la batería", () => {
    const day = start(get("solar-turret"), 8);
    expect(on(day, "t")).toBe(true);
    const night = get("solar-turret");
    night.env = { hour: 23 };
    expect(on(start(night, 8), "t")).toBe(true);
  });

  it("SAM: anda y deja pasar 75 a la luz", () => {
    const w = start(get("sam-site"));
    expect(on(w, "s")).toBe(true);
    expect(w.get("l")!.received[0]).toBe(75);
  });

  it("puerta con botón: abre al apretar y se cierra sola a los 5 s", () => {
    const w = start(get("button-door"));
    expect(w.get("d")!.hasFlag(1 << 1)).toBe(false);
    w.get("bt")!.act("press");
    w.tick(1);
    expect(w.get("d")!.hasFlag(1 << 1)).toBe(true);
    w.tick(5);
    expect(w.get("d")!.hasFlag(1 << 1)).toBe(false);
  });

  it("trampa HBHF: con alguien adentro la Tesla recibe 25; sin nadie, nada", () => {
    const w = start(get("hbhf-tesla-trap"));
    expect(w.get("t")!.received[0]).toBe(25);
    w.get("h")!.act("players", 0);
    w.tick(2);
    expect(w.get("t")!.received[0]).toBe(0);
  });

  it("luces de noche: prendidas a las 22, apagadas al mediodía", () => {
    expect(on(start(get("night-lights"), 8), "l3")).toBe(true);
    const day = get("night-lights");
    day.env = { hour: 12 };
    expect(on(start(day, 8), "l1")).toBe(false);
  });

  it("respaldo de batería: torreta, calefactor y heladera andan", () => {
    const w = start(get("battery-backup"));
    expect([on(w, "t"), on(w, "h"), on(w, "f")]).toEqual([true, true, true]);
  });

  it("generador con interruptor inteligente: prende y apaga el generador", () => {
    const w = start(get("fuel-generator-smart-switch"));
    expect(w.get("g")!.isOn()).toBe(true);
    expect(on(w, "l")).toBe(true);
    w.get("ss")!.act("power");
    w.tick(2);
    expect(w.get("g")!.isOn()).toBe(false);
    expect(on(w, "l")).toBe(false);
  });

  it("compuertas: AND con los dos, OR con uno, XOR con uno y no con los dos", () => {
    expect(on(start(get("and-gate")), "l")).toBe(true);
    expect(on(start(get("or-gate")), "l")).toBe(true);
    const x = start(get("xor-gate"));
    expect(on(x, "l")).toBe(true);
    x.get("sb")!.act("power");
    x.tick(2);
    expect(on(x, "l")).toBe(false);
  });

  it("celda de memoria: Set prende Output", () => {
    const w = start(get("memory-cell"));
    expect([on(w, "o"), on(w, "i")]).toEqual([false, true]);
    w.get("bs")!.act("press");
    w.tick(2);
    expect([on(w, "o"), on(w, "i")]).toEqual([true, false]);
  });

  it("contador: a los 3 prende la luz y el reset la apaga", () => {
    const w = start(get("counter"));
    for (let i = 0; i < 3; i++) {
      w.get("bt")!.act("press");
      w.tick(1.5);
    }
    expect(on(w, "l")).toBe(true);
    w.get("br")!.act("press");
    w.tick(1.5);
    expect(on(w, "l")).toBe(false);
  });

  it("alarma sísmica: suena con la vibración y se apaga 3 s después", () => {
    const w = start(get("seismic-alarm"));
    expect(on(w, "a")).toBe(false);
    w.get("s")!.act("shake");
    w.tick(1);
    expect([on(w, "a"), on(w, "l")]).toEqual([true, true]);
    w.tick(3);
    expect(on(w, "a")).toBe(false);
  });

  it("torretas con ramas: las tres andan", () => {
    const w = start(get("turrets-with-branches"));
    expect([on(w, "t1"), on(w, "t2"), on(w, "t3")]).toEqual([true, true, true]);
    expect(w.get("t3")!.received[0]).toBe(80);
  });

  it("puerta por RF: abierta con el emisor prendido, cerrada al apagarlo", () => {
    const w = start(get("rf-door"));
    expect(w.get("d")!.hasFlag(1 << 1)).toBe(true);
    w.get("sw")!.act("power");
    w.tick(2);
    expect(w.get("d")!.hasFlag(1 << 1)).toBe(false);
  });
});
