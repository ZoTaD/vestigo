/**
 * El nombre de un mapa en el idioma de la página (`games/aoe2/data/maps.json`, del juego). Un mapa que no está ahí
 * (uno nuevo o personalizado) sale de su slug: `arabian-desert` → "Arabian Desert".
 * Desde el 2026-11-26 lo usan también el historial, la partida y el cara a cara, que lo mostraban siempre en inglés.
 */
import maps from "@aoe2/maps.json";
import type { Lang } from "../../i18n";

export const prettify = (slug: string): string =>
  slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

const MAPAS = new Map((maps as { slug: string; name: { en: string; es: string } }[]).map((m) => [m.slug, m.name]));
export const mapName = (slug: string, lang: Lang): string => MAPAS.get(slug)?.[lang] ?? prettify(slug);
