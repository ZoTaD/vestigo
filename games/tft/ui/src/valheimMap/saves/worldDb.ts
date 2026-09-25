// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Saves/WorldDbReader.cs y WorldDb.cs
/**
 * La base del mundo. Dos formatos:
 *
 * - `_main.<N>.db2` (1.0, con chunks): int32 versión, double netTime y el
 *   bloque de `ZoneSystem.Save` en gzip (zonas generadas, versión de lugares,
 *   claves globales, `locationsGenerated` y las instancias de lugares:
 *   int32 hash del prefab, 3 floats, bool colocado). Los objetos van aparte,
 *   en los `.chunk`.
 * - `<mundo>.db` (antes de 1.0): lo mismo pero con los objetos adentro
 *   (`ZDOMan.Load`) y el bloque de zonas sin comprimir (`ZoneSystem.LoadOld`,
 *   con los lugares por nombre hasta la versión 40).
 */
import { stableHashCode } from "../engine/stableHash";
import { PackageReader } from "./package";
import { readZdos, type Zdo } from "./zdo";

export interface LocationRecord { hash: number; x: number; y: number; z: number; placed: boolean }

export interface WorldDb {
  version: number;
  netTime: number;
  locations: LocationRecord[];
  warnings: string[];
}

/** Las instancias de lugares del bloque nuevo (gzip). */
function readZoneSystem(z: PackageReader, what: string, warnings: string[]): LocationRecord[] {
  const zones = z.readCount("zonas generadas", 4);
  z.take(zones * 4);
  z.readInt(); // versión de lugares
  const keys = z.readCount("claves globales");
  for (let i = 0; i < keys; i++) z.skipString();
  z.readBool(); // locationsGenerated
  const n = z.readCount("lugares", 17);
  const out: LocationRecord[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = { hash: z.readInt(), x: z.readSingle(), y: z.readSingle(), z: z.readSingle(), placed: z.readBool() };
  }
  if (z.remaining) warnings.push(`${what}: sobran ${z.remaining} bytes en el bloque de zonas`);
  return out;
}

/** `ZoneSystem.LoadOld` (`.db` viejo): sin comprimir y con ramas por versión. */
function readZoneSystemOld(p: PackageReader, version: number): LocationRecord[] {
  const zones = p.readCount("zonas generadas", 8);
  p.take(zones * 8);
  if (version < 13) return [];
  p.readInt(); // versión del generador
  if (version >= 21) p.readInt(); // versión de lugares
  if (version < 14) return [];
  const keys = p.readCount("claves globales");
  for (let i = 0; i < keys; i++) p.skipString();
  if (version < 18) return [];
  if (version >= 20) p.readBool();
  const n = p.readCount("lugares", 13);
  const out: LocationRecord[] = [];
  for (let i = 0; i < n; i++) {
    const hash = version < 40 ? stableHashCode(p.readString()) : p.readInt();
    const x = p.readSingle(), y = p.readSingle(), z = p.readSingle();
    const placed = version >= 19 ? p.readBool() : false;
    out.push({ hash, x, y, z, placed });
  }
  return out;
}

/** `_main.<N>.db2`. */
export function parseDb2(bytes: Uint8Array, what = ".db2"): WorldDb {
  const p = new PackageReader(bytes);
  const version = p.readInt();
  const netTime = p.readDouble();
  const warnings: string[] = [];
  let locations: LocationRecord[] = [];
  try {
    locations = readZoneSystem(p.readCompressedPackage(), what, warnings);
  } catch (e) {
    warnings.push(`${what}: no se pudieron leer los lugares (${(e as Error).message})`);
  }
  // Lo que sigue (eventos) no le sirve al mapa.
  return { version, netTime, locations, warnings };
}

/**
 * `<mundo>.db` de antes de 1.0: los objetos van adentro. `onZdo` recibe cada
 * uno (desde la versión 31; los anteriores se saltean con aviso).
 */
export function parseLegacyDb(
  bytes: Uint8Array, onZdo: (z: Zdo) => void, wantData: (prefab: number) => boolean, what = ".db",
): WorldDb & { zdoCount: number } {
  const p = new PackageReader(bytes);
  const version = p.readInt();
  const netTime = version >= 4 ? p.readDouble() : 0;
  const warnings: string[] = [];
  let locations: LocationRecord[] = [];
  let zdoCount = 0;
  try {
    p.readLong(); // id de sesión
    p.readUInt(); // próximo uid
    const n = p.readCount("objetos", 2);
    zdoCount = n;
    if (version >= 31) readZdos(p, n, version, onZdo, wantData);
    else {
      // `ZDO.LoadOldFormat`: cada uno con su largo; se saltean.
      for (let i = 0; i < n; i++) { p.take(12); p.take(p.readInt()); }
      warnings.push(`${what}: mundo versión ${version} (anterior a 2023); no se leen sus objetos`);
    }
    if (version >= 12) locations = readZoneSystemOld(p, version);
  } catch (e) {
    warnings.push(`${what}: lectura incompleta (${(e as Error).message})`);
  }
  return { version, netTime, locations, warnings, zdoCount };
}
