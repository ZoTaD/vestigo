import { renderToString } from "react-dom/server";
import App from "./App";
import { type Route } from "./route";

/**
 * La app renderizada a texto, para que el HTML servido tenga contenido.
 *
 * **Por qué existe.** El prerender escribía sólo el `<head>`: cada ruta salía con
 * su título, su canonical y sus etiquetas OG, pero el `<body>` era
 * `<div id="root"></div>` y nada más — 4.149 bytes. Un rastreador que no ejecuta
 * JavaScript veía una página en blanco, y aunque Googlebot sí lo ejecuta, lo hace
 * en una segunda pasada más tarde y con menos prioridad. Medido en Search
 * Console: **341 de 361 páginas descubiertas y sin indexar.**
 *
 * ---
 *
 * **No se hidrata, y es a propósito.** El cliente sigue montando con
 * `createRoot`, que descarta lo que había y renderiza de cero.
 *
 * Hidratar sería más rápido, pero exige que el primer render del navegador dé
 * **exactamente** el mismo árbol que éste, y acá no lo da: el consentimiento de
 * cookies, la banda recordada y el idioma recordado salen de `localStorage`, que
 * en Node no existe. Un visitante con "Plata y abajo" guardado hidrataría sobre
 * el HTML de la banda por defecto, y React tiraría el subárbol con un error en
 * consola. Se puede arreglar difiriendo esas lecturas a un efecto, pero eso
 * cambia el comportamiento de tres features para ganar milisegundos.
 *
 * Lo que este archivo tiene que resolver es que **el HTML servido diga algo**, y
 * eso se logra igual sin hidratar. El costo real es un render de más en el
 * navegador, sobre datos que ya están en memoria.
 */
export function renderApp(route: Route): string {
  // El idioma no se pasa aparte: `App` ya monta su propio `LangContext` con
  // `route.lang`, así que darle la ruta alcanza para que la copia salga en el
  // idioma de la página. Envolverlo de nuevo acá sería un segundo proveedor
  // diciendo lo mismo.
  return renderToString(<App ssrRoute={route} />);
}
