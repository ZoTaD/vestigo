/**
 * El índice de fichas de Diablo II (2026-09-29): las de la wiki (runas, palabras
 * rúnicas, únicos, conjuntos, clases, parches) y las de los jefes y superúnicos
 * de la calculadora de drops, cada una con su pestaña y su nombre en los dos
 * idiomas. Se pide aparte (~63 KB) y sólo cuando hace falta: el `<head>` de una
 * ficha al navegar (`PageMeta.tsx`).
 */
import type { D2rTab } from "../route";

export interface D2IndexEntry {
  sec: D2rTab;
  id: string;
  en: string;
  es: string;
  img?: string | null;
}

let cache: D2IndexEntry[] | null = null;
let pending: Promise<D2IndexEntry[]> | null = null;

export const peekD2Index = (): D2IndexEntry[] | null => cache;

export function loadD2Index(): Promise<D2IndexEntry[]> {
  // La wiki y las fichas de la calculadora de drops, en un solo índice. Cada una es un archivo aparte: si una no llega (un
  // corte de red, un archivo viejo después de publicar), la otra sigue dando sus nombres. Sólo si no llega ninguna se
  // rechaza, como antes, y el `<head>` se queda con el título de la pestaña.
  pending ??= Promise.allSettled([import("@d2r/wiki/index.json"), import("@d2r/drops/index.json")]).then((parts) => {
    const llegaron = parts.flatMap((p) => (p.status === "fulfilled" ? [p.value.default as unknown as D2IndexEntry[]] : []));
    if (!llegaron.length) throw (parts[0] as PromiseRejectedResult).reason;
    cache = llegaron.flat();
    return cache;
  });
  return pending;
}
