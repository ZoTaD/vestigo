/**
 * Pestañas viejas después de publicar (2026-09-25).
 *
 * El mapa de Valheim, el árbol y el regex de PoE2 y los datos de cada pestaña se
 * bajan aparte, con un nombre que cambia en cada publicación. Una pestaña abierta
 * desde antes pide el archivo viejo; Netlify contesta con la página (no hay
 * 404 para `/assets`) y la carga falla. Sin esto, React desmontaba todo y la
 * pantalla quedaba en blanco hasta recargar (ZoTaD: "la primera vez que apretás
 * el mapa"). Ahora se recarga sola y trae la versión nueva.
 */
const KEY = "vestigo:stale-reload";
/** Si recargó hace menos que esto, el archivo falta de verdad: no se insiste. */
const LOOP_MS = 10_000;

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Recarga salvo que haya recargado recién. Devuelve si recargó. */
export function onStaleChunk(now: number, store: Store, reload: () => void): boolean {
  let last = 0;
  try { last = Number(store.getItem(KEY)) || 0; } catch { /* sin almacenamiento: se recarga igual */ }
  if (now - last < LOOP_MS) return false;
  try { store.setItem(KEY, String(now)); } catch { /* ídem */ }
  reload();
  return true;
}

/** Escucha el aviso de Vite cuando no puede cargar un pedazo de código. */
export function installStaleChunkReload() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (e) => {
    if (onStaleChunk(Date.now(), window.sessionStorage, () => window.location.reload())) e.preventDefault();
  });
}
