import type { View } from "./route";

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
