/**
 * La sección Rust (2026-10-05): la barra del inventario y la página abierta. Diseño: docs/design/2026-10-05-rust.md.
 *
 * Las pestañas que todavía no tienen página (`RUST_PUBLISHED` en route.ts) se muestran apagadas y sin enlace, y una
 * dirección a una de ellas muestra la portada. Las de las etapas que vienen (Monumentos, Electricidad…) se anuncian
 * igual, sin dirección. La tipografía y la hoja de estilos viajan con este chunk: sólo las baja quien entra a Rust.
 */
import RouteLink from "./RouteLink";
import { RUST_PUBLISHED, type Route, type RustSection } from "./route";
import { RUST_TABS, useRustCopy } from "./rustCopy";
import RustHome from "./rust/RustHome";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/roboto-condensed/700.css";
import "@fontsource/roboto-condensed/800.css";
import "./styles/rust.css";

type Nav = (route: Route) => void;

const isLive = (tab: RustSection) => tab === "home" || (RUST_PUBLISHED as RustSection[]).includes(tab);

export default function Rust({ route, navigate }: { route: Route; navigate: Nav }) {
  return (
    <div className="rs">
      <Tabs route={route} navigate={navigate} />
      {/* Por ahora la única página es la portada; cada pestaña se suma acá cuando se publica. */}
      <RustHome route={route} navigate={navigate} />
    </div>
  );
}

/** La barra del inventario: las pestañas que existen enlazan, las que vienen se anuncian apagadas. */
function Tabs({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useRustCopy();
  const current = route.rsSection ?? "home";
  return (
    <div className="rs-tabs-band">
      <nav className="rs-tabs" aria-label="Rust">
        {RUST_TABS.map((tab) =>
          isLive(tab) ? (
            <RouteLink
              className={`rs-tab${tab === current ? " is-on" : ""}`}
              to={{ ...route, view: "rust", rsSection: tab, detail: undefined }}
              onNavigate={navigate}
              active={tab === current}
              key={tab}
            >
              {t.tabs[tab]}
            </RouteLink>
          ) : (
            <span className="rs-tab is-soon" aria-disabled="true" title={t.soon} key={tab}>
              {t.tabs[tab]}
            </span>
          ),
        )}
        {t.soonTabs.map((name) => (
          <span className="rs-tab is-soon" aria-disabled="true" title={t.soon} key={name}>
            {name}
          </span>
        ))}
      </nav>
    </div>
  );
}
