// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Saves/CharacterReader.cs y CharacterProfile.cs
/**
 * `<personaje>.fch` (`PlayerProfile.SavePlayerToDisk`):
 *
 *   int32 largo; paquete: int32 versión (46 en 1.0), estadísticas (10
 *   categorías desde la 46 o la 44; una lista plana desde la 38; 4 ints desde
 *   la 28), [v≥40] bool primer spawn, int32 mundos y por cada uno: int64 uid,
 *   bool+Vector3 spawn, bool+Vector3 salida, [v≥30] bool+Vector3 muerte,
 *   Vector3 casa, [v≥29] bool + byte array del mapa; después nombre, id…
 *   int32 64 + SHA-512 del paquete (el juego lo lee y lo descarta).
 *
 * Las estadísticas no se usan, pero hay que recorrerlas: todo tiene largo.
 */
import type { CharacterData, InputFile, MapPin } from "./contract";
import { parsePlayerMap } from "./mapData";
import { PackageReader } from "./package";

/** `Version.Player.DeepNorth`. */
const PLAYER_VERSION = 46;

function skipStringFloatList(p: PackageReader): void {
  const n = p.readCount("lista de estadísticas", 5);
  for (let i = 0; i < n; i++) { p.skipString(); p.take(4); }
}

function skipStats(p: PackageReader, version: number): void {
  if (version >= 46 || version === 44) {
    const stats = p.readInt();
    const categories = p.readInt();
    if (stats < 0 || categories < 0 || stats * 4 * categories > p.remaining) throw new RangeError("tabla de estadísticas imposible");
    for (let c = 0; c < categories; c++) {
      p.take(stats * 4);
      skipStringFloatList(p); // mundos conocidos
      skipStringFloatList(p); // claves de mundo conocidas
      skipStringFloatList(p); // comandos conocidos
      const enemyTables = p.readCount("tablas de enemigos", 4);
      for (let k = 0; k < enemyTables; k++) skipStringFloatList(p);
      for (let k = 0; k < 5; k++) skipStringFloatList(p); // recoger, fabricar, cosechar, comer, construir
    }
  } else if (version >= 38) {
    p.take(p.readCount("estadísticas", 4) * 4);
  } else if (version >= 28) {
    p.take(16);
  }
}

export function readCharacter(file: InputFile): CharacterData {
  const what = file.name;
  const warnings: string[] = [];
  const outer = new PackageReader(file.data);
  const p = outer.readPackage();
  const version = p.readInt();
  if (version < 27) throw new Error(`${what}: personaje versión ${version}, más viejo de lo que el juego acepta`);
  if (version > PLAYER_VERSION) warnings.push(`${what}: personaje versión ${version}, más nuevo que ${PLAYER_VERSION}; puede leerse mal`);

  skipStats(p, version);
  if (version >= 40) p.readBool(); // primer spawn

  const count = p.readCount("mundos", 37);
  const raw: { uid: string; blob: Uint8Array | null }[] = [];
  for (let i = 0; i < count; i++) {
    const uid = p.readLong().toString();
    p.take(13 + 13); // spawn y salida (bool + Vector3)
    if (version >= 30) p.take(13); // muerte
    p.take(12); // casa
    // `player >= MapData && ReadBool()`: debajo de 29 no se lee ningún byte.
    const blob = version >= 29 && p.readBool() ? p.readByteArray() : null;
    raw.push({ uid, blob });
  }
  const name = p.readString();

  const worlds: CharacterData["worlds"] = raw.map(({ uid, blob }) => {
    if (!blob) return { uid, explored: null, pins: [] };
    try {
      const map = parsePlayerMap(blob);
      // Los pines propios tienen dueño 0; los demás vinieron de una mesa (sin nombre acá).
      const pins: MapPin[] = map.pins.map((q) => ({
        name: q.name, x: q.x, z: q.z, type: q.type, checked: q.checked, ...(q.ownerId === 0n ? { owner: name } : {}),
      }));
      return { uid, explored: map.explored, pins };
    } catch (e) {
      warnings.push(`${what}: no se pudo leer el mapa del mundo ${uid} (${(e as Error).message})`);
      return { uid, explored: null, pins: [] };
    }
  });
  return { name, worlds, warnings };
}
