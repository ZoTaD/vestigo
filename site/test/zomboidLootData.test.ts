import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import itemsList from "@zomboid/site/items-list.json";
import { PZ_LOOT_ROOM_SHARDS, pzShard, pzShardOf } from "../src/zomboid/shard";

/**
 * Los datos del botín de Project Zomboid (2026-10-01) que arma `games/zomboid/tools/loot.py`: dónde aparece cada objeto
 * (100 archivos por el hash del slug), qué hay en cada habitación del mapa (32 archivos por el hash del nombre) y los
 * nombres en `common.json`. Se prueba con los archivos reales: un enlace roto, un nombre que falta o un archivo que
 * engorda saltan acá.
 */
type Row = [string, string, number, string?];
type ItemLoot = {
  rooms: Row[];
  nRooms: number;
  stash?: Row[];
  zombie?: { m: number; f: number; outfits: [string, number][]; nOutfits: number };
  vehicles?: [string, string, number][];
  nVehicles?: number;
  bags?: [{ id: string; en: string; es: string; icon: string | null }, number][];
};
type RoomShard = {
  items: Record<string, [string, string, string | null]>;
  conts: Record<string, [string, string]>;
  rooms: Record<string, { t: string; n: number; top: Row[] }>;
};
type Loc = { en: string; es: string };
type Common = {
  containers: Record<string, Loc>; parts: Record<string, Loc>; vehicles: Record<string, Loc>;
  outfits: Record<string, Loc>; stashes: Record<string, Loc>; zones: Record<string, Loc>;
  aliases: Record<string, string[]>;
  spots: Record<string, { n: number; at?: [string, number, number] }>;
};

const RAW = import.meta.glob("../../games/zomboid/data/loot/**/*.json", { eager: true, query: "?raw", import: "default" }) as Record<
  string,
  string
>;
const FILES = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k.replace(/^.*\/data\/loot\//, ""), JSON.parse(v)]));
const sharded = <T,>(dir: string) =>
  new Map(
    Object.entries(FILES).flatMap(([k, v]) => {
      const m = k.match(new RegExp(`^${dir}/(\\d\\d)\\.json$`));
      return m ? [[m[1], v as Record<string, T>] as const] : [];
    }),
  );
const ITEMS = sharded<ItemLoot>("items");
const ROOMS = new Map([...sharded<unknown>("rooms")].map(([n, v]) => [n, v as unknown as RoomShard]));
const COMMON = FILES["common.json"] as Common;
const SLUGS = new Set((itemsList as { rows: { id: string }[] }).rows.map((r) => r.id));
const KB = 1024;

describe("reparto", () => {
  it("pzShardOf es shard(clave, n) de site.py", () => {
    expect(pzShardOf("crowbar", 100)).toBe(pzShard("crowbar"));
    // Los valores salieron de `python -c "…shard(k, 32)…"` sobre games/zomboid/tools/site.py.
    const want: Record<string, string> = { kitchen: "15", garage: "12", _all: "29", Bathroom: "03", bedroom4: "25" };
    for (const [k, v] of Object.entries(want)) expect(pzShardOf(k, PZ_LOOT_ROOM_SHARDS), k).toBe(v);
    expect(pzShard("crowbar")).toBe("27");
  });

  it("hay 100 archivos por objeto y 32 por habitación, aunque alguno quede vacío", () => {
    expect(ITEMS.size).toBe(100);
    expect(ROOMS.size).toBe(PZ_LOOT_ROOM_SHARDS);
  });

  it("cada objeto está en el archivo que dice pzShard y tiene ficha", () => {
    for (const [n, shard] of ITEMS)
      for (const slug of Object.keys(shard)) {
        expect(pzShard(slug), slug).toBe(n);
        expect(SLUGS.has(slug), slug).toBe(true);
      }
  });

  it("cada habitación está en el archivo que dice pzShardOf(nombre, 32)", () => {
    for (const [n, shard] of ROOMS)
      for (const key of Object.keys(shard.rooms)) expect(pzShardOf(key, PZ_LOOT_ROOM_SHARDS), key).toBe(n);
  });
});

describe("enlaces y nombres", () => {
  it("todo slug de `top` y todo bolso tiene ficha, y cada `top` trae su nombre en el archivo", () => {
    for (const [, shard] of ROOMS)
      for (const [key, room] of Object.entries(shard.rooms))
        for (const [slug, cont] of room.top) {
          expect(SLUGS.has(slug), `${key}: ${slug}`).toBe(true);
          expect(shard.items[slug], `${key}: ${slug}`).toBeDefined();
          expect(shard.conts[cont], `${key}: ${cont}`).toBeDefined();
        }
    for (const [, shard] of ITEMS)
      for (const [slug, it] of Object.entries(shard))
        for (const [bag] of it.bags ?? []) expect(SLUGS.has(bag.id), `${slug}: ${bag.id}`).toBe(true);
  });

  it("toda tabla, habitación y escondite nombrado existe en common (salvo _all)", () => {
    const known = (k: string) => k === "_all" || k in COMMON.spots || k in COMMON.stashes;
    for (const [, shard] of ROOMS) for (const r of Object.values(shard.rooms)) expect(known(r.t), r.t).toBe(true);
    for (const [, shard] of ITEMS)
      for (const it of Object.values(shard)) {
        for (const [k] of it.rooms) expect(known(k), k).toBe(true);
        for (const [k] of it.stash ?? []) expect(known(k), k).toBe(true);
      }
  });

  it("todo mueble, parte, vehículo, atuendo y zona nombrado tiene nombre en los dos idiomas", () => {
    const missing: string[] = [];
    const need = (table: Record<string, Loc>, k: string, what: string) => {
      if (!table[k]?.en || !table[k]?.es) missing.push(`${what}:${k}`);
    };
    const force = (r: Row) => r[3]?.startsWith("z:") && need(COMMON.zones, r[3].slice(2), "zona");
    for (const [, shard] of ITEMS)
      for (const it of Object.values(shard)) {
        for (const r of [...it.rooms, ...(it.stash ?? [])]) {
          need(COMMON.containers, r[1], "mueble");
          force(r);
        }
        for (const [g, part] of it.vehicles ?? []) {
          need(COMMON.vehicles, g, "vehículo");
          need(COMMON.parts, part, "parte");
        }
        for (const [o] of it.zombie?.outfits ?? []) need(COMMON.outfits, o, "atuendo");
      }
    expect([...new Set(missing)].sort()).toEqual([]);
  });
});

describe("pesos", () => {
  // El plan estimaba 400 KB con gzip para todo data/loot; con los topes del contrato (10 habitaciones por objeto, 30
  // objetos por habitación) da ~610: los archivos de habitaciones repiten el nombre en/es de cada objeto que nombran
  // (~180 KB). Cada página baja uno o dos archivos (≤ 11 KB con gzip), así que lo que pesa el total es sólo el deploy.
  const raw = (v: unknown) => Buffer.from(JSON.stringify(v));
  it("cada archivo pesa lo que tiene que pesar", () => {
    for (const [n, v] of ITEMS) expect(raw(v).length, `items/${n}`).toBeLessThanOrEqual(30 * KB);
    for (const [n, v] of ROOMS) expect(raw(v).length, `rooms/${n}`).toBeLessThanOrEqual(45 * KB);
    expect(raw(COMMON).length).toBeLessThanOrEqual(45 * KB);
  });

  it("todo data/loot con gzip no pasa de 650 KB", () => {
    const total = Object.values(RAW).reduce((n, v) => n + gzipSync(v, { level: 9 }).length, 0);
    expect(total).toBeLessThanOrEqual(650 * KB);
  });
});
