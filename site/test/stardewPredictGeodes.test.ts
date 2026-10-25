// Geodas y cajas misteriosas contra el juego real: cada caso de `geodes.json` lo
// escribió el oráculo (`games/stardew/tools/oracle`, comando `geodes`) llamando a
// `Utility.getTreasureFromGeode` con el flujo del yunque de Clint.
import { describe, expect, it } from "vitest";
import fx from "./fixtures/stardew-predict/geodes.json";
import raw from "../../games/stardew/data/predict.json";
import { predictGeodes, type GeodeKind, type GeodeState } from "../src/stardew/predict/geodes";
import type { PredictData } from "../src/stardew/predict/query";
import { uidHalf } from "../src/stardew/save/parse";

const data = raw as unknown as PredictData;

interface Caso {
  kind: GeodeKind;
  gameId: number;
  legacy: boolean;
  uid: string;
  uidHalf: number;
  geodesCracked: number;
  mysteryBoxesOpened: number;
  deepestMineLevel: number;
  fishingLevel: number;
  season: 0 | 1 | 2 | 3;
  day: number;
  mail: string[];
  mastery0: number;
  qiBeans: boolean;
  goldenCoconutCracked: boolean;
  count: number;
  drops: string[];
}

const casos = fx.cases as Caso[];

function estado(c: Caso): GeodeState {
  return {
    seed: { gameId: c.gameId, legacy: c.legacy },
    uidHalf: c.uidHalf,
    geodesCracked: c.geodesCracked,
    mysteryBoxesOpened: c.mysteryBoxesOpened,
    deepestMineLevel: c.deepestMineLevel,
    fishingLevel: c.fishingLevel,
    season: c.season,
    day: c.day,
    mail: c.mail,
    mastery0: c.mastery0,
    bookMystery: 0,
    qiBeans: c.qiBeans,
    goldenCoconutCracked: c.goldenCoconutCracked,
  };
}

describe("predictGeodes contra el juego", () => {
  it("el fixture tiene todos los tipos y muchas aperturas", () => {
    const tipos = new Set(casos.map((c) => c.kind));
    expect([...tipos].sort()).toEqual(["275", "535", "536", "537", "749", "791", "GoldenMysteryBox", "MysteryBox"]);
    expect(casos.reduce((s, c) => s + c.drops.length, 0)).toBeGreaterThan(10000);
  });

  it("predict.json tiene los objetos en el orden de Game1.objectData", () => {
    expect(data.objects.map((o) => o[0])).toEqual(fx.objectOrder);
  });

  it("uidHalf del lector coincide con el (int)uid / 2 del juego", () => {
    for (const c of casos) expect(uidHalf(c.uid)).toBe(c.uidHalf);
  });

  it("cada apertura da el mismo premio y la misma cantidad", () => {
    let azar = 0;
    for (const c of casos) {
      const got = predictGeodes(c.kind, estado(c), data, c.count);
      expect(got).toHaveLength(c.count);
      c.drops.forEach((d, i) => {
        const corte = d.lastIndexOf(" ");
        const id = d.slice(0, corte);
        const qty = Number(d.slice(corte + 1));
        const p = got[i];
        const donde = `${c.kind} partida ${c.gameId} geodas ${c.geodesCracked} cajas ${c.mysteryBoxesOpened} apertura ${i + 1}`;
        expect(p.qty, donde).toBe(qty);
        if (p.oneOf) {
          // Cosecha de baja calidad: el juego la elige con Game1.random.
          azar++;
          expect(p.oneOf, donde).toContain(id);
          expect(p.id, donde).toBe("");
        } else {
          expect(p.id, donde).toBe(id);
        }
      });
    }
    // Lo que no se puede saber es poco y sólo de las cajas.
    expect(azar).toBeGreaterThan(0);
    expect(azar).toBeLessThan(800);
  });

  it("sin el día, la semilla del mapache sale como una de las dos posibles", () => {
    // Casos con día cambiado: lo que da el juego tiene que estar en oneOf, y nada más cambia.
    let semillas = 0;
    for (const c of casos.filter((x) => x.kind === "GoldenMysteryBox")) {
      const conDia = predictGeodes(c.kind, estado(c), data, c.count);
      const sinDia = predictGeodes(c.kind, { ...estado(c), day: undefined }, data, c.count);
      c.drops.forEach((d, i) => {
        const id = d.slice(0, d.lastIndexOf(" "));
        if (/Seeds$/.test(id) && sinDia[i].oneOf && !conDia[i].oneOf) {
          semillas++;
          expect(sinDia[i].id).toBe("");
          expect(sinDia[i].qty).toBe(8);
          expect(sinDia[i].oneOf).toContain(id);
          expect(sinDia[i].oneOf).toHaveLength(2);
        } else {
          expect(sinDia[i]).toEqual(conDia[i]);
        }
      });
    }
    expect(semillas).toBeGreaterThan(10);
  });

  it("con count 0 no abre nada", () => {
    expect(predictGeodes("535", estado(casos[0]), data, 0)).toEqual([]);
  });
});
