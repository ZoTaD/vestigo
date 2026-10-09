/**
 * El circuito en el link (2026-10-09): binario compacto → `deflate-raw` (`CompressionStream`) → base64url, en el
 * `#hash` (no viaja al servidor). Plan: docs/superpowers/plans/2026-10-09-rust-electricidad.md.
 *
 * Formato v2 (2026-10-09, agua e industrial): textos (tipos, objetos y categorías) · entorno con lluvia, niebla y nieve ·
 * por parte, además, su inventario (objeto, ranura, cantidad) y los filtros de la cinta. La v1 sigue abriendo.
 *
 * Formato v1 (todo en varint; los con signo en zigzag):
 *   versión · tipos (cantidad, y cada shortname con su largo en UTF-8) · entorno (hora×10, ráfaga×100, altura) ·
 *   partes (cantidad; por parte: índice de tipo, x, y, cantidad de ajustes y cada uno como índice en `CFG_KEYS` +
 *   valor×100) · cables (cantidad; por cable: parte y enchufe de salida, parte y enchufe de entrada).
 * `CFG_KEYS` sólo crece al final: así un link viejo sigue abriendo. Una versión nueva del formato suma su rama en
 * `decode` y deja la v1 como está.
 */
import type { Circuit, Part, PartCfg } from "./engine/types";

export const CODEC_VERSION = 2;
/** Los ajustes que se guardan. Sólo se agregan al final. */
export const CFG_KEYS = [
  "on", "fuel", "charge", "branchAmount", "timerLength", "target", "count", "passthrough", "frequency", "players", "detect", "vibration", "ammo", "open", "manualMode",
  // v2 (2026-10-09): agua e industrial.
  "height", "water", "salt", "fresh", "mode", "crafting",
  // Poste de tendido (9/10): fusibles pesados en la central.
  "fuses",
] as const;

class Writer {
  bytes: number[] = [];
  uint(v: number): void {
    let x = Math.max(0, Math.floor(v));
    while (x >= 0x80) {
      this.bytes.push((x % 0x80) | 0x80);
      x = Math.floor(x / 0x80);
    }
    this.bytes.push(x);
  }
  int(v: number): void {
    const x = Math.round(v);
    this.uint(x >= 0 ? x * 2 : -x * 2 - 1);
  }
  str(s: string): void {
    const b = new TextEncoder().encode(s);
    this.uint(b.length);
    for (const x of b) this.bytes.push(x);
  }
}

class Reader {
  i = 0;
  constructor(private b: Uint8Array) {}
  uint(): number {
    let x = 0;
    let mul = 1;
    for (;;) {
      if (this.i >= this.b.length) throw new Error("corto");
      const c = this.b[this.i++];
      x += (c & 0x7f) * mul;
      if (c < 0x80) return x;
      mul *= 0x80;
    }
  }
  int(): number {
    const u = this.uint();
    return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
  }
  str(): string {
    const n = this.uint();
    const s = new TextDecoder().decode(this.b.subarray(this.i, this.i + n));
    this.i += n;
    return s;
  }
}

/** El circuito en bytes, sin comprimir (siempre en la versión nueva). */
export function toBytes(c: Circuit): Uint8Array {
  const w = new Writer();
  w.uint(CODEC_VERSION);
  // Tabla de textos: tipos de parte, objetos de los inventarios y de los filtros, categorías.
  const strings: string[] = [];
  const str = (s: string): number => {
    let i = strings.indexOf(s);
    if (i < 0) i = strings.push(s) - 1;
    return i;
  };
  for (const p of c.parts) {
    str(p.type);
    for (const it of p.inv ?? []) str(it.id);
    for (const f of p.filters ?? []) {
      if (f.item) str(f.item);
      if (f.cat) str(f.cat);
    }
  }
  w.uint(strings.length);
  for (const t of strings) w.str(t);
  w.uint(Math.round((c.env?.hour ?? 12) * 10));
  w.uint(Math.round((c.env?.gust ?? 0.5) * 100));
  w.uint(Math.round(c.env?.height ?? 20));
  w.uint(Math.round((c.env?.rain ?? 0) * 100));
  w.uint(Math.round((c.env?.fog ?? 0) * 100));
  w.uint(Math.round((c.env?.snow ?? 0) * 100));
  w.uint(c.parts.length);
  const index = new Map(c.parts.map((p, i) => [p.id, i]));
  for (const p of c.parts) {
    w.uint(str(p.type));
    w.int(p.x);
    w.int(p.y);
    // La altura 0 (y cualquier ajuste en 0 que sea el valor por defecto de la parte) no viaja.
    const cfg = Object.entries(p.cfg ?? {}).filter(([k, v]) => (CFG_KEYS as readonly string[]).includes(k) && Number.isFinite(v) && !(k === "height" && v === 0));
    w.uint(cfg.length);
    for (const [k, v] of cfg) {
      w.uint((CFG_KEYS as readonly string[]).indexOf(k));
      w.int(v * 100);
    }
    const inv = p.inv ?? [];
    w.uint(inv.length);
    for (const it of inv) {
      w.uint(str(it.id));
      w.uint(it.slot);
      w.uint(it.n);
    }
    const filters = p.filters ?? [];
    w.uint(filters.length);
    for (const f of filters) {
      w.uint(f.item ? str(f.item) + 1 : 0);
      w.uint(f.cat ? str(f.cat) + 1 : 0);
      w.uint(f.max ?? 0);
      w.uint(f.min ?? 0);
      w.uint(f.buffer ?? 0);
    }
  }
  const wires = c.wires.filter((x) => index.has(x.from[0]) && index.has(x.to[0]));
  w.uint(wires.length);
  for (const x of wires) {
    w.uint(index.get(x.from[0])!);
    w.uint(x.from[1]);
    w.uint(index.get(x.to[0])!);
    w.uint(x.to[1]);
  }
  return Uint8Array.from(w.bytes);
}

/** Los ids de las partes al abrir un link: cortos y en orden. */
export const partId = (i: number): string => `p${i}`;

/** Lee la v1 (sólo energía) y la v2 (con agua e industrial). */
export function fromBytes(b: Uint8Array): Circuit {
  const r = new Reader(b);
  const version = r.uint();
  if (version !== 1 && version !== 2) throw new Error(`versión ${version}`);
  const strings: string[] = [];
  for (let n = r.uint(); n > 0; n--) strings.push(r.str());
  const env: Circuit["env"] = { hour: r.uint() / 10, gust: r.uint() / 100, height: r.uint() };
  if (version >= 2) Object.assign(env, { rain: r.uint() / 100, fog: r.uint() / 100, snow: r.uint() / 100 });
  const parts: Part[] = [];
  for (let i = 0, n = r.uint(); i < n; i++) {
    const type = strings[r.uint()];
    const x = r.int();
    const y = r.int();
    const cfg: PartCfg = {};
    for (let k = r.uint(); k > 0; k--) {
      const key = CFG_KEYS[r.uint()];
      const v = r.int() / 100;
      if (key) cfg[key] = v;
    }
    const part: Part = { id: partId(i), type, x, y, ...(Object.keys(cfg).length ? { cfg } : {}) };
    if (version >= 2) {
      const inv: NonNullable<Part["inv"]> = [];
      for (let k = r.uint(); k > 0; k--) inv.push({ id: strings[r.uint()], slot: r.uint(), n: r.uint() });
      const filters: NonNullable<Part["filters"]> = [];
      for (let k = r.uint(); k > 0; k--) {
        const item = r.uint();
        const cat = r.uint();
        const f: NonNullable<Part["filters"]>[number] = {};
        if (item) f.item = strings[item - 1];
        if (cat) f.cat = strings[cat - 1];
        const max = r.uint();
        const min = r.uint();
        const buffer = r.uint();
        if (max) f.max = max;
        if (min) f.min = min;
        if (buffer) f.buffer = buffer;
        filters.push(f);
      }
      if (inv.length) part.inv = inv;
      if (filters.length) part.filters = filters;
    }
    parts.push(part);
  }
  const wires: Circuit["wires"] = [];
  for (let n = r.uint(); n > 0; n--) {
    const fa = r.uint();
    const fs = r.uint();
    const ta = r.uint();
    const ts = r.uint();
    if (parts[fa] && parts[ta]) wires.push({ from: [partId(fa), fs], to: [partId(ta), ts] });
  }
  return { parts, wires, env };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const b64url = (b: Uint8Array): string => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** El circuito como texto para el `#hash`. */
export async function encode(c: Circuit): Promise<string> {
  return b64url(await pipe(toBytes(c), new CompressionStream("deflate-raw")));
}

/** Un `#hash` (sin el `#` ni el `c=`) de vuelta a circuito; `null` si está roto. */
export async function decode(s: string): Promise<Circuit | null> {
  try {
    return fromBytes(await pipe(fromB64url(s), new DecompressionStream("deflate-raw")));
  } catch {
    return null;
  }
}

/** El `#hash` del editor: `#c=<circuito>`. */
export const HASH_KEY = "c=";

/** Autoguardado en el navegador. Puede fallar (modo privado, cuota): nunca rompe la página. */
export const STORAGE_KEY = "vestigo.rust.electric.v1";

export function saveLocal(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    /* sin almacenamiento: el link sigue andando */
  }
}

export function loadLocal(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
