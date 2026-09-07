import { renderToString } from "react-dom/server";
import App, { preloadAreas } from "./App";
import { type Route } from "./route";

/**
 * El HTML de una ruta, para el prerender del build (ver `vite.config.ts`).
 *
 * **Es asíncrono desde el 2026-09-07**: TFT se carga bajo demanda en el
 * navegador (`lazyWithPreload`), y `renderToString` no espera promesas, así que
 * las zonas perezosas se precargan acá antes de renderizar. Sin esto, las
 * páginas de TFT saldrían al HTML con el `fallback` vacío.
 */
export async function renderApp(route: Route): Promise<string> {
  await preloadAreas();
  // El idioma no se pasa aparte: `App` ya monta su propio `LangContext` con
  // `route.lang`, así que darle la ruta alcanza para que la copia salga en el
  // idioma de la página.
  return renderToString(<App ssrRoute={route} />);
}
