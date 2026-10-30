/**
 * Pines compartidos por enlace (2026-10-30): los pines elegidos viajan en el `#` de la dirección (no llegan al
 * servidor), como `#p=<base64url>`: JSON compacto `[[x, z, tipo, nombre], …]` (metros redondeados) comprimido con
 * deflate-raw. Un enlace de más de `MAX_HASH` caracteres no se arma: la página avisa y pide filtrar.
 */
export interface SharedPin { x: number; z: number; type: number; name: string }

/** Lo que aguanta una dirección sin problemas en navegadores, chats y redes. */
export const MAX_HASH = 8000;

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const toB64url = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function encodePins(pins: SharedPin[]): Promise<string> {
  const rows = pins.map((p) => [Math.round(p.x), Math.round(p.z), p.type, p.name.slice(0, 40)]);
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(rows)), new CompressionStream("deflate-raw")));
}

/** Los pines de un `#p=…`; lo que no se puede leer (enlace cortado, otro formato) da una lista vacía. */
export async function decodePins(code: string): Promise<SharedPin[]> {
  try {
    const raw = JSON.parse(new TextDecoder().decode(await pipe(fromB64url(code), new DecompressionStream("deflate-raw"))));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]))
      .slice(0, 2000)
      .map((r) => ({ x: r[0], z: r[1], type: Number(r[2]) || 3, name: typeof r[3] === "string" ? r[3].slice(0, 40) : "" }));
  } catch {
    return [];
  }
}

/** El código de pines de la dirección actual (`#p=…`), si hay. */
export const pinsInHash = (hash: string): string | null => new URLSearchParams(hash.replace(/^#/, "")).get("p");
