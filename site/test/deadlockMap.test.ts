import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYERS,
  MAP,
  MAP_KINDS,
  campHealthAt,
  campSoulsAt,
  clock,
  isUpAt,
  timerOf,
} from "../src/deadlockMapData";
import { DEADLOCK_COPY } from "../src/deadlockCopy";
import { DEADLOCK_SECTIONS, parseRoute, routePath } from "../src/route";

describe("Deadlock: el mapa", () => {
  it("es una pestaña con su dirección", () => {
    expect(DEADLOCK_SECTIONS).toContain("map");
    const route = parseRoute("/en/deadlock/map");
    expect(route.dlSection).toBe("map");
    expect(routePath(route)).toBe("/en/deadlock/map");
  });

  it("cada tipo del archivo tiene orden, nombre y explicación en los dos idiomas", () => {
    expect([...MAP_KINDS].sort()).toEqual(Object.keys(MAP.kinds).sort());
    for (const lang of ["en", "es"] as const) {
      const t = DEADLOCK_COPY[lang].deadlock.map;
      expect(Object.keys(t.kinds).sort()).toEqual([...MAP_KINDS].sort());
      expect(Object.keys(t.about).sort()).toEqual([...MAP_KINDS].sort());
    }
  });

  it("la cuenta de cada tipo es la de sus puntos, y todos caen dentro del minimapa", () => {
    for (const kind of MAP_KINDS) {
      const points = MAP.kinds[kind].group === "jungle" ? MAP.camps.filter((c) => c.kind === kind) : MAP.points[kind] ?? [];
      expect(points.length, kind).toBe(MAP.kinds[kind].count);
    }
    for (const c of MAP.camps) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(1);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(1);
      // Un campamento sin criaturas no tendría vida ni almas que mostrar.
      expect(Object.keys(c.units).length, c.kind).toBeGreaterThan(0);
    }
  });

  it("qué apareció a cada minuto", () => {
    const small = MAP.kinds["camp-small"];
    expect(isUpAt(small, small.initial! - 1)).toBe(false);
    expect(isUpAt(small, small.initial!)).toBe(true);
    // Lo que no tiene reloj está siempre.
    expect(timerOf(MAP.kinds.shop)).toBeNull();
    expect(isUpAt(MAP.kinds.shop, 0)).toBe(true);
    // Un rompible usa el reloj de su grupo.
    const crate = MAP.kinds.crate;
    expect(isUpAt(crate, crate.timers![2].initial - 1, 2)).toBe(false);
    expect(isUpAt(crate, crate.timers![0].initial, 0)).toBe(true);
  });

  it("las almas crecen con el minuto y la vida sólo en el jefe del medio", () => {
    const camp = MAP.camps.find((c) => c.kind === "camp-large")!;
    expect(campSoulsAt(camp, 0)).toBe(camp.souls);
    expect(campSoulsAt(camp, 20)).toBeGreaterThan(camp.souls);
    expect(campHealthAt(camp, 20)).toBe(camp.health);
    const boss = MAP.camps.find((c) => c.kind === "midboss")!;
    expect(campHealthAt(boss, 10)).toBe(boss.health + 10 * boss.healthGrowth!);
  });

  it("al abrir no se dibujan las cajas ni las estatuas", () => {
    expect(DEFAULT_LAYERS).not.toContain("crate");
    expect(DEFAULT_LAYERS).not.toContain("statue");
    expect(DEFAULT_LAYERS).toContain("camp-medium");
  });

  it("el reloj se escribe m:ss", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(335)).toBe("5:35");
  });
});
