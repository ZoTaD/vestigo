import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  bestPhases,
  loadPopular,
  popularOf,
  usePopular,
  type PopularHero,
} from "../src/deadlockPopularData";

// Infernus del 2026-09-29, recortado (ver `popular.ts` en el pipeline).
const infernus: PopularHero = {
  heroId: 1,
  updatedAt: "2026-09-29T17:26:21.000Z",
  phases: {
    early: [
      { itemId: 968099481, pick: 0.683, winrate: 0.505 },
      { itemId: 1548066885, pick: 0.603, winrate: 0.505 },
      { itemId: 2951612397, pick: 0.072, winrate: 0.524 },
    ],
    mid: [
      { itemId: 2951612397, pick: 0.533, winrate: 0.505 },
      { itemId: 1548066885, pick: 0.124, winrate: 0.483 },
      { itemId: 3696726732, pick: 0.319, winrate: 0.532 },
    ],
    late: [
      { itemId: 3696726732, pick: 0.363, winrate: 0.481 },
      { itemId: 2951612397, pick: 0.113, winrate: 0.513 },
    ],
  },
};

describe("los objetos populares de un héroe", () => {
  it("cada objeto va a la fase donde más se compra", () => {
    const m = bestPhases(infernus);
    expect(m.get(2951612397)).toEqual({ phase: "mid", pick: 0.533 });
    expect(m.get(1548066885)).toEqual({ phase: "early", pick: 0.603 });
    expect(m.get(3696726732)).toEqual({ phase: "late", pick: 0.363 });
    expect(m.get(123)).toBeUndefined();
  });

  it("en un empate gana la fase más temprana, que es cuando se compra primero", () => {
    const empate: PopularHero = {
      ...infernus,
      phases: { early: [{ itemId: 5, pick: 0.2, winrate: 0.5 }], mid: [{ itemId: 5, pick: 0.2, winrate: 0.5 }], late: [] },
    };
    expect(bestPhases(empate).get(5)).toEqual({ phase: "early", pick: 0.2 });
  });

  it("popularOf lee lo ya cargado y no inventa nada antes", async () => {
    expect(popularOf(1, 968099481)).toBeNull();
    const h = await loadPopular(1);
    expect(h?.heroId).toBe(1);
    // Contra el archivo publicado, sea cual sea el día: la fase con más pick.
    const item = h!.phases.mid[0].itemId;
    const max = Math.max(
      ...(["early", "mid", "late"] as const).flatMap((f) => h!.phases[f].filter((e) => e.itemId === item).map((e) => e.pick))
    );
    expect(popularOf(1, item)?.pick).toBe(max);
    expect(popularOf(1, 123)).toBeNull();
  });

  it("un héroe sin archivo (Deadman Danny, no jugable) da null", async () => {
    expect(await loadPopular(78)).toBeNull();
    expect(popularOf(78, 968099481)).toBeNull();
  });

  it("el hook devuelve lo cargado, y null sin héroe", async () => {
    await loadPopular(1);
    const Ver = ({ id }: { id: number | null }) => {
      const p = usePopular(id);
      return createElement("i", null, p === undefined ? "bajando" : p === null ? "nada" : String(p.heroId));
    };
    expect(renderToString(createElement(Ver, { id: 1 }))).toContain(">1<");
    expect(renderToString(createElement(Ver, { id: null }))).toContain("nada");
    // Uno que no se pidió todavía: mientras baja, undefined.
    expect(renderToString(createElement(Ver, { id: 2 }))).toContain("bajando");
  });
});
