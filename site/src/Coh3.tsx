/**
 * La sección Company of Heroes 3 (2026-11-04): estética B "Puesto de mando", elegida por ZoTaD. Diseño:
 * docs/superpowers/specs/2026-11-04-coh3-design.md.
 *
 * Títulos en Big Shoulders Stencil Display y el resto en Archivo. La portada lleva el arte grande del juego; las
 * pestañas, una franja baja con el mismo arte. Cada pestaña con página viaja en su chunk (`TABS`, y su archivo en
 * `COH3_TAB_FILES` de areaFiles.ts). Las tipografías y la hoja de estilos viajan con este chunk.
 */
import { Suspense, useEffect, useRef } from "react";
import { lazyWithPreload } from "./lazyWithPreload";
import RouteLink from "./RouteLink";
import type { Coh3Section, Route } from "./route";
import { COH3_TABS, useCoh3Copy } from "./coh3Copy";
import Coh3Home from "./coh3/Coh3Home";
import { Coh3Loading } from "./coh3/ui";
import "@fontsource/big-shoulders-stencil-display/800.css";
import "@fontsource/big-shoulders-stencil-display/900.css";
import "@fontsource-variable/archivo/wdth.css";
import "./styles/coh3.css";

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá y en `COH3_TAB_FILES`. */
// Una línea por pestaña (no en una sola): `areas.test.ts` lee este bloque para compararlo con `COH3_TAB_FILES`.
const TABS: Partial<Record<Coh3Section, LazyTab>> = {
};

/** ¿La pestaña ya tiene página? Las que no, se anuncian apagadas y su dirección muestra la portada. */
const hasPage = (tab: Coh3Section): boolean => tab === "home" || !!TABS[tab];

/** Los datos que una pestaña baja aparte de su chunk, pedidos junto con él (y esperados por el prerender). */
const TAB_DATA: Partial<Record<Coh3Section, (route: Route) => Promise<unknown>>> = {
  home: (route) => import("./coh3/data").then((m) => m.preloadRoute(route)),
};

/** Baja el chunk de la pestaña de una ruta de CoH3, y sus datos. */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.c3Section ?? "home";
  const shown = hasPage(sec) ? sec : "home";
  const data = TAB_DATA[shown] ?? ((r: Route) => import("./coh3/data").then((m) => m.preloadRoute(r)));
  return Promise.all([TABS[shown]?.preload(), data(route)]).then(() => undefined);
};

/** La dirección a la que llevó el último Atrás o Adelante (igual que en `Cs2.tsx`). */
let poppedTo: string | null = null;
function cameFromHistory(path: string): boolean {
  const hit = poppedTo === path;
  poppedTo = null;
  return hit;
}
if (typeof window !== "undefined") window.addEventListener("popstate", () => (poppedTo = window.location.pathname));

export default function Coh3({ route, navigate }: TabProps) {
  const t = useCoh3Copy();
  const asked = route.c3Section ?? "home";
  const section = hasPage(asked) ? asked : "home";
  const Tab = TABS[section];
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
  const isHome = section === "home";
  return (
    <div className="c3" data-section={section}>
      {isHome ? (
        <Coh3Home.Hero route={route} navigate={navigate} />
      ) : (
        <div className="c3-strip">
          <RouteLink className="c3-brand" to={{ ...route, view: "coh3", c3Section: "home", detail: undefined }} onNavigate={navigate}>
            <img src="/coh3/logo.webp" alt="Company of Heroes 3" width={140} height={79} decoding="async" />
          </RouteLink>
        </div>
      )}
      <div className="c3-tabbar">
        <nav className="c3-tabs" aria-label="Company of Heroes 3" ref={tabsRef}>
          {COH3_TABS.map((tab) =>
            hasPage(tab) ? (
              <RouteLink
                className={`c3-tab${tab === section ? " is-on" : ""}`}
                to={{ ...route, view: "coh3", c3Section: tab, detail: undefined }}
                onNavigate={navigate}
                active={tab === section}
                key={tab}
              >
                {t.tabs[tab]}
              </RouteLink>
            ) : (
              <span className="c3-tab is-soon" aria-disabled="true" key={tab} title={t.t.soon}>
                {t.tabs[tab]}
              </span>
            ),
          )}
        </nav>
      </div>
      <div className="c3-wrap">
        {Tab ? (
          <Suspense fallback={<Coh3Loading />}>
            <Tab route={route} navigate={navigate} />
          </Suspense>
        ) : (
          <Coh3Home route={route} navigate={navigate} live={hasPage} />
        )}
      </div>
      <p className="c3-credit">{t.credit}</p>
    </div>
  );
}
