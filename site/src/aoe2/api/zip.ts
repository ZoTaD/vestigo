/**
 * El primer archivo de un zip (2026-11-20): las grabaciones de AoE2 vienen en un zip con un solo `.aoe2record`. Lee el
 * encabezado local (y, si los tamaños van al final, el directorio central). Sólo del lado del servidor (`node:zlib`).
 */
import { inflateRawSync } from "node:zlib";

/** Una grabación de 1v1 de una hora pesa ~8 MB; más de esto no es una grabación (y no se descomprime). */
export const MAX_GRABACION = 32 * 1024 * 1024;

export function unzipFirst(z: Uint8Array): Uint8Array | null {
  try {
    const b = Buffer.from(z.buffer, z.byteOffset, z.byteLength);
    if (b.readUInt32LE(0) !== 0x04034b50) return null;
    const metodo = b.readUInt16LE(8);
    let comp = b.readUInt32LE(18);
    const ini = 30 + b.readUInt16LE(26) + b.readUInt16LE(28);
    if (!comp) {
      // Tamaños en el directorio central (bit 3): se busca su primera entrada.
      const cd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      if (cd < 0) return null;
      comp = b.readUInt32LE(cd + 20);
    }
    if (b.readUInt32LE(22) > MAX_GRABACION) return null;
    const datos = b.subarray(ini, ini + comp);
    if (metodo === 0) return datos.length > MAX_GRABACION ? null : new Uint8Array(datos);
    return new Uint8Array(inflateRawSync(datos, { maxOutputLength: MAX_GRABACION }));
  } catch {
    return null;
  }
}
