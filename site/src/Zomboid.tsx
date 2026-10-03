/**
 * La sección Project Zomboid (2026-09-30): las solapas de la libreta y la página abierta. Diseño:
 * docs/design/2026-09-30-zomboid.md.
 *
 * Las pestañas que todavía no tienen página (`PZ_PUBLISHED` en route.ts) se muestran apagadas y sin enlace, la misma
 * regla que la barra aplica a los juegos que vienen, y una dirección a una de ellas muestra la portada. Las
 * tipografías y la hoja de estilos viajan con este chunk: sólo las baja quien entra a Zomboid.
 *
 * Como en Diablo II, la portada viaja con el área y cada pestaña es un chunk aparte con sus datos: `preloadTab` la trae
 * antes del primer render para que el prerender la escriba entera. **Una pestaña nueva** suma su línea en `TABS`, en
 * `PZ_TAB_FILES` (`areaFiles.ts`) y en `PZ_PUBLISHED`; sus fichas entran solas al sitemap y al `<head>`.
 *
 * Este archivo no trae slugs en español: el mapa entero pesa ~236 KB y no puede viajar con la portada. Cada pestaña, al
 * cargarse, anota los de las secciones que enlaza (`import items from "virtual:pz-slugs-es/items"` y
 * `registerPzSlugs(items)`). Alcanza porque `preloadRoute` baja la pestaña antes de que `App` lea la dirección.
 */
import { Suspense, useEffect } from "react";
import RouteLink from "./RouteLink";
import { lazyWithPreload } from "./lazyWithPreload";
import { parseRoute, PZ_PUBLISHED, routePath, type PzSection, type Route } from "./route";
import { PZ_TABS, useZomboidCopy } from "./zomboidCopy";
import PzLoading from "./zomboid/PzLoading";
import ZomboidHome from "./zomboid/ZomboidHome";
import "@fontsource/old-standard-tt/700.css";
import "@fontsource/caveat/700.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "./styles/zomboid.css";
import { preloadChanges } from "./zomboid/patches/preloadChanges";

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

const PzMap = lazyWithPreload(() => import("./zomboid/map/ZomboidMap"));
const PzItems = lazyWithPreload(() => import("./zomboid/items/ZomboidItems"));
const PzRecipes = lazyWithPreload(() => import("./zomboid/recipes/ZomboidRecipes"));
const PzCrafting = lazyWithPreload(() => import("./zomboid/crafting/ZomboidCrafting"));
const PzTraits = lazyWithPreload(() => import("./zomboid/traits/ZomboidTraits"));
const PzPlanner = lazyWithPreload(() => import("./zomboid/planner/ZomboidPlanner"));
const PzMoodles = lazyWithPreload(() => import("./zomboid/moodles/ZomboidMoodles"));
const PzSkills = lazyWithPreload(() => import("./zomboid/skills/ZomboidSkills"));
const PzServer = lazyWithPreload(() => import("./zomboid/server/ZomboidServer"));
const PzPatches = lazyWithPreload(() => import("./zomboid/patches/ZomboidPatches"));

/** Las pestañas con página, cada una en su chunk (como en `D2r.tsx`). Una nueva suma su línea acá y en `PZ_TAB_FILES`. */
const TABS: Partial<Record<PzSection, LazyTab>> = {
  // El Mapa no pide datos antes del primer render: su intro sale de `map/meta.json` (viaja en el chunk) y el visor baja
  // lo suyo al montarse, en el navegador. Por eso no tiene línea en `TAB_DATA`.
  map: PzMap,
  items: PzItems,
  recipes: PzRecipes,
  // Fabricación baja su grafo aparte (`craft.json`, ~200 KB con gzip): línea en `TAB_DATA`, como Objetos y Recetas.
  crafting: PzCrafting,
  // Rasgos y profesiones son el mismo chunk, con sus datos adentro (~23 KB con gzip, ver `traits/data.ts`): tampoco
  // tienen línea en `TAB_DATA`. Bajar el chunk ya anota los slugs y trae las fichas, y `App` lee la dirección después.
  traits: PzTraits,
  professions: PzTraits,
  // El planificador trae sus datos en el chunk (los de Rasgos, compartidos): sin línea en `TAB_DATA`. El `?b=` lo lee él
  // al montarse, en el navegador.
  planner: PzPlanner,
  // Moodles trae los 26 en el chunk (~6 KB con gzip, ver `moodles/data.ts`): sin línea en `TAB_DATA`, como Rasgos.
  moodles: PzMoodles,
  // Habilidades trae las 35 con sus libros, revistas y VHS en el chunk (~16 KB con gzip, ver `skills/data.ts`): sin
  // línea en `TAB_DATA`, como Rasgos y Moodles.
  skills: PzSkills,
  // Servidor trae las 269 opciones de sandbox, las 144 del .ini y los presets en el chunk (~40 KB con gzip, ver
  // `server/data.ts`): sin línea en `TAB_DATA`. El generador escribe todas las filas en el primer render, y la
  // configuración del link (`?p=&s=&i=`) la lee él al montarse, en el navegador.
  server: PzServer,
  // Parches trae el índice de versiones en el chunk (~1 KB con gzip), así la lista nunca pasa por "cargando…"; la página
  // de cada versión baja aparte (línea en `TAB_DATA`).
  patches: PzPatches,
};

/** La solapa que se marca en cada sección: las profesiones no tienen la suya y viven bajo "Rasgos". */
const TAB_OF: Partial<Record<PzSection, PzSection>> = { professions: "traits" };

/**
 * Los datos que una pestaña baja aparte de su chunk (la lista, el archivo de una ficha), por `import()` para que no
 * entren al área. Se piden junto con el chunk: `main.tsx` espera a `preloadRoute` antes del primer render, y sin esto la
 * página prerenderizada se reemplazaba por la hoja de "cargando…" hasta que llegaran. Al pasar el mouse por un enlace,
 * además, la ficha ya empieza a bajar (las filas de la lista de Objetos, sólo al apretar: ver `prefetch` en `RouteLink`).
 *
 * En frío, `main.tsx` lee la dirección antes de que la pestaña anote sus slugs en español (lo hace al cargarse su
 * chunk): `detail` llega como "palanca" y no como "crowbar", o "aserrar-troncos" y no "saw-log", y con eso se pedía el
 * archivo equivocado y la lista entera, y el primer render pasaba por "cargando…". Por eso primero el chunk, y la ficha
 * se busca con la dirección leída de nuevo, ya con los slugs (lo prueban los `zomboidColdLoad*.test.ts`).
 */
const TAB_DATA: Partial<Record<PzSection, (route: Route) => Promise<void>>> = {
  items: (route) =>
    Promise.all([PzItems.preload(), import("./zomboid/items/data")]).then(([, m]) =>
      m.preloadItemsRoute(parseRoute(routePath(route))),
    ),
  recipes: (route) =>
    Promise.all([PzRecipes.preload(), import("./zomboid/recipes/data")]).then(([, m]) =>
      m.preloadRecipesRoute(parseRoute(routePath(route))),
    ),
  crafting: (route) =>
    Promise.all([PzCrafting.preload(), import("./zomboid/crafting/data")]).then(([, m]) => m.preloadCraftRoute(route)),
  patches: (route) =>
    Promise.all([PzPatches.preload(), import("./zomboid/patches/data")]).then(([, m]) =>
      m.preloadPatchesRoute(parseRoute(routePath(route))),
    ),
};

/** Baja el chunk de la pestaña de una ruta de Project Zomboid, y sus datos (la portada ya viene con el área). */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.pzSection ?? "home";
  // Con la pestaña y la ficha ya cargadas, el "Qué cambió" de la ficha, sólo si trae cambios (ver `patches/changes.tsx`).
  return Promise.all([TABS[sec]?.preload(), TAB_DATA[sec]?.(route)]).then(() => preloadChanges(route));
};

const isLive = (tab: PzSection) => tab === "home" || (PZ_PUBLISHED as PzSection[]).includes(tab);

/**
 * La dirección a la que llevó el último Atrás o Adelante del navegador, hasta que la vuelta arriba la consulte. Igual que
 * en `D2r.tsx` (no se importa de ahí: arrastraría el chunk de Diablo II). La anota un listener del módulo y no del
 * componente: con Atrás desde otra sección, `Zomboid` se monta después del `popstate` y tiene que saberlo igual.
 */
let poppedTo: string | null = null;

/** Anota un Atrás o Adelante. Lo llama el listener de `popstate`; se exporta para probarlo sin un navegador. */
export const notePop = (path: string): void => {
  poppedTo = path;
};

/** ¿La página que se muestra llegó con Atrás o Adelante? Se consume al preguntar (ver `D2r.tsx`). */
export function cameFromHistory(path: string): boolean {
  const hit = poppedTo === path;
  poppedTo = null;
  return hit;
}

if (typeof window !== "undefined") window.addEventListener("popstate", () => notePop(window.location.pathname));

export default function Zomboid({ route, navigate }: TabProps) {
  const section = route.pzSection ?? "home";
  const Tab = TABS[section];
  // Cambiar de pestaña o de ficha arranca arriba, como cambiar de página: sin esto, un objeto del fondo de la lista (hay
  // 3.826) abría su ficha a la altura donde estaba la fila. El idioma no cuenta, y Atrás y Adelante tampoco: el
  // navegador devuelve el lugar donde estabas, y volver arriba lo perdía al regresar a la lista.
  useEffect(() => {
    if (typeof window !== "undefined" && !cameFromHistory(window.location.pathname)) window.scrollTo({ top: 0 });
  }, [section, route.detail]);
  return (
    <div className="pz">
      <Tabs route={route} navigate={navigate} />
      {Tab ? (
        // El fallback sólo se ve al saltar a una pestaña sin precargar: la de llegada y la del prerender ya vienen.
        <Suspense fallback={<PzLoading />}>
          <Tab route={route} navigate={navigate} />
        </Suspense>
      ) : (
        <ZomboidHome route={route} navigate={navigate} />
      )}
    </div>
  );
}

/** Las solapas de la libreta: las que existen enlazan, las que vienen se anuncian apagadas. */
function Tabs({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useZomboidCopy();
  const section = route.pzSection ?? "home";
  const current = TAB_OF[section] ?? section;
  return (
    <div className="pz-tabs-band">
      <nav className="pz-tabs" aria-label="Project Zomboid">
        {PZ_TABS.map((tab) =>
          isLive(tab) ? (
            <RouteLink
              className={`pz-tab${tab === current ? " is-on" : ""}`}
              to={{ ...route, view: "zomboid", pzSection: tab, detail: undefined }}
              onNavigate={navigate}
              active={tab === current}
              key={tab}
            >
              {t.tabs[tab]}
            </RouteLink>
          ) : (
            // Con las 11 pestañas publicadas (2026-10-02) esta rama no se usa: queda para la próxima pestaña que se
            // anuncie antes de salir.
            <span className="pz-tab is-soon" aria-disabled="true" title={t.soon} key={tab}>
              {t.tabs[tab]}
              {/* El `title` sólo lo ve quien pasa el mouse: el lector de pantalla y el dedo necesitan el "Pronto" en el
                  texto, escondido a la vista con la misma clase que usa el resto del sitio. */}
              <span className="visually-hidden"> — {t.soon}</span>
            </span>
          ),
        )}
      </nav>
    </div>
  );
}
