// Eventos de la noche contra el juego real: cada caso de `night.json` lo escribió
// el oráculo (`games/stardew/tools/oracle`, comando `night`) llamando a
// `Utility.pickFarmEvent()` noche tras noche (con la fecha y `DaysPlayed` del día
// nuevo), con y sin una rosa de hadas madura en la granja.
import { describe, expect, it } from "vitest";
import fx from "./fixtures/stardew-predict/night.json";
import { predictNights, type NightEvent } from "../src/stardew/predict/night";

interface Caso {
  gameId: number;
  legacy: boolean;
  rose: boolean;
  ccPantry: boolean;
  raccoonTreeFallen: boolean;
  gotCapsule: boolean;
  sawQiPlane: boolean;
  billboardTicket: boolean;
  from: number;
  events: string;
}

const casos = fx.cases as Caso[];
const eventos = (c: Caso) => c.events.split(" ").map((x) => (x === "-" ? null : (x as NightEvent)));
// La noche que lleva al día 2 de primavera del año 1.
const opciones = (c: Caso) => ({
  year: 1,
  season: 0 as const,
  day: 2,
  gotCapsule: c.gotCapsule,
  ccPantry: c.ccPantry,
  raccoonTreeFallen: c.raccoonTreeFallen,
  sawQiPlane: c.sawQiPlane,
  billboardTicket: c.billboardTicket,
});
const semilla = (c: Caso) => ({ gameId: c.gameId, legacy: c.legacy });

describe("predictNights contra el juego", () => {
  it("el fixture tiene todos los eventos", () => {
    const todos = new Set(casos.flatMap((c) => c.events.split(" ")));
    for (const e of ["fairy", "witch", "meteorite", "owl", "capsule", "earthquake", "raccoon", "qiPlane"]) {
      expect(todos.has(e), e).toBe(true);
    }
    // Con el boleto del cartel, el avión sale la primera noche.
    expect(casos.filter((c) => c.billboardTicket).every((c) => c.events.startsWith("qiPlane "))).toBe(true);
  });

  it("cada noche, con la rosa de hadas sabida", () => {
    for (const c of casos) {
      const nombre = `${c.gameId} rosa=${c.rose} despensa=${c.ccPantry} mapache=${c.raccoonTreeFallen}`;
      const n = c.events.split(" ").length;
      expect(predictNights(semilla(c), c.from, n, { ...opciones(c), fairyRose: c.rose }), nombre).toEqual(eventos(c));
    }
  });

  it("sin saber de la rosa: fairyIfRose justo donde la rosa cambia la noche", () => {
    let vistos = 0;
    for (let i = 0; i < casos.length; i += 2) {
      const [sin, con] = [casos[i], casos[i + 1]];
      expect([sin.rose, con.rose]).toEqual([false, true]);
      const a = eventos(sin);
      const b = eventos(con);
      const esperado = b.map((x, k) => (x !== a[k] ? "fairyIfRose" : x));
      vistos += esperado.filter((x) => x === "fairyIfRose").length;
      expect(predictNights(semilla(con), con.from, b.length, opciones(con))).toEqual(esperado);
    }
    expect(vistos).toBeGreaterThan(0);
  });

  it("arrancar en otra noche da lo mismo que la serie entera", () => {
    const c = casos.find((x) => !x.rose && !x.ccPantry && !x.sawQiPlane && !x.billboardTicket)!;
    const todo = eventos(c);
    // La noche al día 150 (año 2, verano 10): ya pasaron el avión de Qi y el terremoto.
    const desde = 150;
    const k = desde - c.from;
    expect(todo.slice(0, k)).toContain("qiPlane");
    const capsula = todo.slice(0, k).includes("capsule");
    const r = predictNights(semilla(c), desde, 50, {
      year: 2, season: 1, day: 10, gotCapsule: capsula, ccPantry: false, raccoonTreeFallen: false,
      sawQiPlane: true, fairyRose: false,
    });
    expect(r).toEqual(todo.slice(k, k + 50));
  });
});
