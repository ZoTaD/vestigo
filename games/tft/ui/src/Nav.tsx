import { useState, type FormEvent } from "react";
import { useCopy, useLang, type Lang } from "./i18n";
import RouteLink from "./RouteLink";
import { setPendingSearch } from "./pendingSearch";
import { routeInLang, type Route } from "./route";

export type Game = "tft" | "deadlock";
/** Home is not a game's tab — it is the site's front door, one level above them. */
export type Place = "home" | Game;
/** The legal pages are reachable from the footer and highlight no tab. */
export type View = Place | "privacy" | "terms";

/**
 * La barra superior del rediseño del 2026-09-06: marca · lugares · buscador ·
 * idioma. Fija arriba, igual en la portada y en los dos juegos.
 *
 * **El buscador está en todas las páginas** porque buscarse es el caso de uso
 * número uno de un sitio de stats y la competencia entera lo tiene a un tap
 * (op.gg, u.gg, Tracklock, tactics.tools, Dotabuff). Busca en el juego activo;
 * en la portada y en las páginas legales, en Deadlock, que es el que tiene
 * búsqueda por nombre. El texto viaja por `pendingSearch` hasta la pestaña
 * Jugador, que es la que sabe buscar.
 */
export default function Nav({
  active,
  route,
  onNavigate,
}: {
  active: View;
  /** La ruta actual: de ahí sale el idioma con el que se arma cada `href`. */
  route: Route;
  onNavigate: (route: Route) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const [query, setQuery] = useState("");
  /** Ir a un lugar es cambiar de vista y cerrar cualquier detalle abierto. */
  const a = (place: Place): Route => ({ ...route, view: place, detail: undefined });

  const searchGame: Game = active === "tft" ? "tft" : "deadlock";
  const searchLabel = copy.shell.searchFor(
    searchGame === "tft" ? copy.games.tftShort : copy.games.deadlock
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setPendingSearch(q);
    setQuery("");
    if (searchGame === "tft") {
      onNavigate({ ...route, view: "tft", section: "player", detail: undefined });
    } else {
      onNavigate({ ...route, view: "deadlock", dlSection: "player", detail: undefined });
    }
  };

  return (
    <nav className="top" aria-label={copy.brand}>
      <div className="top-in">
        <RouteLink className="top-brand" to={a("home")} onNavigate={onNavigate}>
          {copy.brand}
        </RouteLink>

        <span className="top-places">
          <RouteLink
            className="top-place"
            to={a("home")}
            active={active === "home"}
            onNavigate={onNavigate}
          >
            {copy.sections.home}
          </RouteLink>
          <RouteLink
            className="top-place"
            to={a("tft")}
            active={active === "tft"}
            onNavigate={onNavigate}
          >
            {copy.games.tftShort}
          </RouteLink>
          <RouteLink
            className="top-place"
            to={a("deadlock")}
            active={active === "deadlock"}
            onNavigate={onNavigate}
          >
            {copy.games.deadlock}
          </RouteLink>
          {/* Dota 2 se anuncia, no se enlaza: no existe la ruta, así que un
              enlace llevaría a un 404 y de paso entraría al sitemap. */}
          <span className="top-place is-soon" aria-disabled="true">
            {copy.games.dota}
            <em className="top-soon">{copy.games.soon}</em>
          </span>
        </span>

        <form className="top-search" role="search" onSubmit={submit}>
          <label className="top-search-field">
            <svg className="top-search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <input
              className="top-search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.shell.search}
              aria-label={searchLabel}
              autoComplete="off"
            />
            <span className="top-search-game" aria-hidden="true">
              {searchGame === "tft" ? copy.games.tftShort : copy.games.deadlock}
            </span>
          </label>
        </form>

        <span className="top-lang">
          <span className="visually-hidden" id="lang-label">
            {copy.language.label}
          </span>
          {/* El cambio de idioma es un enlace a la MISMA página en el otro
              idioma: es exactamente el par que declara `hreflang`, y con
              `<a href>` Google puede seguirlo. */}
          <span role="group" aria-labelledby="lang-label" style={{ display: "contents" }}>
            {(["en", "es"] as Lang[]).map((code) => (
              <RouteLink
                className="top-langbtn"
                key={code}
                to={routeInLang(route, code)}
                active={lang === code}
                hrefLang={code}
                onNavigate={onNavigate}
              >
                {copy.language[code]}
              </RouteLink>
            ))}
          </span>
        </span>
      </div>
    </nav>
  );
}
