/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Google Analytics measurement id (`G-XXXXXXXXXX`), set in the host's build
   * environment rather than committed.
   *
   * Leaving it unset is a supported state, not a broken one: with no id the
   * analytics module loads nothing and the consent notice never appears, which
   * is what a local dev server and a preview build should do.
   */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Los slugs en español de las fichas de Diablo II, armados en el build (`esSlugsModule` en vite.config.ts). */
declare module "virtual:d2r-slugs-es" {
  const slugs: import("./d2r/slugs").D2rSlugsEs;
  export default slugs;
}

/** Los de Project Zomboid, igual: del `index.json` que escribe su extractor. */
declare module "virtual:pz-slugs-es" {
  const slugs: Partial<Record<import("./route").PzTab, Record<string, string>>>;
  export default slugs;
}

/**
 * Los de una sola sección de Project Zomboid (`virtual:pz-slugs-es/items` → `{ items: {…} }`): cada pestaña trae sólo
 * los de lo que enlaza, porque el mapa entero pesa demasiado para viajar con la portada.
 */
declare module "virtual:pz-slugs-es/*" {
  const slugs: Partial<Record<import("./route").PzTab, Record<string, string>>>;
  export default slugs;
}

/**
 * Los nombres de las fichas de una sección de Project Zomboid (`virtual:pz-names/items` → `{ crowbar: ["Crowbar",
 * "Palanca"], … }`), para el `<head>` de una ficha (`zomboid/index.ts`). Una sección que no tiene fichas no resuelve.
 */
declare module "virtual:pz-names/*" {
  const names: Record<string, [string, string]>;
  export default names;
}

/** Las versiones de Parches de Project Zomboid que tienen página (`pzPatchPagesModule` en vite.config.ts). */
declare module "virtual:pz-patch-pages" {
  const slugs: string[];
  export default slugs;
}
