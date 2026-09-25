import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installStaleChunkReload } from "./staleChunks";
// La entrada es lo único que importa `areas.ts` (ver `areasRegistry.ts`).
import * as allAreas from "./areas";
import { provideAreas } from "./areasRegistry";
import { parseRoute } from "./route";
// Las @font-face del sitio, servidas desde el dominio (ver fonts.ts).
import "./fonts";
// Los tokens van primero: son las variables que todas las demás hojas leen.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/codex.css";
// Después del códex a propósito: la portada pisa reglas suyas, y con la misma
// especificidad gana la que se declara última.
import "./styles/home.css";
// La cáscara y las primitivas del rediseño del 2026-09-06 van al final por la
// misma razón: donde compiten con una regla vieja de la misma especificidad,
// gana la nueva.
import "./styles/shell.css";
import "./styles/primitives.css";
import "./styles/views.css";
import "./styles/scrollbar.css";
// Las hojas de cada juego (Deadlock y News, PoE2, Valheim) ya no van acá: viajan
// con el chunk de su área (ver `areas.ts`) y sólo las baja quien entra al juego.

// Una pestaña vieja después de publicar se recarga sola en vez de quedar en blanco.
installStaleChunkReload();
provideAreas(allAreas);

/**
 * El primer render espera al chunk de la vista de llegada, y en Deadlock al de
 * su pestaña (2026-09-25).
 *
 * `createRoot` reemplaza el HTML prerenderizado: si renderizara ya, un área
 * todavía no bajada mostraría el fallback vacío de `Suspense` en lugar de la
 * página que ya se estaba viendo. Esperando, la página prerenderizada queda en
 * pantalla hasta que la app la reemplaza por la misma página, ya viva. El HTML
 * anuncia ese chunk con `modulepreload`, así que casi siempre ya llegó.
 */
allAreas.preloadRoute(parseRoute(window.location.pathname)).then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
