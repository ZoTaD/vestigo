import { describe, expect, it } from "vitest";
import drops from "../../games/d2r/data/drops/drops.json";
import index from "../../games/d2r/data/drops/index.json";

/**
 * Los datos de la calculadora de drops (2026-09-29): si un parche o un cambio
 * en drops.py rompe una referencia, esto avisa antes que la calculadora.
 */
type RawTc = { p: number; e: [string, number, number[]?][]; g?: number; l?: number };
const D = drops as unknown as {
  tcs: Record<string, RawTc>;
  bases: Record<string, { q: number; qf: number; n: { en: string; es: string } }>;
  uniques: { id: string; key: string; code: string; f?: number }[];
  sets: { id: string; set: string; key: string; code: string }[];
  monsters: Record<string, { tc: string[][] }>;
  areas: { id: number }[];
  sources: { id: string; mon: string; area: number | null; tc?: string[] }[];
  tz: { b: number[][]; boost: number; heraldTc: number[]; maxTier: number };
};

describe("datos de la calculadora de drops", () => {
  const uniqueKeys = new Set(D.uniques.map((u) => u.key));
  const setKeys = new Set(D.sets.map((x) => x.key));

  it("cada entrada de cada TC es otra TC, una base, oro, o un único o pieza por nombre", () => {
    const bad = Object.entries(D.tcs).flatMap(([name, tc]) =>
      tc.e.filter(([t]) => !D.tcs[t] && !D.bases[t] && t !== "gld" && !uniqueKeys.has(t) && !setKeys.has(t)).map(([t]) => `${name} → ${t}`),
    );
    expect(bad).toEqual([]);
  });

  it("las TCs automáticas de armas y armaduras existen", () => {
    expect(D.tcs.weap3.e.length).toBeGreaterThan(0);
    expect(D.tcs.armo3.e.length).toBeGreaterThan(0);
    expect(D.tcs.armo60.e.some(([code]) => code === "uap")).toBe(true); // el Shako (qlvl 58) está entre 58 y 60
  });

  it("Mefisto tira 7 veces y la Condesa tiene tiradas negativas", () => {
    expect(D.tcs["Mephisto (H)"].p).toBe(7);
    expect(D.tcs["Countess (H)"].p).toBe(-2);
  });

  it("cada jefe y superúnico apunta a un área que existe y tiene de dónde soltar", () => {
    const areas = new Set(D.areas.map((a) => a.id));
    for (const s of D.sources) {
      if (s.area !== null) expect(areas.has(s.area), s.id).toBe(true);
      const tc = s.tc ? s.tc[2] : D.monsters[s.mon].tc[2][0];
      expect(D.tcs[tc], `${s.id}: ${tc}`).toBeDefined();
    }
    expect(D.sources.map((s) => s.id)).toEqual(expect.arrayContaining(["mephisto", "baal", "the-countess", "pindleskin", "diablo-clone"]));
  });

  it("el Clon de Diablo sólo suelta en Infierno (el juego le da TC en las tres dificultades)", () => {
    const clone = D.sources.find((s) => s.id === "diablo-clone")!;
    expect(clone.tc?.slice(0, 2)).toEqual(["", ""]);
    expect(D.tcs[clone.tc![2]]).toBeDefined();
  });

  it("los únicos del sorteo tienen el id de la wiki y los de nombre fijo van aparte", () => {
    const pool = D.uniques.filter((u) => !u.f);
    expect(pool).toHaveLength(403);
    expect(pool.find((u) => u.key === "Harlequin Crest")?.id).toBe("harlequin-crest");
    expect(D.sets.find((x) => x.key === "Tal Rasha's Howling Wind")?.id).toBe("tal-rashas-guardianship");
  });

  it("runas siempre normales, anillos mínimo mágicos, talismanes nunca raros", () => {
    expect(D.bases.r30.qf).toBe(1);
    expect(D.bases.rin.qf).toBe(2);
    expect(D.bases.cm3.qf).toBe(3);
    expect(D.bases.uap.qf).toBe(0);
  });

  it("Zonas de Terror: nivel del jugador + 2, con los topes de Infierno y los Heraldos de RotW", () => {
    expect(D.tz.boost).toBe(2);
    expect(D.tz.b[2]).toEqual([70, 96]);
    expect(D.tz.maxTier).toBe(5);
  });

  it("el índice de fichas no repite ids y todas son de la pestaña drops", () => {
    const ids = (index as { sec: string; id: string }[]).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((index as { sec: string }[]).every((e) => e.sec === "drops")).toBe(true);
  });

  it("las TCs automáticas pesan por la Rarity de su tipo (no la de la base) y las bandas sin bases quedan vacías", () => {
    const w = Object.fromEntries(D.tcs.armo60.e.map(([code, weight]) => [code, weight]));
    expect(w.uap).toBe(3); // el Shako: su rarity en armor.txt es 1, pero los cascos pesan 3
    expect(w.bab).toBe(1); // el yelmo de Bárbaro es de una clase: pesa 1
    expect(D.tcs.mele3.e.length).toBeGreaterThan(0);
    expect(D.tcs.bow3.e.length).toBeGreaterThan(0);
    expect(D.tcs.bow15).toEqual({ p: 1, e: [] }); // no hay arcos de nivel 13 a 15, pero los monstruos nombran la banda
  });
});

import farmU from "../../games/d2r/data/drops/computed/farm-u.json";
import farmS from "../../games/d2r/data/drops/computed/farm-s.json";
import farmR from "../../games/d2r/data/drops/computed/farm-r.json";
import places from "../../games/d2r/data/drops/computed/places.json";
import { dropData } from "../src/d2r/drops/data";
import { parsePlaceKey, type FarmFile } from "../src/d2r/drops/farm";
import { farmEntry } from "../src/d2r/drops/farmEntry";
import { ladderOk } from "../src/d2r/drops/rules";
import type { Target } from "../src/d2r/drops/types";
import { SEASON } from "../src/d2r/season";

/**
 * Los bloques los escribe `scripts/d2-drops.ts` (`npm run d2:drops`) con el motor y la temporada de hoy. Si alguien regenera
 * `drops.json` después de un parche, toca el motor o cambia `SEASON` sin volver a correr el script, las fichas publicarían números
 * viejos: estos tests lo atrapan.
 */
describe("los bloques 'Dónde farmearlo' precalculados", () => {
  const U = farmU as unknown as FarmFile;
  const S = farmS as unknown as FarmFile;
  const R = farmR as unknown as FarmFile;
  const P = places as unknown as { s: Record<string, unknown>; a: Record<string, unknown> };
  const all = () => [...Object.values(U), ...Object.values(S), ...Object.values(R)];

  it("cada lugar tiene nombre, y places.json trae sólo los que usan los bloques (va entero a cada ficha de la wiki)", () => {
    const used = { s: new Set<string>(), a: new Set<string>() };
    for (const e of all()) {
      for (const [key] of e.b) used.s.add(parsePlaceKey(key).id);
      for (const [key] of e.a) used.a.add(parsePlaceKey(key).id);
    }
    expect(Object.keys(P.s).sort()).toEqual([...used.s].sort());
    expect(Object.keys(P.a).sort()).toEqual([...used.a].sort());
  });

  it("la Cresta del arlequín: un jefe grande de Infierno primero; Ist: la Condesa", () => {
    expect(["mephisto", "diablo", "baal"]).toContain(parsePlaceKey(U["harlequin-crest"].b[0][0]).id);
    expect(parsePlaceKey(R.r24.b[0][0]).id).toBe("the-countess");
  });

  it("cada único, pieza y runa tiene su entrada", () => {
    expect(Object.keys(U).sort()).toEqual(D.uniques.map((u) => u.id).sort());
    expect(Object.keys(S).sort()).toEqual(D.sets.map((x) => x.id).sort());
    expect(Object.keys(R)).toHaveLength(33);
  });

  it("lo que esta temporada sólo cae en Clasificación, y sólo eso, se calculó en Clasificación (`l: 1`) y tiene dónde farmearse", () => {
    // Un invariante y no los ítems de la temporada 15: al cambiar `SEASON` sin regenerar, esto se pone en rojo.
    for (const x of dropData().uniques) expect(!!U[x.id].l, x.id).toBe(!ladderOk(x.lad, false, SEASON));
    for (const x of dropData().sets) expect(!!S[x.id].l, x.id).toBe(!ladderOk(x.lad, false, SEASON));
    for (const e of all()) if (e.l) expect(e.b.length).toBeGreaterThan(0);
  });

  it("salen del motor de hoy: cuatro entradas recalculadas como las calcula el script dan exactamente lo mismo", () => {
    const DD = dropData();
    // El primer ítem que esta temporada sólo cae en Clasificación, si hay alguno: se calcula con Clasificación prendida.
    const ladderOnly =
      DD.uniques.filter((u) => !ladderOk(u.lad, false, SEASON)).map((u) => [U, u.id, { k: "u", id: u.id }, u.lad] as const)[0] ??
      DD.sets.filter((x) => !ladderOk(x.lad, false, SEASON)).map((x) => [S, x.id, { k: "s", id: x.id }, x.lad] as const)[0];
    const cases: (readonly [FarmFile, string, Target, [number, number]?])[] = [
      [U, "harlequin-crest", { k: "u", id: "harlequin-crest" }],
      [R, "r24", { k: "b", code: "r24" }],
      [S, "tal-rashas-guardianship", { k: "s", id: "tal-rashas-guardianship" }],
      ...(ladderOnly ? [ladderOnly] : []),
    ];
    for (const [file, id, target, lad] of cases) expect(farmEntry(DD, target, SEASON, lad), id).toEqual(file[id]);
  });
});
