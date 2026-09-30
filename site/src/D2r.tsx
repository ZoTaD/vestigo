/**
 * La sección Diablo II: Resurrected (2026-09-29): las pestañas del Arcón y la
 * pestaña abierta. Diseño: docs/design/2026-09-29-d2r-portada.md.
 *
 * La portada viaja con el área; cada pestaña de la wiki es un chunk aparte con
 * sus datos (únicos, conjuntos…), igual que las de Deadlock: `preloadTab` la
 * trae antes del primer render para que el prerender la escriba entera.
 *
 * Las pestañas que todavía no existen se muestran apagadas y sin enlace, la
 * misma regla que la barra aplica a los juegos que vienen.
 */
import { Suspense, useEffect } from "react";
import RouteLink from "./RouteLink";
import { lazyWithPreload } from "./lazyWithPreload";
import type { D2rSection, Route } from "./route";
import { D2R_LIVE, D2R_TABS, useD2rCopy } from "./d2rCopy";
import D2rHome from "./d2r/D2rHome";
import "./styles/d2r.css";
import "./styles/d2r-wiki.css";

type Nav = (route: Route) => void;

const D2rRunes = lazyWithPreload(() => import("./d2r/D2rRunes"));
const D2rRunewords = lazyWithPreload(() => import("./d2r/D2rRunewords"));
const D2rUniques = lazyWithPreload(() => import("./d2r/D2rUniques"));
const D2rSets = lazyWithPreload(() => import("./d2r/D2rSets"));
const D2rBases = lazyWithPreload(() => import("./d2r/D2rBases"));
const D2rCube = lazyWithPreload(() => import("./d2r/D2rCube"));
const D2rClasses = lazyWithPreload(() => import("./d2r/D2rClasses"));
const D2rZones = lazyWithPreload(() => import("./d2r/D2rZones"));
const D2rBreakpoints = lazyWithPreload(() => import("./d2r/D2rBreakpoints"));
const D2rDrops = lazyWithPreload(() => import("./d2r/D2rDrops"));
const D2rPlanner = lazyWithPreload(() => import("./d2r/D2rPlanner"));
const D2rGrail = lazyWithPreload(() => import("./d2r/D2rGrail"));
const D2rPatches = lazyWithPreload(() => import("./d2r/D2rPatches"));

const TABS: Partial<Record<D2rSection, { preload: () => Promise<void> }>> = {
  runes: D2rRunes,
  runewords: D2rRunewords,
  uniques: D2rUniques,
  sets: D2rSets,
  bases: D2rBases,
  cube: D2rCube,
  classes: D2rClasses,
  "terror-zones": D2rZones,
  breakpoints: D2rBreakpoints,
  drops: D2rDrops,
  planner: D2rPlanner,
  grail: D2rGrail,
  patches: D2rPatches,
};

/** Baja el chunk de la pestaña de una ruta de Diablo II (la portada ya viene con el área). */
export const preloadTab = (route: Route): Promise<void> => TABS[route.d2Section ?? "home"]?.preload() ?? Promise.resolve();

/**
 * La dirección a la que llevó el último Atrás o Adelante del navegador, hasta que la vuelta arriba la consulte. La anota un
 * listener del módulo y no del componente: con Atrás desde otra sección de la app, `D2r` se monta después del `popstate` y
 * tiene que saberlo igual.
 */
let poppedTo: string | null = null;

/** Anota un Atrás o Adelante. Lo llama el listener de `popstate`; se exporta para probarlo sin un navegador. */
export const notePop = (path: string): void => {
  poppedTo = path;
};

/**
 * ¿La página que se muestra llegó con Atrás o Adelante? Se consume al preguntar, así un Atrás que no cambió de pestaña ni de
 * ficha (el idioma) no se queda guardado: el siguiente cambio de página, de la app, vuelve arriba.
 */
export function cameFromHistory(path: string): boolean {
  const hit = poppedTo === path;
  poppedTo = null;
  return hit;
}

if (typeof window !== "undefined") window.addEventListener("popstate", () => notePop(window.location.pathname));

export default function D2r({ route, navigate }: { route: Route; navigate: Nav }) {
  const section = route.d2Section ?? "home";
  const props = { route, navigate };
  // Cambiar de pestaña o de ficha arranca arriba, como cambiar de página (igual que en Valheim): sin esto, un enlace
  // de abajo (el directorio de jefes de la calculadora, una palabra rúnica de la lista) abría la ficha a media altura.
  // El idioma y la query (el estado de la calculadora) no cuentan: ahí no se cambia de página. Atrás y Adelante tampoco:
  // el navegador devuelve el lugar donde estabas, y volver arriba lo perdía al regresar a una lista larga.
  useEffect(() => {
    if (typeof window !== "undefined" && !cameFromHistory(window.location.pathname)) window.scrollTo({ top: 0 });
  }, [section, route.detail]);
  return (
    <div className="d2">
      <Tabs route={route} navigate={navigate} />
      {section === "home" ? (
        <D2rHome {...props} />
      ) : (
        <Suspense fallback={<div className="d2-loading" aria-busy="true" />}>
          <div className="d2-page">
            {section === "runes" && <D2rRunes {...props} />}
            {section === "runewords" && <D2rRunewords {...props} />}
            {section === "uniques" && <D2rUniques {...props} />}
            {section === "sets" && <D2rSets {...props} />}
            {section === "bases" && <D2rBases {...props} />}
            {section === "cube" && <D2rCube {...props} />}
            {section === "classes" && <D2rClasses {...props} />}
            {section === "terror-zones" && <D2rZones {...props} />}
            {section === "breakpoints" && <D2rBreakpoints {...props} />}
            {section === "drops" && <D2rDrops {...props} />}
            {section === "planner" && <D2rPlanner {...props} />}
            {section === "grail" && <D2rGrail {...props} />}
            {section === "patches" && <D2rPatches {...props} />}
          </div>
        </Suspense>
      )}
    </div>
  );
}

/** Las pestañas del Arcón: las que existen enlazan, las que vienen se anuncian apagadas. */
function Tabs({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useD2rCopy();
  const current = route.d2Section ?? "home";
  return (
    <div className="d2-tabs-band">
      <nav className="d2-tabs" aria-label="Diablo II">
        {D2R_TABS.map((tab) =>
          D2R_LIVE.includes(tab) ? (
            <RouteLink
              className={`d2-tab${tab === current ? " is-on" : ""}`}
              to={{ ...route, view: "d2r", d2Section: tab as D2rSection, detail: undefined }}
              onNavigate={navigate}
              active={tab === current}
              key={tab}
            >
              {t.tabs[tab]}
            </RouteLink>
          ) : (
            <span className="d2-tab is-soon" aria-disabled="true" title={t.soon} key={tab}>
              {t.tabs[tab]}
            </span>
          ),
        )}
      </nav>
    </div>
  );
}
