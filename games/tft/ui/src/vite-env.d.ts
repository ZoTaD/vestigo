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
