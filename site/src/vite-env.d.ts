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

/** Los slugs en español de las fichas de Diablo II, armados en el build (`d2rSlugsModule` en vite.config.ts). */
declare module "virtual:d2r-slugs-es" {
  const slugs: import("./d2r/slugs").D2rSlugsEs;
  export default slugs;
}
