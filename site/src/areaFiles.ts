import type { D2rSection, DeadlockSection, PzSection, Route, View } from "./route";

/**
 * El archivo de cada vista, para que `vite.config.ts` encuentre su chunk en el
 * bundle y ponga en el HTML prerenderizado su `<link rel="stylesheet">` y sus
 * `<link rel="modulepreload">`. Tiene que coincidir con los `import()` de
 * `areas.ts` (lo cuida `test/areas.test.ts`).
 *
 * Archivo aparte porque lo importa `vite.config.ts`: si importara `areas.ts`,
 * esbuild seguiría sus `import()` y metería la app entera en la config.
 */
export const AREA_FILES: Partial<Record<View, string>> = {
  home: "src/Home.tsx",
  deadlock: "src/DeadlockArea.tsx",
  poe2: "src/Poe2Area.tsx",
  valheim: "src/Valheim.tsx",
  d2r: "src/D2r.tsx",
  zomboid: "src/Zomboid.tsx",
  privacy: "src/Privacy.tsx",
  terms: "src/Terms.tsx",
};

/**
 * Las pestañas de Deadlock que viajan en su propio chunk, igual que `TABS` en
 * `DeadlockArea.tsx` (también lo cuida `test/areas.test.ts`). La tier list no
 * está: viene con el área.
 */
export const DEADLOCK_TAB_FILES: Partial<Record<DeadlockSection, string>> = {
  items: "src/DeadlockItems.tsx",
  heroes: "src/DeadlockHeroes.tsx",
  builder: "src/DeadlockBuilderPage.tsx",
  patches: "src/DeadlockNews.tsx",
  ranks: "src/DeadlockRanks.tsx",
  ladder: "src/DeadlockPlayerLadder.tsx",
  comebacks: "src/DeadlockComebacks.tsx",
  player: "src/DeadlockPlayer.tsx",
  match: "src/DeadlockReport.tsx",
};

/**
 * Las pestañas de Diablo II que viajan en su propio chunk, igual que `TABS` en
 * `D2r.tsx` (2026-09-29). La portada viene con el área.
 */
export const D2R_TAB_FILES: Partial<Record<D2rSection, string>> = {
  runes: "src/d2r/D2rRunes.tsx",
  runewords: "src/d2r/D2rRunewords.tsx",
  uniques: "src/d2r/D2rUniques.tsx",
  sets: "src/d2r/D2rSets.tsx",
  bases: "src/d2r/D2rBases.tsx",
  cube: "src/d2r/D2rCube.tsx",
  classes: "src/d2r/D2rClasses.tsx",
  "terror-zones": "src/d2r/D2rZones.tsx",
  breakpoints: "src/d2r/D2rBreakpoints.tsx",
  drops: "src/d2r/D2rDrops.tsx",
  planner: "src/d2r/D2rPlanner.tsx",
  grail: "src/d2r/D2rGrail.tsx",
  patches: "src/d2r/D2rPatches.tsx",
};

/**
 * Las pestañas de Project Zomboid que viajan en su propio chunk, igual que `TABS`
 * en `Zomboid.tsx` (2026-09-30; lo cuida `test/areas.test.ts`). Cada una suma
 * acá su línea el día que se publica. La portada viene con el área.
 */
export const PZ_TAB_FILES: Partial<Record<PzSection, string>> = {
  map: "src/zomboid/map/ZomboidMap.tsx",
  items: "src/zomboid/items/ZomboidItems.tsx",
  recipes: "src/zomboid/recipes/ZomboidRecipes.tsx",
  crafting: "src/zomboid/crafting/ZomboidCrafting.tsx",
  // Rasgos y profesiones comparten chunk (ver `TABS` en Zomboid.tsx).
  traits: "src/zomboid/traits/ZomboidTraits.tsx",
  professions: "src/zomboid/traits/ZomboidTraits.tsx",
  planner: "src/zomboid/planner/ZomboidPlanner.tsx",
  moodles: "src/zomboid/moodles/ZomboidMoodles.tsx",
  skills: "src/zomboid/skills/ZomboidSkills.tsx",
  server: "src/zomboid/server/ZomboidServer.tsx",
  patches: "src/zomboid/patches/ZomboidPatches.tsx",
};

/**
 * Los servidores que una pestaña consulta apenas abre (2026-09-25): el HTML les
 * abre la conexión (`preconnect`) mientras baja el JS, y la primera consulta
 * no espera el DNS y el TLS. `cors` es para `fetch`; una imagen va sin. (Las
 * banderas ya no: salen del sitio desde el 2026-09-25, ver `flags.ts`.)
 */
export const DEADLOCK_TAB_ORIGINS: Partial<Record<DeadlockSection, { href: string; cors: boolean }[]>> = {
  ladder: [{ href: "https://api.deadlock-api.com", cors: true }],
  player: [{ href: "https://api.deadlock-api.com", cors: true }],
  match: [{ href: "https://api.deadlock-api.com", cors: true }],
};

export const originsFor = (route: Route) => (route.view === "deadlock" ? DEADLOCK_TAB_ORIGINS[route.dlSection] ?? [] : []);

/** Los archivos cuyo JS y CSS necesita una ruta antes del primer render. */
export function filesFor(route: Route): string[] {
  const area = AREA_FILES[route.view];
  if (!area) return [];
  const tab =
    route.view === "deadlock"
      ? DEADLOCK_TAB_FILES[route.dlSection]
      : route.view === "d2r"
        ? D2R_TAB_FILES[route.d2Section ?? "home"]
        : route.view === "zomboid"
          ? PZ_TAB_FILES[route.pzSection ?? "home"]
          : undefined;
  return tab ? [area, tab] : [area];
}
