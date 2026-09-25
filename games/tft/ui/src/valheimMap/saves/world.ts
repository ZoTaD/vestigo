// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Saves/SaveDiscovery.cs, WorldSaveReader.cs y ChunkMappingReader.cs
/**
 * Una carpeta de mundo, entera. En 1.0 (`World.IsChunkedSave`) cada guardado
 * es un grupo `_main.<N>.fwl2/.db2/.chunks/.ok` más los `.chunk` con los
 * objetos; el juego se queda con el grupo completo de número más alto
 * (`SaveCollection.KeepOnlyNewest`) y el `.chunks` dice qué `.chunk` le tocan.
 * Antes de 1.0 eran `<mundo>.fwl` + `<mundo>.db`, con los objetos adentro.
 *
 * De los objetos sale lo que muestra el mapa: portales, mesas de cartografía
 * (con su mapa compartido), tumbas, camas, barcos, carros y cuántas piezas
 * construyó la gente en cada zona de 64 m.
 */
import { stableHashCode } from "../engine/stableHash";
import type { InputFile, MapPin, Portal, SavePoint, WorldSaveData } from "./contract";
import { LOCATION_PREFABS } from "./locationNames";
import { parseSharedMap, type RawPin } from "./mapData";
import { PackageReader } from "./package";
import { parseDb2, parseLegacyDb, type LocationRecord } from "./worldDb";
import { parseWorldMeta, type WorldMeta } from "./worldMeta";
import { readZdos, type Zdo } from "./zdo";

const hashes = (names: string[]) => new Map(names.map((n) => [stableHashCode(n), n]));

/** Los portales del juego (`Game.m_portalPrefabs`); en 1.0 además viven todos en su propio chunk. */
const PORTALS = hashes(["portal_wood", "portal_stone", "portal"]);
const BEDS = hashes(["bed", "piece_bed02", "ashwood_bed"]);
const SHIPS = hashes(["Raft", "Karve", "VikingShip", "VikingShip_Ashlands"]);
const CARTS = hashes(["Cart"]);
const TOMBSTONE = stableHashCode("Player_tombstone");
const CARTOGRAPHY = stableHashCode("piece_cartographytable");
const LOCATIONS = hashes([...LOCATION_PREFABS]);

/** `ZoneSystem.ChunkPortal`: el chunk (índice 1, tamaño 0) donde 1.0 guarda los portales. */
const PORTAL_CHUNK_PREFIX = "00_01__0_";
/** Más allá de esto no hay mundo (el juego guarda cosas auxiliares cerca de 1.000.000). */
const WORLD_LIMIT = 10_500 + 500;

const basename = (path: string) => path.replace(/\\/g, "/").split("/").pop() ?? path;
const dirname = (path: string) => { const p = path.replace(/\\/g, "/"); const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); };

/** `ZoneSystem.GetZone`: la zona de 64 m (centrada en múltiplos de 64). */
const zoneOf = (v: number) => Math.floor((v + 32) / 64);

interface SaveGroup { dir: string; n: number; fwl?: InputFile; db?: InputFile; chunks?: InputFile; ok?: InputFile; count: number }

/** Los grupos `_main.<N>.*` de todas las carpetas, del número más alto al más bajo. */
function findGroups(files: InputFile[]): SaveGroup[] {
  const groups = new Map<string, SaveGroup>();
  for (const f of files) {
    const m = /^_main\.(\d+)\.(fwl2|db2|chunks|ok)$/i.exec(basename(f.path || f.name));
    if (!m) continue;
    const dir = dirname(f.path || f.name);
    const n = Number(m[1]);
    const key = `${dir}\n${n}`;
    const g = groups.get(key) ?? { dir, n, count: 0 };
    const ext = m[2].toLowerCase();
    if (ext === "fwl2") g.fwl = f; else if (ext === "db2") g.db = f; else if (ext === "chunks") g.chunks = f; else g.ok = f;
    g.count++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.n - a.n);
}

/** El grupo que usaría el juego: el completo más alto; si no hay, el más alto con `.fwl2`. */
function pickGroup(groups: SaveGroup[], warnings: string[]): SaveGroup | null {
  const complete = groups.find((g) => g.fwl && g.db && g.chunks && g.ok);
  if (complete) return complete;
  const lone = groups.find((g) => g.n === 0 && g.fwl && g.count === 1);
  if (lone) return lone;
  const any = groups.find((g) => g.fwl);
  if (any) warnings.push(`no hay un guardado completo (_main.N con .fwl2, .db2, .chunks y .ok); se usa _main.${any.n}`);
  return any ?? null;
}

/** `.chunks` (`ChunkSaveMapping.Save`): versión, total, y los chunks con su versión → nombres de archivo. */
function readChunkMapping(bytes: Uint8Array): Set<string> {
  const p = new PackageReader(bytes);
  p.readUShort();
  p.readInt();
  const n = p.readCount("chunks", 11);
  const names = new Set<string>();
  for (let i = 0; i < n; i++) {
    const chunk = p.readUShort();
    const size = p.readByte();
    const version = p.readUInt();
    p.readInt(); // cantidad de objetos
    // ChunkSaveMapping.GetChunkFilename: {chunk >> 8:x2}_{chunk & 255:x2}__{size}_{version}.chunk
    const hex = (v: number) => v.toString(16).padStart(2, "0");
    names.add(`${hex(chunk >> 8)}_${hex(chunk & 255)}__${size}_${version}.chunk`);
  }
  return names;
}

/** Lo que se junta de los objetos, sea del formato que sea. */
class Collector {
  portals: Portal[] = [];
  points: SavePoint[] = [];
  tables: { x: number; z: number; data: Uint8Array | null }[] = [];
  zones = new Map<number, number>();
  /** id de jugador → nombre (de camas y tumbas), para ponerle dueño a los pines compartidos. */
  players = new Map<bigint, string>();
  count = 0;

  onZdo = (z: Zdo, inPortalChunk = false): void => {
    this.count++;
    const h = z.prefab;
    if (PORTALS.has(h) || inPortalChunk) {
      this.portals.push({ prefab: PORTALS.get(h) ?? String(h), x: z.x, z: z.z, tag: z.tag ?? "" });
    } else if (h === TOMBSTONE) {
      this.points.push({ kind: "tombstone", x: z.x, z: z.z, ...(z.ownerName ? { label: z.ownerName } : {}) });
    } else if (BEDS.has(h)) {
      this.points.push({ kind: "bed", x: z.x, z: z.z, ...(z.ownerName ? { label: z.ownerName } : {}) });
    } else if (SHIPS.has(h)) {
      this.points.push({ kind: "ship", x: z.x, z: z.z, label: SHIPS.get(h)! });
    } else if (CARTS.has(h)) {
      this.points.push({ kind: "cart", x: z.x, z: z.z, label: CARTS.get(h)! });
    } else if (h === CARTOGRAPHY) {
      this.points.push({ kind: "cartography", x: z.x, z: z.z });
      this.tables.push({ x: z.x, z: z.z, data: z.data ? z.data.slice() : null });
    }
    if (z.owner !== null && z.owner !== 0n && z.ownerName) this.players.set(z.owner, z.ownerName);
    // Pieza construida por alguien (`Piece.IsPlacedByPlayer`): las de ruinas y aldeas no tienen creador.
    if (z.creator && Math.abs(z.x) < WORLD_LIMIT && Math.abs(z.z) < WORLD_LIMIT) {
      const key = (zoneOf(z.x) + 512) * 1024 + (zoneOf(z.z) + 512);
      this.zones.set(key, (this.zones.get(key) ?? 0) + 1);
    }
  };
}

const wantData = (prefab: number) => prefab === CARTOGRAPHY;

/** Lee la carpeta de un mundo (1.0 o anterior). Lo que no se entiende queda en `warnings`. */
export function readWorld(files: InputFile[]): WorldSaveData {
  const warnings: string[] = [];
  const col = new Collector();
  let meta: WorldMeta | null = null;
  let locations: LocationRecord[] = [];

  const groups = findGroups(files);
  const group = pickGroup(groups, warnings);
  if (group) {
    if (new Set(groups.map((g) => g.dir)).size > 1) warnings.push(`hay guardados de más de una carpeta; se usa ${group.dir || "la raíz"}`);
    meta = parseWorldMeta(group.fwl!.data, basename(group.fwl!.name));
    warnings.push(...meta.warnings);
    if (group.db) {
      const db = parseDb2(group.db.data, basename(group.db.name));
      locations = db.locations;
      warnings.push(...db.warnings);
    } else warnings.push("falta el .db2: no hay lugares generados");

    // Los .chunk de esa carpeta; si está el .chunks, sólo los que nombra (puede haber viejos sueltos).
    const inDir = files.filter((f) => /\.chunk$/i.test(f.name) && dirname(f.path || f.name) === group.dir);
    let listed: Set<string> | null = null;
    if (group.chunks) {
      try { listed = readChunkMapping(group.chunks.data); } catch (e) { warnings.push(`no se pudo leer el .chunks (${(e as Error).message})`); }
    }
    // Por nombre: el resultado no depende del orden en que llegaron (carpeta o zip).
    const chunkFiles = (listed ? inDir.filter((f) => listed!.has(basename(f.name).toLowerCase())) : inDir)
      .sort((a, b) => (basename(a.name) < basename(b.name) ? -1 : 1));
    if (listed) {
      const missing = listed.size - chunkFiles.length;
      if (missing > 0) warnings.push(`faltan ${missing} de ${listed.size} archivos .chunk`);
    } else if (inDir.length) warnings.push("sin .chunks: se leen todos los .chunk de la carpeta");
    if (!inDir.length && group.db) warnings.push("no vino ningún .chunk: no hay portales ni construcciones");

    for (const f of chunkFiles) {
      const name = basename(f.name);
      try {
        const p = new PackageReader(f.data);
        const version = p.readShort();
        const n = p.readCount("objetos", 2);
        const portalChunk = name.startsWith(PORTAL_CHUNK_PREFIX);
        readZdos(p, n, version, portalChunk ? (z) => col.onZdo(z, true) : col.onZdo, wantData);
        if (p.remaining) warnings.push(`${name}: sobran ${p.remaining} bytes`);
      } catch (e) {
        warnings.push(`${name}: lectura incompleta (${(e as Error).message})`);
      }
    }
  } else {
    // Formato anterior a 1.0: <mundo>.fwl + <mundo>.db (se ignoran los .old).
    const fwl = files.find((f) => /\.fwl$/i.test(f.name));
    if (!fwl) throw new Error("no hay un mundo de Valheim: falta _main.N.fwl2 (1.0) o <mundo>.fwl");
    meta = parseWorldMeta(fwl.data, basename(fwl.name));
    warnings.push(...meta.warnings);
    const stem = basename(fwl.name).replace(/\.fwl$/i, "").toLowerCase();
    const db = files.find((f) => basename(f.name).toLowerCase() === `${stem}.db`) ?? files.find((f) => /\.db$/i.test(f.name));
    if (db) {
      const r = parseLegacyDb(db.data, col.onZdo, wantData, basename(db.name));
      locations = r.locations;
      warnings.push(...r.warnings);
    } else warnings.push(`falta ${stem}.db: sólo se sabe la semilla`);
  }

  // Nombres para los pines compartidos: por id de jugador (camas, tumbas) o por autor (historial del .fwl2).
  const byAuthor = new Map(meta.playerHistory.map((h) => [h.platformUserId, h.displayName]));
  const pinOut = (q: RawPin): MapPin => {
    const owner = col.players.get(q.ownerId) ?? byAuthor.get(q.author);
    return { name: q.name, x: q.x, z: q.z, type: q.type, checked: q.checked, ...(owner ? { owner } : {}) };
  };
  const cartography: WorldSaveData["cartography"] = col.tables.map((t) => {
    if (!t.data) return { x: t.x, z: t.z, explored: null, pins: [] };
    try {
      const shared = parseSharedMap(t.data);
      return { x: t.x, z: t.z, explored: shared.explored, pins: shared.pins.map(pinOut) };
    } catch (e) {
      warnings.push(`mesa de cartografía en (${Math.round(t.x)}, ${Math.round(t.z)}): no se pudo leer su mapa (${(e as Error).message})`);
      return { x: t.x, z: t.z, explored: null, pins: [] };
    }
  });

  const buildZones: [number, number, number][] = [...col.zones]
    .map(([k, n]): [number, number, number] => [Math.floor(k / 1024) - 512, (k % 1024) - 512, n])
    .sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);

  const unknown = new Map<number, number>();
  const locs: WorldSaveData["locations"] = [];
  for (const l of locations) {
    const prefab = LOCATIONS.get(l.hash);
    if (prefab) locs.push({ prefab, x: l.x, z: l.z });
    else unknown.set(l.hash, (unknown.get(l.hash) ?? 0) + 1);
  }
  if (unknown.size) warnings.push(`${[...unknown.values()].reduce((a, b) => a + b, 0)} lugares de ${unknown.size} tipos desconocidos (¿de un mod?)`);

  return {
    name: meta.name, seedName: meta.seedName, seed: meta.seed, uid: meta.uid, worldGenVersion: meta.worldGenVersion,
    portals: col.portals, points: col.points, cartography, buildZones, locations: locs, warnings,
  };
}
