/**
 * La sección Rust (2026-10-05): la barra del inventario y la página abierta. Diseño: docs/design/2026-10-05-rust.md.
 *
 * Cada pestaña con página viaja en su chunk (`TABS`, y su archivo en `RUST_TAB_FILES` de areaFiles.ts). Las que
 * todavía no tienen (`RUST_PUBLISHED` en route.ts) se muestran apagadas y sin enlace, y una dirección a una de ellas
 * muestra la portada. Las de las etapas que vienen (Monumentos, Electricidad…) se anuncian igual, sin dirección. La
 * tipografía y la hoja de estilos viajan con este chunk: sólo las baja quien entra a Rust.
 */
import { Suspense, useEffect } from "react";
import home from "@rust/home.json";
import { lazyWithPreload } from "./lazyWithPreload";
import RouteLink from "./RouteLink";
import { parseRoute, registerRustSlugs, routePath, RUST_PUBLISHED, type Route, type RustSection } from "./route";
import { RUST_TABS, useRustCopy } from "./rustCopy";
import RsLoading from "./rust/RsLoading";
import RustHome from "./rust/RustHome";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/roboto-condensed/700.css";
import "@fontsource/roboto-condensed/800.css";
import "./styles/rust.css";

// Los casilleros de la portada enlazan su ficha: sus slugs en español van con el área, así no hace falta bajar los de
// la pestaña Objetos para dibujar la portada.
registerRustSlugs({ items: Object.fromEntries(home.filter((h) => h.slugEs !== h.slug).map((h) => [h.slug, h.slugEs])) });

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

const RsItems = lazyWithPreload(() => import("./rust/items/RustItems"));
const RsRaid = lazyWithPreload(() => import("./rust/raid/RustRaid"));
const RsElectricity = lazyWithPreload(() => import("./rust/electric/RustElectricity"));

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá, en `RUST_TAB_FILES` y en `RUST_PUBLISHED`. */
// Una línea por pestaña (no en una sola): `areas.test.ts` lee este bloque para compararlo con `RUST_TAB_FILES`.
const TABS: Partial<Record<RustSection, LazyTab>> = {
  items: RsItems,
  raid: RsRaid,
  electricity: RsElectricity,
};

/**
 * Los datos que una pestaña baja aparte de su chunk, pedidos junto con él. En frío, `main.tsx` lee la dirección antes de
 * que la pestaña anote sus slugs en español: primero el chunk, y la ficha se busca con la dirección leída de nuevo.
 */
const TAB_DATA: Partial<Record<RustSection, (route: Route) => Promise<void>>> = {
  items: (route) =>
    Promise.all([RsItems.preload(), import("./rust/items/data")]).then(([, m]) => m.preloadItemsRoute(parseRoute(routePath(route)))),
  // Los slugs en español de los circuitos listos los anota el chunk de la pestaña al cargarse.
  electricity: () => RsElectricity.preload().then(() => undefined),
};

/** Baja el chunk de la pestaña de una ruta de Rust, y sus datos (la portada ya viene con el área). */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.rsSection ?? "home";
  return Promise.all([TABS[sec]?.preload(), TAB_DATA[sec]?.(route)]).then(() => undefined);
};

/**
 * La dirección a la que llevó el último Atrás o Adelante del navegador, hasta que la vuelta arriba la consulte. Igual que
 * en `Zomboid.tsx` y `D2r.tsx` (no se importa de ahí: arrastraría el chunk de esa sección). La anota un listener del
 * módulo y no del componente: con Atrás desde otra sección, `Rust` se monta después del `popstate` y tiene que saberlo.
 */
let poppedTo: string | null = null;

/** Anota un Atrás o Adelante. Lo llama el listener de `popstate`; se exporta para probarlo sin un navegador. */
export const notePop = (path: string): void => {
  poppedTo = path;
};

/** ¿La página que se muestra llegó con Atrás o Adelante? Se consume al preguntar. */
export function cameFromHistory(path: string): boolean {
  const hit = poppedTo === path;
  poppedTo = null;
  return hit;
}

if (typeof window !== "undefined") window.addEventListener("popstate", () => notePop(window.location.pathname));

const isLive = (tab: RustSection) => tab === "home" || (RUST_PUBLISHED as RustSection[]).includes(tab);

export default function Rust({ route, navigate }: TabProps) {
  const section = route.rsSection ?? "home";
  const Tab = TABS[section];
  // Cambiar de pestaña o de ficha arranca arriba, como cambiar de página: un objeto del fondo de la lista abría su
  // ficha a la altura donde estaba el casillero. Atrás y Adelante no: el navegador devuelve el lugar donde estabas, y
  // volver arriba lo perdía al regresar a la lista.
  useEffect(() => {
    if (typeof window !== "undefined" && !cameFromHistory(window.location.pathname)) window.scrollTo({ top: 0 });
  }, [section, route.detail]);
  return (
    <div className="rs">
      <Tabs route={route} navigate={navigate} />
      {Tab ? (
        <Suspense fallback={<RsLoading />}>
          <Tab route={route} navigate={navigate} />
        </Suspense>
      ) : (
        <RustHome route={route} navigate={navigate} />
      )}
    </div>
  );
}

/** La barra del inventario: las pestañas que existen enlazan, las que vienen se anuncian apagadas. */
function Tabs({ route, navigate }: TabProps) {
  const t = useRustCopy();
  const current = route.rsSection ?? "home";
  return (
    <div className="rs-tabs-band">
      <nav className="rs-tabs" aria-label="Rust">
        {RUST_TABS.map((tab) =>
          isLive(tab) ? (
            <RouteLink
              className={`rs-tab${tab === current ? " is-on" : ""}`}
              to={{ ...route, view: "rust", rsSection: tab, detail: undefined }}
              onNavigate={navigate}
              active={tab === current}
              key={tab}
            >
              {t.tabs[tab]}
            </RouteLink>
          ) : (
            <span className="rs-tab is-soon" aria-disabled="true" title={t.soon} key={tab}>
              {t.tabs[tab]}
            </span>
          ),
        )}
        {t.soonTabs.map((name) => (
          <span className="rs-tab is-soon" aria-disabled="true" title={t.soon} key={name}>
            {name}
          </span>
        ))}
      </nav>
    </div>
  );
}
