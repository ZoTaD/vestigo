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
import { cohTabs, switchGame, type CohGame, type Coh3Section, type Route } from "./route";
import { COH3_TABS, COH_GAME_COPY, useCoh3Copy } from "./coh3Copy";
import { useLang } from "./i18n";
import Coh3Home from "./coh3/Coh3Home";
import { Coh3Loading, CohGameContext } from "./coh3/ui";
import "@fontsource/big-shoulders-stencil-display/800"; // sin ".css": su `exports` ("./*" → "./*.css") lo duplicaría
import "@fontsource/big-shoulders-stencil-display/900";
import "@fontsource-variable/archivo/wdth.css";
import "./styles/coh3.css";

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

const Coh3Leaderboards = lazyWithPreload(() => import("./coh3/leaderboards/Coh3Leaderboards"));
const Coh3Players = lazyWithPreload(() => import("./coh3/players/Coh3Players"));
const Coh3Matches = lazyWithPreload(() => import("./coh3/matches/Coh3Matches"));
const Coh3Units = lazyWithPreload(() => import("./coh3/explorer/Coh3Units"));
const Coh3Weapons = lazyWithPreload(() => import("./coh3/explorer/Coh3Weapons"));
const Coh3Battlegroups = lazyWithPreload(() => import("./coh3/explorer/Coh3Battlegroups"));
const Coh3Penetration = lazyWithPreload(() => import("./coh3/combat/Coh3Penetration"));
const Coh3Dps = lazyWithPreload(() => import("./coh3/combat/Coh3Dps"));
const Coh3Stats = lazyWithPreload(() => import("./coh3/stats/Coh3Stats"));
const Coh3TierList = lazyWithPreload(() => import("./coh3/stats/Coh3TierList"));
const Coh3Patches = lazyWithPreload(() => import("./coh3/more/Coh3Patches"));
const Coh3Maps = lazyWithPreload(() => import("./coh3/more/Coh3Maps"));
const Coh3Challenges = lazyWithPreload(() => import("./coh3/more/Coh3Challenges"));
const Coh3FinalStand = lazyWithPreload(() => import("./coh3/more/Coh3FinalStand"));
const Coh3Ranks = lazyWithPreload(() => import("./coh3/stats/Coh3Ranks"));
const Coh3Achievements = lazyWithPreload(() => import("./coh3/more/Coh3Achievements"));
const CohCommanders = lazyWithPreload(() => import("./coh3/explorer/CohCommanders"));
const CohBulletins = lazyWithPreload(() => import("./coh3/explorer/CohBulletins"));

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá y en `COH3_TAB_FILES`. */
// Una línea por pestaña (no en una sola): `areas.test.ts` lee este bloque para compararlo con `COH3_TAB_FILES`.
const TABS: Partial<Record<Coh3Section, LazyTab>> = {
  leaderboards: Coh3Leaderboards,
  players: Coh3Players,
  matches: Coh3Matches,
  units: Coh3Units,
  weapons: Coh3Weapons,
  battlegroups: Coh3Battlegroups,
  penetration: Coh3Penetration,
  dps: Coh3Dps,
  stats: Coh3Stats,
  "tier-list": Coh3TierList,
  patches: Coh3Patches,
  maps: Coh3Maps,
  challenges: Coh3Challenges,
  "final-stand": Coh3FinalStand,
  ranks: Coh3Ranks,
  achievements: Coh3Achievements,
  commanders: CohCommanders,
  bulletins: CohBulletins,
};

/** ¿La pestaña ya tiene página en ese juego? Las de CoH3 que no, se anuncian apagadas; CoH1 y CoH2 sólo muestran las suyas. */
const hasPage = (tab: Coh3Section, game?: CohGame): boolean => tab === "home" || (!!TABS[tab] && cohTabs(game).includes(tab));
const GAME_LIST: { g: CohGame; label: string; logo: string }[] = [
  { g: "coh3", label: "CoH3", logo: "/coh3/logo.webp" },
  { g: "coh2", label: "CoH2", logo: "/coh2/logo.webp" },
  { g: "coh1", label: "CoH1", logo: "/coh1/logo.webp" },
];

/** Los datos que una pestaña baja aparte de su chunk, pedidos junto con él (y esperados por el prerender). */
const TAB_DATA: Partial<Record<Coh3Section, (route: Route) => Promise<unknown>>> = {
  home: (route) => import("./coh3/data").then((m) => m.preloadRoute(route)),
};

/** Baja el chunk de la pestaña de una ruta de CoH3, y sus datos. */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.c3Section ?? "home";
  const shown = hasPage(sec, route.cohGame) ? sec : "home";
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
  const { lang } = useLang();
  const game: CohGame = route.cohGame ?? "coh3";
  const otro = game === "coh3" ? null : COH_GAME_COPY[game][lang];
  const asked = route.c3Section ?? "home";
  const section = hasPage(asked, game) ? asked : "home";
  const live = (tab: Coh3Section) => hasPage(tab, game);
  // Cada juego muestra sólo las pestañas que tiene.
  const barra = COH3_TABS.filter((tab) => live(tab));
  const Tab = TABS[section];
  useEffect(() => {
    if (typeof window !== "undefined" && !cameFromHistory(window.location.pathname)) window.scrollTo({ top: 0 });
  }, [section, route.detail, game]);
  // En el teléfono la barra es una fila que se desliza: la pestaña abierta se lleva a la vista moviendo sólo la barra.
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = tabsRef.current;
    const on = nav?.querySelector<HTMLElement>(".is-on");
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  }, [section, game]);
  const isHome = section === "home";
  return (
    <CohGameContext.Provider value={game}>
    <div className="c3" data-section={section} data-game={game}>
      {isHome ? (
        <Coh3Home.Hero route={route} navigate={navigate} />
      ) : (
        <div className="c3-strip">
          <RouteLink className="c3-brand" to={{ ...route, view: "coh3", c3Section: "home", detail: undefined }} onNavigate={navigate}>
            <img src={`/${game}/logo.webp`} alt={otro?.name ?? "Company of Heroes 3"} width={140} height={79} decoding="async" />
          </RouteLink>
        </div>
      )}
      <nav className="c3-gsel" aria-label="Company of Heroes">
        {GAME_LIST.map(({ g, label }) => (
          <RouteLink key={g} className={`c3-gsel-i${g === game ? " is-on" : ""}`} to={switchGame(route, g)} onNavigate={navigate} active={g === game}>
            {label}
          </RouteLink>
        ))}
      </nav>
      <div className="c3-tabbar">
        <nav className="c3-tabs" aria-label={otro?.name ?? "Company of Heroes 3"} ref={tabsRef}>
          {barra.map((tab) =>
            live(tab) ? (
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
            {/* `key`: al cambiar de juego la pestaña se monta de nuevo (su estado y sus datos son de un juego). */}
            <Tab key={game} route={route} navigate={navigate} />
          </Suspense>
        ) : (
          <Coh3Home route={route} navigate={navigate} live={live} />
        )}
      </div>
      <p className="c3-credit">{otro?.credit ?? t.credit}</p>
    </div>
    </CohGameContext.Provider>
  );
}
