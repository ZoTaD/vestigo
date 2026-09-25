/**
 * Los ZDO (los objetos guardados del mundo) tal como los escribe `ZDO.Save` y
 * los lee `ZDO.Load` en Valheim 1.0 (IL de `assembly_valheim.dll`; SeedLab no
 * los lee). Cada uno:
 *
 *   uint16 banderas
 *   [versión < 40] Vector2s sector (se descarta)
 *   bandera 8192 ? Vector2s (x, z) con y = 0 : Vector3 posición
 *   int32 prefab (hash estable del nombre)
 *   bandera 4096 ? rotación (versión ≥ 40: 2 o 4 bytes; antes: Vector3)
 *   si (banderas & 255) hay datos, en este orden y cada uno con su bandera:
 *     1 conexión (byte tipo + int32 hash), 2 floats, 4 Vector3, 8 cuaterniones,
 *     16 ints, 32 longs, 64 strings, 128 byte arrays;
 *   cada lista: cantidad (`ReadNumItems`; antes de la versión 33, un byte) y
 *   pares (int32 clave = hash del nombre, valor).
 *
 * Se recorren todos pero sólo se guardan las claves que usa el mapa; lo demás
 * se saltea sin decodificar.
 */
import { stableHashCode } from "../engine/stableHash";
import type { PackageReader } from "./package";

export const KEY = {
  tag: stableHashCode("tag"),
  ownerName: stableHashCode("ownerName"),
  owner: stableHashCode("owner"),
  creator: stableHashCode("creator"),
  data: stableHashCode("data"),
} as const;

/** Lo que interesa de un ZDO. El lector reutiliza el mismo objeto: copiar lo que se quiera guardar. */
export interface Zdo {
  prefab: number;
  x: number;
  y: number;
  z: number;
  /** El nombre del portal (`tag`). */
  tag: string | null;
  /** Dueño de una tumba o una cama (`ownerName`). */
  ownerName: string | null;
  /** Id del jugador dueño (`owner`, int64), si lo hay. */
  owner: bigint | null;
  /** Lo construyó un jugador (`creator` distinto de 0: `Piece.IsPlacedByPlayer`). */
  creator: boolean;
  /** El byte array `data` (el mapa de la mesa de cartografía), sólo si se pidió para ese prefab. */
  data: Uint8Array | null;
}

/**
 * Lee `count` ZDO seguidos de `p`. `wantData(prefab)` dice de qué prefabs
 * guardar el byte array `data` (los demás se saltean sin copiar).
 */
export function readZdos(
  p: PackageReader, count: number, version: number,
  onZdo: (z: Zdo) => void, wantData: (prefab: number) => boolean = () => false,
): void {
  const z: Zdo = { prefab: 0, x: 0, y: 0, z: 0, tag: null, ownerName: null, owner: null, creator: false, data: null };
  const modern = version >= 40;
  const numItems = version >= 33 ? () => p.readNumItems() : () => p.readByte();
  for (let i = 0; i < count; i++) {
    const flags = p.readUShort();
    if (!modern) p.take(4);
    if (flags & 8192) { z.x = p.readShort(); z.y = 0; z.z = p.readShort(); }
    else { z.x = p.readSingle(); z.y = p.readSingle(); z.z = p.readSingle(); }
    z.prefab = p.readInt();
    if (flags & 4096) {
      // ReadSmallRotation: un uint16 con el bit alto = sólo giro en y; si no, dos.
      if (modern) { if (!(p.readUShort() & 0x8000)) p.take(2); }
      else p.take(12);
    }
    z.tag = null; z.ownerName = null; z.owner = null; z.creator = false; z.data = null;
    if (flags & 255) {
      if (flags & 1) p.take(5);
      if (flags & 2) { const n = numItems(); p.take(n * 8); }
      if (flags & 4) { const n = numItems(); p.take(n * 16); }
      if (flags & 8) { const n = numItems(); p.take(n * 20); }
      if (flags & 16) { const n = numItems(); p.take(n * 8); }
      if (flags & 32) {
        const n = numItems();
        for (let k = 0; k < n; k++) {
          const key = p.readInt();
          if (key === KEY.creator) z.creator = p.readLongNonZero();
          else if (key === KEY.owner) z.owner = p.readLong();
          else p.take(8);
        }
      }
      if (flags & 64) {
        const n = numItems();
        for (let k = 0; k < n; k++) {
          const key = p.readInt();
          if (key === KEY.tag) z.tag = p.readString();
          else if (key === KEY.ownerName) z.ownerName = p.readString();
          else p.skipString();
        }
      }
      if (flags & 128) {
        const n = numItems();
        const keep = wantData(z.prefab);
        for (let k = 0; k < n; k++) {
          const key = p.readInt();
          const len = p.readInt();
          if (len < 0) throw new RangeError("byte array de largo negativo");
          const at = p.take(len);
          if (keep && key === KEY.data) z.data = p.buf.subarray(at, at + len);
        }
      }
    }
    onZdo(z);
  }
}
