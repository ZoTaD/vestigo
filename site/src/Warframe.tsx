/**
 * La sección Warframe (2026-10-27): estética A "Arsenal". Plan: docs/superpowers/plans/2026-10-27-warframe-etapa-1.md.
 *
 * Azul noche con un resplandor radial, la barra de pestañas en Rajdhani y cada pantalla en paneles de vidrio
 * translúcido, sin bordes de color. Sin el logo del juego: el nombre va en letra. Cada pestaña con página viaja en su
 * chunk (`TABS`, y su archivo en `WF_TAB_FILES` de areaFiles.ts). Las tipografías y la hoja de estilos viajan con este
 * chunk: sólo las baja quien entra a Warframe.
 */
import { Suspense, useEffect, useRef } from "react";
import { lazyWithPreload } from "./lazyWithPreload";
import RouteLink from "./RouteLink";
import { parseRoute, routePath, type Route, type WfSection, type WfTab } from "./route";
import { useWfCopy, WF_TABS } from "./warframeCopy";
import WarframeHome from "./warframe/WarframeHome";
import { WfLoading } from "./warframe/ui";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/600.css";
import "./styles/warframe.css";

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

const WfArsenal = lazyWithPreload(() => import("./warframe/arsenal/WfArsenal"));
const WfRelics = lazyWithPreload(() => import("./warframe/relics/WfRelics"));
const WfFarming = lazyWithPreload(() => import("./warframe/farming/WfFarming"));
const WfMods = lazyWithPreload(() => import("./warframe/mods/WfMods"));
const WfStarChart = lazyWithPreload(() => import("./warframe/starchart/WfStarChart"));

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá y en `WF_TAB_FILES`. */
// Una línea por pestaña (no en una sola): `areas.test.ts` lee este bloque para compararlo con `WF_TAB_FILES`.
const TABS: Partial<Record<WfSection, LazyTab>> = {
  arsenal: WfArsenal,
  relics: WfRelics,
  farming: WfFarming,
  mods: WfMods,
  "star-chart": WfStarChart,
};

/** ¿La pestaña ya tiene página? Las que no, se anuncian apagadas y su dirección muestra la portada. */
const hasPage = (tab: WfSection): boolean => tab === "home" || !!TABS[tab];

/** Los datos que una pestaña baja aparte de su chunk, pedidos junto con él. La portada no baja ninguno: los conteos viajan con el área. */
const TAB_DATA: Partial<Record<WfSection, (route: Route) => Promise<unknown>>> = {
  arsenal: (route) => preloadFichas(route),
  relics: (route) => preloadFichas(route),
  farming: (route) => preloadFichas(route),
  mods: (route) => preloadFichas(route),
  "star-chart": (route) => preloadFichas(route),
};

/**
 * Las pestañas con fichas bajan la ficha (o la lista) de la dirección. En frío, `main.tsx` lee la dirección antes de que
 * se conozca el slug en español de la ficha: primero se anota, y la ficha se busca con la dirección leída de nuevo.
 */
const preloadFichas = (route: Route): Promise<void> =>
  import("./warframe/data").then((m) => m.preloadRoute(route).then(() => m.preloadRoute(parseRoute(routePath(route)))));

/** Baja el chunk de la pestaña de una ruta de Warframe, y sus datos. */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.wfSection ?? "home";
  const shown = hasPage(sec) ? sec : "home";
  return Promise.all([TABS[shown]?.preload(), TAB_DATA[shown]?.(route)]).then(() => undefined);
};

/** La dirección a la que llevó el último Atrás o Adelante, hasta que la vuelta arriba la consulte (igual que en `Stardew.tsx`). */
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

export default function Warframe({ route, navigate }: TabProps) {
  const t = useWfCopy();
  const asked = route.wfSection ?? "home";
  // Una pestaña sin página todavía muestra la portada, y la barra marca Inicio.
  const section = hasPage(asked) ? asked : "home";
  const Tab = TABS[section];
  // Cambiar de pestaña o de ficha arranca arriba; Atrás y Adelante no, que el navegador devuelve el lugar donde estabas.
  useEffect(() => {
    if (typeof window !== "undefined" && !cameFromHistory(window.location.pathname)) window.scrollTo({ top: 0 });
  }, [section, route.detail]);
  // En el teléfono la barra es una fila que se desliza: la pestaña abierta se lleva a la vista moviendo sólo la barra.
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = tabsRef.current;
    const on = nav?.querySelector<HTMLElement>(".is-on");
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  }, [section]);
  return (
    <div className="wf" data-section={section}>
      <header className="wf-hero">
        {/* El nombre en letra, sin el logo del juego. */}
        <RouteLink className="wf-brand" to={{ ...route, view: "warframe", wfSection: "home", detail: undefined }} onNavigate={navigate}>
          WARFRAME
        </RouteLink>
      </header>
      <div className="wf-wrap">
        <nav className="wf-tabs" aria-label="Warframe" ref={tabsRef}>
          {WF_TABS.map((tab) =>
            hasPage(tab) ? (
              <RouteLink
                className={`wf-tab${tab === section ? " is-on" : ""}`}
                to={{ ...route, view: "warframe", wfSection: tab, detail: undefined }}
                onNavigate={navigate}
                active={tab === section}
                key={tab}
              >
                {t.tabs[tab]}
              </RouteLink>
            ) : (
              <span className="wf-tab is-soon" aria-disabled="true" title={t.soon} key={tab}>
                {t.tabs[tab]}
              </span>
            ),
          )}
        </nav>
        {Tab ? (
          <Suspense fallback={<WfLoading />}>
            <Tab route={route} navigate={navigate} />
          </Suspense>
        ) : (
          <WarframeHome route={route} navigate={navigate} live={(tab: WfTab) => hasPage(tab)} />
        )}
      </div>
    </div>
  );
}
