import { describe, expect, it } from "vitest";
import { buildPopular, popularIndex, type RawPopularHero } from "../src/popular";

// Recortes reales de `api.deadlock-api.com/v1/assets/heroes` del 2026-09-29
// (Infernus, timestamp 1790702781 = 17:26:21 UTC). La API manda cada fase en
// orden alfabético de `class_name`, no por pick: por eso el recorte va así.
const infernus: RawPopularHero = {
  id: 1,
  name: "Infernus",
  player_selectable: true,
  disabled: false,
  in_development: false,
  popular_items: {
    timestamp: 1790702781,
    early_game: [
      { item_id: 2951612397, class_name: "upgrade_arcane_extension", pick_pct: 7.239438, winrate_pct: 52.416492 },
      { item_id: 4104549924, class_name: "upgrade_blitz_bullets", pick_pct: 31.735987, winrate_pct: 50.95943 },
      { item_id: 1548066885, class_name: "upgrade_clip_size", pick_pct: 60.34076, winrate_pct: 50.475616 },
      { item_id: 968099481, class_name: "upgrade_improved_spirit", pick_pct: 68.275085, winrate_pct: 50.458942 },
      { item_id: 668299740, class_name: "upgrade_rapid_rounds", pick_pct: 66.79318, winrate_pct: 49.884293 },
    ],
    mid_game: [
      { item_id: 2951612397, class_name: "upgrade_arcane_extension", pick_pct: 53.275845, winrate_pct: 50.481747 },
      { item_id: 4104549924, class_name: "upgrade_blitz_bullets", pick_pct: 30.414236, winrate_pct: 49.082596 },
      { item_id: 1548066885, class_name: "upgrade_clip_size", pick_pct: 12.378371, winrate_pct: 48.34162 },
      { item_id: 668299740, class_name: "upgrade_rapid_rounds", pick_pct: 10.423891, winrate_pct: 49.970257 },
      { item_id: 3696726732, class_name: "upgrade_toxic_bullets", pick_pct: 31.882864, winrate_pct: 53.164417 },
    ],
    late_game: [
      { item_id: 2951612397, class_name: "upgrade_arcane_extension", pick_pct: 11.257263, winrate_pct: 51.290424 },
      { item_id: 3696726732, class_name: "upgrade_toxic_bullets", pick_pct: 36.295353, winrate_pct: 48.14892 },
    ],
  },
};

// Deadman Danny (78) vino con City Never Sleeps y no se puede elegir: la API lo
// manda sin `popular_items`. Se le pegan los de Infernus para probar que el
// filtro es por las banderas del juego y no por la ausencia del campo.
const danny: RawPopularHero = {
  id: 78,
  name: "Deadman Danny",
  player_selectable: false,
  disabled: false,
  in_development: false,
  popular_items: infernus.popular_items,
};

// Los ids de tienda del catálogo (recorte): los seis de Infernus.
const shop = new Set([2951612397, 4104549924, 1548066885, 968099481, 668299740, 3696726732]);

describe("los objetos populares por héroe", () => {
  it("pasa los porcentajes de la API (0–100) a fracción con tres decimales", () => {
    const [h] = buildPopular([infernus], shop);
    expect(h.heroId).toBe(1);
    expect(h.updatedAt).toBe("2026-09-29T17:26:21.000Z");
    expect(h.phases.mid.find((e) => e.itemId === 2951612397)).toEqual({
      itemId: 2951612397,
      pick: 0.533,
      winrate: 0.505,
    });
  });

  it("ordena cada fase por pick de mayor a menor, no por nombre como la API", () => {
    const [h] = buildPopular([infernus], shop);
    expect(h.phases.early.map((e) => e.itemId)).toEqual([968099481, 668299740, 1548066885, 4104549924, 2951612397]);
    expect(h.phases.mid.map((e) => e.pick)).toEqual([0.533, 0.319, 0.304, 0.124, 0.104]);
    expect(h.phases.late.map((e) => e.itemId)).toEqual([3696726732, 2951612397]);
  });

  it("descarta los objetos que no están en la tienda", () => {
    // Escudo Antiguo (4238249888) sólo existe en Street Brawl (coste 9999).
    const conBrawl: RawPopularHero = {
      ...infernus,
      popular_items: {
        ...infernus.popular_items!,
        late_game: [
          ...infernus.popular_items!.late_game!,
          { item_id: 4238249888, class_name: "upgrade_ancient_shield", pick_pct: 40, winrate_pct: 50 },
        ],
      },
    };
    const [h] = buildPopular([conBrawl], shop);
    expect(h.phases.late.map((e) => e.itemId)).toEqual([3696726732, 2951612397]);
  });

  it("deja afuera a los héroes que no se pueden jugar y a los que no traen el dato", () => {
    const sinDato: RawPopularHero = { ...infernus, id: 2, name: "Seven", popular_items: undefined };
    expect(buildPopular([infernus, danny, sinDato], shop).map((h) => h.heroId)).toEqual([1]);
  });

  it("no publica un héroe al que la tienda le vacía las tres fases", () => {
    expect(buildPopular([infernus], new Set([123]))).toEqual([]);
  });

  it("acepta la escala 0–1 si la API la cambia algún día", () => {
    const enFraccion: RawPopularHero = {
      ...infernus,
      popular_items: {
        timestamp: 1790702781,
        early_game: [{ item_id: 968099481, class_name: "upgrade_improved_spirit", pick_pct: 0.68275085, winrate_pct: 0.50458942 }],
      },
    };
    const [h] = buildPopular([enFraccion], shop);
    expect(h.phases.early).toEqual([{ itemId: 968099481, pick: 0.683, winrate: 0.505 }]);
    expect(h.phases.mid).toEqual([]);
  });

  it("el índice lista los héroes y la fecha más nueva de la API", () => {
    const hs = buildPopular([infernus, { ...infernus, id: 6, name: "Abrams", popular_items: { ...infernus.popular_items!, timestamp: 1790700000 } }], shop);
    expect(popularIndex(hs, "2026-09-29T18:00:00.000Z")).toEqual({
      generatedAt: "2026-09-29T18:00:00.000Z",
      updatedAt: "2026-09-29T17:26:21.000Z",
      heroes: [1, 6],
    });
  });
});
