import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useCopy, useLang, type Lang } from "./i18n";
import RouteLink from "./RouteLink";
import { setPendingSearch } from "./pendingSearch";
import { routeInLang, type Route } from "./route";
import { GAME_GROUPS } from "./gameGroups";
import { hasNavSearch, loadNavSearcher, type NavHit, type NavSearcher } from "./navSearch";

export type Game = "deadlock" | "poe2" | "valheim" | "d2r" | "zomboid" | "rust";
/** Home is not a game's tab — it is the site's front door, one level above them. */
export type Place = "home" | Game;
/** The legal pages are reachable from the footer and highlight no tab. */
export type View = Place | "privacy" | "terms";

/**
 * La barra superior del rediseño del 2026-09-06: marca · lugares · buscador ·
 * idioma. Igual en la portada y en todos los juegos.
 *
 * **Los juegos van en un menú, por categoría** (2026-10-12): con seis sueltos la barra ya no daba para el
 * séptimo. Quedan "Inicio", el botón "Juegos" y, adentro de un juego, su nombre.
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
  /**
   * En Valheim, Diablo II, Project Zomboid y Rust la barra busca las fichas del juego y muestra los resultados mientras
   * se escribe; cada uno lleva a su ficha (Valheim desde el 2026-09-24, pedido de ZoTaD; los otros tres desde el
   * 2026-10-11, que hasta entonces decían "Buscar un jugador" y mandaban a Deadlock). Ver `navSearch.ts`.
   */
  const liveGame = hasNavSearch(active) ? active : null;
  const itemSearch = inPoe2 || !!liveGame;
  const gameName: Partial<Record<View, [short: string, full: string]>> = {
    poe2: [copy.games.poe2Short, copy.games.poe2],
    valheim: [copy.games.valheim, copy.games.valheim],
    d2r: [copy.games.diablo2Short, copy.games.diablo2],
    zomboid: [copy.games.zomboidShort, copy.games.zomboid],
    rust: [copy.games.rust, copy.games.rust],
  };
  const [searchGame, searchGameFull] = (itemSearch && gameName[active]) || [copy.games.deadlock, copy.games.deadlock];
  const searchLabel = itemSearch ? copy.shell.searchItemFor(searchGameFull) : copy.shell.searchFor(searchGameFull);

  /** El buscador del juego, pedido recién al enfocar la barra. Al cambiar de juego se suelta el anterior. */
  const [searcher, setSearcher] = useState<{ game: View; run: NavSearcher } | null>(null);
  const run = searcher?.game === active ? searcher.run : null;
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLFormElement>(null);
  const wantIndex = () => {
    if (liveGame && !run) loadNavSearcher(liveGame).then((r) => setSearcher({ game: liveGame, run: r }), () => undefined);
  };
  const hits = useMemo<NavHit[]>(() => (run ? run(query, lang, 10) : []), [run, query, lang]);
  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  /* --- El menú de juegos -------------------------------------------------- */
  const [menu, setMenu] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => { if (bar.current && !bar.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [menu]);
  /** La portada de cada juego: a dónde lleva su nombre en el menú. */
  const gameHome: Record<Game, Route> = {
    deadlock: a("deadlock"),
    poe2: { ...a("poe2"), p2Section: "economy" },
    valheim: { ...a("valheim"), vhSection: "home" },
    d2r: { ...a("d2r"), d2Section: "home" },
    zomboid: { ...a("zomboid"), pzSection: "home" },
    rust: { ...a("rust"), rsSection: "home" },
  };
  const gameFull: Record<Game, string> = {
    deadlock: copy.games.deadlock,
    poe2: copy.games.poe2,
    valheim: copy.games.valheim,
    d2r: copy.games.diablo2,
    zomboid: copy.games.zomboid,
    rust: copy.games.rust,
  };
  const gameShort: Record<Game, string> = { ...gameFull, poe2: copy.games.poe2Short, d2r: copy.games.diablo2Short, zomboid: copy.games.zomboidShort };
  const activeGame = active in gameHome ? (active as Game) : null;

  const hitRoute = (h: NavHit): Route => ({ ...route, detail: undefined, ...h.to });
  const goTo = (h: NavHit) => {
    setQuery("");
    setOpen(false);
    onNavigate(hitRoute(h));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (liveGame && hits.length) return goTo(hits[Math.min(sel, hits.length - 1)]);
    // Diablo II, Zomboid y Rust no tienen a dónde llevar un texto sin resultados: la lista ya dice que no hay nada.
    if (liveGame && !inValheim) return;
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
      <div className="top-in" ref={bar}>
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
          <button
            type="button"
            className="top-place top-games-btn"
            aria-expanded={menu}
            aria-controls="top-games"
            onClick={() => setMenu((v) => !v)}
          >
            {copy.games.menu}
            <svg className="top-games-caret" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* El juego en el que se está, al lado del botón: dice dónde estás y vuelve a su portada. */}
          {activeGame && (
            <RouteLink className="top-place" to={gameHome[activeGame]} active onNavigate={onNavigate}>
              {gameShort[activeGame]}
            </RouteLink>
          )}
        </span>

        {/* El menú con todos los juegos, por categoría (2026-10-12). Va siempre en el HTML, abierto o no: son los
            enlaces a cada juego que antes estaban sueltos en la barra, y el prerender y Google los tienen que ver. */}
        <div className="top-games" id="top-games" hidden={!menu}>
          {GAME_GROUPS.map((g) => (
            <div className="top-games-group" key={g.id}>
              <p className="top-games-title">{copy.games.groups[g.id]}</p>
              {g.games.map((game) => (
                <RouteLink
                  className="top-games-link"
                  key={game}
                  to={gameHome[game]}
                  active={active === game}
                  onNavigate={(r) => { setMenu(false); onNavigate(r); }}
                >
                  {gameFull[game]}
                </RouteLink>
              ))}
            </div>
          ))}
        </div>

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
              role={liveGame ? "combobox" : undefined}
              aria-expanded={liveGame ? open && hits.length > 0 : undefined}
              aria-controls={liveGame ? "top-hits" : undefined}
              placeholder={itemSearch ? copy.shell.searchItem : copy.shell.search}
              aria-label={searchLabel}
              autoComplete="off"
            />
            <span className="top-search-game" aria-hidden="true">
              {searchGame}
            </span>
          </label>
          {liveGame && open && query.trim().length >= 2 && run && (
            <div className="top-hits" id="top-hits" role="listbox">
              {hits.length === 0 && <div className="top-hit is-empty">{copy.shell.searchNone}</div>}
              {hits.map((h, i) => (
                <RouteLink key={h.key} className={`top-hit${i === sel ? " is-on" : ""}`} to={hitRoute(h)} onNavigate={() => goTo(h)}>
                  <span className="top-hit-ic">
                    {h.img && <img src={h.img} alt="" width={28} height={28} loading="lazy" decoding="async" className={h.art ? "is-art" : undefined} />}
                  </span>
                  <span className="top-hit-n">
                    {h.name}
                    {h.alt && <small>{h.alt}</small>}
                  </span>
                  <small className="top-hit-tab">{h.tab}</small>
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
