import type { Lang } from "./i18n";

/**
 * Un texto en los dos idiomas, y cómo elegir uno.
 *
 * Acá no hay datos: sólo el tipo y la función. Vivía junto al catálogo de TFT,
 * y cada módulo que quería `text()` arrastraba el catálogo entero (medido el
 * 2026-09-07: casi un megabyte de más en cada página). Un módulo sin datos es
 * lo que evita que vuelva a pasar.
 */
export interface Localized {
  en: string;
  es: string;
}

export function text(field: Localized | undefined, lang: Lang, fallback = ""): string {
  return field?.[lang] || field?.en || fallback;
}
