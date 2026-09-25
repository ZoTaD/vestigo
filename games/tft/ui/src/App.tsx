import { Suspense, useEffect, useState } from "react";
import Nav from "./Nav";
import RouteLink from "./RouteLink";
import CookieBanner from "./CookieBanner";
import { DeadlockArea, HomeArea, PageMeta, Poe2Area, PrivacyPage, TermsPage, ValheimArea } from "./areas";
import type { BandId as DlBandId } from "./deadlockData";
import {
  analyticsAvailable,
  loadAnalytics,
  rememberConsent,
  revokeAnalytics,
  storedConsent,
  trackPage,
  type Consent,
} from "./analytics";
import {
  LangContext,
  rememberLang,
  storedLang,
  useCopy,
  type Lang,
} from "./i18n";
import { LANGS, parseRoute, routePath, type Route } from "./route";
import { storedBand } from "./bands";

// TFT no se monta desde el 2026-09-15: `parseRoute` ya no produce la vista
// "tft", así que acá no hay nada que dibujar para ella. `TftArea.tsx` y sus
// vistas siguen en el repo, sin importar, por si el juego vuelve (ver route.ts).

/**
 * The shell: where you are, and the disclaimer under everything.
 *
 * Home sits beside the games rather than inside one. It describes what Vestigo
 * does for a player in any game — naming TFT there would date the page the moment
 * a second game ships.
 *
 * Split from the provider below so it can read the language through the same
 * context every other component uses, instead of taking it as a prop that would
 * then have to be threaded through the whole tree.
 */
function Shell({
  route,
  navigate,
}: {
  route: Route;
  navigate: (next: Route) => void;
}) {
  const copy = useCopy();
  const { view: place } = route;
  const [consent, setConsent] = useState<Consent | null>(storedConsent);
  // Reopening the notice from the footer is how a decision gets withdrawn,
  // which the GDPR requires to be as easy as giving it.
  const [reopened, setReopened] = useState(false);

  // A remembered "yes" has to survive the reload, so this runs on mount too and
  // not only on the click that granted it.
  useEffect(() => {
    if (consent === "granted") loadAnalytics();
  }, [consent]);

  // Now that navigation writes real URLs, GA is told the same path the address
  // bar shows — the reports and the site finally agree on what a page is.
  //
  // The language prefix is dropped so /en/tft/units and /es/tft/units count as
  // one page: the report is about which screens get used, not which
  // translations, and language is already a dimension of its own in GA.
  useEffect(() => {
    if (consent !== "granted") return;
    const path = routePath({ ...route, lang: "en" }).replace(/^\/en/, "") || "/";
    trackPage(path, place);
  }, [route, consent, place]);

  const decide = (next: Consent) => {
    rememberConsent(next);
    setConsent(next);
    setReopened(false);
    if (next === "granted") loadAnalytics();
    else revokeAnalytics();
  };

  /**
   * La banda de Deadlock vive acá y no adentro de cada pestaña.
   *
   * Con un `useState` por página, elegir Arconte en la tier list de héroes y
   * pasar a objetos volvía sola a Fantasma+, y el visitante tenía que elegir dos
   * veces lo mismo. Es el mismo criterio que la banda de TFT, que se recuerda
   * entre visitas — acá alcanza con que sobreviva al cambio de pestaña, porque
   * la banda de Deadlock todavía no viaja en la URL. `undefined` es "la
   * publicada", que resuelve `DeadlockArea` (ver ahí por qué no acá).
   */
  const [dlBand, setDlBand] = useState<DlBandId | undefined>(undefined);

  // The legal pages open at the top: arriving at a policy already scrolled to
  // the footer you clicked from reads as a broken link.
  const goLegal = (doc: "privacy" | "terms") => {
    navigate({ ...route, view: doc, detail: undefined });
    window.scrollTo({ top: 0 });
  };

  /**
   * **`data-game` va al lado de `data-theme`, no en su lugar.**
   *
   * Las ~7.900 líneas de `codex.css` están todas prefijadas con
   * `[data-theme="codex"]`, así que cambiar ese atributo apagaría la hoja entera
   * y obligaría a reescribirla para el otro juego. Este atributo **sólo pisa las
   * variables** —el negro, el crema, el oro y la tipografía—, de modo que todo
   * lo que ya está escrito con `var(--ink)` se re-pinta solo y sólo lo que
   * necesita forma propia se escribe con los dos selectores juntos.
   *
   * Los valores salen de la paleta con nombre del propio juego
   * (`assets.deadlock-api.com/v2/colors`), no de una elección nuestra.
   */
  return (
    <div
      className="app"
      data-theme="codex"
      data-game={place === "deadlock" || place === "poe2" || place === "valheim" ? place : undefined}
      /**
       * La home es el único lugar que no es el códex.
       *
       * `data-game` re-pinta las variables del códex para un juego; esto hace
       * otra cosa y por eso es otro atributo: la portada tiene identidad propia
       * —papel claro, titulares de palo, los juegos entrando a sangre cada uno
       * con su oscuridad— y vive en `styles/home.css`, una hoja aparte prefijada
       * con `[data-place="home"]`. Nada de lo que hay acá adentro toca al resto
       * del sitio, que sigue siendo oro sobre azul medianoche.
       */
      data-place={place}
    >
      <div className="grain" aria-hidden="true" />

      <Suspense fallback={null}>
        <PageMeta route={route} />
      </Suspense>

      <Nav active={place} route={route} onNavigate={navigate} />

      {/* Cada vista es un chunk aparte (ver `areas.ts`). El fallback sólo se ve
          al saltar a un juego que todavía no se bajó: la llegada al sitio espera
          el chunk antes del primer render, en `main.tsx`. */}
      <Suspense fallback={<div className="area-loading" aria-busy="true" />}>
        {place === "home" && <HomeArea route={route} navigate={navigate} />}
        {place === "deadlock" && (
          <DeadlockArea route={route} navigate={navigate} band={dlBand} onBand={setDlBand} />
        )}
        {place === "poe2" && <Poe2Area route={route} navigate={navigate} />}
        {place === "valheim" && <ValheimArea route={route} navigate={navigate} />}
        {place === "privacy" && <PrivacyPage />}
        {place === "terms" && <TermsPage />}
      </Suspense>

      {/* One centred column, in the order someone reads it: where to go, where
          the data comes from, the notice Riot requires, then the byline. */}
      <footer className="foot">
        <nav className="foot-links" aria-label={copy.footer.privacy}>
          <RouteLink
            className="foot-link"
            to={{ ...route, view: "privacy", detail: undefined }}
            onNavigate={(r) => { navigate(r); window.scrollTo({ top: 0 }); }}
          >
            {copy.footer.privacy}
          </RouteLink>
          <RouteLink
            className="foot-link"
            to={{ ...route, view: "terms", detail: undefined }}
            onNavigate={(r) => { navigate(r); window.scrollTo({ top: 0 }); }}
          >
            {copy.footer.terms}
          </RouteLink>
          {copy.footer.englishOnly && (
            <span className="foot-note">{copy.footer.englishOnly}</span>
          )}
          {analyticsAvailable() && (
            <button className="foot-link is-consent" onClick={() => setReopened(true)}>
              {copy.consent.settings}
              {consent && ` — ${consent === "granted" ? copy.consent.on : copy.consent.off}`}
            </button>
          )}
        </nav>

        {/* Una sola línea de fuentes desde que Deadlock es el único juego: la
            de Riot/CommunityDragon describía las páginas de TFT, que ya no se
            sirven. */}
        {/* En PoE2 no se nombra a Valve (no es su juego) ni a los proveedores
            de datos, a pedido de ZoTaD; sí el crédito que pide la licencia de
            la tipografía Fontin. */}
        <p className="foot-sources">
          {place === "poe2" ? copy.footer.sourcesPoe2 : place === "valheim" ? copy.footer.sourcesValheim : copy.footer.sourcesDeadlock}
        </p>

        {/* Required by Riot's General Policies, which every third-party product
            must post, and by Overwolf's compliance guide. It is not decoration —
            leave the wording alone. */}
        <p className="foot-legal">{copy.footer.disclaimer}</p>

        {/* El mismo aviso, para el otro dueño: las directrices de contenido de
            Valve piden lo mismo que las de Riot, así que el pie lo dice en las
            dos direcciones o no lo dice en ninguna. Va en un párrafo aparte a
            propósito: la redacción de Riot no se toca. */}
        <p className="foot-legal">{copy.footer.disclaimerValve}</p>

        <p className="foot-copy">
          © {new Date().getFullYear()} {copy.brand}
        </p>
      </footer>

      {/* Undecided behaves exactly like a refusal: nothing loads until someone
          answers, so the notice never has to block the page to be honest. */}
      {analyticsAvailable() && (consent === null || reopened) && (
        <CookieBanner onDecide={decide} onPrivacy={() => goLegal("privacy")} />
      )}
    </div>
  );
}

/** Did the visitor's URL name a language, or do we have to choose one? */
const urlNamesLang = (pathname: string): boolean =>
  LANGS.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));

/**
 * Where the first render starts.
 *
 * A URL that names its language wins outright — a link shared in Spanish has to
 * open in Spanish for whoever receives it, whatever they picked here before.
 * Only when the address is silent (someone typing vestigo.gg) does the
 * remembered choice decide.
 */
function initialRoute(): Route {
  const { pathname } = window.location;
  const parsed = parseRoute(pathname);
  const lang = urlNamesLang(pathname) ? parsed.lang : storedLang();
  // Same rule for the rank: an address that names a band is what the sender
  // meant to share, and only a silent one falls back to what was picked before.
  return { ...parsed, lang, band: parsed.band ?? storedBand() };
}

/**
 * @param ssrRoute La ruta con la que renderizar, en vez de leerla del navegador.
 *   La usa el prerender del build, que corre en Node y no tiene `window`. En el
 *   navegador va siempre sin este parámetro y nada cambia.
 */
export default function App({ ssrRoute }: { ssrRoute?: Route } = {}) {
  const [route, setRoute] = useState<Route>(() => ssrRoute ?? initialRoute());

  // The back button has to work, or real URLs are worse than no URLs: people
  // would land deep in the site with no way back out.
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Tidy the address on arrival: "/" and "/tft" become the full canonical path
  // without adding a history entry, so the first Back still leaves the site.
  useEffect(() => {
    const want = routePath(route);
    if (window.location.pathname !== want) window.history.replaceState(null, "", want);
    // Only on mount: later changes go through navigate, which writes its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = (next: Route) => {
    // El idioma se recuerda acá y no sólo en `setLang`, porque desde que el
    // selector es un `<a href>` el cambio entra por este camino. Con la memoria
    // sólo en `setLang`, elegir español y volver al día siguiente abría en
    // inglés.
    if (next.lang !== route.lang) rememberLang(next.lang);
    const path = routePath(next);
    if (path !== window.location.pathname) window.history.pushState(null, "", path);
    setRoute(next);
  };

  // Also on mount, not just on click: a remembered Spanish choice has to reach
  // the document on the next visit too, or screen readers and translation tools
  // would read English markup as Spanish.
  useEffect(() => {
    document.documentElement.lang = route.lang;
  }, [route.lang]);

  const setLang = (next: Lang) => {
    rememberLang(next);
    // The same page, in the other language: switching never sends you home.
    navigate({ ...route, lang: next });
  };

  return (
    <LangContext.Provider value={{ lang: route.lang, setLang }}>
      <Shell route={route} navigate={navigate} />
    </LangContext.Provider>
  );
}
