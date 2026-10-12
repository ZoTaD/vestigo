/**
 * La sección Terraria (2026-10-12): estética C "World slice", la página como un corte del mundo. Diseño:
 * docs/superpowers/specs/2026-10-12-terraria-etapa-1-design.md.
 *
 * Cada pestaña vive en una capa (la portada en el cielo, Objetos en el subsuelo, el árbol en las cavernas) y la regla
 * de profundidad es la navegación: fija a la izquierda en pantallas anchas, una fila arriba en el resto. Cada pestaña
 * con página viaja en su chunk (`TABS`, y su archivo en `TERRARIA_TAB_FILES` de areaFiles.ts). La tipografía y la
 * hoja de estilos viajan con este chunk: sólo las baja quien entra a Terraria.
 */
import { Suspense, useEffect } from "react";
import home from "@terraria/home.json";
import { lazyWithPreload } from "./lazyWithPreload";
import RouteLink from "./RouteLink";
import { parseRoute, registerTerrariaSlugs, routePath, TERRARIA_PUBLISHED, type Route, type TerrariaSection } from "./route";
import { TERRARIA_TABS, useTerrariaCopy } from "./terrariaCopy";
import type { Featured } from "./terraria/data";
import TerrariaHome from "./terraria/TerrariaHome";
import { TrLoading } from "./terraria/ui";
import "@fontsource/comic-neue/700.css";
import "./styles/terraria.css";

// Los casilleros de la portada enlazan su ficha: sus slugs en español van con el área, así no hace falta bajar la
// lista para dibujar la portada.
registerTerrariaSlugs({ items: Object.fromEntries((home.featured as Featured[]).filter((f) => f[2] !== f[1]).map((f) => [f[1], f[2]])) });

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

const TrItems = lazyWithPreload(() => import("./terraria/items/TerrariaItems"));
const TrCrafting = lazyWithPreload(() => import("./terraria/crafting/TerrariaCrafting"));

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá, en `TERRARIA_TAB_FILES` y en `TERRARIA_PUBLISHED`. */
// Una línea por pestaña (no en una sola): `areas.test.ts` lee este bloque para compararlo con `TERRARIA_TAB_FILES`.
const TABS: Partial<Record<TerrariaSection, LazyTab>> = {
  items: TrItems,
  crafting: TrCrafting,
};

/**
 * Los datos que una pestaña baja aparte de su chunk, pedidos junto con él. En frío, `main.tsx` lee la dirección antes
 * de que se conozca el slug en español de la ficha: primero se anota, y la ficha se busca con la dirección leída de nuevo.
 */
const TAB_DATA: Partial<Record<TerrariaSection, (route: Route) => Promise<void>>> = {
  items: (route) =>
    Promise.all([TrItems.preload(), import("./terraria/data")]).then(([, m]) => m.preloadItemsRoute(route).then(() => m.preloadItemsRoute(parseRoute(routePath(route))))),
  crafting: (route) => Promise.all([TrCrafting.preload(), import("./terraria/data")]).then(([, m]) => m.preloadCraftingRoute(route)),
};

/** Baja el chunk de la pestaña de una ruta de Terraria, y sus datos (la portada ya viene con el área). */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.trSection ?? "home";
  return Promise.all([TABS[sec]?.preload(), TAB_DATA[sec]?.(route)]).then(() => undefined);
};

/** La dirección a la que llevó el último Atrás o Adelante, hasta que la vuelta arriba la consulte (igual que en `Rust.tsx`). */
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

export default function Terraria({ route, navigate }: TabProps) {
  const section = route.trSection ?? "home";
  const Tab = TABS[section];
  // Cambiar de pestaña o de ficha arranca arriba; Atrás y Adelante no, que el navegador devuelve el lugar donde estabas.
  useEffect(() => {
    if (typeof window !== "undefined" && !cameFromHistory(window.location.pathname)) window.scrollTo({ top: 0 });
  }, [section, route.detail]);
  return (
    <div className="tr" data-layer={section}>
      <Depth route={route} navigate={navigate} />
      {Tab ? (
        <Suspense fallback={<TrLoading />}>
          <Tab route={route} navigate={navigate} />
        </Suspense>
      ) : (
        <TerrariaHome route={route} navigate={navigate} />
      )}
    </div>
  );
}

/** La regla de profundidad: cada pestaña con la capa del mundo donde vive. Las que vienen se anuncian apagadas. */
function Depth({ route, navigate }: TabProps) {
  const t = useTerrariaCopy();
  const current = route.trSection ?? "home";
  const live = (tab: TerrariaSection) => tab === "home" || (TERRARIA_PUBLISHED as TerrariaSection[]).includes(tab);
  return (
    <nav className="tr-depth" aria-label="Terraria">
      {TERRARIA_TABS.filter(live).map((tab) => (
        <RouteLink
          className={`tr-depth-tab${tab === current ? " is-on" : ""}`}
          to={{ ...route, view: "terraria", trSection: tab, detail: undefined }}
          onNavigate={navigate}
          active={tab === current}
          data-layer={tab}
          key={tab}
        >
          <i aria-hidden="true" />
          <span>
            <small>{t.layers[tab]}</small>
            {t.tabs[tab]}
          </span>
        </RouteLink>
      ))}
      {t.soonTabs.map(([layer, name]) => (
        <span className="tr-depth-tab is-soon" aria-disabled="true" title={t.soon} key={name}>
          <i aria-hidden="true" />
          <span>
            <small>{layer}</small>
            {name}
          </span>
        </span>
      ))}
    </nav>
  );
}
