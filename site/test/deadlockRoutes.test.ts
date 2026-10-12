import { describe, expect, it } from "vitest";
import { MAP } from "../src/deadlockMapData";
import {
  PATH_FACTOR,
  STOP_OVERHEAD_S,
  SUGGESTED_STOPS,
  allStops,
  distanceM,
  formatRoute,
  inSide,
  inWing,
  parseRoute,
  routeTotals,
  stopSouls,
  suggestRoute,
} from "../src/deadlockRoutes";

const hero = { speed: 8, dps: 50 };

describe("Deadlock: rutas del mapa", () => {
  it("cada parada tiene un id único que ida y vuelta da la misma ruta", () => {
    const stops = allStops();
    expect(new Set(stops.map((s) => s.id)).size).toBe(stops.length);
    const some = [stops[0], stops[60], stops[5]];
    expect(parseRoute(formatRoute(some))).toEqual(some);
    // Un id que ya no existe se descarta en vez de romper la ruta compartida.
    expect(parseRoute("c0.zz9.c1").map((s) => s.id)).toEqual(["c0", "c1"]);
  });

  it("el mapa mide lo que mide: de punta a punta, el ancho del mundo por el factor de camino", () => {
    const meters = distanceM({ x: 0, y: 0.5 }, { x: 1, y: 0.5 });
    expect(meters).toBeCloseTo(((2 * MAP.bound) / 39.37) * PATH_FACTOR, 5);
  });

  it("una ruta suma caminar y limpiar, y la primera parada no camina", () => {
    const [a, b] = allStops().filter((s) => s.camp !== undefined);
    const t = routeTotals([a, b], hero, 10);
    expect(t.legs[0].travel).toBe(0);
    expect(t.legs[1].travel).toBeCloseTo(distanceM(a, b) / hero.speed, 5);
    expect(t.legs[0].clear).toBeCloseTo(MAP.camps[a.camp!].health / hero.dps + STOP_OVERHEAD_S, 5);
    expect(t.total).toBeCloseTo(t.travel + t.clear, 5);
    expect(t.souls).toBe(stopSouls(a, 10) + stopSouls(b, 10));
    expect(t.soulsPerMin).toBeCloseTo(t.souls / (t.total / 60), 5);
    expect(routeTotals([], hero, 10).soulsPerMin).toBe(0);
  });

  it("más daño limpia antes y más velocidad camina antes", () => {
    const stops = allStops().filter((s) => s.camp !== undefined).slice(0, 4);
    const slow = routeTotals(stops, hero, 10);
    expect(routeTotals(stops, { ...hero, dps: 100 }, 10).clear).toBeLessThan(slow.clear);
    expect(routeTotals(stops, { ...hero, speed: 12 }, 10).travel).toBeLessThan(slow.travel);
  });

  it("una caja da el promedio de lo que suelta y crece con el minuto", () => {
    const crate = allStops().find((s) => s.kind === "crate")!;
    const k = MAP.kinds.crate;
    expect(stopSouls(crate, 0)).toBeCloseTo(k.souls! * k.dropChance!, 5);
    expect(stopSouls(crate, 10)).toBeGreaterThan(stopSouls(crate, 0));
  });

  it("la ruta sugerida se queda en su lado y su mitad, sin repetir y con lo que ya apareció", () => {
    for (const side of ["amber", "sapphire"] as const) {
      for (const wing of ["west", "east"] as const) {
        const route = suggestRoute(side, wing, hero, 10);
        expect(route.length).toBeGreaterThan(1);
        expect(route.length).toBeLessThanOrEqual(SUGGESTED_STOPS);
        expect(new Set(route.map((s) => s.id)).size).toBe(route.length);
        for (const s of route) {
          expect(inSide(s, side)).toBe(true);
          expect(inWing(s, wing)).toBe(true);
          expect(s.kind).not.toBe("midboss");
          expect(MAP.kinds[s.kind].initial!).toBeLessThanOrEqual(600);
        }
      }
    }
    // Al minuto 1 todavía no apareció ningún campamento: no hay ruta que sugerir.
    expect(suggestRoute("amber", "west", hero, 1)).toEqual([]);
  });

  it("el mapa trae su forma calcada", () => {
    expect(MAP.shape.ground.startsWith("M")).toBe(true);
    expect(MAP.shape.silhouette.length).toBeGreaterThan(1000);
  });
});
