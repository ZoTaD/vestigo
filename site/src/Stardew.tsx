/**
 * La sección Stardew Valley (2026-10-22): estética A "Menú del juego". Diseño:
 * docs/superpowers/specs/2026-10-22-stardew-design.md.
 *
 * La página es el menú del juego sobre el valle: el cielo con el paisaje abajo, la barra de pestañas como las del
 * inventario (botones naranjas de madera, el activo crema) y cada pantalla en cajas con el marco de madera. Sin el
 * logo oficial: el título va en Pixelify Sans. Cada pestaña con página viaja en su chunk (`TABS`, y su archivo en
 * `STARDEW_TAB_FILES` de areaFiles.ts). Las tipografías y la hoja de estilos viajan con este chunk: sólo las baja quien
 * entra a Stardew Valley.
 */
import { Suspense, useEffect } from "react";
import { lazyWithPreload } from "./lazyWithPreload";
import RouteLink from "./RouteLink";
import { parseRoute, routePath, type Route, type StardewSection, type StardewTab } from "./route";
import { STARDEW_TABS, useStardewCopy } from "./stardewCopy";
import StardewHome from "./stardew/StardewHome";
import { loadHome } from "./stardew/homeData";
import { SdLoading } from "./stardew/ui";
import "@fontsource/pixelify-sans/500.css";
import "@fontsource/pixelify-sans/700.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/800.css";
import "./styles/stardew.css";

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

const SdItems = lazyWithPreload(() => import("./stardew/items/StardewItems"));

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá y en `STARDEW_TAB_FILES`. */
// Una línea por pestaña (no en una sola): `areas.test.ts` lee este bloque para compararlo con `STARDEW_TAB_FILES`.
const TABS: Partial<Record<StardewSection, LazyTab>> = {
  items: SdItems,
};

/** ¿La pestaña ya tiene página? Las que no, se anuncian apagadas y su dirección muestra la portada. */
const hasPage = (tab: StardewSection): boolean => tab === "home" || !!TABS[tab];

/**
 * Los datos que una pestaña baja aparte de su chunk, pedidos junto con él. La portada, los nombres de lo que muestra.
 * Objetos, igual que en Terraria: en frío, `main.tsx` lee la dirección antes de que se conozca el slug en español de la
 * ficha; primero se anota, y la ficha se busca con la dirección leída de nuevo.
 */
const TAB_DATA: Partial<Record<StardewSection, (route: Route) => Promise<unknown>>> = {
  home: (route) => loadHome(route.lang),
  items: (route) =>
    Promise.all([SdItems.preload(), import("./stardew/data")]).then(([, m]) => m.preloadItemsRoute(route).then(() => m.preloadItemsRoute(parseRoute(routePath(route))))),
};

/** Baja el chunk de la pestaña de una ruta de Stardew Valley, y sus datos. */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.sdSection ?? "home";
  const shown = hasPage(sec) ? sec : "home";
  return Promise.all([TABS[shown]?.preload(), TAB_DATA[shown]?.(route)]).then(() => undefined);
};

/** La dirección a la que llevó el último Atrás o Adelante, hasta que la vuelta arriba la consulte (igual que en `Terraria.tsx`). */
let poppedTo: string | null = null;
export const notePop = (path: string): void => {
  poppedTo = path;
};
export function cameFromHistory(path: string): boolean {
  const hit = poppedTo === path;
  poppedTo = null;
  return hit;
}
if (typeof window !== "undefined") window.addEventListener("popstate", () => notePop(window.location.pathname));

export default function Stardew({ route, navigate }: TabProps) {
  const t = useStardewCopy();
  const asked = route.sdSection ?? "home";
  // Una pestaña sin página todavía muestra la portada, y la barra marca Inicio.
  const section = hasPage(asked) ? asked : "home";
  const Tab = TABS[section];
  // Cambiar de pestaña o de ficha arranca arriba; Atrás y Adelante no, que el navegador devuelve el lugar donde estabas.
  useEffect(() => {
    if (typeof window !== "undefined" && !cameFromHistory(window.location.pathname)) window.scrollTo({ top: 0 });
  }, [section, route.detail]);
  return (
    <div className="sd" data-section={section}>
      <header className="sd-hero">
        <RouteLink className="sd-brand" to={{ ...route, view: "stardew", sdSection: "home", detail: undefined }} onNavigate={navigate}>
          Stardew Valley
        </RouteLink>
      </header>
      <div className="sd-wrap">
        <nav className="sd-tabs" aria-label="Stardew Valley">
          {STARDEW_TABS.map((tab) =>
            hasPage(tab) ? (
              <RouteLink
                className={`sd-tab${tab === section ? " is-on" : ""}`}
                to={{ ...route, view: "stardew", sdSection: tab, detail: undefined }}
                onNavigate={navigate}
                active={tab === section}
                key={tab}
              >
                {t.tabs[tab]}
              </RouteLink>
            ) : (
              <span className="sd-tab is-soon" aria-disabled="true" title={t.soon} key={tab}>
                {t.tabs[tab]}
              </span>
            ),
          )}
        </nav>
        {Tab ? (
          <Suspense fallback={<SdLoading />}>
            <Tab route={route} navigate={navigate} />
          </Suspense>
        ) : (
          <StardewHome route={route} navigate={navigate} live={(tab: StardewTab) => hasPage(tab)} />
        )}
      </div>
    </div>
  );
}
