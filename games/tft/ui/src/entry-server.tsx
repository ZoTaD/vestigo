import { renderToString } from "react-dom/server";
import App from "./App";
import { type Route } from "./route";
import { loadBuilds } from "./deadlockBuildsData";
import { loadMastery } from "./deadlockMasteryData";
import { loadDetail } from "./deadlockItemsData";
import { loadEdition, resolveSlug } from "./deadlockNewsData";
import { loadHeroDetail, loadHeroKit, loadInsights } from "./deadlockHeroKitData";
import { BANDS, loadBand, PUBLISHED_BAND } from "./deadlockData";
import { heroes as heroSlugs } from "./deadlockSlugs";

/**
 * El HTML de una ruta, para el prerender del build (ver `vite.config.ts`).
 *
 * **Antes de renderizar se precarga lo que la página baja aparte**, porque
 * `renderToString` no espera promesas y los `useEffect` no corren en el
 * servidor. Sin esto el HTML de un héroe decía "Loading…" donde va la build, y
 * el de Vestigo News era una hoja en blanco con "Printing the edition…"
 * (medido el 2026-09-18 sobre el sitio publicado). Cada módulo guarda lo
 * cargado en una caché propia que sus hooks leen en el primer render.
 */
async function preload(route: Route): Promise<void> {
  if (route.view !== "deadlock") return;
  const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
  if (route.dlSection === "meta" && route.detail) await Promise.all([quiet(loadBuilds()), quiet(loadMastery())]);
  if (route.dlSection === "heroes" && route.detail) {
    // La ficha entera: su kit, lo medido en la banda publicada y las cuatro
    // tier lists, que la sección "Por rango" compara.
    const id = Number(heroSlugs.toId.get(route.detail));
    await Promise.all([
      quiet(loadBuilds()),
      quiet(loadMastery()),
      quiet(loadHeroKit()),
      quiet(loadInsights(PUBLISHED_BAND)),
      ...(Number.isFinite(id) ? [quiet(loadHeroDetail(id))] : []),
      ...BANDS.map((b) => quiet(loadBand(b.id))),
    ]);
  }
  if (route.dlSection === "heroes") await quiet(loadHeroKit());
  if (route.dlSection === "items" && route.detail) await quiet(loadDetail());
  if (route.dlSection === "patches") {
    const { slug } = resolveSlug(route.detail);
    if (slug) await quiet(loadEdition(slug));
  }
}

export async function renderApp(route: Route): Promise<string> {
  await preload(route);
  // El idioma no se pasa aparte: `App` ya monta su propio `LangContext` con
  // `route.lang`, así que darle la ruta alcanza para que la copia salga en el
  // idioma de la página.
  return renderToString(<App ssrRoute={route} />);
}
