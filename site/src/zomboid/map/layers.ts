/**
 * Las capas del juego del Mapa de Project Zomboid (2026-09-30, Task 3): vehículos, recolección, granjas y animales,
 * sótanos posibles, zombis por tipo, historias, botín rico, edificios con nombre, puntos de aparición y escondites.
 * Plan: docs/superpowers/plans/2026-09-30-zomboid-mapa.md; el contrato de los datos, en `write_web` de `map.py`.
 *
 * Todo lo de acá es lógica pura, sin Leaflet ni `window`, y se prueba en `test/zomboidMapLayers.test.ts`:
 *
 * - **Zonas** (`zones/<id>.json` de cada región): rectángulos `[x, y, ancho, alto, nombre?, extras?]` y polígonos. Una
 *   zona que cruza la frontera entre regiones viene en cada una, y se dibuja una sola vez: se deduplica por
 *   `tipo|x,y,w,h|nombre|extras` y no por la posición sola, porque el juego tiene zonas idénticas que sólo cambian el
 *   piso (`z`) o la dirección (`d`), y esas son dos. Se dibujan en canvas (`drawZones`): son miles (9.690 lugares para
 *   autos) y como marcadores de Leaflet no entrarían en el DOM.
 * - **Puntos de aparición**: con la regla del juego para la profesión (ver `spawnMarks`).
 * - **Escondites**: sus anotaciones como las dibuja el juego (`annotationMark`, `stashPin`). Los textos de las notas
 *   van sólo en el mapa: hay alguno con palabrotas del juego, y no pueden terminar en un título ni en otro texto.
 *
 * Los nombres que se leen (el tipo de vehículo, la especie, el tipo de zombi…) salen de las tablas de `zoneNames.ts`.
 * Sólo lo usa el visor (`overlays.ts`, `regionData.ts`) y viaja en su chunk; lo que la página necesita antes (colores,
 * sellos, cifras, tipos) está en `layerMeta.ts`.
 */
import type { Lang } from "../../i18n";
import {
  ZONE_COLOR,
  ZONE_LAYER,
  humanize,
  type Annotation,
  type SpawnData,
  type SpawnPoint,
  type StampDef,
  type Stash,
  type ZoneDefs,
  type ZoneKind,
} from "./layerMeta";
import type { Rect } from "./paper";
import type { LayerId } from "./url";
import { BUILDING_NAMES, type ZoneNames } from "./zoneNames";

// ─────────────────────────────── zonas ───────────────────────────────

/**
 * De abajo hacia arriba: la recolección cubre casi todo el mapa y va al fondo; lo chico (sótanos, autos) arriba, para
 * que se vea y se pueda tocar.
 */
const DRAW_ORDER: ZoneKind[] = [
  "TownZone",
  "TrailerPark",
  "FarmLand",
  "Farm",
  "Vegitation",
  "Forest",
  "DeepForest",
  "ZombiesType",
  "Ranch",
  "LootZone",
  "ZoneStory",
  "BuildingName",
  "Basement",
  "ParkingStall",
];
const RANK = new Map(DRAW_ORDER.map((k, i) => [k, i]));

/** El slug de la lista de todo el mundo ("desempleado"), para nombrarla distinto en la nota de un punto. */
export const fallbackProf = (known: ReadonlySet<string>): string | null => professionSlug("unemployed", known);

/** Lo que el juego pone de más en una zona: el piso, la dirección (autos) y la escalera (sótanos, relativa a la zona). */
export interface ZoneExtras {
  z?: number;
  d?: string;
  stair?: [number, number, string];
}
export type RawRect = [number, number, number, number, string?, ZoneExtras?];
export interface RawPoly {
  p: number[];
  n?: string;
  z?: number;
  line?: boolean;
}
/** Un `zones/<id>.json` tal como lo escribe `map.py`. */
export interface ZonesFile {
  zones?: Record<string, RawRect[]>;
  zonesP?: Record<string, RawPoly[]>;
}

export interface Zone {
  kind: ZoneKind;
  /** `tipo|x,y,w,h|nombre|extras`: la misma zona en dos regiones da la misma clave. */
  key: string;
  /** El nombre del juego ("police", " Offices", "cowlarge"), tal cual; "" si no tiene. */
  name: string;
  box: [number, number, number, number];
  area: number;
  rect?: [number, number, number, number];
  poly?: number[];
  line?: boolean;
  z?: number;
  d?: string;
  stair?: [number, number, string];
}

const isKind = (k: string): k is ZoneKind => Object.hasOwn(ZONE_LAYER, k);

function polyBox(p: number[]): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < b[0]) b[0] = p[i];
    if (p[i] > b[2]) b[2] = p[i];
    if (p[i + 1] < b[1]) b[1] = p[i + 1];
    if (p[i + 1] > b[3]) b[3] = p[i + 1];
  }
  return b;
}

/**
 * Las zonas de un archivo de región que van a alguna capa, con su caja y su clave calculadas una vez.
 *
 * Con `defs`, las zonas de historia que el juego nunca arma (un nombre que ninguna clase de historia usa: ver
 * `ZoneDefs.stories`) no entran: no son historias, y mostrarlas como "una escena al azar" prometía algo que no pasa. Sin
 * `defs` (los tests de la geometría) entran todas.
 */
export function parseZones(file: ZonesFile, defs?: ZoneDefs): Zone[] {
  const out: Zone[] = [];
  const live = defs && new Set(defs.stories);
  for (const [kind, rects] of Object.entries(file.zones ?? {})) {
    if (!isKind(kind)) continue;
    for (const [x, y, w, h, name = "", extras] of rects) {
      if (kind === "ZoneStory" && live && !live.has(name)) continue;
      const zone: Zone = {
        kind,
        key: `${kind}|${x},${y},${w},${h}|${name}|${extras ? JSON.stringify(extras) : ""}`,
        name,
        box: [x, y, x + w, y + h],
        area: w * h,
        rect: [x, y, w, h],
      };
      if (extras?.z != null) zone.z = extras.z;
      if (extras?.d) zone.d = extras.d;
      if (extras?.stair) zone.stair = extras.stair;
      out.push(zone);
    }
  }
  for (const [kind, polys] of Object.entries(file.zonesP ?? {})) {
    if (!isKind(kind)) continue;
    for (const p of polys) {
      if (kind === "ZoneStory" && live && !live.has(p.n ?? "")) continue;
      const box = polyBox(p.p);
      const zone: Zone = {
        kind,
        key: `${kind}|p:${p.p.join(",")}|${p.n ?? ""}|${p.z ?? ""}${p.line ? "|line" : ""}`,
        name: p.n ?? "",
        box,
        area: (box[2] - box[0]) * (box[3] - box[1]),
        poly: p.p,
      };
      if (p.z != null) zone.z = p.z;
      if (p.line) zone.line = true;
      out.push(zone);
    }
  }
  return out;
}

/**
 * Las zonas de las capas prendidas que tocan `rect`, de varias regiones, cada una una vez, en el orden en que se
 * dibujan (de abajo hacia arriba; dentro de un tipo, las grandes primero, así una chica encima se ve).
 */
export function zonesIn(lists: readonly (readonly Zone[])[], rect: Rect, on: ReadonlySet<LayerId>): Zone[] {
  const seen = new Set<string>();
  const out: Zone[] = [];
  for (const list of lists) {
    for (const z of list) {
      if (!on.has(ZONE_LAYER[z.kind])) continue;
      const b = z.box;
      if (b[0] > rect.x1 || b[2] < rect.x0 || b[1] > rect.y1 || b[3] < rect.y0) continue;
      if (seen.has(z.key)) continue;
      seen.add(z.key);
      out.push(z);
    }
  }
  return out.sort((a, b) => RANK.get(a.kind)! - RANK.get(b.kind)! || b.area - a.area);
}

/** ¿El punto está adentro del anillo? (Par o impar de cruces, como `evenodd`.) */
function inRing(p: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** ¿La casilla (x, y) —con decimales: el punto bajo el cursor— cae en la zona? Un rectángulo cubre [x, x + ancho). */
export function zoneContains(z: Zone, x: number, y: number): boolean {
  if (z.rect) {
    const [zx, zy, w, h] = z.rect;
    return x >= zx && x < zx + w && y >= zy && y < zy + h;
  }
  return !!z.poly && !z.line && inRing(z.poly, x, y);
}

/** Las zonas de las capas prendidas bajo un punto, la de arriba primero (lo que se ve encima es lo que se tocó). */
export function zonesAt(lists: readonly (readonly Zone[])[], x: number, y: number, on: ReadonlySet<LayerId>): Zone[] {
  return zonesIn(lists, { x0: x, y0: y, x1: x, y1: y }, on)
    .filter((z) => zoneContains(z, x, y))
    .reverse();
}

// ─────────────────────────────── nombres ───────────────────────────────

/** La clave de las tablas de `zoneNames.ts` para lo que no es un nombre del juego (corrales, edificios): sin espacios ni mayúsculas. */
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

/**
 * El tipo de vehículo de un lugar para autos, como lo busca el juego (IsoChunk y VehicleType): sin nombre usa la tabla
 * del tipo de zona ("parkingstall"); el nombre va en minúsculas; un "rtrafficjamw" es un embotellamiento que sólo sale
 * una de cada diez veces (`Rand.Next(100) < 10` en IsoChunk), con la tabla de "trafficjamw". `null` si el juego no tiene
 * esa tabla: ahí no aparece ningún auto.
 */
function vehicleKey(name: string, defs: ZoneDefs): string | null {
  let k = (name || "parkingstall").toLowerCase();
  const sometimes = /^rtrafficjam[nsew]$/.test(k);
  if (sometimes) k = k.slice(1);
  if (!defs.vehicles.includes(k)) return null;
  if (k.startsWith("trafficjam")) return sometimes ? "rtrafficjam" : "trafficjam";
  return k === "parkingstall" ? "" : k;
}

/** La tabla de zombis de una zona, en minúsculas para buscarla en `zoneNames.ts`; "" si usa la de todo el mundo (`Default`). */
function zombieKey(name: string, defs: ZoneDefs): string {
  const table = Object.hasOwn(defs.zombies, name) ? defs.zombies[name] : "Default";
  return table === "Default" ? "" : table.toLowerCase();
}

const pick = (table: Record<string, string>, key: string, raw: string) => (Object.hasOwn(table, key) ? table[key] : humanize(raw));

/** La especie de un corral: "cowlarge" → vacas (corral grande); "notchicken" es vacas, ovejas o chanchos, al azar. */
function ranchText(name: string, t: ZoneNames): string {
  const k = norm(name);
  const species = t.ranch.species;
  if (Object.hasOwn(species, k)) return species[k];
  const m = k.match(/^(.*?)(small|large|big)$/);
  if (m && Object.hasOwn(species, m[1])) return `${species[m[1]]} (${m[2] === "small" ? t.ranch.small : t.ranch.large})`;
  return humanize(name);
}

/** El nombre de un edificio con nombre propio ("KnoxBank" → "Knox Bank", "BinkysFarm" → "Binky's Farm"). */
export const buildingName = (name: string): string => {
  const k = norm(name);
  return Object.hasOwn(BUILDING_NAMES, k) ? BUILDING_NAMES[k] : humanize(name);
};

/** El tipo de zombi de una zona: el de su tabla, o "variados" si usa la de todo el mundo. */
const zombieText = (z: Zone, t: ZoneNames, defs: ZoneDefs) => {
  const k = zombieKey(z.name, defs);
  return Object.hasOwn(t.zombieTypes, k) ? t.zombieTypes[k] : humanize(k);
};

/**
 * La historia de una zona. El juego elige una historia cuyo tipo de zona sea igual al nombre (`String.equals`, con
 * mayúsculas): las de "Forest", "Lake" y "Beach" son muchas (29 en el bosque, 6 junto al lago, 5 en la playa) y se
 * sortean, así que se dice eso y no una en particular. Una zona cuyo nombre no usa ninguna historia no llega hasta acá
 * (`parseZones` la deja afuera); un nombre que sí se usa y no está en la tabla se muestra separado en palabras.
 */
const storyText = (z: Zone, t: ZoneNames) => pick(t.stories, z.name, z.name);

/** Lo que dice una zona al tocarla: su capa y qué es ("Vehículos: policía"), con el piso si no es la planta baja. */
export function zoneLabel(z: Zone, t: ZoneNames, defs: ZoneDefs): string {
  let label: string;
  switch (z.kind) {
    case "ParkingStall": {
      const k = vehicleKey(z.name, defs);
      label = t.zone.vehicles(k === null ? t.zone.noVehicles : pick(t.vehicleTypes, k, z.name));
      break;
    }
    case "Ranch":
      label = t.zone.animals(ranchText(z.name, t));
      break;
    case "Basement":
      label = t.zone.basement;
      break;
    case "ZombiesType":
      label = t.zone.zombies(zombieText(z, t, defs));
      break;
    case "ZoneStory":
      label = t.zone.story(storyText(z, t));
      break;
    case "LootZone":
      label = norm(z.name) === "poor" ? t.zone.loot.poor : t.zone.loot.rich;
      break;
    case "BuildingName":
      label = buildingName(z.name);
      break;
    default:
      label = t.zone.forage(t.forage[z.kind]);
  }
  return z.z ? t.zone.floor(label, String(z.z)) : label;
}

/** El texto corto que va adentro de una zona cuando entra (el tipo de zombi, la historia, el edificio), sin la capa. */
export function zoneText(z: Zone, t: ZoneNames, defs: ZoneDefs): string | null {
  switch (z.kind) {
    case "ZombiesType":
      return zombieText(z, t, defs);
    case "ZoneStory":
      return storyText(z, t);
    case "BuildingName":
      return buildingName(z.name);
    case "Ranch":
      return ranchText(z.name, t);
    default:
      return null;
  }
}

/** El sello que va adentro de una zona (el sufijo de `map_<nombre>.png`), si lleva uno. */
export function zoneStamp(z: Zone): string | null {
  switch (z.kind) {
    case "ParkingStall":
      return "steeringwheel";
    case "Basement":
      return "ladder";
    case "LootZone":
      return "dollarsign";
    case "BuildingName":
      return "house";
    case "ZombiesType":
      return "z";
    case "ZoneStory":
      // Con el nombre tal cual, como el juego (una zona "forest" en minúscula no llega acá: no arma ninguna historia).
      return z.name === "Forest" ? "tent" : z.name === "Lake" ? "fish" : z.name === "Beach" ? "sun" : z.name === "Baseball" ? "baseball" : "exclamation";
    case "Ranch": {
      const k = norm(z.name).replace(/(small|large|big|onlyone)$/, "");
      return ["cow", "pig", "sheep", "chicken", "turkey", "rabbit"].includes(k) ? k : "pawprint";
    }
    default:
      return null;
  }
}

// ─────────────────────────────── dibujo ───────────────────────────────

type ZoneCtx = Pick<
  CanvasRenderingContext2D,
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "rect"
  | "fill"
  | "stroke"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "globalAlpha"
  | "drawImage"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "measureText"
  | "fillText"
  | "strokeText"
>;

export interface DrawZoneOptions {
  /** El sello teñido y listo (con su halo), o `null` si la imagen todavía no llegó (la capa se redibuja al llegar). */
  stamp: (file: string, color: string) => CanvasImageSource | null;
  /** El texto corto de una zona (ver `zoneText`), ya en el idioma de la página. */
  text: (z: Zone) => string | null;
  /** Letra y halo: claros sobre el satélite, tinta sobre el papel (como las calles). */
  theme: { fill: string; halo: string };
}

/** El sello teñido mide 64 px de dibujo más 4 de halo por lado (ver `overlays.ts`). */
export const STAMP_CANVAS = 72;
const STAMP_PAD = STAMP_CANVAS / 64;

/** Lo más chico que se dibuja una zona chica (un lugar para un auto de lejos): dos píxeles, para que se vea el punto. */
const MIN_PX = 2;

function drawStamp(ctx: ZoneCtx, img: CanvasImageSource, cx: number, cy: number, size: number) {
  const s = size * STAMP_PAD;
  ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
}

/**
 * Pinta las zonas en la tesela que cubre `rect`, a `scale` píxeles por casilla: el tinte de cada una, el contorno de
 * cerca, y adentro su sello y su nombre cuando entran. Las zonas llegan en orden (`zonesIn`).
 */
export function drawZones(ctx: ZoneCtx, zones: readonly Zone[], rect: Rect, scale: number, opts: DrawZoneOptions): void {
  const px = (x: number) => (x - rect.x0) * scale;
  const py = (y: number) => (y - rect.y0) * scale;
  ctx.lineJoin = "round";
  for (const z of zones) {
    const color = ZONE_COLOR[z.kind];
    const forage = ZONE_LAYER[z.kind] === "recoleccion";
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (z.rect) {
      let [x, y, w, h] = [px(z.rect[0]), py(z.rect[1]), z.rect[2] * scale, z.rect[3] * scale];
      if (w < MIN_PX) (x -= (MIN_PX - w) / 2), (w = MIN_PX);
      if (h < MIN_PX) (y -= (MIN_PX - h) / 2), (h = MIN_PX);
      ctx.rect(x, y, w, h);
    } else if (z.poly) {
      const p = z.poly;
      ctx.moveTo(px(p[0]), py(p[1]));
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(px(p[i]), py(p[i + 1]));
      if (!z.line) ctx.closePath();
    }
    if (!z.line) {
      // La recolección cubre casi todo y va sobre el verde del satélite: un poco más de tinte para que se lea.
      ctx.globalAlpha = forage ? 0.42 : 0.4;
      ctx.fill();
    }
    // El contorno ayuda a separar zonas pegadas, pero de lejos la recolección sería una red de líneas.
    if (z.line || scale >= (forage ? 1 : 0.25)) {
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = z.line ? 2 : 1;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Los sellos y los nombres, después de todos los tintes: así ninguna zona de arriba tapa un sello de abajo a medias.
  ctx.font = `600 11px "Noto Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  for (const z of zones) {
    const file = zoneStamp(z);
    const [x0, y0, x1, y1] = z.box;
    const w = (x1 - x0) * scale;
    const h = (y1 - y0) * scale;
    let cx = px((x0 + x1) / 2);
    let cy = py((y0 + y1) / 2);
    let size = 0;
    if (z.kind === "Basement" && z.stair) {
      // La escalera va donde el juego la pone (relativa a la zona), del tamaño de un sello chico desde que se ve el
      // pueblo: es lo que dice "acá abajo puede haber un sótano".
      if (scale >= 0.5) {
        cx = px(x0 + z.stair[0] + 0.5);
        cy = py(y0 + z.stair[1] + 0.5);
        size = Math.min(22, 12 + 6 * Math.max(0, Math.log2(scale) + 1));
      }
    } else if (file) {
      const room = Math.min(w, h);
      // Los autos, del ancho del lugar (un lugar de 3 casillas recién a zoom 5); lo demás, desde que entra un sello.
      size = z.kind === "ParkingStall" ? (room >= 9 ? Math.min(room * 0.85, 20) : 0) : room >= 16 ? Math.min(room * 0.55, 28) : 0;
    }
    if (size && file) {
      const img = opts.stamp(file, ZONE_COLOR[z.kind]);
      if (img) drawStamp(ctx, img, cx, cy, size);
    }
    const text = scale >= 0.5 ? opts.text(z) : null;
    if (!text) continue;
    const tw = ctx.measureText(text).width;
    const ty = size ? cy + size / 2 + 9 : cy;
    if (tw + 6 > w || (size ? size + 22 : 16) > h) continue;
    ctx.strokeStyle = opts.theme.halo;
    ctx.fillStyle = opts.theme.fill;
    ctx.strokeText(text, cx, ty);
    ctx.fillText(text, cx, ty);
  }
}

// ─────────────────────────────── puntos de aparición ───────────────────────────────

/**
 * Los nombres del juego que no son el slug de la ficha de Profesiones. Hay dos generaciones: `spawnpoints.lua` de cada
 * pueblo usa los ids de siempre ("mechanics", "fireofficer", "unemployed"), y los SpawnPoint de objects.lua los de B42
 * ("angler", "diyexpert", "blacksmith"). Los demás se parecen al slug sin guiones ("constructionworker").
 */
const PROF_ALIASES: Record<string, string> = {
  unemployed: "custom-occupation",
  fireofficer: "firefighter",
  fisherman: "fishing-guide",
  angler: "fishing-guide",
  mechanics: "mechanic",
  metalworker: "welder",
  repairman: "diy-expert",
  smither: "blacksmith",
};

const profIndexes = new WeakMap<ReadonlySet<string>, Map<string, string>>();
function profIndex(known: ReadonlySet<string>): Map<string, string> {
  let m = profIndexes.get(known);
  if (!m) {
    m = new Map();
    for (const s of known) {
      m.set(s, s);
      m.set(s.replace(/-/g, ""), s);
    }
    for (const [token, slug] of Object.entries(PROF_ALIASES)) if (known.has(slug)) m.set(token, slug);
    profIndexes.set(known, m);
  }
  return m;
}

/** El slug de la ficha de una profesión del juego ("mechanics" → "mechanic"); `null` si no es una ("all", o una rara). */
export function professionSlug(token: string, known: ReadonlySet<string>): string | null {
  const t = token.trim().toLowerCase();
  if (t === "all") return null;
  return profIndex(known).get(t) ?? null;
}

export interface SpawnMark {
  x: number;
  y: number;
  z: number;
  /** El pueblo del `spawnpoints.lua` ("Muldraugh"), o `null` si es un SpawnPoint suelto del mapa. */
  town: string | null;
  /** Las profesiones del punto, como slugs de ficha, sin repetir. */
  profs: string[];
  /**
   * Un punto para todas las profesiones: un SpawnPoint "all", o un pueblo que sólo tiene la lista de desempleado (ahí
   * aparece todo el mundo, sea cual sea su profesión).
   */
  all: boolean;
}

const townName = (name: string) => name.replace(/,\s*KY$/i, "").trim();

function mark(p: SpawnPoint, town: string | null, known: ReadonlySet<string>): SpawnMark {
  const profs: string[] = [];
  for (const t of p[3]) {
    const s = professionSlug(t, known);
    if (s && !profs.includes(s)) profs.push(s);
  }
  return { x: p[0], y: p[1], z: p[2], town, profs, all: p[3].some((t) => t.trim().toLowerCase() === "all") };
}

/**
 * Los puntos de aparición, todos o los de una profesión. Con la regla del juego: al elegir un pueblo, se aparece en
 * uno de los puntos de la profesión; si el pueblo no tiene lista para ella, en los de "desempleado" (la lista de todo
 * el mundo). Los SpawnPoint sueltos del mapa valen si nombran la profesión o si son para todas.
 */
export function spawnMarks(data: SpawnData, prof: string | null, known: ReadonlySet<string>): SpawnMark[] {
  const fallback = professionSlug("unemployed", known);
  const out: SpawnMark[] = [];
  for (const town of data.towns) {
    const marks = town.points.map((p) => mark(p, townName(town.name), known));
    if (fallback && marks.every((m) => m.profs.every((s) => s === fallback))) for (const m of marks) m.all = true;
    if (!prof) {
      out.push(...marks);
      continue;
    }
    const own = marks.filter((m) => m.profs.includes(prof));
    out.push(...(own.length ? own : marks.filter((m) => fallback !== null && m.profs.includes(fallback))));
  }
  for (const p of data.zones) {
    const m = mark(p, null, known);
    if (!prof || m.all || m.profs.includes(prof)) out.push(m);
  }
  return out;
}

/** Las profesiones que un punto no nombra (vacío si es para todas): para decir "todas menos Médico e Ingeniero". */
export const spawnMissing = (m: SpawnMark, known: ReadonlySet<string>): string[] =>
  m.all ? [] : [...known].filter((s) => !m.profs.includes(s));

// ─────────────────────────────── escondites ───────────────────────────────

export type AnnotationMark =
  | { kind: "stamp"; x: number; y: number; color: string; src: string }
  | { kind: "text"; x: number; y: number; color: string; text: string };

export const stampSrc = (file: string): string => `/zomboid/map/stamps/${file}`;

/** El color de una anotación va a un `style`: sólo pasa un `#rrggbb`. */
const COLOR = /^#[0-9a-f]{6}$/i;
const INK = "#212121";
const safeColor = (c: string) => (COLOR.test(c) ? c : INK);

/**
 * Una anotación como la dibuja el juego: el sello teñido de su color (centrado en su punto) o el texto con su color
 * (desde su punto hacia la derecha y abajo), en el idioma de la página si el juego lo tradujo.
 */
export function annotationMark(a: Annotation, lang: Lang, stamps: Record<string, StampDef>): AnnotationMark | null {
  const color = safeColor(a.color);
  if (a.stamp) {
    return Object.hasOwn(stamps, a.stamp) ? { kind: "stamp", x: a.x, y: a.y, color, src: stampSrc(stamps[a.stamp].file) } : null;
  }
  const text = (lang === "es" && a.es) || a.text;
  return text ? { kind: "text", x: a.x, y: a.y, color, text } : null;
}

/**
 * La anotación que marca el escondite: el sello más cercano a su lugar (el círculo o la X sobre la casa). Sin sellos,
 * la primera que se dibuja. `-1` si no tiene ninguna. De cerca es la que se elige con el teclado (una por escondite).
 */
export function stashMainAnnotation(stash: Pick<Stash, "building" | "annotations">, stamps: Record<string, StampDef>): number {
  const [x, y] = stash.building;
  let best = -1;
  let dist = Infinity;
  stash.annotations.forEach((a, i) => {
    if (!a.stamp || !Object.hasOwn(stamps, a.stamp)) return;
    const d = Math.hypot(a.x - x, a.y - y);
    if (d < dist) (best = i), (dist = d);
  });
  return best >= 0 ? best : stash.annotations.findIndex((a) => !!a.text);
}

/**
 * El escondite de lejos: un solo sello en su lugar, el de la anotación más cercana (la que lo marca). Sin sellos, una
 * X del color de su primera nota.
 */
export function stashPin(
  stash: Pick<Stash, "building" | "annotations">,
  stamps: Record<string, StampDef>,
): { x: number; y: number; color: string; src: string } {
  const [x, y] = stash.building;
  const best = stash.annotations[stashMainAnnotation(stash, stamps)];
  if (best?.stamp) return { x, y, color: safeColor(best.color), src: stampSrc(stamps[best.stamp].file) };
  return { x, y, color: safeColor(stash.annotations[0]?.color ?? "#a60e0e"), src: stampSrc(stamps.X?.file ?? "map_x.png") };
}
