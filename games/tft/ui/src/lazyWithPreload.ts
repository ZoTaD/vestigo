import { createElement, type ComponentType } from "react";

/**
 * `React.lazy` con un `preload()` que el prerender puede esperar.
 *
 * **Por qué no `React.lazy` a secas.** El sitio se prerenderiza con
 * `renderToString` (ver `entry-server.tsx`), que no espera promesas: un
 * componente perezoso sin resolver rendería el `fallback` y las páginas de
 * TFT saldrían vacías al HTML que lee Google. Con este envoltorio, el servidor
 * llama a `preload()` antes de renderizar y el componente ya está en memoria;
 * en el navegador, la primera visita a una zona todavía no cargada lanza la
 * promesa y `Suspense` muestra el fallback hasta que llegue el chunk.
 *
 * Es lo que deja partir el bundle por juego (2026-09-07): la portada y
 * Deadlock dejan de bajar el megabyte de datos de TFT.
 */
export function lazyWithPreload<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>
): ComponentType<P> & { preload: () => Promise<void> } {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;

  const preload = (): Promise<void> => {
    pending ??= factory().then((m) => {
      loaded = m.default;
    });
    return pending;
  };

  const Lazy = (props: P) => {
    if (!loaded) throw preload();
    return createElement(loaded, props);
  };

  return Object.assign(Lazy, { preload });
}
