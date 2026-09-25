/**
 * Descompresión deflate (RFC 1951) y gzip (RFC 1952) sincrónica y sin
 * dependencias. El juego comprime con `Utils.Compress` (gzip plano) el bloque
 * de zonas del `.db2`, el mapa de la mesa de cartografía y el mapa de cada
 * mundo del `.fch`; `DecompressionStream` es asincrónico y el lector no lo es.
 *
 * Tablas de Huffman de acceso directo: un vistazo de `maxLen` bits da el
 * símbolo y cuántos bits gastar. Los mapas son casi todo ceros (copias de 258
 * bytes), así que lo que pesa es copiar, no decodificar.
 */

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/** El orden en que vienen las longitudes del código de longitudes (bloque dinámico). */
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Table { t: Int32Array; bits: number }

/** Tabla directa: índice = los próximos `bits` bits (el código viene invertido); valor = símbolo << 4 | largo. */
function buildTable(lengths: ArrayLike<number>, n: number): Table {
  let maxLen = 0;
  const count = new Int32Array(16);
  for (let i = 0; i < n; i++) { count[lengths[i]]++; if (lengths[i] > maxLen) maxLen = lengths[i]; }
  if (maxLen === 0) return { t: new Int32Array(1), bits: 0 };
  count[0] = 0;
  const next = new Int32Array(16);
  let code = 0;
  for (let len = 1; len <= 15; len++) { code = (code + count[len - 1]) << 1; next[len] = code; }
  const size = 1 << maxLen;
  const t = new Int32Array(size);
  for (let sym = 0; sym < n; sym++) {
    const len = lengths[sym];
    if (!len) continue;
    let c = next[len]++;
    let rev = 0;
    for (let i = 0; i < len; i++) { rev = (rev << 1) | (c & 1); c >>= 1; }
    for (let i = rev; i < size; i += 1 << len) t[i] = (sym << 4) | len;
  }
  return { t, bits: maxLen };
}

let FIXED_LIT: Table | null = null;
let FIXED_DIST: Table | null = null;
function fixedTables(): [Table, Table] {
  if (!FIXED_LIT) {
    const l = new Uint8Array(288);
    l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
    FIXED_LIT = buildTable(l, 288);
    FIXED_DIST = buildTable(new Uint8Array(30).fill(5), 30);
  }
  return [FIXED_LIT, FIXED_DIST!];
}

/** Descomprime un flujo deflate crudo. `sizeHint` evita agrandar la salida si se sabe el tamaño. */
export function inflateRaw(src: Uint8Array, sizeHint = 0, start = 0): Uint8Array {
  let pos = start;
  let bitBuf = 0;
  let bitCnt = 0;
  let out = new Uint8Array(sizeHint > 0 ? sizeHint : Math.max(1024, src.length * 4));
  let op = 0;

  const need = (n: number) => {
    // Pasado el final se rellena con ceros: un flujo cortado falla al validar, no aquí.
    while (bitCnt < n) {
      if (pos < src.length) bitBuf |= src[pos] << bitCnt;
      else if (pos > src.length + 4) throw new Error("deflate: datos truncados");
      pos++;
      bitCnt += 8;
    }
  };
  const bits = (n: number): number => {
    if (n === 0) return 0;
    need(n);
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  };
  const decode = (tb: Table): number => {
    need(tb.bits);
    const e = tb.t[bitBuf & ((1 << tb.bits) - 1)];
    const len = e & 15;
    if (!len) throw new Error("deflate: código de Huffman inválido");
    bitBuf >>>= len;
    bitCnt -= len;
    return e >> 4;
  };
  const grow = (min: number) => {
    let size = out.length * 2;
    while (size < min) size *= 2;
    const n = new Uint8Array(size);
    n.set(out.subarray(0, op));
    out = n;
  };

  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      // Bloque guardado sin comprimir: se descartan los bits hasta el byte y se
      // devuelven los bytes enteros que el vistazo ya había cargado.
      pos -= bitCnt >> 3;
      bitBuf = 0; bitCnt = 0;
      if (pos + 4 > src.length) throw new Error("deflate: bloque guardado truncado");
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      if (pos + len > src.length) throw new Error("deflate: bloque guardado truncado");
      if (op + len > out.length) grow(op + len);
      out.set(src.subarray(pos, pos + len), op);
      op += len;
      pos += len;
      continue;
    }
    let lit: Table, dist: Table;
    if (type === 1) [lit, dist] = fixedTables();
    else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
      const clt = buildTable(cl, 19);
      const lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const sym = decode(clt);
        if (sym < 16) lens[i++] = sym;
        else {
          let rep: number, val = 0;
          if (sym === 16) { if (!i) throw new Error("deflate: repetición sin anterior"); val = lens[i - 1]; rep = 3 + bits(2); }
          else if (sym === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (i + rep > hlit + hdist) throw new Error("deflate: longitudes de más");
          lens.fill(val, i, i + rep);
          i += rep;
        }
      }
      lit = buildTable(lens.subarray(0, hlit), hlit);
      dist = buildTable(lens.subarray(hlit), hdist);
    } else throw new Error("deflate: tipo de bloque inválido");

    for (;;) {
      const sym = decode(lit);
      if (sym < 256) {
        if (op >= out.length) grow(op + 1);
        out[op++] = sym;
      } else if (sym === 256) break;
      else {
        const li = sym - 257;
        if (li >= 29) throw new Error("deflate: largo inválido");
        const len = LEN_BASE[li] + bits(LEN_EXTRA[li]);
        const di = decode(dist);
        if (di >= 30) throw new Error("deflate: distancia inválida");
        const d = DIST_BASE[di] + bits(DIST_EXTRA[di]);
        if (d > op) throw new Error("deflate: distancia antes del principio");
        if (op + len > out.length) grow(op + len);
        // Copia byte a byte: el origen puede pisarse con el destino (d < len).
        let from = op - d;
        if (d >= len) { out.copyWithin(op, from, from + len); op += len; }
        else for (let k = 0; k < len; k++) out[op++] = out[from++];
      }
    }
  }
  return op === out.length ? out : out.subarray(0, op);
}

/** gzip (lo que escribe `Utils.Compress`): cabecera de 10 bytes y opcionales, deflate, CRC y tamaño. */
export function gunzip(src: Uint8Array): Uint8Array {
  if (src.length < 18 || src[0] !== 0x1f || src[1] !== 0x8b || src[2] !== 8) throw new Error("no es gzip (se esperaba 1f 8b 08)");
  const flags = src[3];
  let p = 10;
  if (flags & 4) p += 2 + (src[p] | (src[p + 1] << 8)); // FEXTRA
  if (flags & 8) { while (p < src.length && src[p]) p++; p++; } // FNAME
  if (flags & 16) { while (p < src.length && src[p]) p++; p++; } // FCOMMENT
  if (flags & 2) p += 2; // FHCRC
  // ISIZE (tamaño mod 2^32) sólo como pista de capacidad, con tope.
  const n = src.length;
  const isize = (src[n - 4] | (src[n - 3] << 8) | (src[n - 2] << 16) | (src[n - 1] << 24)) >>> 0;
  const out = inflateRaw(src, isize > 0 && isize <= 128 * 1024 * 1024 ? isize : 0, p);
  if (isize !== (out.length >>> 0)) throw new Error("gzip: el tamaño no coincide");
  return out;
}
