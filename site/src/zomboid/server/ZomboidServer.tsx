/**
 * La pestaña Servidor de Project Zomboid (2026-10-01): `/en/project-zomboid/server`, `/es/project-zomboid/servidor`.
 * Plan: docs/superpowers/plans/2026-10-01-zomboid-servidor.md.
 *
 * Despacha por `detail`:
 * - sin `detail`, el generador;
 * - `sandbox-presets`, los presets comparados (Task 4, `Presets.tsx`);
 * - `water-and-power-shutoff`, la calculadora de cortes de agua y luz (Task 5, `Shutoff.tsx`);
 * - otra ficha de la sección en el índice (si `server.py` sumara una antes que su página), el generador sin aviso,
 *   porque la dirección es buena;
 * - cualquier otra cosa, el generador con el aviso "no encontramos esa página".
 *
 * Los datos viajan en el chunk (`data.ts`): no hay "cargando…".
 */
import serverSlugs from "virtual:pz-slugs-es/server";
import { registerPzSlugs, type Route } from "../../route";
import Generator from "./Generator";
import Presets from "./Presets";
import Shutoff, { SHUTOFF_ID } from "./Shutoff";

// Las direcciones en español de las fichas de la sección (`/servidor/presets-de-sandbox`). Al cargarse el módulo, como
// en las otras pestañas: `preloadRoute` baja este chunk antes de que `App` lea la dirección.
registerPzSlugs(serverSlugs);

/** Las fichas que tiene la sección en el índice (los ids en inglés). */
const KNOWN = new Set(Object.keys(serverSlugs.server ?? {}));

export default function ZomboidServer({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  if (route.detail === "sandbox-presets") return <Presets route={route} navigate={navigate} />;
  if (route.detail === SHUTOFF_ID) return <Shutoff route={route} navigate={navigate} />;
  const missing = !!route.detail && !KNOWN.has(route.detail);
  return <Generator route={route} navigate={navigate} missing={missing} />;
}
