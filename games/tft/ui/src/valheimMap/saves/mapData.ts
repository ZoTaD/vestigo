// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Saves/CharacterReader.cs (ParseMapData) y PlayerMapData.cs
/**
 * Los dos formatos de mapa del juego, los dos sobre la grilla del minimapa
 * (2048² celdas de 12 m, índice `fila * 2048 + columna`, fila 0 = sur):
 *
 * - el de cada mundo en el `.fch` (`Minimap.GetMapData`): versión y, desde la
 *   7, un gzip con tamaño, lo explorado propio, lo explorado por otros y los
 *   pines;
 * - el compartido de la mesa de cartografía (`Minimap.GetSharedMapData`,
 *   guardado en gzip en el `data` del ZDO): versión 3, cantidad de celdas,
 *   un bool por celda (lo propio y lo de otros ya unidos) y los pines con
 *   dueño (id de jugador y autor de plataforma).
 */
import type { Explored, MapPin } from "./contract";
import { gunzip } from "./inflate";
import { PackageReader } from "./package";

/** `Minimap.m_pixelSize`: metros por celda. */
export const MAP_PIXEL_SIZE = 12;

/** Un pin con lo que el archivo dice de su dueño (para ponerle nombre después). */
export interface RawPin extends MapPin { ownerId: bigint; author: string }

export interface PlayerMap {
  version: number;
  explored: Explored;
  pins: RawPin[];
}

function readPins(p: PackageReader, withChecked: boolean, withOwner: boolean, withAuthor: boolean): RawPin[] {
  const n = p.readCount("pines", 20);
  const pins: RawPin[] = [];
  for (let i = 0; i < n; i++) {
    const name = p.readString();
    const [x, , z] = p.readVector3();
    const type = p.readInt();
    const checked = withChecked ? p.readBool() : false;
    const ownerId = withOwner ? p.readLong() : 0n;
    const author = withAuthor ? p.readString() : "";
    pins.push({ name, x, z, type, checked, ownerId, author });
  }
  return pins;
}

/**
 * El mapa de un mundo dentro del `.fch` (`Minimap.SetMapData`). Lo explorado
 * que se devuelve es lo que ese personaje ve en su mapa: lo propio más lo
 * que le compartieron.
 */
export function parsePlayerMap(blob: Uint8Array): PlayerMap {
  const outer = new PackageReader(blob);
  const version = outer.readInt();
  // Version.Map.Compressed = 7.
  const p = version >= 7 ? new PackageReader(gunzip(outer.readByteArray())) : outer;
  const size = p.readInt();
  if (size <= 0 || size > 8192) throw new RangeError(`tamaño de mapa imposible: ${size}`);
  const cells = size * size;
  const out = new Uint8Array(cells);
  if (version >= 5) {
    // NewExplore: dos capas de un byte por celda.
    const own = p.take(cells);
    const others = p.take(cells);
    const b = p.buf;
    for (let i = 0; i < cells; i++) out[i] = b[own + i] | b[others + i] ? 1 : 0;
  } else {
    const at = p.take(cells);
    for (let i = 0; i < cells; i++) out[i] = p.buf[at + i] ? 1 : 0;
  }
  // PinsChecked = 3, PinsOwnerID = 6, PinsAuthor = 8.
  const pins = version >= 2 ? readPins(p, version >= 3, version >= 6, version >= 8) : [];
  if (version >= 4) p.readBool(); // mostrar mi posición a los demás
  return { version, explored: { size, pixelSize: MAP_PIXEL_SIZE, cells: out }, pins };
}

/**
 * El `data` de una mesa de cartografía (gzip de `GetSharedMapData`). Se lee
 * como `AddSharedMapData`: el largo debe ser un cuadrado (el juego exige su
 * 2048²) y los pines traen el autor desde la versión 3.
 */
export function parseSharedMap(compressed: Uint8Array): { explored: Explored | null; pins: RawPin[] } {
  const p = new PackageReader(gunzip(compressed));
  const version = p.readInt();
  const n = p.readInt();
  const size = Math.round(Math.sqrt(n));
  if (n <= 0 || size * size !== n || size > 8192) throw new RangeError(`celdas de mapa imposibles: ${n}`);
  const at = p.take(n);
  const cells = p.buf.slice(at, at + n);
  for (let i = 0; i < n; i++) if (cells[i] > 1) cells[i] = 1;
  const pins: RawPin[] = [];
  if (version >= 2) {
    const count = p.readCount("pines", 20);
    for (let i = 0; i < count; i++) {
      // Acá el orden es otro que en el .fch: primero el dueño.
      const ownerId = p.readLong();
      const name = p.readString();
      const [x, , z] = p.readVector3();
      const type = p.readInt();
      const checked = p.readBool();
      const author = version >= 3 ? p.readString() : "";
      pins.push({ name, x, z, type, checked, ownerId, author });
    }
  }
  return { explored: { size, pixelSize: MAP_PIXEL_SIZE, cells }, pins };
}

/** Cuántas celdas están exploradas (0 a 1). */
export function exploredFraction(e: Explored): number {
  let n = 0;
  for (let i = 0; i < e.cells.length; i++) n += e.cells[i];
  return n / e.cells.length;
}
