/**
 * Baja el "Qué cambió" junto con la pestaña cuando la ficha de la ruta trae cambios (2026-10-02), así el prerender y la
 * primera carga lo dibujan sin esperar. Lo llama `preloadTab` (`Zomboid.tsx`), que corre tanto en `main.tsx` antes del
 * primer render como en el prerender (`renderApp` → `preloadRoute`).
 */
import { parseRoute, routePath, type Route } from "../../route";
import { loadChangesBox, lookupFicha } from "./boxLoader";

/**
 * Si la ficha de la ruta trae cambios, baja el recuadro. Va después de bajar la pestaña y sus datos: la dirección se
 * lee de nuevo, ya con los slugs en español anotados ("palanca" → "crowbar"), como en `TAB_DATA`.
 */
export async function preloadChanges(route: Route): Promise<void> {
  if (route.view !== "zomboid" || !route.detail || !route.pzSection) return;
  const id = parseRoute(routePath(route)).detail ?? route.detail;
  if (lookupFicha(route.pzSection, id)?.changes?.length) await loadChangesBox();
}
