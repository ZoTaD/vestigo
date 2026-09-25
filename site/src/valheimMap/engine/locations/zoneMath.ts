// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Locations/ZoneMath.cs
/**
 * Lo de `ZoneSystem` que usa la ubicación de lugares, más dos ayudantes de
 * `Utils`. Todo literal: varios difieren de la versión obvia en un redondeo.
 *
 * Las zonas son `Vector2s` (dos int16). Acá van como dos enteros sueltos, y la
 * clave numérica `zoneKey` sirve para los mapas.
 */
import type { UnityRandom } from "../unityRandom";

const F = Math.fround;

/** `ZoneSystem.c_ZoneSize`. */
export const ZONE_SIZE = 64;
/** `ZoneSystem.c_ZoneSizeHalf`. */
export const ZONE_HALF = 32;
/** `ZoneSystem.c_WaterLevel`. */
export const WATER_LEVEL = 30;
/** El radio dentro del cual `GetRandomZone` acepta un centro de zona. */
export const ZONE_ACCEPT_RADIUS = 10000;

/** Un entero a int16, como la conversión a `short` de C#. */
export function toShort(v: number): number {
  return (v << 16) >> 16;
}

/** Clave única de una zona (dos int16). */
export function zoneKey(x: number, y: number): number {
  return (x << 16) ^ (y & 0xffff);
}

/**
 * `Utils.FloorToInt(float)`: `(int)(f + 64000f) - 64000`. NO es Math.floor: el
 * sesgo se suma en float y cuantiza la fracción antes de truncar.
 */
export function floorToInt(f: number): number {
  return (F(f + 64000) | 0) - 64000;
}

/**
 * `Utils.LengthXZ`: la suma se redondea a float ANTES de la raíz (es el
 * argumento de Mathf.Sqrt). Distinto de Vector3.magnitude, y el juego usa los
 * dos sobre el mismo punto (filtros 1 y 5).
 */
export function lengthXZ(x: number, z: number): number {
  return F(Math.sqrt(F(x * x + z * z)));
}

/** `Vector3.magnitude`: productos y suma en double, un solo redondeo. */
export function magnitude3(x: number, y: number, z: number): number {
  return F(Math.sqrt(x * x + y * y + z * z));
}

/** `Vector3.sqrMagnitude`: un solo redondeo, al guardar. */
export function sqrMagnitude3(x: number, y: number, z: number): number {
  return F(x * x + y * y + z * z);
}

/** `ZoneSystem.GetZone(p)`: x de la zona (la z usa la misma fórmula con `pz`). */
export function zoneOf(p: number): number {
  return floorToInt(F((p + 32.0) / 64.0));
}

/** `Mathf.Max(a, b)`. */
export function mathfMax(a: number, b: number): number {
  return a > b ? a : b;
}

/** Salida de `getRandomZone` / `getRandomPointInZone` (sin asignar objetos). */
export const out = { zx: 0, zy: 0, px: 0, pz: 0 };

/**
 * `ZoneSystem.GetRandomZone(range)`: DOS sorteos enteros por vuelta hasta que el
 * centro quede a menos de 10.000 m. Con `num == 0` es `Range(0, 0)`, que no
 * consume nada. Deja la zona en `out.zx`, `out.zy`.
 */
export function getRandomZone(rnd: UnityRandom, range: number): void {
  const num = ((range | 0) / 64) | 0;
  for (let guard = 0; guard < 10_000_000; guard++) {
    const vx = toShort(rnd.rangeInt(-num, num));
    const vy = toShort(rnd.rangeInt(-num, num));
    if (magnitude3(F(vx * 64), 0, F(vy * 64)) < ZONE_ACCEPT_RADIUS) {
      out.zx = vx;
      out.zy = vy;
      return;
    }
  }
  throw new Error(`GetRandomZone no aceptó una zona en 10.000.000 vueltas (range=${range}).`);
}

/**
 * `ZoneSystem.GetRandomPointInZone(zone, radius)`: exactamente dos sorteos
 * float, siempre. Deja el punto en `out.px`, `out.pz` (la y es 0).
 */
export function getRandomPointInZone(rnd: UnityRandom, zx: number, zy: number, locationRadius: number): void {
  const cx = F(zx * 64);
  const cz = F(zy * 64);
  const lo = F(-32 + locationRadius);
  const hi = F(32 - locationRadius);
  const x = rnd.rangeFloat(lo, hi);
  const z = rnd.rangeFloat(lo, hi);
  out.px = F(cx + x);
  out.pz = F(cz + z);
}
