import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildingAt, buildingCell, defaultFloor, floorsOf, NO_INSET, roomTiles, sheetInset, shiftIntoView, type Building } from "../src/zomboid/map/buildings";
import { floorRooms, ROOM_NAMES, roomKey, roomName, splitWords, toneName } from "../src/zomboid/map/rooms";
import { MAP_COPY } from "../src/zomboid/map/copy";

/**
 * Los edificios del Mapa de Project Zomboid (2026-09-30, Task 4): al tocar uno se ve qué es, cuántos pisos tiene y, por
 * piso, sus habitaciones con su nombre y su tamaño. Los nombres de las habitaciones son los tipos de cuarto del juego
 * (`bedroom`, `livingroom`…): los más comunes van escritos a mano en inglés y en español, y el resto se muestra con el
 * nombre del juego separado en palabras. Se prueba con los `bld/<región>.json` reales.
 */
const WEB = join(__dirname, "..", "..", "games", "zomboid", "data", "map", "web");
const common = JSON.parse(readFileSync(join(WEB, "common.json"), "utf-8")) as { rooms: string[] };
const files = readdirSync(join(WEB, "bld")).filter((f) => f.endsWith(".json"));
const bld = (id: string) => JSON.parse(readFileSync(join(WEB, "bld", `${id}.json`), "utf-8")) as Building[];

/**
 * Cuántas habitaciones de cada tipo hay en todo el mapa (cada edificio una vez, aunque toque dos regiones). Las variantes
 * se juntan con la regla de siempre (minúsculas, sin `ww_`, sin el número del final) pero SIN mirar `ROOM_NAMES`: si se
 * juntara con `roomKey`, que sólo agrupa hacia claves que ya tienen nombre, un tipo frecuente sin traducir y partido en
 * variantes (`foo1`, `foo2`, `ww_foo`) quedaría repartido, caería debajo del corte y el test no lo vería.
 */
const plain = (raw: string) => raw.trim().toLowerCase().replace(/^ww_/, "").replace(/\d+$/, "");
function roomCounts(): Map<string, number> {
  const seen = new Set<string>();
  const n = new Map<string, number>();
  for (const f of files)
    for (const b of JSON.parse(readFileSync(join(WEB, "bld", f), "utf-8")) as Building[]) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      for (const rooms of Object.values(b.floors))
        for (const r of rooms) {
          const k = plain(common.rooms[r[0]]);
          n.set(k, (n.get(k) ?? 0) + 1);
        }
    }
  return n;
}
/** Los tipos que suman el 95 % de las habitaciones, del más frecuente al menos. */
function top95(): string[] {
  const counts = [...roomCounts()].sort((a, b) => b[1] - a[1]);
  const total = counts.reduce((s, [, v]) => s + v, 0);
  expect(total).toBeGreaterThan(80000);
  let acc = 0;
  const top: string[] = [];
  for (const [k, v] of counts) {
    if (acc / total >= 0.95) break;
    acc += v;
    top.push(k);
  }
  return top;
}

describe("los nombres de las habitaciones", () => {
  it("las que suman el 95 % de las habitaciones del mapa están escritas a mano, en los dos idiomas", () => {
    const top = top95();
    expect(top.length).toBeGreaterThan(40);
    // `roomKey` pasa los errores de tipeo del juego (`liviingroom`) a su clave; lo que queda tiene que tener nombre.
    const missing = top.filter((k) => !Object.hasOwn(ROOM_NAMES, roomKey(k)));
    expect(missing).toEqual([]);
    for (const k of top) {
      const [en, es] = ROOM_NAMES[roomKey(k)];
      expect(en.trim(), k).not.toBe("");
      expect(es.trim(), k).not.toBe("");
    }
  });

  it("ROOM_NAMES arranca con esos mismos tipos, del más frecuente al menos (el comentario de rooms.ts lo promete)", () => {
    const top = top95().map(roomKey);
    const written = Object.keys(ROOM_NAMES).slice(0, top.length);
    // Se compara como conjunto y por orden de frecuencia: dos tipos con la misma cantidad pueden ir en cualquier orden.
    expect([...written].sort()).toEqual([...top].sort());
    const counts = roomCounts();
    const freq = (k: string) => [...counts].filter(([raw]) => roomKey(raw) === k).reduce((s, [, v]) => s + v, 0);
    for (let i = 1; i < written.length; i++) expect(freq(written[i - 1]), `${written[i - 1]} antes de ${written[i]}`).toBeGreaterThanOrEqual(freq(written[i]));
  });

  it("en rioplatense: living, baño, cocina, dormitorio", () => {
    expect(roomName("livingroom", "es")).toBe("Living");
    expect(roomName("bathroom", "es")).toBe("Baño");
    expect(roomName("kitchen", "es")).toBe("Cocina");
    expect(roomName("bedroom", "es")).toBe("Dormitorio");
    expect(roomName("livingroom", "en")).toBe("Living room");
  });

  it("las variantes del juego van al mismo nombre: mayúsculas, número al final, prefijo ww_ y errores de tipeo", () => {
    expect(roomKey("Bathroom")).toBe("bathroom");
    expect(roomKey("bedroom4")).toBe("bedroom");
    expect(roomKey("kidsbedroom4")).toBe("kidsbedroom");
    expect(roomKey("ww_bedroom")).toBe("bedroom");
    expect(roomKey("liviingroom")).toBe("livingroom");
    expect(roomKey("breakoom")).toBe("breakroom");
    expect(roomName("Empty", "es")).toBe(roomName("empty", "es"));
  });

  it("las demás, con el nombre del juego separado en palabras cuando se puede", () => {
    expect(splitWords("gunstorestorage")).toBe("Gun store storage");
    expect(splitWords("jayschicken_dining")).toBe("Jays chicken dining");
    expect(splitWords("location_sewer_01_11")).toBe("Location sewer 01 11");
    // Lo que no se puede separar queda entero (con la primera en mayúscula), sin inventar palabras.
    expect(splitWords("xqzv")).toBe("Xqzv");
    expect(roomName("gunstorestorage", "es")).toBe("Gun store storage");
  });

  it("los tonos del juego (qué clase de edificio es) más comunes, traducidos; el resto separado en palabras", () => {
    expect(toneName("Farmhouse", "es")).toBe("Casa de chacra");
    expect(toneName("Bank", "es")).toBe("Banco");
    expect(toneName("HouseSuburb", "en")).toBe("Suburban house");
    expect(toneName("WaterpurificationOffice", "es")).toBe("Waterpurification Office");
  });
});

describe("el Knox Bank de Muldraugh", () => {
  const list = bld("7_6");
  const bank = buildingAt([list], 10623, 9685);

  it("es el edificio de esa casilla", () => {
    expect(bank).toMatchObject({ id: "41_37_45", name: "KnoxBank", tone: "Bank" });
  });

  it("tiene sótano, planta baja y primer piso, y arranca en la planta baja", () => {
    expect(floorsOf(bank!)).toEqual(["-1", "0", "1"]);
    expect(defaultFloor(bank!)).toBe("0");
  });

  it("la bóveda y las cajas de seguridad están en el sótano, agrupadas por tipo y de la más grande a la más chica", () => {
    const rooms = floorRooms(bank!, "-1", common.rooms);
    expect(rooms.map((r) => r.key)).toEqual(expect.arrayContaining(["vault", "depositboxes"]));
    expect(roomName("vault", "es")).toBe("Bóveda");
    for (let i = 1; i < rooms.length; i++) expect(rooms[i - 1].tiles).toBeGreaterThanOrEqual(rooms[i].tiles);
    const office = rooms.find((r) => r.key === "office")!;
    // La oficina del sótano: un cuarto en dos rectángulos (5×4 y 3×2).
    expect(office).toMatchObject({ count: 1, tiles: 26 });
    expect(office.rects).toEqual([
      [10623, 9700, 5, 4],
      [10623, 9704, 3, 2],
    ]);
  });

  it("dos habitaciones del mismo tipo en un piso son una línea con la cuenta y la suma", () => {
    const ground = floorRooms(bank!, "0", common.rooms);
    const empty = ground.find((r) => r.key === "empty")!;
    expect(empty).toMatchObject({ count: 2, tiles: 2 });
  });

  it("cada grupo trae los nombres del juego de sus habitaciones (para el botín, que va por nombre exacto)", () => {
    for (const floor of floorsOf(bank!))
      for (const g of floorRooms(bank!, floor, common.rooms)) {
        expect(g.raws.length, `${floor} ${g.key}`).toBeGreaterThan(0);
        expect(new Set(g.raws).size).toBe(g.raws.length);
        for (const raw of g.raws) expect(roomKey(raw), raw).toBe(g.key);
      }
  });
});

describe("encontrar el edificio tocado", () => {
  const b = (id: string, floors: Building["floors"], box: Building["box"] = [0, 0, 100, 100]): Building => ({ id, box, floors });

  it("el tamaño de una habitación son sus casillas", () => {
    expect(roomTiles([3, 0, 0, 5, 4, 10, 10, 3, 2])).toBe(26);
  });

  it("cuenta la casilla dentro de un cuarto de cualquier piso, no la caja", () => {
    const l = [b("a", { "0": [[0, 10, 10, 5, 5]] }), b("b", { "1": [[0, 30, 30, 2, 2]] })];
    expect(buildingAt([l], 12, 14)?.id).toBe("a");
    expect(buildingAt([l], 31, 31)?.id).toBe("b");
    // Borde derecho: x + ancho ya es la casilla de al lado.
    expect(buildingAt([l], 15, 12)).toBeNull();
    expect(buildingAt([l], 50, 50)).toBeNull();
  });

  it("si dos edificios se pisan, gana el más chico (el de adentro); un edificio en dos regiones cuenta una vez", () => {
    const big = b("big", { "0": [[0, 0, 0, 50, 50]] }, [0, 0, 50, 50]);
    const small = b("small", { "0": [[0, 10, 10, 4, 4]] }, [10, 10, 14, 14]);
    expect(buildingAt([[big], [small, big]], 11, 11)?.id).toBe("small");
  });

  it("el id dice su celda de 256 casillas (para abrir un link con `edificio=`)", () => {
    expect(buildingCell("41_37_45")).toEqual([10496, 9472, 10752, 9728]);
    expect(buildingCell("nada")).toBeNull();
  });
});

describe("los textos de la hoja del edificio", () => {
  it("los pisos: planta baja, pisos y sótanos", () => {
    expect(MAP_COPY.es.building.floor("0")).toBe("Planta baja");
    expect(MAP_COPY.es.building.floor("2")).toBe("Piso 2");
    expect(MAP_COPY.es.building.floor("-1")).toBe("Sótano");
    expect(MAP_COPY.es.building.floor("-2")).toBe("Sótano 2");
    expect(MAP_COPY.en.building.floor("0")).toBe("Ground floor");
    expect(MAP_COPY.en.building.floor("-1")).toBe("Basement");
  });
});

describe("que la hoja no tape el edificio", () => {
  // El caso medido a 375 px: mapa de 0 a 375 de ancho y de 100 a 672 de alto; la hoja, de y 293 a 632, a lo ancho.
  const map = { left: 0, top: 100, right: 375, bottom: 672 };
  const sheetBottom = { left: 10, top: 393, right: 365, bottom: 662 };
  const view = { width: 375, height: 572 };

  it("en el celular la hoja va abajo y tapa desde su borde de arriba hasta el pie del mapa (más un respiro)", () => {
    expect(sheetInset(sheetBottom, map)).toEqual({ ...NO_INSET, bottom: 672 - 393 + 10 });
  });

  it("en el escritorio angosto la hoja va a la derecha y tapa desde su borde izquierdo", () => {
    const side = { left: 560, top: 116, right: 860, bottom: 500 };
    expect(sheetInset(side, { left: 0, top: 100, right: 876, bottom: 700 })).toEqual({ ...NO_INSET, right: 876 - 560 + 10 });
  });

  it("escritorio angosto (~870 px): una hoja lateral del 74 % del mapa sigue siendo lateral, no la del celular", () => {
    // Medido a 870 px: mapa de 410 de ancho (y 548 a 1156), hoja de 304 pegada a la derecha y a 16 px del borde de arriba.
    const narrow = { left: 0, top: 548, right: 410, bottom: 1156 };
    const side = { left: 90, top: 564, right: 394, bottom: 1000 };
    expect(sheetInset(side, narrow)).toEqual({ ...NO_INSET, right: 410 - 90 + 10 });
  });

  it("el celular sigue siendo celular: pegada a los dos lados aunque sea baja", () => {
    const low = { left: 10, top: 560, right: 365, bottom: 662 };
    expect(sheetInset(low, map)).toEqual({ ...NO_INSET, bottom: 672 - 560 + 10 });
  });

  it("sin hoja no tapa nada", () => {
    expect(sheetInset(null, map)).toEqual(NO_INSET);
  });

  it("el edificio que llega al centro y queda abajo de la hoja se sube hasta lo libre", () => {
    // Centrado en el mapa de 572 de alto: y 286 ± 15. Lo libre llega a 572 - 289 = 283.
    const inset = sheetInset(sheetBottom, map);
    const box = { left: 170, top: 271, right: 205, bottom: 301 };
    const [dx, dy] = shiftIntoView(box, view, inset);
    expect(dx).toBe(0);
    // Sube hasta que el borde de abajo (301) llegue a 283: el mapa se corre 18 hacia abajo.
    expect(dy).toBe(301 - (572 - inset.bottom));
    expect(301 - dy).toBeLessThanOrEqual(572 - inset.bottom);
  });

  it("si ya se ve entero en lo libre, no se mueve", () => {
    expect(shiftIntoView({ left: 100, top: 20, right: 150, bottom: 80 }, view, sheetInset(sheetBottom, map))).toEqual([0, 0]);
  });

  it("si la hoja tapa todo el eje (sin espacio libre), no mueve nada", () => {
    expect(shiftIntoView({ left: 100, top: 20, right: 150, bottom: 80 }, view, { ...NO_INSET, bottom: 600 })).toEqual([0, 0]);
    expect(shiftIntoView({ left: 100, top: 20, right: 150, bottom: 80 }, view, { ...NO_INSET, right: 375 })).toEqual([0, 0]);
  });

  it("a la derecha: se corre a lo ancho; y si no entra, queda centrado en lo libre", () => {
    expect(shiftIntoView({ left: 520, top: 50, right: 580, bottom: 90 }, { width: 876, height: 600 }, { ...NO_INSET, right: 326 })).toEqual([30, 0]);
    const [dx] = shiftIntoView({ left: 0, top: 0, right: 800, bottom: 50 }, { width: 876, height: 600 }, { ...NO_INSET, right: 326 });
    expect(dx).toBe(400 - 275);
  });
});
