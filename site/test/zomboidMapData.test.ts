import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Los datos del mapa de Project Zomboid para la web (2026-09-30): `games/zomboid/tools/map.py` parte los JSON del mapa
 * (vector, edificios, zonas, calles, escondites…) en `data/map/web/`, para que el visor pida sólo lo que se ve.
 *
 *   regions/<rx>_<ry>.json  el dibujo (mapa de papel) de una región de 1.500 casillas (rx = floor(x / 1500))
 *   zones/<rx>_<ry>.json    sus zonas, para las capas del juego (se piden si hay una capa prendida)
 *   bld/<rx>_<ry>.json      sus edificios con pisos y habitaciones (se piden al tocar un edificio)
 *   common.json             lo que no depende del lugar: paleta, nombres de habitación, calles, escondites…
 *   search.json             las entradas del buscador
 *
 * Se prueba con los archivos reales (los que commitea `map.py`): si un parche engorda una región o se pierde un edificio,
 * salta acá.
 */
const R = 1500;
const DATA = join(__dirname, "..", "..", "games", "zomboid", "data", "map");
const WEB = join(DATA, "web");

const read = <T,>(...parts: string[]): T => JSON.parse(readFileSync(join(...parts), "utf-8")) as T;
const webFiles = (sub: string) =>
  readdirSync(join(WEB, sub))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5));

type Ring = number[];
type Poly = Ring[];
type Vector = {
  bounds: number[];
  style: unknown;
  buildings: Record<string, Poly[]>;
  roads: Record<string, Poly[]>;
  roadLines: Record<string, Ring[]>;
  water: Poly[];
  railway: Poly[];
  wood: Poly[];
  driveways: Poly[];
  places: { name: string; kind: string; x: number; y: number }[];
};
type Building = {
  id: string;
  box: [number, number, number, number];
  type?: string;
  tone?: string;
  name?: string;
  parts?: string[];
  floors: Record<string, number[][]>;
};
type Zone = { r?: number[]; p?: number[]; n?: string; z?: number; d?: string; stair?: unknown[]; line?: boolean };
type ZoneTuple = [number, number, number, number, string?, { z?: number; d?: string; stair?: unknown[] }?];
type PolyZone = { p: number[]; n?: string; z?: number; line?: boolean };
type Region = {
  b?: Record<string, Poly[]>;
  roads?: Record<string, Poly[]>;
  roadLines?: Record<string, Ring[]>;
  water?: Poly[];
  railway?: Poly[];
  wood?: Poly[];
  driveways?: Poly[];
};
type Zones = { zones?: Record<string, ZoneTuple[]>; zonesP?: Record<string, PolyZone[]> };
type Street = { name: string; width: number; points: number[]; label: [number, number, number] };
type Stash = {
  id: string;
  town: string | null;
  near?: string;
  annotations: { x: number; y: number; text?: string; es?: string }[];
  building: [number, number];
  /** Sólo si el juego no traía casilla (un 1, 2, 3… en vez de una): `building` es entonces el centro de las anotaciones. */
  buildingRaw?: [number, number];
};
type Common = {
  style: unknown;
  bounds: number[];
  rooms: string[];
  places: Vector["places"];
  labels: { layer: string; text: string; x: number; y: number }[];
  streets: Street[];
  stamps: Record<string, { file: string; group: string }>;
  stashes: Stash[];
  spawns: { towns: unknown[]; zones: unknown[] };
  regions: { id: string; box: number[]; draw?: 1; zones?: 1; bld?: 1 }[];
};
type Hit = { k: string; en: string; es: string; x: number; y: number };

const vector = read<Vector>(DATA, "vector.json");
const buildings = read<{ rooms: string[]; buildings: Building[] }>(DATA, "buildings.json");
const zonesSrc = read<{ zones: Record<string, Zone[]> }>(DATA, "zones.json");
const streetsSrc = read<Street[]>(DATA, "streets.json");
const stashesSrc = read<{ stamps: Common["stamps"]; stashes: Stash[] }>(DATA, "stashes.json");
const common = read<Common>(WEB, "common.json");
const search = read<Hit[]>(WEB, "search.json");

const regionIds = webFiles("regions");
const zoneIds = webFiles("zones");
const bldIds = webFiles("bld");
const cell = (id: string) => {
  const [rx, ry] = id.split("_").map(Number);
  return [rx * R, ry * R, (rx + 1) * R, (ry + 1) * R];
};
/** Las regiones que un rectángulo [x1, y1, x2, y2] cubre de verdad (con área): las que TIENEN que traerlo. */
const covering = (x1: number, y1: number, x2: number, y2: number) => {
  const out: string[] = [];
  for (let rx = Math.floor(x1 / R); rx * R < Math.max(x2, x1 + 1); rx++)
    for (let ry = Math.floor(y1 / R); ry * R < Math.max(y2, y1 + 1); ry++) out.push(`${rx}_${ry}`);
  return out;
};
/** ¿La celda de la región toca el mapa ([0, 0, ancho, alto])? El borde de arriba cuenta y el de abajo no, como en map.py. */
const inBounds = (id: string) => {
  const [cx1, cy1, cx2, cy2] = cell(id);
  const [bx1, by1, bx2, by2] = common.bounds;
  return cx1 <= bx2 && cx2 > bx1 && cy1 <= by2 && cy2 > by1;
};
/** Lo mismo que `covering` para las zonas: las que se asoman por el borde del mapa no llevan a la región de afuera. */
const coveringZones = (x1: number, y1: number, x2: number, y2: number) => covering(x1, y1, x2, y2).filter(inBounds);
const ringBox = (r: number[]) => {
  const xs = r.filter((_, i) => i % 2 === 0);
  const ys = r.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
};
const inRing = (x: number, y: number, ring: number[]) => {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const [x1, y1, x2, y2] = [ring[2 * i], ring[2 * i + 1], ring[2 * ((i + 1) % n)], ring[2 * ((i + 1) % n) + 1]];
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
  }
  return inside;
};

/** El doble del área con signo de un anillo plano (fórmula del cordón), con la y hacia abajo como el mapa. */
const area2 = (r: number[]) => {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) a += r[2 * i] * r[2 * ((i + 1) % n) + 1] - r[2 * ((i + 1) % n)] * r[2 * i + 1];
  return a;
};
const reversed = (r: number[]) => {
  const out: number[] = [];
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i], r[i + 1]);
  return out;
};
/**
 * Un polígono como lo escribe `map.py` en las regiones: el anillo de afuera con área positiva y los huecos con negativa.
 * `paper.ts` junta los polígonos de un color en un solo camino con `nonzero`, y dos que se pisan y giran al revés se
 * anulan (un hueco en la ruta donde se cruza con otra).
 */
const wound = (p: Poly): Poly => p.map((ring, i) => ((i === 0 ? 1 : -1) * area2(ring) < 0 ? reversed(ring) : ring));

const regionCache = new Map<string, Region>();
const region = (id: string) => {
  let r = regionCache.get(id);
  if (!r) regionCache.set(id, (r = read<Region>(WEB, "regions", `${id}.json`)));
  return r;
};
const zonesCache = new Map<string, Zones>();
const zonesOf = (id: string) => {
  let z = zonesCache.get(id);
  if (!z) zonesCache.set(id, (z = read<Zones>(WEB, "zones", `${id}.json`)));
  return z;
};

describe("la grilla de regiones", () => {
  it("la lista trae cada región con la caja de su celda y los archivos que tiene, y cada archivo está en la lista", () => {
    expect(regionIds.length).toBeGreaterThan(50);
    const all = [...new Set([...regionIds, ...zoneIds, ...bldIds])].sort((a, b) => {
      const [ax, ay] = a.split("_").map(Number);
      const [bx, by] = b.split("_").map(Number);
      return ax - bx || ay - by;
    });
    expect(common.regions.map((r) => r.id)).toEqual(all);
    for (const r of common.regions) {
      expect(r.box, r.id).toEqual(cell(r.id));
      expect(r.draw === 1, `${r.id} draw`).toBe(existsSync(join(WEB, "regions", `${r.id}.json`)));
      expect(r.zones === 1, `${r.id} zones`).toBe(existsSync(join(WEB, "zones", `${r.id}.json`)));
      expect(r.bld === 1, `${r.id} bld`).toBe(existsSync(join(WEB, "bld", `${r.id}.json`)));
    }
  });

  it("ninguna región cae entera fuera del mapa: una zona que asoma una casilla por el borde no inventa una celda vacía", () => {
    expect(common.regions.filter((r) => !inBounds(r.id)).map((r) => r.id)).toEqual([]);
    expect(common.regions.every((r) => r.box[0] >= 0 && r.box[1] >= 0)).toBe(true);
    expect(zoneIds.filter((id) => id.startsWith("-"))).toEqual([]);
  });

  it("no hay archivos vacíos: una región sin zonas (o sin dibujo, o sin edificios) no tiene ese archivo", () => {
    for (const id of regionIds) expect(Object.keys(region(id)).length, `regions/${id}`).toBeGreaterThan(0);
    for (const id of zoneIds) expect(Object.keys(zonesOf(id)).length, `zones/${id}`).toBeGreaterThan(0);
    for (const id of bldIds) expect(read<unknown[]>(WEB, "bld", `${id}.json`).length, `bld/${id}`).toBeGreaterThan(0);
  });
});

describe("el tamaño", () => {
  it("ninguna región pasa 250 KB crudos: ni su dibujo ni sus zonas", () => {
    const size = (sub: string, id: string) => statSync(join(WEB, sub, `${id}.json`)).size;
    const big = [
      ...regionIds.map((id) => [`regions/${id}`, size("regions", id)] as const),
      ...zoneIds.map((id) => [`zones/${id}`, size("zones", id)] as const),
    ].filter(([, n]) => n > 250_000);
    expect(big).toEqual([]);
  });

  it("los edificios (bld/) tienen su tope aparte, holgado: 1,5 MB crudos; hoy el mayor, Louisville, pesa 1,1 MB", () => {
    // No los frena el mismo tope de 250 KB (se piden de a uno, al tocar un edificio), pero un parche no puede duplicarlos
    // sin que salte acá: ese tope es el de MAX_BLD_BYTES de map.py.
    const big = bldIds
      .map((id) => [`bld/${id}`, statSync(join(WEB, "bld", `${id}.json`)).size] as const)
      .filter(([, n]) => n > 1_500_000);
    expect(big).toEqual([]);
  });

  it("common.json pesa menos de 500 KB", () => {
    expect(statSync(join(WEB, "common.json")).size).toBeLessThan(500_000);
  });

  it("el buscador no pasa 150 KB (sólo se baja al usarlo)", () => {
    expect(statSync(join(WEB, "search.json")).size).toBeLessThan(150_000);
  });
});

describe("los edificios con habitaciones", () => {
  const byRegion = new Map<string, Building[]>();
  for (const id of webFiles("bld")) byRegion.set(id, read<Building[]>(WEB, "bld", `${id}.json`));
  const where = new Map<string, string[]>();
  for (const [id, list] of byRegion) for (const b of list) where.set(b.id, [...(where.get(b.id) ?? []), id]);

  it("cada edificio de buildings.json está en al menos una región, y su caja cae dentro de ella o la cruza", () => {
    expect(buildings.buildings.length).toBeGreaterThan(9000);
    for (const b of buildings.buildings) {
      const ids = where.get(b.id) ?? [];
      expect(ids.length, b.id).toBeGreaterThan(0);
      for (const id of ids) {
        const [cx1, cy1, cx2, cy2] = cell(id);
        expect(b.box[0] <= cx2 && b.box[2] >= cx1 && b.box[1] <= cy2 && b.box[3] >= cy1, `${b.id} en ${id}`).toBe(true);
      }
    }
  });

  it("y está en TODAS las que toca (un edificio que cruza una frontera va en cada lado)", () => {
    for (const b of buildings.buildings) {
      const want = covering(...b.box).sort();
      const got = [...(where.get(b.id) ?? [])].sort();
      expect(got, b.id).toEqual(want);
    }
  });

  it("trae el edificio tal cual está en buildings.json: pisos, habitaciones por índice y nombre propio", () => {
    const src = new Map(buildings.buildings.map((b) => [b.id, b]));
    for (const list of byRegion.values()) for (const b of list) expect(b, b.id).toEqual(src.get(b.id));
    const rooms = common.rooms;
    expect(rooms).toEqual(buildings.rooms);
    expect(rooms.length).toBe(586);
  });
});

describe("un punto conocido: el Knox Bank de Muldraugh (10623, 9685)", () => {
  const [X, Y] = [10623, 9685];

  it("cae en la región 7_6", () => {
    expect(`${Math.floor(X / R)}_${Math.floor(Y / R)}`).toBe("7_6");
    expect(regionIds).toContain("7_6");
  });

  it("y dentro de un edificio de esa región: por caja, por habitación y por polígono del mapa de papel", () => {
    const list = read<Building[]>(WEB, "bld", "7_6.json");
    const bank = list.find((b) => b.box[0] <= X && X < b.box[2] && b.box[1] <= Y && Y < b.box[3]);
    expect(bank?.name).toBe("KnoxBank");
    const room = Object.values(bank!.floors)
      .flat()
      .some((r) => {
        for (let i = 1; i < r.length; i += 4) if (r[i] <= X && X < r[i] + r[i + 2] && r[i + 1] <= Y && Y < r[i + 1] + r[i + 3]) return true;
        return false;
      });
    expect(room).toBe(true);
    const polys = Object.values(region("7_6").b ?? {}).flat();
    expect(polys.some((p) => inRing(X + 0.5, Y + 0.5, p[0]))).toBe(true);
  });
});

describe("el dibujo de cada región", () => {
  const COUNTS = (k: keyof Region) => (id: string) => {
    const v = region(id)[k] as unknown;
    return Array.isArray(v) ? v.length : Object.values((v ?? {}) as Record<string, unknown[]>).reduce((n, a) => n + a.length, 0);
  };

  /** Cada polígono o línea de vector.json, en cada región que toca (por su caja). */
  const polys: [string, unknown, number[]][] = [];
  for (const [t, list] of Object.entries(vector.buildings)) for (const p of list) polys.push([`b.${t}`, p, p[0]]);
  for (const [t, list] of Object.entries(vector.roads)) for (const p of list) polys.push([`roads.${t}`, p, p[0]]);
  for (const [t, list] of Object.entries(vector.roadLines)) for (const l of list) polys.push([`roadLines.${t}`, l, l]);
  for (const k of ["water", "railway", "wood", "driveways"] as const) for (const p of vector[k]) polys.push([k, p, p[0]]);

  const pick = (id: string, path: string): unknown[] => {
    const [k, t] = path.split(".");
    const v = (region(id) as Record<string, unknown>)[k] as unknown;
    return (t ? (v as Record<string, unknown[]>)?.[t] : (v as unknown[])) ?? [];
  };

  it("cada polígono de vector.json está en cada región que toca, y en ninguna que no", () => {
    expect(polys.length).toBeGreaterThan(12_000);
    const have = new Map<string, Set<string>>();
    const seen = (id: string, path: string) => {
      const key = `${id}|${path}`;
      let s = have.get(key);
      if (!s) have.set(key, (s = new Set(pick(id, path).map((p) => JSON.stringify(p)))));
      return s;
    };
    for (const [path, shape, ring] of polys) {
      const [x1, y1, x2, y2] = ringBox(ring);
      // Los polígonos van con el giro normalizado (ver `wound`); las líneas no tienen giro.
      const str = JSON.stringify(path.startsWith("roadLines") ? shape : wound(shape as Poly));
      const want = covering(x1, y1, x2, y2);
      for (const id of want) expect(seen(id, path).has(str), `${path} en ${id}`).toBe(true);
    }
  });

  it("todos los polígonos giran igual: el anillo de afuera con área positiva y los huecos al revés (paper.ts los junta con nonzero)", () => {
    // Sin eso, 57 rutas y una vía (las que el juego dibuja al revés) se anulaban donde pisan a otra de su clase.
    const bad: string[] = [];
    let polysN = 0;
    for (const id of regionIds) {
      const r = region(id) as Record<string, unknown>;
      const all: [string, Poly[]][] = [];
      for (const [layer, v] of Object.entries(r)) {
        if (layer === "roadLines") continue;
        if (Array.isArray(v)) all.push([layer, v as Poly[]]);
        else for (const [sub, list] of Object.entries(v as Record<string, Poly[]>)) all.push([`${layer}.${sub}`, list]);
      }
      for (const [path, list] of all)
        list.forEach((p, n) => {
          polysN++;
          p.forEach((ring, i) => {
            const a = area2(ring);
            // Un anillo sin área (degenerado) no tiene giro que normalizar.
            if (a !== 0 && (i === 0 ? a < 0 : a > 0)) bad.push(`${id} ${path}[${n}] ${i === 0 ? "afuera" : "hueco"}`);
          });
        });
    }
    expect(polysN).toBeGreaterThan(12_000);
    expect(bad).toEqual([]);
  });

  it("no hay nada de más: la suma de una capa en las regiones es la de vector.json más los que cruzan", () => {
    const total = (k: keyof Region) => regionIds.reduce((n, id) => n + COUNTS(k)(id), 0);
    const crossing = (list: number[][]) => list.reduce((n, r) => n + covering(...ringBox(r)).length, 0);
    expect(total("b")).toBe(crossing(Object.values(vector.buildings).flat().map((p) => p[0])));
    expect(total("roads")).toBe(crossing(Object.values(vector.roads).flat().map((p) => p[0])));
    expect(total("roadLines")).toBe(crossing(Object.values(vector.roadLines).flat()));
    expect(total("water")).toBe(crossing(vector.water.map((p) => p[0])));
    expect(total("railway")).toBe(crossing(vector.railway.map((p) => p[0])));
  });

  it("las zonas: cada rectángulo de zones.json, como [x, y, w, h, nombre?, extras?], en cada región que toca", () => {
    let rects = 0;
    let polysZ = 0;
    for (const [kind, list] of Object.entries(zonesSrc.zones)) {
      for (const z of list) {
        if (z.r) {
          rects++;
          const [x, y, w, h] = z.r;
          for (const id of coveringZones(x, y, x + w, y + h)) {
            // Hay zonas idénticas en el juego que sólo se distinguen por el piso (un ZombiesType por planta): se busca
            // la que coincide en todo, no la primera con el mismo rectángulo.
            const want = JSON.stringify({ n: z.n ?? "", z: z.z, d: z.d, stair: z.stair });
            const hit = (zonesOf(id).zones?.[kind] ?? []).find(
              (t) =>
                t[0] === x && t[1] === y && t[2] === w && t[3] === h &&
                JSON.stringify({ n: t[4] ?? "", z: t[5]?.z, d: t[5]?.d, stair: t[5]?.stair }) === want,
            );
            expect(hit, `${kind} ${z.r} en ${id}`).toBeTruthy();
          }
        } else if (z.p) {
          polysZ++;
          const [x1, y1, x2, y2] = ringBox(z.p);
          for (const id of coveringZones(x1, y1, x2, y2)) {
            const hit = (zonesOf(id).zonesP?.[kind] ?? []).find((q) => JSON.stringify(q.p) === JSON.stringify(z.p));
            expect(hit, `${kind} polígono en ${id}`).toBeTruthy();
            expect(hit!.n).toBe(z.n);
            expect(hit!.z).toBe(z.z);
          }
        }
      }
    }
    expect(rects).toBeGreaterThan(25_000);
    expect(polysZ).toBeGreaterThan(3_000);
  });

  it("las zonas que asoman por el borde del mapa siguen enteras en la región de adentro, y no se pierde ninguna", () => {
    // El DeepForest [-1, 9401, 8, 199] asoma una casilla por la izquierda: va tal cual a la región 0_6 y a la -1_6 no.
    const edge = (zonesOf("0_6").zones?.DeepForest ?? []).find((t) => t[0] === -1 && t[1] === 9401);
    expect(edge).toEqual([-1, 9401, 8, 199]);
    expect(zoneIds).not.toContain("-1_6");
    // Las 10 que asoman tocan alguna celda del mapa: ninguna zona de zones.json se queda sin región.
    for (const [kind, list] of Object.entries(zonesSrc.zones))
      for (const z of list) {
        const [x1, y1, x2, y2] = z.r ? [z.r[0], z.r[1], z.r[0] + z.r[2], z.r[1] + z.r[3]] : ringBox(z.p!);
        expect(coveringZones(x1, y1, x2, y2).length, `${kind} ${z.r ?? z.p}`).toBeGreaterThan(0);
      }
  });

  it("y las zonas no se inventan: todas las de las regiones están en zones.json", () => {
    const src = new Set<string>();
    for (const [kind, list] of Object.entries(zonesSrc.zones))
      for (const z of list) src.add(`${kind}|${JSON.stringify(z.r ?? z.p)}`);
    for (const id of zoneIds) {
      const r = zonesOf(id);
      for (const [kind, list] of Object.entries(r.zones ?? {}))
        for (const t of list) expect(src.has(`${kind}|${JSON.stringify(t.slice(0, 4))}`), `${kind} ${t}`).toBe(true);
      for (const [kind, list] of Object.entries(r.zonesP ?? {}))
        for (const q of list) expect(src.has(`${kind}|${JSON.stringify(q.p)}`), `${kind} polígono`).toBe(true);
    }
  });

  it("las capas vacías no se escriben (el visor lee `?? {}`)", () => {
    const check = (label: string, r: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(r)) {
        expect(Array.isArray(v) ? v.length : Object.keys(v as object).length, `${label}.${k}`).toBeGreaterThan(0);
        if (!Array.isArray(v)) for (const [t, a] of Object.entries(v as Record<string, unknown[]>)) expect(a.length, `${label}.${k}.${t}`).toBeGreaterThan(0);
      }
    };
    for (const id of regionIds) check(`regions/${id}`, region(id) as Record<string, unknown>);
    for (const id of zoneIds) check(`zones/${id}`, zonesOf(id) as Record<string, unknown>);
  });
});

describe("lo común", () => {
  it("trae lo que no depende del lugar, igual que los JSON de origen", () => {
    expect(common.style).toEqual(vector.style);
    expect(common.bounds).toEqual(vector.bounds);
    expect(common.places).toEqual(vector.places);
    expect(common.streets).toEqual(streetsSrc);
    expect(common.stashes).toEqual(stashesSrc.stashes);
    expect(common.stamps).toEqual(stashesSrc.stamps);
    expect(common.spawns).toEqual(read(DATA, "spawns.json"));
    expect(common.labels).toEqual(read<{ labels: unknown[] }>(DATA, "labels.json").labels);
  });

  it("las calles traen su punto y su ángulo de etiqueta", () => {
    for (const s of common.streets) {
      expect(s.label).toHaveLength(3);
      expect(s.label.every(Number.isFinite)).toBe(true);
    }
  });

  it("los escondites traen sus anotaciones, para dibujarlos como en el juego", () => {
    expect(common.stashes.length).toBeGreaterThan(100);
    expect(common.stashes.some((s) => s.annotations.some((a) => a.text && a.es))).toBe(true);
  });

  it("el punto de cada escondite cae donde lo que dibuja: a menos de 400 casillas de alguna de sus anotaciones", () => {
    // Nueve traían un 1, 2, 3… en vez de una casilla (buildingX = 1): mandaban al visor a (1, 0).
    for (const s of common.stashes) {
      const near = Math.min(...s.annotations.map((a) => Math.hypot(a.x - s.building[0], a.y - s.building[1])));
      expect(near, `${s.id} ${s.building}`).toBeLessThan(400);
    }
  });

  it("los nueve sin casilla propia pasan al centro de sus anotaciones y guardan lo que decía el juego", () => {
    const moved = common.stashes.filter((s) => s.buildingRaw);
    expect(moved.map((s) => s.id).sort()).toEqual(
      ["EkronStashMap6", "EkronStashMap7", "EkronStashMap8", "IrvingtonStashMap10", "IrvingtonStashMap9", "MulStashMap19", "WorldStashMap21", "WorldStashMap23", "WorldStashMap6"],
    );
    for (const s of moved) {
      const [rx, ry] = s.buildingRaw!;
      expect(rx < 50 && ry < 50, `${s.id} decía ${s.buildingRaw}`).toBe(true);
      const n = s.annotations.length;
      const cx = s.annotations.reduce((t, a) => t + a.x, 0) / n;
      const cy = s.annotations.reduce((t, a) => t + a.y, 0) / n;
      expect(Math.abs(s.building[0] - cx), s.id).toBeLessThanOrEqual(0.5);
      expect(Math.abs(s.building[1] - cy), s.id).toBeLessThanOrEqual(0.5);
    }
    // Los otros 116 quedan con el punto del juego, tal cual.
    for (const s of common.stashes.filter((s) => !s.buildingRaw)) expect(s.building[0] > 50 || s.building[1] > 50, s.id).toBe(true);
  });

  it("el pueblo más cercano de los escondites de campo sale de su punto bueno, no del 1 de buildingX = 1", () => {
    const towns = common.labels.filter((l) => l.layer === "text-town");
    const nearest = (p: [number, number]) => towns.reduce((a, b) => (Math.hypot(a.x - p[0], a.y - p[1]) <= Math.hypot(b.x - p[0], b.y - p[1]) ? a : b));
    const field = common.stashes.filter((s) => s.town === null);
    expect(field.length).toBeGreaterThan(10);
    for (const s of field) expect(s.near?.toLowerCase(), s.id).toBe(nearest(s.building).text.toLowerCase());
    // WorldStashMap6 (10189, 6693) queda al lado de West Point, no en Brandenburg, que era donde lo dejaba el (0, 1).
    expect(common.stashes.find((s) => s.id === "WorldStashMap6")?.near).toBe("West Point");
    expect(common.stashes.find((s) => s.id === "WorldStashMap23")?.near).toBe("March Ridge");
  });
});

describe("el buscador", () => {
  const find = (k: string, en: string) => search.find((h) => h.k === k && h.en === en);

  it("cada entrada es { k, en, es, x, y } con un tipo de los conocidos y un punto dentro del mapa", () => {
    const kinds = new Set(["street", "town", "stash", "building", "story"]);
    for (const h of search) {
      expect(kinds.has(h.k), JSON.stringify(h)).toBe(true);
      expect(h.en.trim(), JSON.stringify(h)).not.toBe("");
      expect(h.es.trim(), JSON.stringify(h)).not.toBe("");
      expect(Number.isInteger(h.x) && Number.isInteger(h.y), JSON.stringify(h)).toBe(true);
      expect(h.x >= 0 && h.x <= common.bounds[2] + 300 && h.y >= 0 && h.y <= common.bounds[3] + 300, JSON.stringify(h)).toBe(true);
    }
    for (const k of kinds) expect(search.some((h) => h.k === k), k).toBe(true);
  });

  it("tiene Muldraugh como pueblo, con el punto del pueblo", () => {
    const h = find("town", "Muldraugh");
    expect(h).toBeTruthy();
    expect(h!.es).toBe("Muldraugh");
    // Dentro del pueblo: a menos de 400 casillas del Knox Bank.
    expect(Math.hypot(h!.x - 10623, h!.y - 9685)).toBeLessThan(400);
  });

  it("tiene los doce pueblos del mapa", () => {
    expect(search.filter((h) => h.k === "town").length).toBeGreaterThanOrEqual(12);
    for (const n of ["West Point", "Riverside", "Louisville", "March Ridge", "Valley Station"]) expect(find("town", n), n).toBeTruthy();
  });

  it("tiene las calles de streets.json, una entrada por nombre, en el punto de la etiqueta de su tramo más largo", () => {
    const names = new Set(streetsSrc.map((s) => s.name));
    const hits = search.filter((h) => h.k === "street");
    expect(hits.length).toBe(names.size);
    expect(new Set(hits.map((h) => h.en)).size).toBe(hits.length);
    const main = find("street", "Main St");
    expect(main, "Main St").toBeTruthy();
    const pieces = streetsSrc.filter((s) => s.name === "Main St");
    expect(pieces.some((s) => s.label[0] === main!.x && s.label[1] === main!.y)).toBe(true);
    const first = streetsSrc[0];
    expect(find("street", first.name)).toBeTruthy();
  });

  it("tiene un escondite por mapa anotado, con el texto que el jugador ve en el mapa, en inglés y en español", () => {
    expect(search.filter((h) => h.k === "stash").length).toBe(stashesSrc.stashes.length);
    const piano = search.find((h) => h.k === "stash" && h.en.includes("Piano teacher's house"));
    expect(piano?.es).toContain("Casa de profe de piano");
    expect(piano?.en).toContain("Brandenburg");
    expect([piano?.x, piano?.y]).toEqual([2174, 6011]);
  });

  it("cada escondite del buscador cae a menos de 400 casillas de alguna de sus anotaciones, en el punto de common.stashes", () => {
    const hits = search.filter((h) => h.k === "stash");
    expect(hits.length).toBe(common.stashes.length);
    hits.forEach((h, i) => {
      const s = common.stashes[i];
      expect([h.x, h.y], s.id).toEqual([s.building[0], s.building[1]]);
      const near = Math.min(...s.annotations.map((a) => Math.hypot(a.x - h.x, a.y - h.y)));
      expect(near, `${s.id}: ${h.en}`).toBeLessThan(400);
    });
    // Los nueve de antes, uno por uno: ninguno en la esquina (1, 0).
    expect(hits.filter((h) => h.x < 50 && h.y < 50)).toEqual([]);
  });

  it("el buscador no indexa los insultos de los escondites: el de Ekron que se burla del lector queda con etiqueta neutra", () => {
    const rude = /fuck|shit|bitch|dick|asshole|bastard|bleach|kill yuor|suic[ií]d|\bcloro\b|gilipollas|cabr[oó]n|imb[eé]cil|\bputa\b|mierda|\bidiota\b/i;
    for (const h of search.filter((h) => h.k === "stash")) {
      expect(h.en, h.en).not.toMatch(rude);
      expect(h.es, h.es).not.toMatch(rude);
    }
    const ekron = common.stashes.findIndex((s) => s.id === "EkronStashMap6");
    const hit = search.filter((h) => h.k === "stash")[ekron];
    expect(hit.en).toBe("Stash map 6 (Ekron)");
    expect(hit.es).toBe("Mapa de escondite 6 (Ekron)");
    // Las notas siguen enteras en common.stashes: ahí son el dibujo del mapa, tal cual el juego.
    expect(common.stashes[ekron].annotations.some((a) => a.text === "drink bleach bitch!!")).toBe(true);
    // Y el que no ofende conserva su texto (se busca por lo que uno lee en el mapa).
    expect(search.some((h) => h.k === "stash" && h.en.includes("Piano teacher's house"))).toBe(true);
  });

  it("no hay dos entradas del mismo tipo con el mismo nombre: los escondites, calles, historias… se distinguen", () => {
    const seen = new Map<string, Hit>();
    for (const h of search) {
      const key = `${h.k}|${h.en.toLowerCase()}`;
      expect(seen.get(key), `${h.k} "${h.en}" (${h.x}, ${h.y}) repetido`).toBeUndefined();
      seen.set(key, h);
    }
  });

  it("tiene los edificios con nombre, con el nombre que les pone el juego (y en español si lo traduce)", () => {
    const bank = find("building", "Knox Bank");
    expect(bank).toBeTruthy();
    expect(bank!.x).toBeGreaterThanOrEqual(10623);
    expect(bank!.x).toBeLessThanOrEqual(10633);
    expect(bank!.y).toBeGreaterThanOrEqual(9685);
    expect(bank!.y).toBeLessThanOrEqual(9706);
    expect(find("building", "Nolan's Used Cars")?.es).toBe("Coches de Ocasión Nolan");
    expect(find("building", "Kentucky State Prison"), "los rótulos del mapa de papel también").toBeTruthy();
  });

  it("y las historias con nombre propio, sin las de bosque, lago y playa que llenan el mapa", () => {
    const stories = search.filter((h) => h.k === "story");
    expect(stories.length).toBeGreaterThan(5);
    expect(stories.length).toBeLessThan(60);
    for (const generic of ["Forest", "forest", "Lake", "Beach"]) expect(find("story", generic), generic).toBeUndefined();
    // Sólo las que el juego arma: la "KirstyCormick" del mapa (con C; el juego dice K) no tiene historia, y no se busca.
    expect(stories.some((h) => /Kirsty/.test(h.en))).toBe(false);
    expect(stories.some((h) => /Frank Hemingway/.test(h.en))).toBe(true);
  });

  it("las historias con el mismo nombre en lugares distintos llevan el pueblo más cercano; las del mismo lugar son una", () => {
    const baseball = search.filter((h) => h.k === "story" && h.en.startsWith("Baseball Diamond"));
    expect(baseball.map((h) => h.en).sort()).toEqual(["Baseball Diamond (Louisville)", "Baseball Diamond (Riverside)"]);
    expect(baseball.find((h) => h.en.endsWith("(Riverside)"))?.es).toBe("Campo de béisbol (Riverside)");
    // El "Festival Grounds" son dos zonas a 75 casillas: una entrada, sin pueblo, en el medio de las dos.
    const festival = search.filter((h) => h.k === "story" && h.en.startsWith("Festival Grounds"));
    expect(festival.map((h) => h.en)).toEqual(["Festival Grounds"]);
    const zs = (zonesSrc.zones.ZoneStory ?? []).filter((z) => z.n === "MusicFest" && z.r);
    expect(zs.length).toBe(2);
    const mid = zs.map((z) => [z.r![0] + z.r![2] / 2, z.r![1] + z.r![3] / 2]);
    expect(festival[0].x).toBe(Math.round((mid[0][0] + mid[1][0]) / 2));
    expect(festival[0].y).toBe(Math.round((mid[0][1] + mid[1][1]) / 2));
    // Las que no se repiten conservan su nombre pelado.
    expect(search.some((h) => h.k === "story" && h.en === "Frank Hemingway")).toBe(true);
  });
});

describe("meta.json", () => {
  it("el hash de los datos cubre también web/ (y zombies.bin): si cambia una región, cambia la fecha del sitemap", () => {
    const all = (dir: string, prefix = ""): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? all(join(dir, e.name), `${prefix}${e.name}/`) : /\.(json|bin)$/.test(e.name) ? [`${prefix}${e.name}`] : [],
      );
    const h = createHash("sha256");
    for (const rel of all(DATA).filter((f) => f !== "meta.json").sort()) {
      h.update(Buffer.from(rel));
      h.update(Buffer.from([0]));
      h.update(readFileSync(join(DATA, rel)));
    }
    expect(read<{ dataHash: string }>(DATA, "meta.json").dataHash).toBe(h.digest("hex"));
  });
});
