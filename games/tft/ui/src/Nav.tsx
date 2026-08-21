import { useCopy, useLang, type Lang } from "./i18n";
import RouteLink from "./RouteLink";
import { routeInLang, type Route } from "./route";

export type Game = "tft" | "deadlock";
/** Home is not a game's tab — it is the site's front door, one level above them. */
export type Place = "home" | Game;
/** The legal pages are reachable from the footer and highlight no tab. */
export type View = Place | "privacy" | "terms";

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
  /** Ir a un lugar es cambiar de vista y cerrar cualquier detalle abierto. */
  const a = (place: Place): Route => ({ ...route, view: place, detail: undefined });

  return (
    <nav className="topbar" aria-label={copy.brand}>
      <RouteLink className="topbar-brand" to={a("home")} onNavigate={onNavigate}>
        {copy.brand}
      </RouteLink>

      <span className="topbar-places">
        <RouteLink
          className="topgame"
          to={a("home")}
          active={active === "home"}
          onNavigate={onNavigate}
        >
          {copy.sections.home}
        </RouteLink>

        <span className="topbar-divider" aria-hidden="true" />

        <RouteLink
          className="topgame"
          to={a("tft")}
          active={active === "tft"}
          onNavigate={onNavigate}
        >
          {copy.games.tftShort}
        </RouteLink>
        <RouteLink
          className="topgame"
          to={a("deadlock")}
          active={active === "deadlock"}
          onNavigate={onNavigate}
        >
          {/* El cartel de "pronto" se fue el 2026-07-29, cuando la pestaña pasó a
              tener una tier list medida de verdad. Dejarlo diciendo "pronto"
              sobre una página con datos es la clase de detalle que hace dudar
              del resto de los números. */}
          {copy.games.deadlock}
        </RouteLink>

        {/**
         * Dota 2 se anuncia, no se enlaza.
         *
         * Va como `<span>` y no como `RouteLink` a propósito: no existe la ruta,
         * así que un enlace llevaría a una página vacía o a un 404, y de paso
         * entraría al sitemap. Cuando el juego exista se convierte en
         * `RouteLink` y esto desaparece.
         *
         * `aria-disabled` en vez de esconderlo de los lectores de pantalla: el
         * anuncio también es información para quien no ve la pantalla.
         */}
        <span className="topgame is-soon" aria-disabled="true">
          {copy.games.dota}
          <em className="topgame-soon">{copy.games.soon}</em>
        </span>
      </span>

      <span className="topbar-lang">
        <span className="visually-hidden" id="lang-label">
          {copy.language.label}
        </span>
        {/* El cambio de idioma es un enlace a la MISMA página en el otro idioma,
            no un botón: es exactamente el par que declara `hreflang`, y con
            `<a href>` Google puede seguirlo. Antes cada traducción existía en el
            sitemap sin que nada la enlazara. */}
        <span className="langgroup" role="group" aria-labelledby="lang-label">
          {(["en", "es"] as Lang[]).map((code) => (
            <RouteLink
              className="langbtn"
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
    </nav>
  );
}
