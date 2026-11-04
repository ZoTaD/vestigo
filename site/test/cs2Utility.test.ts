/**
 * Granadas y Miras de CS2 (2026-11-04): los datos de lineups (que cada lineup apunte a un destino de su mapa, que el
 * setpos sea un comando válido y que todo esté traducido), el conversor de sensibilidad y la lectura de códigos de mira.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { encodeCrosshair } from "csgo-sharecode";
import { arrowPath } from "../src/cs2/grenades/Cs2Grenades";
import type { LineupIndex, MapLineups } from "../src/cs2/grenades/data";
import { fromCode, toV1 } from "../src/cs2/crosshairs/Cs2Crosshairs";
import { cm360, convert, edpiCs2, GAMES } from "../src/cs2/crosshairs/sens";

const DIR = new URL("../../games/cs2/data/lineups/", import.meta.url);
const read = <T>(f: string): T => JSON.parse(readFileSync(new URL(f, DIR), "utf-8"));

describe("los datos de Granadas", () => {
  const index = read<LineupIndex>("index.json");
  const maps = readdirSync(DIR).filter((f) => f !== "index.json" && f.endsWith(".json"));

  it("el índice nombra cada mapa y cuenta bien sus lineups", () => {
    expect(index.maps.map((m) => `${m.map}.json`).sort()).toEqual(maps.sort());
    for (const row of index.maps) {
      const m = read<MapLineups>(`${row.map}.json`);
      expect(m.lineups.length).toBe(row.count);
      expect(Object.values(row.counts).reduce((a, b) => a + b, 0)).toBe(row.count);
    }
  });

  it("cada lineup cae en un destino de su mapa, dentro del radar, con setpos y en los dos idiomas", () => {
    for (const f of maps) {
      const m = read<MapLineups>(f);
      const ids = new Set<string>();
      for (const d of m.dests) {
        expect(ids.has(d.id), `${f}: destino repetido ${d.id}`).toBe(false);
        ids.add(d.id);
        expect(d.name[1], `${f}: ${d.name[0]} sin español`).toBeTruthy();
      }
      for (const l of m.lineups) {
        expect(m.dests[l.dest], `${f}: ${l.id}`).toBeDefined();
        for (const v of [...l.from.slice(0, 2), ...l.to.slice(0, 2)]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1024);
        expect(l.setpos).toMatch(/^setpos -?\d+\.\d{2} -?\d+\.\d{2} -?\d+\.\d{2};setang -?\d+\.\d{2} -?\d+\.\d{2} 0$/);
        expect(l.title[1], `${f}: ${l.title[0]} sin español`).toBeTruthy();
        if (l.desc) expect(l.desc[1], `${f}: ${l.desc[0]} sin español`).toBeTruthy();
        expect(["t", "ct"]).toContain(l.side);
      }
    }
  });

  it("la flecha sale de donde se tira y termina donde cae", () => {
    expect(arrowPath({ from: [100, 200, 0], to: [400, 200, 0] })).toMatch(/^M100,200 Q[\d.-]+,[\d.-]+ 400,200$/);
  });
});

describe("el conversor de sensibilidad", () => {
  const [cs2, valorant, deadlock] = GAMES;
  it("una vuelta de CS2 a 1,25 y 800 DPI son 41,6 cm", () => {
    expect(cm360(1.25, 800, cs2.yaw)).toBeCloseTo(41.56, 2);
  });
  it("pasa entre juegos con la misma vuelta", () => {
    expect(convert(1, cs2, valorant)).toBeCloseTo(0.3143, 4);
    expect(convert(2, cs2, deadlock)).toBeCloseTo(1, 6);
    const v = convert(1.5, cs2, valorant);
    expect(cm360(v, 800, valorant.yaw)).toBeCloseTo(cm360(1.5, 800, cs2.yaw), 6);
  });
  it("el eDPI se mide en sensibilidad de CS2", () => {
    expect(edpiCs2(1.25, 800, cs2)).toBeCloseTo(1000, 6);
    expect(edpiCs2(0.4, 800, valorant)).toBeCloseTo(1018.18, 1);
  });
});

describe("los códigos de mira", () => {
  it("un código de CS2 se lee y se vuelve a armar igual", () => {
    const xh = { length: 3, gap: -2, thickness: 1, outline: 1, alpha: 200, color: [0, 255, 255] as [number, number, number], dot: true, tStyle: false, sh: 1440 };
    const code = encodeCrosshair(toV1(xh));
    expect(code.startsWith("CS")).toBe(true);
    const r = fromCode(code)!;
    expect(r.old).toBe(false);
    expect(r.xh).toEqual(xh);
    expect(encodeCrosshair(toV1(r.xh))).toBe(code);
  });
  it("un CSGO- de la época de CS:GO se pasa aproximado y avisa", () => {
    const r = fromCode("CSGO-kM6Tw-TY67b-6dF3W-Hutjm-Sr8rN")!;
    expect(r.old).toBe(true);
    expect(r.approx).toBe(true);
  });
  it("lo que no es un código no se lee", () => {
    expect(fromCode("hola")).toBeNull();
  });
});
