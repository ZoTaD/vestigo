/**
 * La sección Counter-Strike 2 (2026-11-03): estética A "Mesa de mercado". Plan: docs/superpowers/plans/2026-11-03-cs2-etapa-1.md.
 *
 * Grafito casi negro, paneles un tono más claro sin bordes de color, IBM Plex Sans para el texto e IBM Plex Mono con
 * cifras tabulares para precios, floats y porcentajes; acento ámbar. Cada pestaña con página viaja en su chunk (`TABS`,
 * y su archivo en `CS2_TAB_FILES` de areaFiles.ts). Las tipografías y la hoja de estilos viajan con este chunk.
 */
import { Suspense, useEffect, useRef } from "react";
import { lazyWithPreload } from "./lazyWithPreload";
import RouteLink from "./RouteLink";
import type { Cs2Section, Route } from "./route";
import { CS2_TABS, useCs2Copy } from "./cs2Copy";
import Cs2Home from "./cs2/Cs2Home";
import { Cs2Loading } from "./cs2/ui";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles/cs2.css";

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

const Cs2Cases = lazyWithPreload(() => import("./cs2/cases/Cs2Cases"));

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá y en `CS2_TAB_FILES`. */
// Una línea por pestaña (no en una sola): `areas.test.ts` lee este bloque para compararlo con `CS2_TAB_FILES`.
const TABS: Partial<Record<Cs2Section, LazyTab>> = {
  cases: Cs2Cases,
};

/** ¿La pestaña ya tiene página? Las que no, se anuncian apagadas y su dirección muestra la portada. */
const hasPage = (tab: Cs2Section): boolean => tab === "home" || !!TABS[tab];

/** Los datos que una pestaña baja aparte de su chunk, pedidos junto con él. La portada baja sólo los precios de las cajas. */
const TAB_DATA: Partial<Record<Cs2Section, (route: Route) => Promise<unknown>>> = {
  home: () => import("./cs2/data").then((m) => m.loadCasePrices()),
  cases: (route) => import("./cs2/data").then((m) => m.preloadRoute(route)),
};

/** Baja el chunk de la pestaña de una ruta de CS2, y sus datos. */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.c2Section ?? "home";
  const shown = hasPage(sec) ? sec : "home";
  return Promise.all([TABS[shown]?.preload(), TAB_DATA[shown]?.(route)]).then(() => undefined);
};

/** La dirección a la que llevó el último Atrás o Adelante (igual que en `Warframe.tsx`). */
let poppedTo: string | null = null;
function cameFromHistory(path: string): boolean {
  const hit = poppedTo === path;
  poppedTo = null;
  return hit;
}
if (typeof window !== "undefined") window.addEventListener("popstate", () => (poppedTo = window.location.pathname));

export default function Cs2({ route, navigate }: TabProps) {
  const t = useCs2Copy();
  const asked = route.c2Section ?? "home";
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
    <div className="c2" data-section={section}>
      <div className="c2-top">
        <div className="c2-top-in">
          {/* El nombre en letra, sin el logo del juego. */}
          <RouteLink className="c2-brand" to={{ ...route, view: "cs2", c2Section: "home", detail: undefined }} onNavigate={navigate}>
            COUNTER-STRIKE <b>2</b>
          </RouteLink>
          <nav className="c2-tabs" aria-label="Counter-Strike 2" ref={tabsRef}>
            {CS2_TABS.map((tab) =>
              hasPage(tab) ? (
                <RouteLink
                  className={`c2-tab${tab === section ? " is-on" : ""}`}
                  to={{ ...route, view: "cs2", c2Section: tab, detail: undefined }}
                  onNavigate={navigate}
                  active={tab === section}
                  key={tab}
                >
                  {t.tabs[tab]}
                </RouteLink>
              ) : (
                <span className="c2-tab is-soon" aria-disabled="true" key={tab}>
                  {t.tabs[tab]}
                </span>
              ),
            )}
          </nav>
        </div>
      </div>
      <div className="c2-wrap">
        {Tab ? (
          <Suspense fallback={<Cs2Loading />}>
            <Tab route={route} navigate={navigate} />
          </Suspense>
        ) : (
          <Cs2Home route={route} navigate={navigate} live={hasPage} />
        )}
      </div>
    </div>
  );
}
