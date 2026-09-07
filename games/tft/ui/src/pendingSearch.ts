/**
 * El puente entre el buscador de la barra superior y la pestaña Jugador.
 *
 * El buscador vive en todas las páginas del sitio (rediseño del 2026-09-06);
 * la búsqueda de verdad —contra la API de Steam para Deadlock, contra Riot
 * para TFT— vive en la pestaña Jugador de cada juego. La barra no puede
 * buscar por sí misma sin duplicar esa lógica, así que deja el texto acá,
 * navega a la pestaña, y la pestaña lo recoge al montarse.
 *
 * `sessionStorage` y no `localStorage`: es un mensaje entre dos pantallas de la
 * misma visita, no algo que deba sobrevivir a cerrar el navegador. Y se
 * **consume** al leerlo, para que volver a la pestaña más tarde no repita una
 * búsqueda que nadie pidió.
 */

const KEY = "vestigo.pendingSearch";

export function setPendingSearch(query: string): void {
  if (typeof sessionStorage === "undefined") return;
  const q = query.trim();
  if (q) sessionStorage.setItem(KEY, q);
  else sessionStorage.removeItem(KEY);
}

/** Devuelve el texto pendiente y lo borra; `null` si no hay ninguno. */
export function takePendingSearch(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const q = sessionStorage.getItem(KEY);
  if (q !== null) sessionStorage.removeItem(KEY);
  return q;
}
