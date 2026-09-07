import summaryJson from "virtual:tft-summary";
import type { Localized } from "./localized";

/**
 * Lo poco de TFT que la portada necesita, calculado en el build.
 *
 * `virtual:tft-summary` lo arma el plugin `tftSummary()` de `vite.config.ts`
 * leyendo `comps.json`, `items.json` y `catalog.json` en Node: el número del
 * set, cuántas comps hay, la muestra, la mejor comp y el mejor ítem, con sus
 * nombres en los dos idiomas y sus slugs. Son unos cientos de bytes.
 *
 * **Existe para que la portada no importe `comps.json` (533 KB) ni el catálogo
 * (466 KB)** por dos tarjetas y una cifra. Antes lo hacía, y ese megabyte
 * viajaba a la portada y a Deadlock en el bundle principal (2026-09-07).
 */
export interface TftSummary {
  set: string;
  generatedAt: string;
  sampleSize: number;
  compsCount: number;
  best: { slug: string; name: Localized; avgPlacement: number } | null;
  bestItem: {
    slug: string;
    name: Localized;
    img: string;
    avgPlacement: number;
    delta: number;
  } | null;
}

export const tftSummary = summaryJson as TftSummary;
