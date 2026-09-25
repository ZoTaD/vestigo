import type { DeadlockSection, Route, View } from "./route";

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
  player: "src/DeadlockPlayer.tsx",
  match: "src/DeadlockReport.tsx",
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
  const tab = route.view === "deadlock" ? DEADLOCK_TAB_FILES[route.dlSection] : undefined;
  return tab ? [area, tab] : [area];
}
