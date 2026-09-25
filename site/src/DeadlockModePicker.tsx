import RouteLink from "./RouteLink";
import type { Route } from "./route";
import { useCopy } from "./deadlockCopy";

/**
 * Clasificatorias o Street Brawl, en la cabecera de la tier list (2026-09-24).
 *
 * **Son enlaces y no botones**, al revés que el selector de banda: cada modo es
 * una página con su dirección (`/deadlock` y `/deadlock/street-brawl`), así que
 * se puede abrir en otra pestaña, compartir e indexar. La banda, en cambio, no
 * viaja en la URL.
 */
export default function DeadlockModePicker({
  route,
  navigate,
  brawl,
}: {
  route: Route;
  navigate: (route: Route) => void;
  /** True en la tier list de Street Brawl. */
  brawl: boolean;
}) {
  const copy = useCopy();
  const m = copy.deadlock.mode;
  return (
    <nav className="seg" aria-label={m.label}>
      <RouteLink to={{ ...route, view: "deadlock", dlSection: "meta", detail: undefined }} onNavigate={navigate} active={!brawl}>
        {m.ranked}
      </RouteLink>
      <RouteLink
        to={{ ...route, view: "deadlock", dlSection: "street-brawl", detail: undefined }}
        onNavigate={navigate}
        active={brawl}
      >
        {m.brawl}
      </RouteLink>
    </nav>
  );
}
