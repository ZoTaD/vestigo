// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Saves/WorldMetaReader.cs y WorldMeta.cs
/**
 * `_main.<N>.fwl2` (1.0) o `<mundo>.fwl` (antes de los chunks): nombre,
 * semilla y uid del mundo. Mismo formato en los dos (`World.SaveWorldFWLData`):
 *
 *   int32 largo; paquete: int32 versión, string nombre, string semilla,
 *   int32 seed, int64 uid, [v≥26] int32 worldGenVersion, [v≥30] bool needsDB,
 *   [v≥32] claves globales iniciales, [v≥41] historial de jugadores (4 strings c/u).
 */
import { PackageReader } from "./package";

/** `Version.World.DeepNorth`: la versión de 1.0. */
export const WORLD_VERSION = 41;
/** `Version.World.OldestForwardCompatible`. */
const OLDEST_WORLD_VERSION = 9;

export interface PlayerHistoryEntry { platformUserId: string; displayName: string }

export interface WorldMeta {
  version: number;
  name: string;
  seedName: string;
  seed: number;
  /** El uid como texto decimal (int64): con él se cruzan los personajes. */
  uid: string;
  worldGenVersion: number;
  startingGlobalKeys: string[];
  /** Quiénes entraron al mundo (`Steam_7656…` → nombre visible). */
  playerHistory: PlayerHistoryEntry[];
  warnings: string[];
}

export function parseWorldMeta(bytes: Uint8Array, what = ".fwl2"): WorldMeta {
  const file = new PackageReader(bytes);
  const p = file.readPackage();
  const warnings: string[] = [];
  if (file.remaining) warnings.push(`${what}: sobran ${file.remaining} bytes después del paquete`);

  const version = p.readInt();
  if (version < OLDEST_WORLD_VERSION) throw new Error(`${what}: versión de mundo ${version}, más vieja de lo que el juego acepta`);
  // Más nueva que 1.0: se intenta igual (lo que falte queda en avisos).
  if (version > WORLD_VERSION) warnings.push(`${what}: versión de mundo ${version}, más nueva que ${WORLD_VERSION}; puede leerse mal`);

  const name = p.readString();
  const seedName = p.readString();
  const seed = p.readInt();
  const uid = p.readLong().toString();
  const worldGenVersion = version >= 26 ? p.readInt() : 0;
  // `world >= NeedsDB && ReadBool()`: debajo de 30 no se lee ningún byte.
  if (version >= 30) p.readBool();

  const startingGlobalKeys: string[] = [];
  const playerHistory: PlayerHistoryEntry[] = [];
  try {
    if (version >= 32) {
      const n = p.readCount("claves globales");
      for (let i = 0; i < n; i++) startingGlobalKeys.push(p.readString());
    }
    if (version >= 41) {
      const n = p.readCount("jugadores", 4);
      for (let i = 0; i < n; i++) {
        // ZNet.CrossNetworkUserInfo.Read: id de plataforma, nombre visible, nombre del servidor, PlayFab.
        const platformUserId = p.readString();
        const displayName = p.readString();
        p.skipString();
        p.skipString();
        playerHistory.push({ platformUserId, displayName });
      }
    }
    if (p.remaining) warnings.push(`${what}: sobran ${p.remaining} bytes`);
  } catch (e) {
    warnings.push(`${what}: no se pudo leer el final (${(e as Error).message})`);
  }
  return { version, name, seedName, seed, uid, worldGenVersion, startingGlobalKeys, playerHistory, warnings };
}
