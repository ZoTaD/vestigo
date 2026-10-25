// Minas contra el juego real: cada caso de `mines.json` lo escribió el oráculo
// (`games/stardew/tools/oracle`, comando `mines`) llamando a `MineShaft.loadLevel`
// de verdad, piso por piso, con el piso más hondo, el correo de la cantera y el
// buff del Aceite de ajo armados en el juego.
import { describe, expect, it } from "vitest";
import fx from "./fixtures/stardew-predict/mines.json";
import { predictMines, type MineDay } from "../src/stardew/predict/mines";

interface Caso {
  gameId: number;
  legacy: boolean;
  daysPlayed: number;
  lowest: number;
  quarry: boolean;
  garlic: boolean;
  infested: number[];
  slime: number[];
  quarryLevels: number[];
  mushroom: number[];
}

const casos = fx.cases as Caso[];
const esperado = (c: Caso): MineDay => ({
  daysPlayed: c.daysPlayed,
  infested: c.infested,
  slime: c.slime,
  quarry: c.quarryLevels,
  mushroom: c.mushroom,
});
const opciones = (c: Caso) => ({ lowestMineLevel: c.lowest, quarry: c.quarry, garlicOil: c.garlic });

describe("predictMines contra el juego", () => {
  it("el fixture cubre las partidas, los pisos de hongos, la cantera y el ajo", () => {
    expect(new Set(casos.map((c) => c.gameId)).size).toBe(3);
    expect(casos.some((c) => c.legacy)).toBe(true);
    expect(casos.some((c) => c.mushroom.length > 0)).toBe(true);
    expect(casos.every((c) => c.lowest === 120 || c.mushroom.length === 0)).toBe(true);
    expect(casos.some((c) => c.quarryLevels.length > 0)).toBe(true);
    expect(casos.some((c) => c.garlic && c.quarryLevels.length > 0)).toBe(true);
    expect(casos.every((c) => !c.garlic || (c.infested.length === 0 && c.slime.length === 0))).toBe(true);
  });

  it("cada día: pisos infestados, de babas, de cantera y de hongos exactos", () => {
    for (const c of casos) {
      const nombre = `${c.gameId} día ${c.daysPlayed} hondo=${c.lowest} cantera=${c.quarry} ajo=${c.garlic}`;
      expect(predictMines({ gameId: c.gameId, legacy: c.legacy }, c.daysPlayed, 1, opciones(c)), nombre).toEqual([
        esperado(c),
      ]);
    }
  });

  it("varios días seguidos de una vez", () => {
    for (const lowest of [0, 120]) {
      const serie = casos.filter((c) => c.gameId === 390176213 && c.lowest === lowest && c.quarry && !c.garlic);
      expect(serie.length).toBe(30);
      const desde = serie[0].daysPlayed;
      expect(
        predictMines({ gameId: 390176213, legacy: false }, desde, 30, { lowestMineLevel: lowest, quarry: true }),
      ).toEqual(serie.map(esperado));
    }
  });
});
