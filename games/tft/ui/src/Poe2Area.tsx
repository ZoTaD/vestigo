/**
 * Path of Exile 2 entero: la barra de pestañas y la pestaña abierta (2026-09-25).
 *
 * Igual que `DeadlockArea`: `areas.ts` lo carga aparte, con su CSS y su letra,
 * sólo cuando la ruta es de PoE2.
 */
import { useCopy } from "./i18n";
import RouteLink from "./RouteLink";
import Poe2Economy from "./Poe2Economy";
import Poe2Encyclopedia from "./Poe2Encyclopedia";
import Poe2Patches from "./Poe2Patches";
import Poe2TreePage from "./poe2Tree/Poe2TreePage";
import Poe2RegexPage from "./poe2Regex/Poe2RegexPage";
import { POE2_SECTIONS, type Route } from "./route";
// La letra y los adornos del juego (2026-09-23), todo bajo `.p2`. Cinzel titula
// y sólo la usa PoE2, así que viaja con este chunk y no con el resto del sitio.
import "@fontsource/cinzel/400";
import "./styles/poe2.css";
import "./styles/poe2-codex.css";
import "./styles/poe2-tree.css";
import "./styles/poe2-regex.css";

export default function Poe2Area({ route, navigate }: { route: Route; navigate: (next: Route) => void }) {
  const copy = useCopy();
  const section = route.p2Section ?? "economy";
  return (
    <>
      {/* La sub-navegación ya va con la letra del juego: la barra de Vestigo
          de arriba es la misma de todo el sitio, y el juego empieza acá. */}
      <div className="p2-sub">
        <nav className="p2-sub-in" aria-label={copy.games.poe2}>
          {POE2_SECTIONS.map((id) => (
            <RouteLink
              key={id}
              className="p2-sub-item"
              to={{ ...route, view: "poe2", p2Section: id, detail: undefined }}
              active={section === id}
              onNavigate={navigate}
            >
              {copy.poe2.tabs[id]}
            </RouteLink>
          ))}
        </nav>
      </div>
      {section === "encyclopedia" && <Poe2Encyclopedia route={route} navigate={navigate} />}
      {section === "patches" && <Poe2Patches route={route} navigate={navigate} />}
      {section === "tree" && <Poe2TreePage />}
      {section === "regex" && <Poe2RegexPage />}
      {section === "economy" && (
        <Poe2Economy
          league={route.detail}
          onLeague={(l) => navigate({ ...route, view: "poe2", p2Section: "economy", detail: l.slug })}
        />
      )}
    </>
  );
}
