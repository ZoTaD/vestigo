import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useCopy, useLang, type Lang } from "./i18n";
import RouteLink from "./RouteLink";
import { setPendingSearch } from "./pendingSearch";
import { routeInLang, type Route } from "./route";
import { artUrl, iconUrl, loadIndex, peekIndex, searchIndex, type IndexEntry } from "./valheimData";
import type { ValheimCopy } from "./valheimCopy";

export type Game = "tft" | "deadlock" | "poe2" | "valheim";
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
 * (op.gg, u.gg, Tracklock, tactics.tools, Dotabuff). Busca en Deadlock, que
 * desde el 2026-09-15 es el único juego del sitio (ver `route.ts`). El texto
 * viaja por `pendingSearch` hasta la pestaña Jugador, que es la que sabe buscar.
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

  /**
   * Dentro de PoE2 el buscador busca **objetos**, no jugadores: el juego no
   * tiene perfiles públicos que abrir, y lo que alguien busca ahí es cuánto
   * vale lo que acaba de encontrar. Es la misma barra con otro texto; el texto
   * viaja igual por `pendingSearch` y lo recoge la pestaña Economía.
   */
  const inPoe2 = active === "poe2";
  // Dentro de Valheim también se buscan objetos: el texto lo recoge el buscador
  // de la portada de la sección.
  const inValheim = active === "valheim";
  const itemSearch = inPoe2 || inValheim;
  const searchGame = inPoe2 ? copy.games.poe2Short : inValheim ? copy.games.valheim : copy.games.deadlock;
  const searchLabel = inPoe2
    ? copy.shell.searchItemFor(copy.games.poe2)
    : inValheim
      ? copy.shell.searchItemFor(copy.games.valheim)
      : copy.shell.searchFor(copy.games.deadlock);

  /**
   * En Valheim la barra muestra los resultados mientras se escribe, igual que
   * el "Buscar en todo" de la sección, y cada uno lleva a su ficha (pedido de
   * ZoTaD, 2026-09-24). El índice se pide recién al enfocar la barra.
   */
  const [vhIndex, setVhIndex] = useState<IndexEntry[] | null>(() => (inValheim ? peekIndex() : null));
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLFormElement>(null);
  /**
   * Los textos de Valheim (35 KB) se piden recién adentro de Valheim: antes se
   * importaban arriba y viajaban en el JS de entrada de todo el sitio. Para
   * entonces el chunk de Valheim ya los trajo, así que la promesa es inmediata.
   */
  const [vhCopy, setVhCopy] = useState<Record<Lang, ValheimCopy> | null>(null);
  useEffect(() => {
    if (inValheim && !vhCopy) import("./valheimCopy").then((m) => setVhCopy(m.VALHEIM_COPY)).catch(() => undefined);
  }, [inValheim, vhCopy]);
  const wantIndex = () => {
    if (inValheim && !vhIndex) loadIndex().then(setVhIndex).catch(() => undefined);
  };
  const hits = useMemo(() => (inValheim && vhIndex ? searchIndex(vhIndex, query, lang, 10) : []), [inValheim, vhIndex, query, lang]);
  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const goTo = (h: IndexEntry) => {
    setQuery("");
    setOpen(false);
    onNavigate({ ...route, view: "valheim", vhSection: h.tab, detail: h.slug });
  };
  const vhTabs = vhCopy?.[lang].tabs;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (inValheim && hits.length) return goTo(hits[Math.min(sel, hits.length - 1)]);
    setPendingSearch(q);
    setQuery("");
    onNavigate(
      inPoe2
        ? // Se busca en la liga que ya se estaba mirando, no en la de por defecto.
          { ...route, view: "poe2", p2Section: "economy", detail: route.p2Section === "economy" ? route.detail : undefined }
        : inValheim
          ? { ...route, view: "valheim", vhSection: "home", detail: undefined }
          : { ...route, view: "deadlock", dlSection: "player", detail: undefined },
    );
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
            to={a("deadlock")}
            active={active === "deadlock"}
            onNavigate={onNavigate}
          >
            {copy.games.deadlock}
          </RouteLink>
          <RouteLink
            className="top-place"
            to={{ ...a("poe2"), p2Section: "economy" }}
            active={active === "poe2"}
            onNavigate={onNavigate}
          >
            {copy.games.poe2Short}
          </RouteLink>
          <RouteLink
            className="top-place"
            to={{ ...a("valheim"), vhSection: "home" }}
            active={active === "valheim"}
            onNavigate={onNavigate}
          >
            {copy.games.valheim}
          </RouteLink>
          {/* Los juegos que vienen se anuncian, no se enlazan: no existe la
              ruta, así que un enlace llevaría a un 404 y de paso entraría al
              sitemap. En el orden de la hoja de ruta (2026-09-23). */}
          {[copy.games.dota, copy.games.diablo2Short].map((nombre) => (
            <span className="top-place is-soon" aria-disabled="true" key={nombre}>
              {nombre}
              <em className="top-soon">{copy.games.soon}</em>
            </span>
          ))}
        </span>

        <form className="top-search" role="search" onSubmit={submit} ref={box}>
          <label className="top-search-field">
            <svg className="top-search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <input
              className="top-search-input"
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); wantIndex(); }}
              onFocus={() => { setOpen(true); wantIndex(); }}
              onKeyDown={(e) => {
                if (!hits.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => (i + 1) % hits.length); }
                if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => (i - 1 + hits.length) % hits.length); }
                if (e.key === "Escape") setOpen(false);
              }}
              role={inValheim ? "combobox" : undefined}
              aria-expanded={inValheim ? open && hits.length > 0 : undefined}
              aria-controls={inValheim ? "top-hits" : undefined}
              placeholder={itemSearch ? copy.shell.searchItem : copy.shell.search}
              aria-label={searchLabel}
              autoComplete="off"
            />
            <span className="top-search-game" aria-hidden="true">
              {searchGame}
            </span>
          </label>
          {inValheim && open && query.trim().length >= 2 && vhIndex && vhCopy && (
            <div className="top-hits" id="top-hits" role="listbox">
              {hits.length === 0 && <div className="top-hit is-empty">{vhCopy[lang].noResults}</div>}
              {hits.map((h, i) => (
                <RouteLink
                  key={`${h.tab}/${h.slug}`}
                  className={`top-hit${i === sel ? " is-on" : ""}`}
                  to={{ ...route, view: "valheim", vhSection: h.tab, detail: h.slug }}
                  onNavigate={() => goTo(h)}
                >
                  <span className="top-hit-ic">
                    {h.icon ? <img src={iconUrl(h.icon)} alt="" width={28} height={28} loading="lazy" />
                      : h.art || h.photo ? <img src={h.photo ?? artUrl(h.art)} alt="" width={28} height={28} loading="lazy" className="is-art" /> : null}
                  </span>
                  <span className="top-hit-n">
                    {lang === "es" ? h.es : h.en}
                    <small>{lang === "es" ? h.en : h.es}</small>
                  </span>
                  <small className="top-hit-tab">{vhTabs?.[h.tab]}</small>
                </RouteLink>
              ))}
            </div>
          )}
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
