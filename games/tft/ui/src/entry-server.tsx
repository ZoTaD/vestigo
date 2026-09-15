import { renderToString } from "react-dom/server";
import App from "./App";
import { type Route } from "./route";

/**
 * El HTML de una ruta, para el prerender del build (ver `vite.config.ts`).
 *
 * Sigue siendo asíncrono aunque hoy no espere nada: fue así desde el
 * 2026-09-07 para precargar la zona perezosa de TFT, que salió del sitio el
 * 2026-09-15. Si vuelve a haber una zona `lazy`, se precarga acá antes de
 * `renderToString`, que no espera promesas.
 */
export async function renderApp(route: Route): Promise<string> {
  // El idioma no se pasa aparte: `App` ya monta su propio `LangContext` con
  // `route.lang`, así que darle la ruta alcanza para que la copia salga en el
  // idioma de la página.
  return renderToString(<App ssrRoute={route} />);
}
