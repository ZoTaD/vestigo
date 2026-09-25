/// <reference types="node" />
/**
 * Con archivos de verdad (un mundo 1.0 y un personaje que lo visitó). No están
 * en el repo, que es público: las rutas salen de variables de entorno y, si no
 * están, estas pruebas se saltean.
 *
 *   VALHEIM_TEST_WORLD_DIR  carpeta del mundo (la de `worlds_local/<mundo>/`)
 *   VALHEIM_TEST_WORLD_ZIP  esa carpeta en zip (opcional)
 *   VALHEIM_TEST_FCH        un personaje que haya estado en ese mundo
 *   VALHEIM_TEST_SEED       la semilla esperada (opcional)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorld } from "../engine";
import { WATER_LEVEL } from "../engine/render";
import { stableSeed } from "../engine/stableHash";
import { exploredFraction, readCharacter, readWorld, unzip, type Explored, type InputFile, type WorldSaveData } from "./index";

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] ?? "" : "");
const slash = (d: string) => (d && !/[\/]$/.test(d) ? `${d}/` : d);
const WORLD_DIR = slash(env("VALHEIM_TEST_WORLD_DIR"));
const WORLD_ZIP = env("VALHEIM_TEST_WORLD_ZIP");
const CHAR = env("VALHEIM_TEST_FCH");
const CHAR_DIR = CHAR.replace(/[^\/]+$/, "");
const has = (p: string) => !!p && existsSync(p);

const load = (dir: string, name: string): InputFile => ({ name, path: `mundo/${name}`, data: new Uint8Array(readFileSync(dir + name)) });

let cached: WorldSaveData | null = null;
/** El inicio del mundo: el templo de las piedras de sacrificio que dejó el juego. */
let START = { x: 0, z: 0 };
function world(): WorldSaveData {
  if (!cached) {
    const files = readdirSync(WORLD_DIR).map((f) => load(WORLD_DIR, f));
    const t = performance.now();
    cached = readWorld(files);
    const st = cached.locations.find((l) => l.prefab === "StartTemple");
    if (st) START = { x: st.x, z: st.z };
    console.log(`readWorld (carpeta, ${files.length} archivos): ${(performance.now() - t).toFixed(0)} ms`);
  }
  return cached;
}

/** Las celdas exploradas como puntos del mundo (el centro de cada celda de 12 m). */
function* exploredPoints(e: Explored) {
  const half = e.size / 2;
  for (let row = 0; row < e.size; row++) {
    for (let col = 0; col < e.size; col++) {
      if (e.cells[row * e.size + col]) yield { x: (col - half) * e.pixelSize, z: (row - half) * e.pixelSize };
    }
  }
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe.skipIf(!has(WORLD_DIR))("mundo real", () => {
  it("nombre, semilla y uid", () => {
    const w = world();
    expect(w.warnings).toEqual([]);
    expect(w.name).toBeTruthy();
    expect(w.seedName).toBeTruthy();
    if (env("VALHEIM_TEST_SEED")) expect(w.seedName).toBe(env("VALHEIM_TEST_SEED"));
    expect(w.seed).toBe(stableSeed(w.seedName));
    expect(w.locations.some((l) => l.prefab === "StartTemple")).toBe(true);
    expect(w.worldGenVersion).toBe(2);
  });

  it("portales con nombres razonables y unidos de a pares", () => {
    const w = world();
    const byTag = new Map<string, number>();
    for (const p of w.portals) byTag.set(p.tag, (byTag.get(p.tag) ?? 0) + 1);
    const pairs = [...byTag].filter(([, n]) => n === 2).map(([t]) => t);
    console.log(`portales: ${w.portals.length}; pares: ${pairs.length}`);
    expect(w.portals.length).toBeGreaterThan(10);
    for (const p of w.portals) {
      expect(p.tag).toMatch(/^[\p{L}\p{N} _-]{0,20}$/u); // "" = portal sin nombre
      expect(Math.hypot(p.x, p.z)).toBeLessThan(10_500);
    }
    expect(pairs.length).toBeGreaterThanOrEqual(3);
    // Nadie usa un nombre más de dos veces (el juego no uniría el tercero).
    expect(Math.max(...byTag.values())).toBeLessThanOrEqual(2);
  });

  it("tumbas, camas, barcos, carros y construcciones", () => {
    const w = world();
    const count = (k: string) => w.points.filter((p) => p.kind === k).length;
    console.log(`tumbas ${count("tombstone")}, camas ${count("bed")}, barcos ${count("ship")}, carros ${count("cart")}, mesas ${count("cartography")}`);
    console.log(`zonas con construcciones: ${w.buildZones.length}; las 5 más grandes: ${w.buildZones.slice(0, 5).map(([x, z, n]) => `(${x * 64}, ${z * 64}) ${n}`).join("; ")}`);
    expect(count("tombstone")).toBeGreaterThan(0);
    expect(w.points.filter((p) => p.kind === "tombstone").every((p) => p.label)).toBe(true);
    expect(count("bed")).toBeGreaterThan(0);
    expect(count("ship")).toBeGreaterThan(0);
    // La base principal está al lado del inicio.
    expect(w.buildZones.some(([x, z, n]) => n > 100 && dist({ x: x * 64, z: z * 64 }, START) < 400)).toBe(true);
  });

  it("los lugares del .db2 caen donde los pines de jefe", () => {
    const w = world();
    console.log(`lugares: ${w.locations.length}`);
    expect(w.locations.length).toBeGreaterThan(10_000);
    // El altar de Eikthyr tiene 3 candidatos; el pin de la piedra de Vegvisir va al que se usó.
    for (const [pinName, prefab] of [["$enemy_eikthyr", "Eikthyrnir"], ["$enemy_gdking", "GDKing"]]) {
      const pin = w.cartography.flatMap((c) => c.pins).find((p) => p.name === pinName);
      expect(pin).toBeDefined();
      const closest = Math.min(...w.locations.filter((l) => l.prefab === prefab).map((l) => dist(pin!, l)));
      expect(closest).toBeLessThan(40);
    }
  });

  it("la mesa de cartografía: lo explorado tiene sentido sobre el mundo", () => {
    const w = world();
    expect(w.cartography).toHaveLength(1);
    const t = w.cartography[0];
    const e = t.explored!;
    expect(e.size).toBe(2048);
    const frac = exploredFraction(e);
    const disk = frac * (e.size * e.pixelSize) ** 2 / (Math.PI * 10_500 ** 2);
    const owners = new Map<string, number>();
    for (const p of t.pins) owners.set(p.owner ?? "?", (owners.get(p.owner ?? "?") ?? 0) + 1);
    console.log(`mesa: ${(frac * 100).toFixed(2)} % de la grilla, ${(disk * 100).toFixed(2)} % del mundo; ${t.pins.length} pines de ${owners.size} jugadores`);
    expect(frac).toBeGreaterThan(0.001);
    expect(frac).toBeLessThan(0.5);
    // El inicio está explorado y todo lo explorado está dentro del mundo.
    const cell = (x: number, z: number) => e.cells[Math.round(z / 12 + 1024) * 2048 + Math.round(x / 12 + 1024)];
    expect(cell(START.x, START.z)).toBe(1);
    const pts = [...exploredPoints(e)];
    expect(pts.every((p) => Math.hypot(p.x, p.z) < 10_600)).toBe(true);
    // Orientación (fila 0 = sur): los portales, camas y barcos caen sobre celdas exploradas; dado vuelta, no.
    const objs = [...w.portals, ...w.points];
    const on = objs.filter((o) => cell(o.x, o.z)).length / objs.length;
    const flipped = objs.filter((o) => cell(o.x, -o.z)).length / objs.length;
    console.log(`objetos sobre lo explorado: ${(on * 100).toFixed(0)} % (con el mapa dado vuelta: ${(flipped * 100).toFixed(0)} %)`);
    expect(on).toBeGreaterThan(0.9);
    expect(flipped).toBeLessThan(0.5);
    // Y el inicio, explorado, es tierra en el mundo que genera el motor para esa semilla.
    const gen = createWorld(w.seedName);
    expect(gen.height(START.x, START.z)).toBeGreaterThan(WATER_LEVEL);
    const land = pts.filter((p) => dist(p, START) < 100);
    expect(land.filter((p) => gen.height(p.x, p.z) >= WATER_LEVEL).length / land.length).toBeGreaterThan(0.5);
  }, 120_000);

  it.skipIf(!has(WORLD_ZIP))("el zip da lo mismo que la carpeta", async () => {
    const data = new Uint8Array(readFileSync(WORLD_ZIP));
    let t = performance.now();
    const files = await unzip(data);
    console.log(`unzip (${(data.length / 1e6).toFixed(1)} MB, ${files.length} archivos): ${(performance.now() - t).toFixed(0)} ms`);
    t = performance.now();
    const z = readWorld(files);
    console.log(`readWorld (zip): ${(performance.now() - t).toFixed(0)} ms`);
    const w = world();
    expect(z.uid).toBe(w.uid);
    expect(z.portals).toEqual(w.portals);
    expect(z.points).toEqual(w.points);
    expect(z.buildZones).toEqual(w.buildZones);
    expect(z.cartography[0].pins).toEqual(w.cartography[0].pins);
  }, 60_000);
});

describe.skipIf(!has(CHAR))("personaje real", () => {
  it("tiene una entrada para el mundo y sus pines", () => {
    const t = performance.now();
    const c = readCharacter({ name: "personaje.fch", path: "personaje.fch", data: new Uint8Array(readFileSync(CHAR)) });
    console.log(`readCharacter: ${(performance.now() - t).toFixed(0)} ms; mundos ${c.worlds.map((x) => `${x.pins.length} pines, ${x.explored ? (exploredFraction(x.explored) * 100).toFixed(2) + " %" : "sin mapa"}`).join("; ")}`);
    expect(c.warnings).toEqual([]);
    expect(c.name).toBeTruthy();
    if (!has(WORLD_DIR)) return;
    world();
    const w = world();
    const mine = c.worlds.find((x) => x.uid === w.uid);
    expect(mine).toBeDefined();
    expect(mine!.pins.length).toBeGreaterThan(0);
    const e = mine!.explored!;
    expect(e.cells[Math.round(START.z / 12 + 1024) * 2048 + Math.round(START.x / 12 + 1024)]).toBe(1);
    // Lo que ve el personaje y lo de la mesa se pisan bastante (la mesa se sincroniza con todos).
    const table = w.cartography[0].explored!;
    let both = 0, his = 0;
    for (let i = 0; i < e.cells.length; i++) if (e.cells[i]) { his++; if (table.cells[i]) both++; }
    console.log(`de lo que ve el personaje, ${(both / his * 100).toFixed(0)} % también está en la mesa`);
    expect(both / his).toBeGreaterThan(0.5);
  });

  it("los backups automáticos también se leen", () => {
    const main = readCharacter({ name: "p.fch", path: "p.fch", data: new Uint8Array(readFileSync(CHAR)) });
    const backups = readdirSync(CHAR_DIR).filter((f) => /_backup_auto-.*\.fch$/.test(f));
    for (const f of backups) {
      const c = readCharacter({ name: f, path: f, data: new Uint8Array(readFileSync(CHAR_DIR + f)) });
      expect(c.warnings).toEqual([]);
      expect(c.name).toBe(main.name);
    }
  });
});
