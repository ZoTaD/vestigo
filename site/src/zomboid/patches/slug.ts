/**
 * De slug a versión de un parche de Project Zomboid (2026-10-02). Va sola, sin datos: la importa `PageMeta.tsx` para
 * poner el título de una página de versión al navegar, y no puede arrastrar el índice de la pestaña al área.
 */
import pages from "virtual:pz-patch-pages";

/** "42-21" → "42.21", "42-21-1" → "42.21.1", "42-22-b3" → "42.22 (build 3)"; null si no es un slug de versión. */
export function pzPatchVersion(slug: string): string | null {
  const m = /^(\d+)-(\d+)(?:-(\d+))?(?:-b(\d+))?$/.exec(slug);
  if (!m) return null;
  return `${m[1]}.${m[2]}${m[3] ? `.${m[3]}` : ""}${m[4] ? ` (build ${m[4]})` : ""}`;
}

// Las versiones que tienen página: sólo sus slugs, armados en el build (`pzPatchPagesModule` en vite.config.ts).
const PAGES = new Set(pages);

/**
 * El nombre de una versión para el `<head>` al navegar: la versión si tiene página, `null` si no. Sin esto,
 * `/parches/41-78` decía "Notas del parche 41.78" mientras la página mostraba la lista con "No encontramos esa versión".
 */
export function pzPatchName(slug: string): string | null {
  return PAGES.has(slug) ? pzPatchVersion(slug) : null;
}
