import { catalog, text } from "./catalog";
import { units as unitSlugs, items as itemSlugs, compSlugs, compName } from "./slugs";
import { buildComps } from "./data";
import { DEFAULT_BAND } from "./bands";
import type { Route } from "./route";
import type { Lang } from "./i18n";

/**
 * El nombre de la unidad, el ítem o la comp que nombra la URL de TFT, para el
 * título de la página.
 *
 * **Separado de `PageMeta` a propósito**: resolverlo necesita el catálogo y
 * las comps del set (casi un megabyte), y `PageMeta` corre en todas las
 * páginas, incluidas la portada y Deadlock. `PageMeta` lo importa con
 * `import()` sólo cuando la ruta es de TFT con detalle; el prerender no pasa
 * por acá (sus títulos salen de `prerender.ts` con los datos en el build).
 */
export function tftDetailName(route: Route, lang: Lang): string | null {
  if (!route.detail) return null;
  if (route.section === "units") {
    const id = unitSlugs.toId.get(route.detail);
    return id ? text(catalog.champions[id]?.name, lang, route.detail) : null;
  }
  if (route.section === "items") {
    const id = itemSlugs.toId.get(route.detail);
    return id ? text(catalog.items[id]?.name, lang, route.detail) : null;
  }
  if (route.section === "meta") {
    const band = route.band ?? DEFAULT_BAND;
    const id = compSlugs(band).toId.get(route.detail);
    const comp = id ? buildComps(band, lang).find((c) => c.id === id) : undefined;
    return comp ? compName(comp) : null;
  }
  return null;
}
