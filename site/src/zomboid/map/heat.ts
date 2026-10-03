/**
 * La capa "Densidad de zombis" del Mapa de Project Zomboid (2026-10-01): la grilla que escribe `map.py` en
 * `web/zombies.bin` (un byte por chunk de 8×8 casillas, deflate crudo; ver `zombie_density`) y cómo se pinta. Es la
 * densidad relativa que trae el mapa, no una cuenta: el juego la mezcla con el azar de cada mundo y la configuración.
 *
 * Lógica pura salvo `loadDensity` (que pide el archivo); se prueba en `test/zomboidMapHeat.test.ts`. Sólo la usa
 * `overlays.ts`, así que viaja con el visor y no en el chunk de la pestaña. Nada toca `window` al importarse: el
 * prerender puede cruzarse con el módulo sin romperse.
 */
import zombiesUrl from "@zomboid/map/web/zombies.bin?url";
import type { DensityHeader } from "./data";
import { HEAT_RGB, heatAlpha } from "./layerMeta";
import { pxPerTile, tileRect } from "./paper";

/** Niveles de la pirámide: con 4, al zoom −2 (el más lejano) cada celda del último nivel es un píxel. */
export const HEAT_LEVELS = 4;

export interface DensityLevel {
  w: number;
  h: number;
  v: Uint8Array;
}

/**
 * Abre `zombies.bin`. Es deflate crudo (sin la cabecera de zlib), así que va `"deflate-raw"`: con `"deflate"` falla.
 * Sin `DecompressionStream` (Safari antes de la 16.4, navegadores viejos) usa el inflador propio de Valheim, que se pide
 * aparte sólo en ese caso.
 */
export async function inflateDensity(packed: Uint8Array, size: number): Promise<Uint8Array> {
  let out: Uint8Array;
  if (typeof DecompressionStream === "undefined") {
    const { inflateRaw } = await import("../../valheimMap/saves/inflate");
    out = inflateRaw(packed, size);
  } else {
    const stream = new Blob([packed as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    out = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (out.length !== size) throw new Error(`densidad: ${out.length} bytes en vez de ${size}`);
  return out;
}

/**
 * La grilla y sus reducciones a la mitad, por máximo y no por promedio: de lejos un pueblo chico con zombis tiene que
 * seguir viéndose, y el promedio con el campo vacío alrededor lo borraba.
 */
export function densityPyramid(v: Uint8Array, w: number, h: number, levels = HEAT_LEVELS): DensityLevel[] {
  const out: DensityLevel[] = [{ w, h, v }];
  for (let k = 1; k < levels; k++) {
    const p = out[k - 1];
    const nw = Math.ceil(p.w / 2);
    const nh = Math.ceil(p.h / 2);
    const nv = new Uint8Array(nw * nh);
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const s = p.v[y * p.w + x];
        const i = (y >> 1) * nw + (x >> 1);
        if (s > nv[i]) nv[i] = s;
      }
    }
    out.push({ w: nw, h: nh, v: nv });
  }
  return out;
}

/** El nivel para el zoom `z` del visor: el primero que da al menos un píxel por celda (un chunk mide `cell` casillas). */
export const heatLevel = (z: number, cell = 8): number =>
  Math.min(HEAT_LEVELS - 1, Math.max(0, Math.ceil(-Math.log2(pxPerTile(z) * cell))));

/**
 * Qué ventana de la pirámide cubre la tesela (x, y) del zoom `z`: el nivel `k`, la celda de arriba a la izquierda y el
 * lado `n` en celdas. Siempre cae exacto: la tesela mide 2^(12−z) casillas y la celda del nivel 8·2^k, con
 * k = max(0, 1 − z), así que no quedan celdas partidas. Aparte de `overlays.ts` para poder probarla sin Leaflet.
 */
export function heatTileCells(x: number, y: number, z: number, size: number, cell = 8): { k: number; x0: number; y0: number; n: number } {
  const k = heatLevel(z, cell);
  const span = cell * 2 ** k; // casillas por celda del nivel
  const rect = tileRect(x, y, z, size);
  return { k, x0: Math.round(rect.x0 / span), y0: Math.round(rect.y0 / span), n: Math.round((rect.x1 - rect.x0) / span) };
}

/**
 * Las celdas [x0, x0+n) × [y0, y0+n) del nivel en RGBA (n×n): los ceros y lo que cae fuera del mapa, transparentes. Con
 * `<ArrayBuffer>` en el tipo: `new ImageData` no acepta un `ArrayBufferLike` (podría ser compartido) y va directo ahí.
 */
export function heatWindow(level: DensityLevel, x0: number, y0: number, n: number, max: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(n * n * 4);
  // La opacidad de cada valor posible, una vez: la ventana puede tener 32.000 celdas y la raíz no cambia entre ellas.
  const alpha = new Uint8ClampedArray(256);
  for (let v = 1; v < 256; v++) alpha[v] = Math.round(heatAlpha(v, max) * 255);
  const [r, g, b] = HEAT_RGB;
  for (let y = 0; y < n; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= level.h) continue;
    for (let x = 0; x < n; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= level.w) continue;
      const v = level.v[sy * level.w + sx];
      if (!v) continue;
      const o = (y * n + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = alpha[v];
    }
  }
  return out;
}

let pending: Promise<DensityLevel[]> | null = null;
/** Pide `zombies.bin` una vez (la primera vez que se prende la capa) y arma la pirámide. Un corte de red no queda pegado. */
export function loadDensity(head: DensityHeader): Promise<DensityLevel[]> {
  pending ??= fetch(zombiesUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`zombies.bin: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => inflateDensity(new Uint8Array(buf), head.w * head.h))
    .then((v) => densityPyramid(v, head.w, head.h));
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
