/**
 * El motor de electricidad (2026-10-09) contra lo que hace el juego. Cada caso dice de qué parte del código del juego
 * sale el número esperado (decompilado RustChangelog, 2024-08-03) o qué cifra conocida reproduce.
 */
import { describe, expect, it } from "vitest";
import data from "@rust/electricity.json";
import { buildWorld, Catalog, live, type Circuit } from "../src/rust/electric/engine";
import type { ElectricityData, PartCfg } from "../src/rust/electric/engine/types";
import type { ElectricBattery } from "../src/rust/electric/engine/behaviors/battery";

const cat = new Catalog(data as ElectricityData);

/** `c([["a", "electric.splitter"]], "a.0>b.0 a.1>c.0")`: partes y cables en una línea. */
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

const run = (circuit: Circuit, seconds = 3) => {
  const w = buildWorld(cat, circuit);
  w.tick(seconds);
  return w;
};
const got = (w: ReturnType<typeof run>, id: string, slot = 0) => w.get(id)!.received[slot];
const sent = (w: ReturnType<typeof run>, id: string, slot = 0) => w.get(id)!.sent[slot];

describe("IOEntity: paso de energía", () => {
  it("una luz se queda con 1 y pasa el resto por Passthrough", () => {
    const w = run(c([["g", "electric.generator.small"], ["l1", "electric.simplelight"], ["l2", "electric.simplelight"]], "g.0>l1.0 l1.0>l2.0"));
    expect(got(w, "l1")).toBe(100);
    expect(got(w, "l2")).toBe(99);
    expect(w.get("l2")!.isPowered()).toBe(true);
  });

  it("la torreta pide 10: con 9 no se prende", () => {
    const w = run(c([["g", "electric.generator.small"], ["b", "electrical.branch", { branchAmount: 9 }], ["t", "autoturret"]], "g.0>b.0 b.1>t.0"));
    expect(got(w, "t")).toBe(9);
    expect(w.get("t")!.isPowered()).toBe(false);
  });

  it("los cambios llegan en el mismo cuadro aunque la cadena sea larga", () => {
    const parts: [string, string][] = [["g", "electric.generator.small"]];
    let wires = "";
    for (let i = 0; i < 20; i++) {
      parts.push([`l${i}`, "electric.simplelight"]);
      wires += ` ${i === 0 ? "g" : `l${i - 1}`}.0>l${i}.0`;
    }
    const world = buildWorld(cat, c(parts, wires));
    // Los generadores empujan a 1 s (`Init` → `Invoke(MarkDirtyForceUpdateOutputs, 1)`).
    world.tick(1 + 1 / 30);
    expect(got(world, "l19")).toBe(81);
  });
});

describe("Fuentes", () => {
  it("panel solar grande al mediodía: 20; de noche: 0", () => {
    expect(got(run(c([["s", "electric.solarpanel.large"], ["l", "electric.simplelight"]], "s.0>l.0", { hour: 12 }), 7), "l")).toBe(20);
    expect(got(run(c([["s", "electric.solarpanel.large"], ["l", "electric.simplelight"]], "s.0>l.0", { hour: 23 }), 7), "l")).toBe(0);
  });

  it("molino a 50 m con la ráfaga a 0,5: 150 (el tope)", () => {
    const w = run(c([["m", "generator.wind.scrap"], ["l", "electric.simplelight"]], "m.0>l.0", { height: 50, gust: 0.5 }), 3);
    expect(got(w, "l")).toBe(150);
  });

  it("molino en el piso con la ráfaga a 0,3: floor(150 × 0,3) = 45", () => {
    const w = run(c([["m", "generator.wind.scrap"], ["l", "electric.simplelight"]], "m.0>l.0", { height: 0, gust: 0.3 }), 3);
    expect(got(w, "l")).toBe(45);
  });

  it("generador a combustible prendido: 40; apagado: 0", () => {
    expect(got(run(c([["f", "electric.fuelgenerator.small", { on: 1 }], ["l", "electric.simplelight"]], "f.0>l.0")), "l")).toBe(40);
    expect(got(run(c([["f", "electric.fuelgenerator.small"], ["l", "electric.simplelight"]], "f.0>l.0")), "l")).toBe(0);
  });

  it("rueda de agua: 30", () => {
    expect(got(run(c([["r", "generator.water"], ["l", "electric.simplelight"]], "r.0>l.0")), "l")).toBe(30);
  });
});

describe("Splitter, rama, combinador, bloqueador", () => {
  it("el splitter reparte 20 entre 3 salidas conectadas: 7, 7, 6 (el resto a las primeras)", () => {
    const w = run(c([["s", "electric.solarpanel.large"], ["sp", "electric.splitter"], ["a", "electric.simplelight"], ["b", "electric.simplelight"], ["d", "electric.simplelight"]], "s.0>sp.0 sp.0>a.0 sp.1>b.0 sp.2>d.0", { hour: 12 }), 7);
    expect([got(w, "a"), got(w, "b"), got(w, "d")]).toEqual([7, 7, 6]);
  });

  it("el splitter no mira lo que piden: con 2 salidas da 50 y 50 aunque una sea una luz", () => {
    const w = run(c([["g", "electric.generator.small"], ["sp", "electric.splitter"], ["t", "autoturret"], ["l", "electric.simplelight"]], "g.0>sp.0 sp.0>t.0 sp.2>l.0"));
    expect([got(w, "t"), got(w, "l")]).toEqual([50, 50]);
  });

  it("rama de 10 con 100: Branch Out 10, Power Out 90", () => {
    const w = run(c([["g", "electric.generator.small"], ["b", "electrical.branch", { branchAmount: 10 }], ["x", "electric.simplelight"], ["y", "electric.simplelight"]], "g.0>b.0 b.0>x.0 b.1>y.0"));
    expect([got(w, "x"), got(w, "y")]).toEqual([90, 10]);
  });

  it("combinador: suma sus entradas", () => {
    const w = run(c([["s", "electric.solarpanel.large"], ["s2", "electric.solarpanel.large"], ["cb", "electrical.combiner"], ["l", "electric.simplelight"]], "s.0>cb.0 s2.0>cb.1 cb.0>l.0", { hour: 12 }), 7);
    expect(got(w, "l")).toBe(40);
  });

  it("combinador realimentado: la entrada que viene de su propia salida cuenta 0 y marca corto", () => {
    const w = run(c([["g", "electric.generator.small"], ["cb", "electrical.combiner"], ["sp", "electric.splitter"], ["l", "electric.simplelight"]], "g.0>cb.0 cb.0>sp.0 sp.0>cb.1 sp.1>l.0"));
    expect(w.get("cb")!.received[1]).toBeGreaterThan(0);
    expect(w.get("cb")!.hasFlag(1 << 9)).toBe(true);
    expect(got(w, "l")).toBe(50);
  });

  it("bloqueador: con energía en Block Passthrough no pasa nada", () => {
    const free = run(c([["g", "electric.generator.small"], ["bl", "electric.blocker"], ["l", "electric.simplelight"]], "g.0>bl.0 bl.0>l.0"));
    expect(got(free, "l")).toBe(100);
    const blocked = run(c([["g", "electric.generator.small"], ["sp", "electric.splitter"], ["bl", "electric.blocker"], ["l", "electric.simplelight"]], "g.0>sp.0 sp.0>bl.0 sp.1>bl.1 bl.0>l.0"));
    expect(got(blocked, "l")).toBe(0);
  });
});

describe("Baterías", () => {
  const turretAndLight = (charge: number) =>
    c(
      [["b", "electric.battery.rechargable.medium", { charge }], ["sw", "electric.switch", { on: 1 }], ["sp", "electric.splitter"], ["t", "autoturret"], ["l", "electric.simplelight"]],
      "b.0>sw.0 sw.0>sp.0 sp.0>t.0 sp.1>l.0",
    );

  it("una batería empuja su salida máxima (50) y descuenta lo que piden la torreta y la luz (11)", () => {
    const w = run(turretAndLight(9000), 5);
    expect(got(w, "sw")).toBe(50);
    expect([got(w, "t"), got(w, "l")]).toEqual([25, 25]);
    const b = w.get("b") as ElectricBattery;
    expect(b.activeDrain).toBe(11);
  });

  it("11 rWs por segundo: en 60 s gasta 660 rWs (11 rWm)", () => {
    const w = run(turretAndLight(9000), 5);
    const b = w.get("b") as ElectricBattery;
    const before = b.rustWattSeconds;
    w.tick(60);
    // `TickUsage` cobra cada 1 s: 60 cobros de 11 (± uno, según dónde caiga el corte).
    expect(Math.abs(before - b.rustWattSeconds - 660)).toBeLessThanOrEqual(11);
  });

  it("con el interruptor apagado no gasta nada", () => {
    const circuit = turretAndLight(9000);
    circuit.parts[1].cfg = { on: 0 };
    const w = run(circuit, 5);
    expect((w.get("b") as ElectricBattery).activeDrain).toBe(0);
    expect(got(w, "t")).toBe(0);
  });

  it("panel solar de 20 carga 16 rWs por segundo (80 %)", () => {
    const w = run(c([["s", "electric.solarpanel.large"], ["b", "electric.battery.rechargable.small", { charge: 0 }]], "s.0>b.0", { hour: 12 }), 7);
    const b = w.get("b") as ElectricBattery;
    const before = b.rustWattSeconds;
    w.tick(10);
    expect(Math.abs(b.rustWattSeconds - before - 160)).toBeLessThanOrEqual(16);
  });

  it("lo que pide para cargar tiene tope: 4 × su salida (la chica pide hasta 60)", () => {
    const w = run(c([["g", "electric.generator.small"], ["b", "electric.battery.rechargable.small", { charge: 0 }]], "g.0>b.0"), 3);
    expect(w.get("b")!.desiredPower(0)).toBe(60);
    const b = w.get("b") as ElectricBattery;
    const before = b.rustWattSeconds;
    w.tick(10);
    expect(Math.abs(b.rustWattSeconds - before - 480)).toBeLessThanOrEqual(48);
  });

  it("una chica (15) con dos torretas por splitter: les llega 8 y 7, no se prenden y no descuenta nada", () => {
    const w = run(c([["b", "electric.battery.rechargable.small", { charge: 400 }], ["sp", "electric.splitter"], ["t1", "autoturret"], ["t2", "autoturret"]], "b.0>sp.0 sp.0>t1.0 sp.1>t2.0"), 5);
    expect((w.get("b") as ElectricBattery).activeDrain).toBe(0);
    expect([got(w, "t1"), got(w, "t2")]).toEqual([8, 7]);
  });

  it("con menos de 5 rWs no descarga", () => {
    const w = run(c([["b", "electric.battery.rechargable.small", { charge: 0.05 }], ["l", "electric.simplelight"]], "b.0>l.0"), 5);
    expect(got(w, "l")).toBe(0);
  });

  it("la grande da 100", () => {
    const w = run(c([["b", "electric.battery.rechargable.large", { charge: 24000 }], ["l", "electric.simplelight"]], "b.0>l.0"), 5);
    expect(got(w, "l")).toBe(100);
  });
});

describe("Lógica", () => {
  /** Dos fuentes (por rama, para fijar la cifra) a las entradas A y B de una compuerta, y una luz a la salida. */
  const gate = (type: string, a: number, b: number) => {
    const parts: [string, string, PartCfg?][] = [["g", "electric.generator.small"], ["sp", "electric.splitter"], ["ra", "electrical.branch", { branchAmount: a }], ["rb", "electrical.branch", { branchAmount: b }], ["x", type], ["l", "electric.simplelight"]];
    let wires = "g.0>sp.0 sp.0>ra.0 sp.1>rb.0 x.0>l.0";
    if (a > 0) wires += " ra.1>x.0";
    if (b > 0) wires += " rb.1>x.1";
    return got(run(c(parts, wires)), "l");
  };

  it("AND: max(A, B) si las dos tienen", () => {
    expect(gate("electric.andswitch", 10, 20)).toBe(20);
    expect(gate("electric.andswitch", 10, 0)).toBe(0);
  });
  it("OR: max(A, B)", () => {
    expect(gate("electric.orswitch", 10, 0)).toBe(10);
    expect(gate("electric.orswitch", 10, 20)).toBe(20);
  });
  it("XOR: sólo si una tiene", () => {
    expect(gate("electric.xorswitch", 10, 0)).toBe(10);
    expect(gate("electric.xorswitch", 10, 20)).toBe(0);
  });

  it("celda de memoria: Set prende Output, Reset pasa a Inverted Output", () => {
    const circuit = c(
      [["g", "electric.generator.small"], ["sp", "electric.splitter"], ["bs", "electric.button"], ["br", "electric.button"], ["m", "electrical.memorycell"], ["o", "electric.simplelight"], ["i", "electric.simplelight"]],
      "g.0>sp.0 sp.0>m.0 sp.1>bs.0 sp.2>br.0 bs.0>m.1 br.0>m.2 m.0>o.0 m.1>i.0",
    );
    const w = run(circuit, 3);
    expect([got(w, "o"), got(w, "i")]).toEqual([0, 34]);
    w.get("bs")!.act("press");
    w.tick(2);
    expect([got(w, "o"), got(w, "i")]).toEqual([34, 0]);
    w.get("br")!.act("press");
    w.tick(2);
    expect([got(w, "o"), got(w, "i")]).toEqual([0, 34]);
  });

  it("temporizador de 10 s: prende con Toggle On y se apaga solo", () => {
    const w = run(c([["g", "electric.generator.small"], ["sp", "electric.splitter"], ["bt", "electric.button"], ["t", "electric.timer", { timerLength: 10 }], ["l", "electric.simplelight"]], "g.0>sp.0 sp.0>t.0 sp.1>bt.0 bt.0>t.1 t.0>l.0"), 3);
    expect(got(w, "l")).toBe(0);
    w.get("bt")!.act("press");
    w.tick(1);
    expect(got(w, "l")).toBe(50);
    w.tick(8.5);
    expect(got(w, "l")).toBe(50);
    w.tick(1);
    expect(got(w, "l")).toBe(0);
  });

  it("botón: pulso de 0,5 s con al menos 2, aunque no tenga energía", () => {
    const w = run(c([["bt", "electric.button"], ["l", "electric.simplelight"]], "bt.0>l.0"), 2);
    w.get("bt")!.act("press");
    w.tick(0.2);
    expect(got(w, "l")).toBe(2);
    w.tick(0.5);
    expect(got(w, "l")).toBe(0);
  });

  it("contador con objetivo 3: deja pasar después de 3 pulsos", () => {
    const w = run(c([["g", "electric.generator.small"], ["sp", "electric.splitter"], ["bt", "electric.button"], ["k", "electric.counter", { target: 3 }], ["l", "electric.simplelight"]], "g.0>sp.0 sp.0>k.0 sp.1>bt.0 bt.0>k.1 k.0>l.0"), 3);
    for (let i = 0; i < 2; i++) {
      w.get("bt")!.act("press");
      w.tick(1.5);
    }
    expect(got(w, "l")).toBe(0);
    w.get("bt")!.act("press");
    w.tick(1.5);
    expect(got(w, "l")).toBe(50);
  });
});

describe("Sensores y consumidores", () => {
  it("HBHF con 3 jugadores y 10 de entrada da 3", () => {
    const w = run(c([["g", "electric.generator.small"], ["b", "electrical.branch", { branchAmount: 10 }], ["h", "electric.hbhfsensor", { players: 3 }], ["l", "electric.simplelight"]], "g.0>b.0 b.1>h.0 h.0>l.0"), 4);
    expect(got(w, "l")).toBe(3);
  });

  it("torreta: con 10 se prende pero Has Target da 0; con 11, 1", () => {
    const ten = run(c([["g", "electric.generator.small"], ["b", "electrical.branch", { branchAmount: 10 }], ["t", "autoturret", { target: 1 }], ["l", "electric.simplelight"]], "g.0>b.0 b.1>t.0 t.0>l.0"));
    expect(ten.get("t")!.isOn()).toBe(true);
    expect(got(ten, "l")).toBe(0);
    const eleven = run(c([["g", "electric.generator.small"], ["b", "electrical.branch", { branchAmount: 11 }], ["t", "autoturret", { target: 1 }], ["l", "electric.simplelight"]], "g.0>b.0 b.1>t.0 t.0>l.0"));
    expect(got(eleven, "l")).toBe(1);
  });

  it("SAM con 30: deja pasar 5 por Passthrough", () => {
    const w = run(c([["g", "electric.generator.small"], ["b", "electrical.branch", { branchAmount: 30 }], ["s", "samsite"], ["l", "electric.simplelight"]], "g.0>b.0 b.1>s.0 s.3>l.0"));
    expect(got(w, "l")).toBe(5);
  });

  it("controlador de puertas: abre con energía y cierra al cortarse", () => {
    const w = run(c([["g", "electric.generator.small"], ["sw", "electric.switch", { on: 1 }], ["d", "electric.doorcontroller"]], "g.0>sw.0 sw.0>d.0"));
    expect(w.get("d")!.hasFlag(1 << 1)).toBe(true);
    w.get("sw")!.act("power");
    w.tick(1);
    expect(w.get("d")!.hasFlag(1 << 1)).toBe(false);
  });

  it("RF: el receptor deja pasar mientras el emisor tiene energía", () => {
    const w = run(c([["g", "electric.generator.small"], ["sp", "electric.splitter"], ["sw", "electric.switch", { on: 1 }], ["tx", "electric.rf.broadcaster", { frequency: 1234 }], ["rx", "electric.rf.receiver", { frequency: 1234 }], ["l", "electric.simplelight"]], "g.0>sp.0 sp.0>sw.0 sw.0>tx.0 sp.1>rx.0 rx.0>l.0"));
    expect(got(w, "l")).toBe(49);
    w.get("sw")!.act("power");
    w.tick(2);
    expect(got(w, "l")).toBe(0);
  });
});

describe("Cambios en vivo", () => {
  it("conectar y desconectar un cable mueve la energía", () => {
    const circuit = c([["g", "electric.generator.small"], ["l", "electric.simplelight"]]);
    const w = run(circuit, 2);
    live.connect(w, { from: ["g", 0], to: ["l", 0] });
    w.tick(0.5);
    expect(got(w, "l")).toBe(100);
    live.disconnect(w, { from: ["g", 0], to: ["l", 0] });
    w.tick(0.5);
    expect(got(w, "l")).toBe(0);
    expect(w.get("l")!.isPowered()).toBe(false);
  });

  it("borrar una parte deja sin energía a lo que colgaba", () => {
    const w = run(c([["g", "electric.generator.small"], ["sp", "electric.splitter"], ["l", "electric.simplelight"]], "g.0>sp.0 sp.0>l.0"));
    expect(got(w, "l")).toBe(100);
    live.removePart(w, "sp");
    w.tick(0.5);
    expect(got(w, "l")).toBe(0);
  });
});
