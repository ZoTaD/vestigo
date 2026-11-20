/**
 * La sección Age of Empires II: DE (2026-11-20): estética C "Campo de batalla", elegida por ZoTaD. Diseño:
 * docs/superpowers/specs/2026-11-20-aoe2-design.md.
 *
 * Títulos en Cinzel y el resto en Noto Sans. Cada pestaña con página viaja en su chunk (`TABS`, y su archivo en
 * `AOE2_TAB_FILES` de areaFiles.ts). Las tipografías y la hoja de estilos viajan con este chunk.
 */
import { Suspense, useEffect } from "react";
import { lazyWithPreload } from "./lazyWithPreload";
import type { Aoe2Section, Route } from "./route";
import Aoe2Home from "./aoe2/Aoe2Home";
import { Aoe2Header, Aoe2Loading, Aoe2Tabs } from "./aoe2/ui";
import { useAoe2Copy } from "./aoe2Copy";
import "@fontsource/cinzel/700";
import "@fontsource/cinzel/900";
import "@fontsource/noto-sans/400";
import "@fontsource/noto-sans/600";
import "@fontsource/noto-sans/700";
import "./styles/aoe2.css";

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };
type LazyTab = ReturnType<typeof lazyWithPreload<TabProps>>;

const Aoe2Leaderboards = lazyWithPreload(() => import("./aoe2/leaderboards/Aoe2Leaderboards"));
const Aoe2Players = lazyWithPreload(() => import("./aoe2/players/Aoe2Players"));
const Aoe2Matches = lazyWithPreload(() => import("./aoe2/matches/Aoe2Matches"));
const Aoe2Civs = lazyWithPreload(() => import("./aoe2/stats/Aoe2Civs"));
const Aoe2Matchups = lazyWithPreload(() => import("./aoe2/stats/Aoe2Matchups"));
const Aoe2Maps = lazyWithPreload(() => import("./aoe2/stats/Aoe2Maps"));

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá y en `AOE2_TAB_FILES`. */
// Una línea por pestaña (no en una sola): `areas.test.ts` lee este bloque para compararlo con `AOE2_TAB_FILES`.
const TABS: Partial<Record<Aoe2Section, LazyTab>> = {
  leaderboards: Aoe2Leaderboards,
  players: Aoe2Players,
  matches: Aoe2Matches,
  civilizations: Aoe2Civs,
  matchups: Aoe2Matchups,
  maps: Aoe2Maps,
};

const hasPage = (tab: Aoe2Section): boolean => tab === "home" || !!TABS[tab];

/** Baja el chunk de la pestaña de una ruta de AoE2. */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.a2Section ?? "home";
  return Promise.resolve(TABS[hasPage(sec) ? sec : "home"]?.preload()).then(() => undefined);
};

export default function Aoe2({ route, navigate }: TabProps) {
  const t = useAoe2Copy();
  const asked = route.a2Section ?? "home";
  const section = hasPage(asked) ? asked : "home";
  const Tab = TABS[section];
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [section, route.detail]);
  return (
    <div className="a2" data-section={section}>
      <Aoe2Header home={section === "home"} route={route} navigate={navigate} />
      <div className="a2-wrap">
        <Aoe2Tabs route={route} navigate={navigate} section={section} live={hasPage} />
        {Tab ? (
          <Suspense fallback={<Aoe2Loading />}>
            <Tab route={route} navigate={navigate} />
          </Suspense>
        ) : (
          <Aoe2Home route={route} navigate={navigate} />
        )}
      </div>
      <p className="a2-credit">{t.home.lead}</p>
    </div>
  );
}
