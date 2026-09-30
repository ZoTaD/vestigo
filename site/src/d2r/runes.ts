/**
 * El nombre corto de una runa (2026-09-29). Vive acá y no en la ficha (`D2rRunes.tsx`) porque
 * también lo usan las palabras rúnicas y el Grial: importarlo de la ficha les hacía bajar todo
 * lo de la ficha (los datos de farmeo, el bloque y su hoja de estilos) sin mostrar nada de eso.
 */
import type { Rune } from "./wiki";

/** "Ber": el mismo en los dos idiomas. */
export const runeShort = (r: Rune) => r.name.en.replace(/ Rune$/, "");
