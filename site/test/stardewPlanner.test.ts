import { describe, expect, it } from "vitest";
import data from "../../games/stardew/data/planner.json";
import {
  BUILD,
  Board,
  FLOOR,
  HOE,
  OBJ,
  TREE,
  coverage,
  decodePlan,
  deserialize,
  encodePlan,
  erase,
  lines,
  place,
  rangeTiles,
  serialize,
  totals,
  type Farm,
  type PlannerData,
  type PlannerItem,
} from "../src/stardew/planner/model";

const D = data as PlannerData;
const ITEMS = new Map(D.items.map((it) => [it.id, it]));
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Una granja de prueba de `w`×`h` donde todas las casillas tienen los mismos bits. */
function farm(w: number, h: number, bits = HOE | OBJ | FLOOR | BUILD | TREE, fixed: Farm["fixed"] = []): Farm {
  return { key: "T", map: "T", name: ["T", "T"], w, h, grid: ALPHABET[bits].repeat(w * h), fixed, img: "" };
}
const board = (f: Farm, placed = [] as { id: string; x: number; y: number }[]) => new Board(f, ITEMS, placed);
const item = (id: string): PlannerItem => ITEMS.get(id)!;

describe("planificador: alcances del juego", () => {
  it("aspersores: 4 vecinas, 3×3 y 5×5; la boquilla suma uno", () => {
    expect(rangeTiles(item("599"), 5, 5)).toHaveLength(4);
    expect(rangeTiles(item("599+915"), 5, 5)).toHaveLength(9);
    expect(rangeTiles(item("621"), 5, 5)).toHaveLength(9);
    expect(rangeTiles(item("645"), 5, 5)).toHaveLength(25);
    expect(rangeTiles(item("645+915"), 5, 5)).toHaveLength(49);
  });

  it("espantapájaros: distancia < 9 (249 casillas con la suya); el de lujo < 17", () => {
    expect(rangeTiles(item("(BC)8"), 0, 0)).toHaveLength(249);
    expect(rangeTiles(item("(BC)8"), 0, 0)).not.toContainEqual([9, 0]);
    expect(rangeTiles(item("(BC)8"), 0, 0)).toContainEqual([8, 0]);
    expect(rangeTiles(item("(BC)167"), 0, 0)).toContainEqual([16, 0]);
  });

  it("colmena: Manhattan ≤ 5; cabaña junimo: 17×17 desde la casilla del medio", () => {
    expect(rangeTiles(item("(BC)10"), 0, 0)).toHaveLength(60);
    const j = rangeTiles(item("B:Junimo Hut"), 10, 10);
    expect(j).toHaveLength(17 * 17);
    expect(j).toContainEqual([3, 3]);
    expect(j).toContainEqual([19, 19]);
  });
});

describe("planificador: dónde se puede colocar", () => {
  it("un cultivo pide azada y nada encima; un aspersor va sobre un piso pero no sobre un cultivo", () => {
    let b = board(farm(10, 10));
    expect(b.canPlace(item("472"), 1, 1)).toBe(true);
    b = board(b.farm, place(b, "472", 1, 1));
    expect(b.canPlace(item("472"), 1, 1)).toBe(false);
    expect(b.canPlace(item("599"), 1, 1)).toBe(false);
    b = board(b.farm, place(b, "328", 2, 2)); // piso de madera
    expect(b.canPlace(item("599"), 2, 2)).toBe(true);
    expect(b.canPlace(item("472"), 2, 2)).toBe(false);
    expect(board(farm(4, 4, OBJ)).canPlace(item("472"), 1, 1)).toBe(false);
  });

  it("un edificio pide toda su huella edificable y libre, y los edificios fijos ocupan", () => {
    const coop = item("B:Coop");
    const f = farm(12, 12, HOE | OBJ | FLOOR | BUILD, [{ key: "Farmhouse", x: 8, y: 0, w: 4, h: 3, name: ["", ""] }]);
    let b = board(f);
    expect(b.canPlace(coop, 0, 0)).toBe(true);
    expect(b.canPlace(coop, 7, 0)).toBe(false); // pisa la casa
    expect(b.canPlace(coop, 10, 10)).toBe(false); // se sale del mapa
    b = board(f, place(b, "472", 3, 1));
    expect(b.canPlace(coop, 0, 0)).toBe(false); // hay un cultivo en la huella
  });

  it("un frutal: sin otro frutal a 2 casillas y con las 8 de alrededor libres", () => {
    let b = board(farm(12, 12));
    expect(b.canPlace(item("628"), 5, 5)).toBe(true);
    b = board(b.farm, place(b, "628", 5, 5));
    expect(b.canPlace(item("628"), 7, 5)).toBe(false);
    expect(b.canPlace(item("628"), 8, 5)).toBe(true);
    b = board(b.farm, place(b, "599", 4, 4));
    expect(coverage(b).blocked).toEqual([0]);
  });

  it("los aspersores no van donde el mapa dice NoSprinklers", () => {
    expect(board(farm(4, 4, OBJ | 16)).canPlace(item("599"), 1, 1)).toBe(false);
    expect(board(farm(4, 4, OBJ | 16)).canPlace(item("(BC)12"), 1, 1)).toBe(true);
  });

  it("borrar saca lo de arriba primero", () => {
    let b = board(farm(6, 6));
    b = board(b.farm, place(b, "328", 1, 1));
    b = board(b.farm, place(b, "599", 1, 1));
    b = board(b.farm, erase(b, 1, 1));
    expect(b.placed).toEqual([{ id: "328", x: 1, y: 1 }]);
  });
});

describe("planificador: riego, cuervos y cuenta", () => {
  it("cuenta los cultivos sin riego y sin espantapájaros", () => {
    let b = board(farm(30, 30));
    for (const [x, y] of [[5, 4], [5, 6], [20, 20]]) b = board(b.farm, place(b, "472", x, y));
    b = board(b.farm, place(b, "599", 5, 5));
    b = board(b.farm, place(b, "(BC)8", 5, 10));
    const c = coverage(b);
    expect(c.dry).toEqual([2]);
    expect(c.exposed).toEqual([2]);
  });

  it("suma semillas, obra y materiales", () => {
    const t = totals(lines(D.items, [{ id: "472", x: 0, y: 0 }, { id: "472", x: 1, y: 0 }, { id: "621", x: 3, y: 0 }, { id: "B:Coop", x: 5, y: 5 }]));
    expect(t.seeds).toBe(40);
    expect(t.build).toBe(item("B:Coop").cost);
    const mats = Object.fromEntries(t.mats);
    expect(mats["335"]).toBe(1); // lingote de hierro del aspersor de calidad
  });
});

describe("planificador: datos y enlace", () => {
  it("las 8 granjas tienen grilla completa y la estándar se puede arar", () => {
    expect(D.farms).toHaveLength(8);
    for (const f of D.farms) expect(f.grid).toHaveLength(f.w * f.h);
    const std = board(D.farms[0]);
    expect(std.has(30, 30, HOE)).toBe(true);
    expect(std.isFixed(60, 13)).toBe(true); // la casa
  });

  it("serializa y vuelve igual, y descarta lo que ya no existe", async () => {
    const std = D.farms[0];
    let b = board(std);
    for (const [id, x, y] of [["472", 30, 30], ["472", 31, 30], ["599", 30, 31], ["B:Coop", 40, 40]] as const) b = board(std, place(b, id, x, y));
    const s = { farm: std.key, season: 1 as const, placed: b.placed };
    expect(deserialize(serialize(s), D)).toEqual(s);
    expect(deserialize("1|Farm_Standard|0|nada:1.1;472:30.30", D)?.placed).toEqual([{ id: "472", x: 30, y: 30 }]);
    expect(deserialize("9|x", D)).toBeNull();
    const hash = await encodePlan(s);
    expect(hash).toMatch(/^p=[\w-]+$/);
    expect(await decodePlan(`#${hash}`, D)).toEqual(s);
  });
});
