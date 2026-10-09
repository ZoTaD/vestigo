/**
 * El circuito en el link (2026-10-09): binario compacto → `deflate-raw` (`CompressionStream`) → base64url, en el
 * `#hash` (no viaja al servidor). Plan: docs/superpowers/plans/2026-10-09-rust-electricidad.md.
 *
 * Formato v1 (todo en varint; los con signo en zigzag):
 *   versión · tipos (cantidad, y cada shortname con su largo en UTF-8) · entorno (hora×10, ráfaga×100, altura) ·
 *   partes (cantidad; por parte: índice de tipo, x, y, cantidad de ajustes y cada uno como índice en `CFG_KEYS` +
 *   valor×100) · cables (cantidad; por cable: parte y enchufe de salida, parte y enchufe de entrada).
 * `CFG_KEYS` sólo crece al final: así un link viejo sigue abriendo. Una versión nueva del formato suma su rama en
 * `decode` y deja la v1 como está.
 */
import type { Circuit, Part, PartCfg } from "./engine/types";

export const CODEC_VERSION = 1;
/** Los ajustes que se guardan. Sólo se agregan al final. */
export const CFG_KEYS = ["on", "fuel", "charge", "branchAmount", "timerLength", "target", "count", "passthrough", "frequency", "players", "detect", "vibration", "ammo", "open", "manualMode"] as const;

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

/** El circuito en bytes, sin comprimir. */
export function toBytes(c: Circuit): Uint8Array {
  const w = new Writer();
  w.uint(CODEC_VERSION);
  const types = [...new Set(c.parts.map((p) => p.type))];
  w.uint(types.length);
  for (const t of types) w.str(t);
  w.uint(Math.round((c.env?.hour ?? 12) * 10));
  w.uint(Math.round((c.env?.gust ?? 0.5) * 100));
  w.uint(Math.round(c.env?.height ?? 20));
  w.uint(c.parts.length);
  const index = new Map(c.parts.map((p, i) => [p.id, i]));
  for (const p of c.parts) {
    w.uint(types.indexOf(p.type));
    w.int(p.x);
    w.int(p.y);
    const cfg = Object.entries(p.cfg ?? {}).filter(([k, v]) => (CFG_KEYS as readonly string[]).includes(k) && Number.isFinite(v));
    w.uint(cfg.length);
    for (const [k, v] of cfg) {
      w.uint((CFG_KEYS as readonly string[]).indexOf(k));
      w.int(v * 100);
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

export function fromBytes(b: Uint8Array): Circuit {
  const r = new Reader(b);
  const version = r.uint();
  if (version !== 1) throw new Error(`versión ${version}`);
  const types: string[] = [];
  for (let n = r.uint(); n > 0; n--) types.push(r.str());
  const env = { hour: r.uint() / 10, gust: r.uint() / 100, height: r.uint() };
  const parts: Part[] = [];
  for (let i = 0, n = r.uint(); i < n; i++) {
    const type = types[r.uint()];
    const x = r.int();
    const y = r.int();
    const cfg: PartCfg = {};
    for (let k = r.uint(); k > 0; k--) {
      const key = CFG_KEYS[r.uint()];
      const v = r.int() / 100;
      if (key) cfg[key] = v;
    }
    parts.push({ id: partId(i), type, x, y, ...(Object.keys(cfg).length ? { cfg } : {}) });
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
