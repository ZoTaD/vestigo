import { describe, it, expect } from "vitest";
import { buildBandExtras, assertSummaryHasBoards, type Catalog } from "../src/build";
import { aggregateUnits } from "../src/aggregate/units";
import { aggregateItems } from "../src/aggregate/items";
import { calibrate } from "../src/aggregate/calibrate";
import { BANDS } from "../src/bands";
import type { LobbyRecord } from "../src/store";
import type { Participant } from "../src/aggregate/signature";

/**
 * buildBandExtras es la parte de buildBand que --from=summary tiene que poder
 * pedir por separado (Cambio 2 de inc-task-7): units, items, calibration y
 * habits, siempre a partir de tableros crudos agrupados por lobby, nunca de un
 * contador por firma. Estos tests prueban el reuso (los mismos números que
 * llamar directo a aggregateUnits/aggregateItems/calibrate) y el umbral de
 * MIN_BAND_BOARDS/MIN_HABIT_BOARDS aplicado a la muestra que se le pasa.
 *
 * Los umbrales de abajo (2000, 500, 500, 30, 40) son los defaults reales de
 * build.ts (MIN_BAND_BOARDS/PROVISIONAL_BAND_BOARDS/MIN_HABIT_BOARDS/
 * MIN_UNIT_GAMES/MIN_ITEM_GAMES): no están mockeados, así que estos números
 * tienen que coincidir con los que build.ts usa sin ninguna variable de
 * entorno puesta (igual que hace test/bandOutcome.test.ts).
 */

const BAND = BANDS.find((b) => b.id === "apex")!;

const CATALOG: Catalog = {
  champions: { TFT17_Zoe: { cost: 3 }, TFT17_Ornn: { cost: 4 } },
  items: { Deathblade: { composition: ["a", "b"] } },
};

function board(placementInLobby: number): Participant {
  return {
    puuid: "p" + placementInLobby,
    placement: placementInLobby,
    level: 8,
    goldLeft: 3,
    units: [
      { character_id: "TFT17_Zoe", tier: 2, rarity: 2, items: ["Deathblade", "Deathblade"] },
      { character_id: "TFT17_Ornn", tier: 1, rarity: 1, items: [] },
    ],
    traits: [{ name: "TFT17_Sorcerer", numUnits: 6, tierCurrent: 3, tierTotal: 4 }],
  };
}

/** `n` tableros repartidos en lobbies de 8 (un tamaño real de mesa de TFT). */
function lobbiesOf(n: number): LobbyRecord[] {
  const lobbies: LobbyRecord[] = [];
  let made = 0;
  let lobbyIndex = 0;
  while (made < n) {
    const size = Math.min(8, n - made);
    lobbies.push({
      matchId: `LA2_${lobbyIndex}`,
      set: 17,
      queueId: 1100,
      gameType: "standard",
      gameVersion: "Linux Version 16.14.794.5912 [PUBLIC] <Releases/16.14>",
      tier: "CHALLENGER",
      boards: Array.from({ length: size }, (_, i) => board(i + 1)),
    });
    made += size;
    lobbyIndex += 1;
  }
  return lobbies;
}

describe("buildBandExtras", () => {
  it("por debajo de MIN_HABIT_BOARDS y de MIN_BAND_BOARDS, sin permiso provisional: todo vacío", () => {
    const extras = buildBandExtras(BAND, lobbiesOf(100), CATALOG, false);
    expect(extras.outcome).toBe("empty");
    expect(extras.provisional).toBe(false);
    expect(extras.units).toEqual([]);
    expect(extras.items).toEqual([]);
    expect(extras.calibration).toBeUndefined();
    expect(extras.habits).toBeNull();
    expect(extras.boards).toHaveLength(100);
  });

  // El punto del comentario original en buildBand: los hábitos se miden ANTES
  // del portón de la tier list. Con 600 tableros (arriba de MIN_HABIT_BOARDS =
  // 500, abajo de MIN_BAND_BOARDS = 2000) y el permiso provisional en false,
  // units/items/calibration siguen vacíos pero habits NO.
  it("entre MIN_HABIT_BOARDS y MIN_BAND_BOARDS, sin permiso provisional: habits sale igual, lo demás no", () => {
    const extras = buildBandExtras(BAND, lobbiesOf(600), CATALOG, false);
    expect(extras.outcome).toBe("empty");
    expect(extras.units).toEqual([]);
    expect(extras.items).toEqual([]);
    expect(extras.calibration).toBeUndefined();
    expect(extras.habits).not.toBeNull();
    expect(extras.habits!.boards).toBe(600);
  });

  it("entre PROVISIONAL_BAND_BOARDS y MIN_BAND_BOARDS, con permiso: provisional, y esta vez sí se miden", () => {
    const extras = buildBandExtras(BAND, lobbiesOf(600), CATALOG, true);
    expect(extras.outcome).toBe("provisional");
    expect(extras.provisional).toBe(true);
    expect(extras.calibration).toBeDefined();
    expect(extras.units.length).toBeGreaterThan(0);
    expect(extras.items.length).toBeGreaterThan(0);
    expect(extras.habits).not.toBeNull();
  });

  // La prueba de reuso: por encima de MIN_BAND_BOARDS, lo que buildBandExtras
  // mide tiene que ser EXACTAMENTE lo que dan aggregateUnits/aggregateItems/
  // calibrate llamadas directo con los mismos tableros — si difiere, alguien
  // duplicó la lógica en vez de reusarla.
  it("por encima de MIN_BAND_BOARDS: da lo mismo que llamar aggregateUnits/aggregateItems/calibrate directo", () => {
    const lobbies = lobbiesOf(2000);
    const costOf = (id: string) => CATALOG.champions[id]?.cost ?? 0;
    const isCraftable = (id: string) => (CATALOG.items[id]?.composition?.length ?? 0) === 2;
    const grouped = lobbies.map((l) => l.boards);
    const boards = grouped.flat();

    const extras = buildBandExtras(BAND, lobbies, CATALOG, false);

    expect(extras.outcome).toBe("full");
    expect(extras.provisional).toBe(false);
    expect(extras.units).toEqual(aggregateUnits(boards, 30, costOf));
    expect(extras.items).toEqual(aggregateItems(boards, 40, isCraftable));
    expect(extras.calibration).toEqual(calibrate(grouped));
    expect(extras.boards).toEqual(boards);
  });

  it("sin catálogo, no revienta: costos en 0 y sin ítems craftable, como hace el resto del build", () => {
    const extras = buildBandExtras(BAND, lobbiesOf(2000), null, false);
    expect(extras.outcome).toBe("full");
    // Sin catálogo, craftableFilter no reconoce ningún ítem como craftable.
    expect(extras.items).toEqual([]);
  });
});

describe("assertSummaryHasBoards", () => {
  it("no tira cuando el resumen tiene algo", () => {
    expect(() => assertSummaryHasBoards("apex", "16.14", 1)).not.toThrow();
  });

  // El caso que existe para esto: publicar comps: [] pisaría una tier list
  // buena ya publicada, y la causa casi segura es que summarize no corrió para
  // este parche todavía — no que de verdad no haya datos.
  it("tira cuando el resumen está vacío para esa banda y ese parche, explicando por qué", () => {
    expect(() => assertSummaryHasBoards("apex", "16.14", 0)).toThrow(/16\.14/);
  });

  // Y el caso que NO es un error, que es el de un parche recién salido: esta banda
  // está en cero pero otra del mismo parche ya tiene tableros, así que el
  // resumidor corrió bien y ésta simplemente todavía no vio partidas. Sin esta
  // distinción, cada cambio de parche bloquea la publicación entera hasta que las
  // cinco bandas junten algo — pasó con 16.15 el 2026-07-29.
  it("deja pasar una banda vacía si otra banda del mismo parche ya tiene tableros", () => {
    expect(() => assertSummaryHasBoards("diamond-emerald", "16.15", 0, true)).not.toThrow();
  });
});
