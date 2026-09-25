/// <reference types="node" />
/**
 * El lector de partidas sin archivos reales: cada formato se arma acá con un
 * escritor mínimo de ZPackage (little-endian, strings con largo de 7 bits) y
 * se comprime con zlib de Node, que es lo mismo que hace el juego (gzip).
 */
import { deflateRawSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import locationsJson from "@valheimMap/locations.json";
import { stableHashCode } from "../engine/stableHash";
import { gunzip, inflateRaw } from "./inflate";
import { PackageReader } from "./package";
import { readZdos, type Zdo } from "./zdo";
import { parsePlayerMap, parseSharedMap, exploredFraction } from "./mapData";
import { LOCATION_PREFABS } from "./locationNames";
import { readCharacter, readWorld, unzip, type InputFile } from "./index";

/** Escritor de ZPackage para armar archivos de prueba. */
class W {
  private a: number[] = [];
  private tmp = new DataView(new ArrayBuffer(8));
  byte(v: number) { this.a.push(v & 255); return this; }
  bool(v: boolean) { return this.byte(v ? 1 : 0); }
  short(v: number) { return this.byte(v).byte(v >> 8); }
  int(v: number) { return this.byte(v).byte(v >> 8).byte(v >> 16).byte(v >> 24); }
  long(v: bigint) { this.tmp.setBigInt64(0, v, true); for (let i = 0; i < 8; i++) this.byte(this.tmp.getUint8(i)); return this; }
  float(v: number) { this.tmp.setFloat32(0, v, true); for (let i = 0; i < 4; i++) this.byte(this.tmp.getUint8(i)); return this; }
  vec3(x: number, y: number, z: number) { return this.float(x).float(y).float(z); }
  str(s: string) {
    const b = new TextEncoder().encode(s);
    let n = b.length;
    do { this.byte((n & 0x7f) | (n > 0x7f ? 0x80 : 0)); n >>>= 7; } while (n);
    return this.raw(b);
  }
  raw(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.a.push(b[i]); return this; }
  arr(b: Uint8Array) { return this.int(b.length).raw(b); }
  numItems(n: number) { return n < 128 ? this.byte(n) : this.byte(0x80 | (n >> 8)).byte(n); }
  get u8() { return Uint8Array.from(this.a); }
}

const gz = (b: Uint8Array) => new Uint8Array(gzipSync(b));
const file = (path: string, data: Uint8Array): InputFile => ({ name: path.split("/").pop()!, path, data });
const H = stableHashCode;
/** Igualdad de bytes sin `toEqual`, que con 16 MB se queda sin memoria. */
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

describe("inflate", () => {
  it("gzip de datos al azar, de ceros y bloques guardados", () => {
    const rnd = new Uint8Array(100_000);
    let s = 12345;
    for (let i = 0; i < rnd.length; i++) { s = (Math.imul(s, 1103515245) + 12345) | 0; rnd[i] = (s >>> 16) & 3 ? s >>> 24 : 7; }
    expect(same(gunzip(gz(rnd)), rnd)).toBe(true);
    const zeros = new Uint8Array(4 * 2048 * 2048);
    zeros[123_456] = 1;
    expect(same(gunzip(new Uint8Array(gzipSync(zeros, { level: 9 }))), zeros)).toBe(true);
    const text = new TextEncoder().encode("Valheim ".repeat(5000));
    expect(same(inflateRaw(new Uint8Array(deflateRawSync(text, { level: 0 }))), text)).toBe(true);
    expect(same(inflateRaw(new Uint8Array(deflateRawSync(text.subarray(0, 50), { level: 1 }))), text.subarray(0, 50))).toBe(true);
  });
  it("rechaza lo que no es gzip", () => {
    expect(() => gunzip(new Uint8Array(40))).toThrow(/gzip/);
  });
});

describe("PackageReader", () => {
  it("lee los tipos de ZPackage", () => {
    const long = "ñandú ".repeat(40); // > 127 bytes: el largo ocupa dos bytes
    const b = new W().int(-5).short(-2).long(-2222222n).float(1.5).str(long).str("").numItems(5).numItems(300).bool(true).u8;
    const p = new PackageReader(b);
    expect(p.readInt()).toBe(-5);
    expect(p.readShort()).toBe(-2);
    expect(p.readLong()).toBe(-2222222n);
    expect(p.readSingle()).toBe(1.5);
    expect(p.readString()).toBe(long);
    expect(p.readString()).toBe("");
    expect(p.readNumItems()).toBe(5);
    expect(p.readNumItems()).toBe(300);
    expect(p.readBool()).toBe(true);
    expect(() => p.expectEnd("x")).not.toThrow();
    expect(() => p.readByte()).toThrow(/truncado/);
  });
});

/** Un ZDO de 1.0 (versión ≥ 40). */
function zdo(w: W, o: {
  prefab: string; x: number; y?: number; z: number; small?: boolean; rot?: "y" | "full";
  strings?: [string, string][]; longs?: [string, bigint][]; bytes?: [string, Uint8Array][]; junk?: boolean;
}) {
  let flags = 0;
  if (o.junk) flags |= 1 | 2 | 4 | 8 | 16;
  if (o.longs?.length) flags |= 32;
  if (o.strings?.length) flags |= 64;
  if (o.bytes?.length) flags |= 128;
  if (o.rot) flags |= 4096;
  if (o.small) flags |= 8192;
  w.short(flags | 256);
  if (o.small) w.short(o.x).short(o.z); else w.vec3(o.x, o.y ?? 30, o.z);
  w.int(H(o.prefab));
  if (o.rot === "y") w.short(0x8000 | 180); else if (o.rot === "full") w.short(1).short(2);
  if (o.junk) {
    w.byte(1).int(99); // conexión
    w.numItems(1).int(H("health")).float(100);
    w.numItems(1).int(H("spawnpoint")).vec3(1, 2, 3);
    w.numItems(1).int(H("rot")).float(0).float(0).float(0).float(1);
    w.numItems(2).int(H("state")).int(3).int(H("seed")).int(7);
  }
  if (o.longs?.length) { w.numItems(o.longs.length); for (const [k, v] of o.longs) w.int(H(k)).long(v); }
  if (o.strings?.length) { w.numItems(o.strings.length); for (const [k, v] of o.strings) w.int(H(k)).str(v); }
  if (o.bytes?.length) { w.numItems(o.bytes.length); for (const [k, v] of o.bytes) w.int(H(k)).arr(v); }
}

/** Un mapa compartido (`GetSharedMapData`, versión 3) de `size`² celdas. */
function sharedMap(size: number, explored: number[], pins: { owner: bigint; name: string; x: number; z: number; type: number; author: string }[]) {
  const w = new W().int(3).int(size * size);
  const cells = new Uint8Array(size * size);
  for (const i of explored) cells[i] = 1;
  w.raw(cells).int(pins.length);
  for (const p of pins) w.long(p.owner).str(p.name).vec3(p.x, 0, p.z).int(p.type).bool(false).str(p.author);
  return gz(w.u8);
}

describe("ZDO", () => {
  it("1.0: posición chica, rotación, datos que se saltean y los que se guardan", () => {
    const w = new W();
    zdo(w, { prefab: "portal_wood", x: -227.25, z: -248.5, rot: "y", strings: [["tag", "casa"], ["text", "no"]], longs: [["creator", 42n]] });
    zdo(w, { prefab: "piece_cartographytable", x: 100, z: -200, small: true, rot: "full", junk: true, bytes: [["other", new Uint8Array(3)], ["data", Uint8Array.of(9, 8, 7)]] });
    zdo(w, { prefab: "Player_tombstone", x: 5, z: 6, strings: [["ownerName", "Astrid"]], longs: [["owner", 1111111111n], ["creator", 0n]] });
    const got: Zdo[] = [];
    const p = new PackageReader(w.u8);
    readZdos(p, 3, 41, (z) => got.push({ ...z }), (h) => h === H("piece_cartographytable"));
    expect(p.remaining).toBe(0);
    expect(got[0]).toMatchObject({ prefab: H("portal_wood"), x: -227.25, z: -248.5, tag: "casa", creator: true, data: null });
    expect(got[1]).toMatchObject({ prefab: H("piece_cartographytable"), x: 100, y: 0, z: -200, creator: false });
    expect([...got[1].data!]).toEqual([9, 8, 7]);
    expect(got[2]).toMatchObject({ ownerName: "Astrid", owner: 1111111111n, creator: false });
  });

  it("formato viejo (versión 34): sector y rotación como Vector3", () => {
    const w = new W();
    w.short(256 | 4096 | 64).short(3).short(-4).vec3(10, 20, 30).int(H("portal_stone")).vec3(0, 90, 0);
    w.numItems(1).int(H("tag")).str("viejo");
    const got: Zdo[] = [];
    const p = new PackageReader(w.u8);
    readZdos(p, 1, 34, (z) => got.push({ ...z }));
    expect(p.remaining).toBe(0);
    expect(got[0]).toMatchObject({ x: 10, y: 20, z: 30, tag: "viejo" });
  });
});

describe("mapas", () => {
  it("mapa compartido de la mesa (versión 3)", () => {
    const m = parseSharedMap(sharedMap(8, [0, 9, 63], [{ owner: -5n, name: "cueva", x: 12, z: -24, type: 3, author: "Steam_1" }]));
    expect(m.explored!.size).toBe(8);
    expect(m.explored!.pixelSize).toBe(12);
    expect([...m.explored!.cells].reduce((a, b) => a + b, 0)).toBe(3);
    expect(m.explored!.cells[9]).toBe(1);
    expect(m.pins).toEqual([{ name: "cueva", x: 12, z: -24, type: 3, checked: false, ownerId: -5n, author: "Steam_1" }]);
  });

  it("mapa de un mundo del .fch (versión 8, comprimido): une lo propio y lo compartido", () => {
    const n = 4;
    const inner = new W().int(n).raw([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).raw([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
      .int(2).str("casa").vec3(1, 2, 3).int(1).bool(true).long(0n).str("")
      .str("de otro").vec3(-4, 0, 8).int(9).bool(false).long(77n).str("Steam_2").bool(false);
    const map = parsePlayerMap(new W().int(8).arr(gz(inner.u8)).u8);
    expect([...map.explored.cells]).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(exploredFraction(map.explored)).toBe(3 / 16);
    expect(map.pins.map((p) => [p.name, p.x, p.z, p.type, p.checked, p.ownerId])).toEqual([["casa", 1, 3, 1, true, 0n], ["de otro", -4, 8, 9, false, 77n]]);
  });
});

/** Un .fch v46 mínimo: 10 categorías de estadísticas vacías, dos mundos (uno con mapa). */
function character(name: string, worlds: { uid: bigint; map?: Uint8Array }[]) {
  const p = new W().int(46).int(2).int(10);
  for (let c = 0; c < 10; c++) {
    p.float(1).float(2).int(0).int(0).int(0).int(5);
    p.int(1).str("Troll").float(3); // una fila en la primera tabla de enemigos
    for (let k = 0; k < 4 + 5; k++) p.int(0);
  }
  p.bool(false).int(worlds.length);
  for (const w of worlds) {
    p.long(w.uid).bool(false).vec3(0, 0, 0).bool(true).vec3(1, 2, 3).bool(false).vec3(0, 0, 0).vec3(4, 5, 6);
    if (w.map) p.bool(true).arr(w.map); else p.bool(false);
  }
  p.str(name).long(123n).str("").bool(false).long(1700000000n).bool(false);
  return new W().arr(p.u8).int(64).raw(new Uint8Array(64)).u8;
}

describe("personaje", () => {
  it("lee nombre, mundos por uid, lo explorado y los pines", () => {
    const inner = new W().int(2).raw([1, 0, 0, 1]).raw([0, 0, 1, 0]).int(1).str("mina").vec3(10, 0, 20).int(0).bool(false).long(0n).str("").bool(true);
    const fch = character("Bjorn", [{ uid: 1234567n, map: new W().int(8).arr(gz(inner.u8)).u8 }, { uid: -9n }]);
    const c = readCharacter(file("bjorn.fch", fch));
    expect(c.warnings).toEqual([]);
    expect(c.name).toBe("Bjorn");
    expect(c.worlds.map((w) => w.uid)).toEqual(["1234567", "-9"]);
    expect([...c.worlds[0].explored!.cells]).toEqual([1, 0, 1, 1]);
    expect(c.worlds[0].pins).toEqual([{ name: "mina", x: 10, z: 20, type: 0, checked: false, owner: "Bjorn" }]);
    expect(c.worlds[1]).toEqual({ uid: "-9", explored: null, pins: [] });
  });
});

/** Un zip con una entrada guardada, una comprimida y una carpeta (CRC en 0: el lector no lo mira). */
function zip(entries: { path: string; data: Uint8Array; deflate?: boolean }[]) {
  const out = new W();
  const cd = new W();
  let offset = 0;
  const enc = new TextEncoder();
  for (const e of entries) {
    const name = enc.encode(e.path);
    const body = e.deflate ? new Uint8Array(deflateRawSync(e.data)) : e.data;
    const method = e.deflate ? 8 : 0;
    const local = new W().int(0x04034b50).short(20).short(0).short(method).short(0).short(0).int(0)
      .int(body.length).int(e.data.length).short(name.length).short(4).raw(name).raw([0, 0, 0, 0]).raw(body).u8;
    cd.int(0x02014b50).short(20).short(20).short(0).short(method).short(0).short(0).int(0).int(body.length).int(e.data.length)
      .short(name.length).short(0).short(0).short(0).short(0).int(0).int(offset).raw(name);
    out.raw(local);
    offset += local.length;
  }
  const cdBytes = cd.u8;
  out.raw(cdBytes).int(0x06054b50).short(0).short(0).short(entries.length).short(entries.length).int(cdBytes.length).int(offset).short(0);
  return out.u8;
}

describe("unzip", () => {
  it("saca los archivos (guardado y deflate) y saltea las carpetas", async () => {
    const big = new TextEncoder().encode("_main ".repeat(3000));
    const files = await unzip(zip([
      { path: "Mundo de prueba/", data: new Uint8Array(0) },
      { path: "Mundo de prueba/_main.1.ok", data: Uint8Array.of(41, 0, 0, 0) },
      { path: "Mundo de prueba/_main.1.db2", data: big, deflate: true },
    ]));
    expect(files.map((f) => [f.name, f.path, f.data.length])).toEqual([
      ["_main.1.ok", "Mundo de prueba/_main.1.ok", 4], ["_main.1.db2", "Mundo de prueba/_main.1.db2", big.length],
    ]);
    expect(files[1].data).toEqual(big);
  });
});

/** Un .fwl2 (o .fwl) con la versión pedida. */
function fwl(version: number, name: string, seedName: string, uid: bigint) {
  const p = new W().int(version).str(name).str(seedName).int(H(seedName)).long(uid).int(2).bool(true);
  if (version >= 32) p.int(1).str("resourcerate 300");
  if (version >= 41) p.int(1).str("Steam_1").str("ZoTaD").str("").str("");
  return new W().arr(p.u8).u8;
}

const chunkFile = (count: number, body: W) => new W().short(41).int(count).raw(body.u8).u8;

describe("readWorld", () => {
  it("1.0: elige el guardado completo más nuevo y saca todo de los chunks", () => {
    const zone = new W().int(1).short(0).short(0).int(32).int(0).bool(true).int(2)
      .int(H("Eikthyrnir")).vec3(100, 35, -50).bool(true)
      .int(H("LugarDeUnMod")).vec3(1, 2, 3).bool(false);
    const db2 = new W().int(41).raw(new Uint8Array(8)).arr(gz(zone.u8)).float(0).str("").float(0).vec3(0, 0, 0).int(0).u8;

    const portals = new W();
    zdo(portals, { prefab: "portal_wood", x: -227, z: -248, strings: [["tag", "casa"]], longs: [["creator", 1n]] });
    zdo(portals, { prefab: "portal_stone", x: 900, z: 40, strings: [["tag", "casa"]], longs: [["creator", 1n]] });
    const table = sharedMap(8, [1, 2], [{ owner: -2222222n, name: "Eikthyr", x: 100, z: -50, type: 9, author: "Steam_9" },
      { owner: 5n, name: "cobre", x: 0, z: 0, type: 3, author: "Steam_1" }]);
    const main = new W();
    zdo(main, { prefab: "Player_tombstone", x: 10, z: 20, strings: [["ownerName", "Bjorn"]], longs: [["owner", -2222222n]] });
    zdo(main, { prefab: "bed", x: 30, z: 31, strings: [["ownerName", "Astrid"]], longs: [["owner", 7n], ["creator", 7n]] });
    zdo(main, { prefab: "Karve", x: 50, z: 60, longs: [["creator", 7n]] });
    zdo(main, { prefab: "Cart", x: 70, z: 80 });
    zdo(main, { prefab: "piece_cartographytable", x: -137, z: 2681, rot: "y", bytes: [["data", table]], longs: [["creator", 7n]] });
    zdo(main, { prefab: "stone_wall_2x1", x: 33, z: 0 }); // ruina: sin creador, no cuenta
    zdo(main, { prefab: "_ZoneCtrl", x: 1_000_000, z: 1_000_000, longs: [["creator", 1n]] }); // fuera del mundo
    const chunks = new W().short(41).int(9).int(2)
      .short(1).byte(0).int(3).int(2)
      .short(0x1e1e).byte(1).int(5).int(7).u8;
    const old = new W();
    zdo(old, { prefab: "Player_tombstone", x: 0, z: 0 });
    const files = [
      file("Mundo de prueba/_main.8.fwl2", fwl(41, "Mundo de prueba", "prueba1234", 1234567n)),
      file("Mundo de prueba/_main.8.db2", db2),
      file("Mundo de prueba/_main.8.chunks", chunks),
      file("Mundo de prueba/_main.8.ok", Uint8Array.of(41, 0, 0, 0)),
      file("Mundo de prueba/_main.9.fwl2", fwl(41, "Otro", "x", 1n)), // incompleto: no se usa
      file("Mundo de prueba/00_01__0_3.chunk", chunkFile(2, portals)),
      file("Mundo de prueba/1e_1e__1_5.chunk", chunkFile(7, main)),
      file("Mundo de prueba/1e_1e__1_4.chunk", chunkFile(1, old)), // viejo, no está en el .chunks
    ];
    const w = readWorld(files);
    expect(w.warnings).toEqual(["1 lugares de 1 tipos desconocidos (¿de un mod?)"]);
    expect(w).toMatchObject({ name: "Mundo de prueba", seedName: "prueba1234", seed: H("prueba1234"), uid: "1234567", worldGenVersion: 2 });
    expect(w.portals).toEqual([
      { prefab: "portal_wood", x: -227, z: -248, tag: "casa" }, { prefab: "portal_stone", x: 900, z: 40, tag: "casa" },
    ]);
    expect(w.points).toEqual([
      { kind: "tombstone", x: 10, z: 20, label: "Bjorn" }, { kind: "bed", x: 30, z: 31, label: "Astrid" },
      { kind: "ship", x: 50, z: 60, label: "Karve" }, { kind: "cart", x: 70, z: 80, label: "Cart" },
      { kind: "cartography", x: -137, z: 2681 },
    ]);
    expect(w.cartography).toHaveLength(1);
    expect(w.cartography[0].explored!.cells[2]).toBe(1);
    // Dueños: por id (la tumba dice que -2222222 es Bjorn) o por autor (historial del .fwl2).
    expect(w.cartography[0].pins.map((p) => [p.name, p.owner])).toEqual([["Eikthyr", "Bjorn"], ["cobre", "ZoTaD"]]);
    // Zonas: (-227,-248) → (-4,-4); (900,40) → (14,1); (30,31),(50,60) → (0,0) y (1,1); la mesa → (-2,42).
    expect(new Set(w.buildZones.map((z) => z.join(",")))).toEqual(new Set(["-4,-4,1", "14,1,1", "0,0,1", "1,1,1", "-2,42,1"]));
    expect(w.locations).toEqual([{ prefab: "Eikthyrnir", x: 100, z: -50 }]);
  });

  it("formato viejo: <mundo>.fwl + <mundo>.db con los objetos adentro", () => {
    const body = new W();
    // Versión 34: sector y rotación Vector3, conteos con ReadNumItems.
    body.short(256 | 64 | 32).short(0).short(0).vec3(12, 30, 34).int(H("portal_wood")).numItems(1).int(H("creator")).long(3n).numItems(1).int(H("tag")).str("uno");
    body.short(256).short(0).short(0).vec3(-40, 30, 50).int(H("Raft"));
    const db = new W().int(34).raw(new Uint8Array(8)).long(1n).int(10).int(2).raw(body.u8)
      .int(1).int(0).int(0) // zonas generadas (int, int)
      .int(2).int(32) // versión del generador y de lugares
      .int(0).bool(true).int(1).str("Eikthyrnir").vec3(7, 8, 9).bool(true);
    const w = readWorld([file("worlds/Viejo.fwl", fwl(34, "Viejo", "abc", 5n)), file("worlds/Viejo.db", db.u8), file("worlds/Viejo.db.old", Uint8Array.of(1))]);
    expect(w.warnings).toEqual([]);
    expect(w.name).toBe("Viejo");
    expect(w.portals).toEqual([{ prefab: "portal_wood", x: 12, z: 34, tag: "uno" }]);
    expect(w.points).toEqual([{ kind: "ship", x: -40, z: 50, label: "Raft" }]);
    expect(w.buildZones).toEqual([[0, 1, 1]]);
    expect(w.locations).toEqual([{ prefab: "Eikthyrnir", x: 7, z: 9 }]);
  });

  it("sin mundo, un error claro", () => {
    expect(() => readWorld([file("x/leeme.txt", new Uint8Array(3))])).toThrow(/no hay un mundo/);
  });
});

describe("nombres de lugares", () => {
  it("coinciden con locations.json", () => {
    const names = new Set((locationsJson as { locations: { prefabName: string | null }[] }).locations.map((l) => l.prefabName).filter(Boolean));
    expect(new Set(LOCATION_PREFABS)).toEqual(names);
  });
});
