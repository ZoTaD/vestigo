import { describe, expect, it } from "vitest";
import { mergeFiles, mergeTop, topSql, windowRowsSql, type RecordsFile, type Rec } from "../src/records";

const r = (m: number, a: number, v: number, t = 1000, h = 1): Rec => ({ m, a, h, v, t, d: 1800, w: true });

describe("récords: mezclar listas", () => {
  it("se queda con los mejores y, si empatan, con el que llegó primero", () => {
    const top = mergeTop([r(1, 1, 30, 50), r(2, 2, 20)], [r(3, 3, 30, 10), r(4, 4, 25)], 3);
    expect(top.map((x) => x.m)).toEqual([3, 1, 4]);
  });

  it("la misma partida del mismo jugador no entra dos veces (el margen relee días)", () => {
    const top = mergeTop([r(1, 1, 30)], [r(1, 1, 30), r(2, 2, 10)], 10);
    expect(top).toHaveLength(2);
  });

  it("una temporada nueva no hereda los récords de la anterior", () => {
    const vieja = { season: 1, world: { kills: [r(1, 1, 99)] }, heroes: {}, metrics: ["kills"] } as unknown as RecordsFile;
    const nueva = { generatedAt: "", season: 2, readTo: 0, metrics: ["kills"], world: { kills: [r(2, 2, 10)] }, heroes: {} } as unknown as RecordsFile;
    expect(mergeFiles(vieja, nueva).world.kills.map((x) => x.v)).toEqual([10]);
  });

  it("en la misma temporada suma lo publicado y lo nuevo, también por héroe", () => {
    const antes = { season: 2, world: { kills: [r(1, 1, 30)] }, heroes: { "7": { kills: [r(1, 1, 30, 1, 7)] } }, metrics: ["kills"] } as unknown as RecordsFile;
    const nuevo = {
      generatedAt: "",
      season: 2,
      readTo: 0,
      metrics: ["kills"],
      world: { kills: [r(5, 5, 40)] },
      heroes: { "7": { kills: [r(5, 5, 40, 2, 7)] }, "9": { kills: [r(6, 6, 12, 3, 9)] } },
    } as unknown as RecordsFile;
    const f = mergeFiles(antes, nuevo);
    expect(f.world.kills.map((x) => x.v)).toEqual([40, 30]);
    expect(f.heroes["7"].kills.map((x) => x.v)).toEqual([40, 30]);
    expect(f.heroes["9"].kills.map((x) => x.v)).toEqual([12]);
  });
});

describe("récords: SQL", () => {
  it("sólo clasificatorias normales de 15 minutos o más, dentro de la ventana", () => {
    const sql = windowRowsSql([5], 100, 200);
    expect(sql).toContain("match_mode = 'Ranked'");
    expect(sql).toContain("game_mode = 'Normal'");
    expect(sql).toContain("duration_s >= 900");
    expect(sql).toContain("to_timestamp(100)");
    expect(sql).toContain(`list_last("stats.player_damage")`);
  });

  it("el top por héroe parte por héroe y el del mundo no", () => {
    expect(topSql("kills", true)).toContain("partition by hero_id");
    expect(topSql("kills", false)).not.toContain("partition by");
  });
});
