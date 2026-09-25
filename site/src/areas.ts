/**
 * Cada parte del sitio en su propio chunk (2026-09-25).
 *
 * `App` importaba todas las pantallas de todos los juegos, así que el JS de
 * entrada pesaba 762 KB y quien abría Valheim bajaba también el armador de
 * Deadlock y el árbol de PoE2. Ahora la entrada es la cáscara (barra, pie,
 * idioma, rutas) y cada vista se baja aparte, con su CSS.
 *
 * `lazyWithPreload` y no `React.lazy`: el prerender (`entry-server.tsx`) y el
 * arranque en el navegador (`main.tsx`) esperan a `preloadView` antes del
 * primer render, así que la página prerenderizada nunca se cambia por un
 * fallback vacío. `Suspense` sólo se ve al saltar de un juego a otro sin
 * haberlo precargado, y `RouteLink` precarga al pasar el mouse.
 *
 * **Un juego nuevo** se suma acá, en `areaFiles.ts` (para que el prerender sepa
 * qué CSS y qué JS anunciar en cada HTML) y en el `switch` de `App`.
 */
import { lazyWithPreload } from "./lazyWithPreload";
import type { Route, View } from "./route";

const loadDeadlock = () => import("./DeadlockArea");

export const HomeArea = lazyWithPreload(() => import("./Home"));
export const DeadlockArea = lazyWithPreload(loadDeadlock);
export const Poe2Area = lazyWithPreload(() => import("./Poe2Area"));
export const ValheimArea = lazyWithPreload(() => import("./Valheim"));
export const PrivacyPage = lazyWithPreload(() => import("./Privacy"));
export const TermsPage = lazyWithPreload(() => import("./Terms"));

/**
 * El `<head>` de cada página al navegar. Perezoso también: arma títulos con los
 * datos de todos los juegos, y el HTML prerenderizado ya trae los de la página
 * de llegada, así que no hace falta para el primer pintado.
 */
export const PageMeta = lazyWithPreload(() => import("./PageMeta"));

const BY_VIEW: Partial<Record<View, { preload: () => Promise<void> }>> = {
  home: HomeArea,
  deadlock: DeadlockArea,
  poe2: Poe2Area,
  valheim: ValheimArea,
  privacy: PrivacyPage,
  terms: TermsPage,
};

/** Baja (una sola vez) el chunk de una vista. Nunca rechaza: si falla, el render lo reintenta. */
export const preloadView = (view: View): Promise<void> =>
  (BY_VIEW[view]?.preload() ?? Promise.resolve()).catch(() => undefined);

/**
 * Lo mismo para una ruta entera: la vista y, en Deadlock, además el chunk de su
 * pestaña (ver `preloadTab` en `DeadlockArea.tsx`). Es lo que esperan el primer
 * render y el prerender, y lo que precarga un enlace al pasar el mouse.
 */
export const preloadRoute = async (route: Route): Promise<void> => {
  await preloadView(route.view);
  if (route.view === "deadlock") await loadDeadlock().then((m) => m.preloadTab(route)).catch(() => undefined);
};
