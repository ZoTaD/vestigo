import RouteLink from "./RouteLink";
import { useCopy } from "./deadlockCopy";
import type { Route } from "./route";
import "./styles/deadlock-heroes-tabs.css";

/**
 * Las sub-pestañas de Héroes (2026-11-18): la tabla de estadísticas
 * (`/deadlock/heroes`) y los récords (`/deadlock/heroes/records`). Van arriba
 * de las dos, con el mismo aspecto que las de la Escalera y el perfil.
 */
export default function DeadlockHeroesTabs({
  route,
  navigate,
  active,
}: {
  route: Route;
  navigate: (r: Route) => void;
  active: "stats" | "records";
}) {
  const t = useCopy().deadlock.heroes.subtabs;
  return (
    <nav className="dl-htabs" aria-label={t.label}>
      <RouteLink
        className="dl-htab"
        to={{
          ...route,
          view: "deadlock",
          dlSection: "heroes",
          detail: undefined,
        }}
        onNavigate={navigate}
        active={active === "stats"}
      >
        {t.stats}
      </RouteLink>
      <RouteLink
        className="dl-htab"
        to={{
          ...route,
          view: "deadlock",
          dlSection: "heroes",
          detail: "records",
        }}
        onNavigate={navigate}
        active={active === "records"}
      >
        {t.records}
      </RouteLink>
    </nav>
  );
}
