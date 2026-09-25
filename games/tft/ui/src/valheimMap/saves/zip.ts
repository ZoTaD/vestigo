/**
 * Un zip (el de la carpeta del mundo) a archivos sueltos, en el navegador y
 * sin dependencias: se lee el directorio central del final (sus tamaños valen
 * aunque el zip use descriptores de datos) y cada entrada se descomprime con
 * `DecompressionStream("deflate-raw")`. Sólo "guardado" (0) y deflate (8).
 */
import type { InputFile } from "./contract";
import { inflateRaw } from "./inflate";

const UTF8 = new TextDecoder("utf-8");

async function inflate(data: Uint8Array, size: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") return inflateRaw(data, size);
  // El zip nunca viene en un SharedArrayBuffer; el cast es sólo para los tipos de Blob.
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Los archivos de un zip (sin las carpetas). Las entradas que no se pueden leer se saltean. */
export async function unzip(data: Uint8Array): Promise<InputFile[]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);

  // Fin del directorio central: firma 06054b50, buscada desde atrás (puede haber comentario).
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65535); i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("no es un zip (no se encontró el directorio central)");
  let count = u16(eocd + 10);
  let cd = u32(eocd + 16);
  // ZIP64: los valores reales están en su propio registro de fin.
  if ((cd === 0xffffffff || count === 0xffff) && eocd >= 20 && u32(eocd - 20) === 0x07064b50) {
    const rec = Number(view.getBigUint64(eocd - 20 + 8, true));
    if (u32(rec) === 0x06064b50) { count = Number(view.getBigUint64(rec + 32, true)); cd = Number(view.getBigUint64(rec + 48, true)); }
  }

  const out: InputFile[] = [];
  let p = cd;
  for (let i = 0; i < count; i++) {
    if (p + 46 > data.length || u32(p) !== 0x02014b50) throw new Error("zip dañado (directorio central)");
    const method = u16(p + 10);
    let csize = u32(p + 20);
    let usize = u32(p + 24);
    const nameLen = u16(p + 28), extraLen = u16(p + 30), commentLen = u16(p + 32);
    let local = u32(p + 42);
    const path = UTF8.decode(data.subarray(p + 46, p + 46 + nameLen));
    // Campo extra ZIP64 (0x0001): tamaños y desplazamiento de 8 bytes, sólo los que valen 0xffffffff.
    for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen;) {
      const id = u16(e), len = u16(e + 2);
      if (id === 1) {
        let q = e + 4;
        if (usize === 0xffffffff) { usize = Number(view.getBigUint64(q, true)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(view.getBigUint64(q, true)); q += 8; }
        if (local === 0xffffffff) local = Number(view.getBigUint64(q, true));
      }
      e += 4 + len;
    }
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith("/")) continue;
    if (local + 30 > data.length || u32(local) !== 0x04034b50) continue;
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    const raw = data.subarray(start, start + csize);
    let bytes: Uint8Array;
    if (method === 0) bytes = raw.slice();
    else if (method === 8) {
      try { bytes = await inflate(raw, usize); } catch { continue; }
    } else continue;
    const name = path.split("/").pop() ?? path;
    out.push({ name, path, data: bytes });
  }
  return out;
}
