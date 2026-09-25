import { renderToString } from "react-dom/server";
import App from "./App";
import { VALHEIM_TABS, type Route } from "./route";
import { loadBuilds } from "./deadlockBuildsData";
import { loadMastery } from "./deadlockMasteryData";
import { loadDetail } from "./deadlockItemsData";
import { loadEdition, resolveSlug } from "./deadlockNewsData";
import { loadHeroDetail, loadHeroKit, loadInsights } from "./deadlockHeroKitData";
import { BANDS, BRAWL, loadBand, PUBLISHED_BAND } from "./deadlockData";
import { heroes as heroSlugs } from "./deadlockSlugs";
import { leagueBySlug, loadEconomy } from "./poe2EconomyData";
import { isCat, loadCat, loadIndex } from "./poe2EncyclopediaData";
import { EDITIONS, loadAllEditions, loadEdition as loadP2Edition } from "./poe2PatchesData";
import { loadIndex as loadVhIndex, loadTab as loadVhTab } from "./valheimData";
import { loadEdition as loadVhEdition, loadEditions as loadVhEditions } from "./valheimPatchesData";

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
  const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
  if (route.view === "poe2") return preloadPoe2(route, quiet);
  if (route.view === "valheim") return preloadValheim(route, quiet);
  if (route.view !== "deadlock") return;
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
  if (route.dlSection === "street-brawl") await quiet(loadBand(BRAWL));
  if (route.dlSection === "items" && route.detail) await quiet(loadDetail());
  if (route.dlSection === "patches") {
    const { slug } = resolveSlug(route.detail);
    if (slug) await quiet(loadEdition(slug));
  }
}

/**
 * Path of Exile 2: lo mismo para sus tres pestañas. La ficha también lleva
 * "los únicos sobre esta base" y su historial de parches, así que se precargan
 * esas listas; las ediciones quedan en memoria y la siguiente ficha no las vuelve a pedir.
 */
async function preloadPoe2(route: Route, quiet: (p: Promise<unknown>) => Promise<unknown>): Promise<void> {
  const section = route.p2Section ?? "economy";
  // El árbol se arma en el navegador: el HTML lleva el título y la explicación.
  if (section === "tree") return;
  if (section === "economy") {
    await quiet(loadEconomy(leagueBySlug(route.detail).slug));
    return;
  }
  if (section === "patches") {
    const slug = EDITIONS.find((e) => e.slug === route.detail)?.slug ?? EDITIONS[0]?.slug;
    await Promise.all([quiet(loadIndex()), ...(slug ? [quiet(loadP2Edition(slug))] : [])]);
    return;
  }
  const [cat, slug] = (route.detail ?? "").split("/");
  await Promise.all([
    quiet(loadIndex()),
    ...(isCat(cat) ? [quiet(loadCat(cat))] : []),
    ...(isCat(cat) && slug ? [quiet(loadAllEditions())] : []),
    ...(cat === "bases" && slug ? [quiet(loadCat("uniques"))] : []),
  ]);
}

/**
 * Valheim: todas las pestañas de una vez (~2 MB de JSON que quedan en memoria
 * para las ~3.400 páginas del build). Una ficha usa su pestaña, la de cada
 * ingrediente y la de lo que se hace en ella; pedirlas todas es más simple que
 * adivinar cuáles. Más la Crónica: el índice, la edición y los nombres.
 */
async function preloadValheim(route: Route, quiet: (p: Promise<unknown>) => Promise<unknown>): Promise<void> {
  const tasks = [quiet(loadVhIndex()), quiet(loadVhEditions()), ...VALHEIM_TABS.map((t) => quiet(loadVhTab(t)))];
  if (route.vhSection === "patches" || route.vhSection === "home") {
    const eds = await loadVhEditions().catch(() => []);
    const slug = route.detail ?? eds[0]?.slug;
    if (slug) tasks.push(quiet(loadVhEdition(slug)));
  }
  await Promise.all(tasks);
}

export async function renderApp(route: Route): Promise<string> {
  await preload(route);
  // El idioma no se pasa aparte: `App` ya monta su propio `LangContext` con
  // `route.lang`, así que darle la ruta alcanza para que la copia salga en el
  // idioma de la página.
  return renderToString(<App ssrRoute={route} />);
}
