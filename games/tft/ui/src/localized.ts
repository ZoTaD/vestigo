import type { Lang } from "./i18n";

/**
 * Un texto en los dos idiomas, y cómo elegir uno.
 *
 * **Vivía en `catalog.ts`, y eso costaba 466 KB en cada página.** `catalog.ts`
 * importa el catálogo de TFT (campeones, rasgos, ítems) para exponerlo, y los
 * once módulos de Deadlock sólo querían `text()` de ahí: al importarla,
 * arrastraban el catálogo entero de un juego que no iban a mirar. Medido el
 * 2026-09-07: el bundle principal pesaba 1,4 MB (339 KB comprimidos) en la
 * portada y en Deadlock, y casi un megabyte eran datos de TFT.
 *
 * Acá no hay datos: sólo el tipo y la función. `catalog.ts` los re-exporta
 * para que TFT no cambie.
 */
export interface Localized {
  en: string;
  es: string;
}

export function text(field: Localized | undefined, lang: Lang, fallback = ""): string {
  return field?.[lang] || field?.en || fallback;
}
