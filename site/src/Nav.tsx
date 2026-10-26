import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useCopy, useLang, type Lang } from "./i18n";
import RouteLink from "./RouteLink";
import { setPendingSearch } from "./pendingSearch";
import { routeInLang, type Route } from "./route";
import { GAME_GROUPS, GAME_LOGOS } from "./gameGroups";
import { hasNavSearch, hitIconSize, loadNavSearcher, type NavHit, type NavSearcher } from "./navSearch";

export type Game = "deadlock" | "poe2" | "valheim" | "d2r" | "zomboid" | "rust" | "terraria" | "stardew";
/** Home is not a game's tab — it is the site's front door, one level above them. */
export type Place = "home" | Game;
/** The legal pages are reachable from the footer and highlight no tab. */
export type View = Place | "privacy" | "terms";

/**
 * La barra superior del rediseño del 2026-09-06: marca · lugares · buscador ·
 * idioma. Igual en la portada y en todos los juegos.
 *
 * **Los juegos viven en el menú "Games"** (2026-10-26, maqueta B elegida por ZoTaD): con ocho juegos ya no entraban
 * en la barra. El botón abre un panel con una columna por categoría (`gameGroups.ts`), el logo de cada juego en un
 * solo color y sus tres pestañas más buscadas; en el teléfono el panel ocupa la pantalla. En la barra queda sólo el
 * juego en el que se está. Antes (2026-10-12) entraban los que cabían y el resto iba a un menú de tres puntos.
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
    terraria: [copy.games.terraria, copy.games.terraria],
    stardew: [copy.games.stardew, copy.games.stardew],
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
  /* --- El menú de juegos ------------------------------------------------------ */
  const activeGame = (Object.keys(GAME_LOGOS) as Game[]).includes(active as Game) ? (active as Game) : null;
  const [menu, setMenu] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** En el teléfono el menú tapa la pantalla entera: ahí el foco no sale de él y la página de atrás no se mueve. */
  const isSheet = () => typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches;
  const closeMenu = (refocus: boolean) => {
    setMenu(false);
    if (refocus) menuBtn.current?.focus();
  };
  useEffect(() => {
    if (!menu) return;
    /** Lo que se puede enfocar en el panel y está a la vista (la X sólo se ve en el teléfono). */
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>("a, button") ?? [])].filter((el) => el.offsetParent);
    focusable()[0]?.focus();
    const out = (e: MouseEvent) => { if (nav.current && !nav.current.contains(e.target as Node)) closeMenu(false); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeMenu(true);
      if (e.key !== "Tab" || !isSheet()) return;
      const all = focusable();
      const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    // En escritorio el menú cuelga de la barra: si el foco se va a la página, se cierra.
    const leave = (e: FocusEvent) => { if (!isSheet() && nav.current && !nav.current.contains(e.target as Node)) closeMenu(false); };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", keys);
    document.addEventListener("focusin", leave);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    if (isSheet()) root.style.overflow = "hidden";
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", keys);
      document.removeEventListener("focusin", leave);
      root.style.overflow = overflow;
    };
  }, [menu]);
  /** Elegir algo del menú es navegar y cerrarlo. */
  const pick = (r: Route) => { setMenu(false); onNavigate(r); };
  /** La portada de cada juego: a dónde lleva su nombre en el menú. */
  const gameHome: Record<Game, Route> = {
    deadlock: a("deadlock"),
    poe2: { ...a("poe2"), p2Section: "economy" },
    valheim: { ...a("valheim"), vhSection: "home" },
    d2r: { ...a("d2r"), d2Section: "home" },
    zomboid: { ...a("zomboid"), pzSection: "home" },
    rust: { ...a("rust"), rsSection: "home" },
    terraria: { ...a("terraria"), trSection: "home" },
    stardew: { ...a("stardew"), sdSection: "home" },
  };
  const gameFull: Record<Game, string> = {
    deadlock: copy.games.deadlock,
    poe2: copy.games.poe2,
    valheim: copy.games.valheim,
    d2r: copy.games.diablo2,
    zomboid: copy.games.zomboid,
    rust: copy.games.rust,
    terraria: copy.games.terraria,
    stardew: copy.games.stardew,
  };
  const gameShort: Record<Game, string> = { ...gameFull, poe2: copy.games.poe2Short, d2r: copy.games.diablo2Short, zomboid: copy.games.zomboidShort, stardew: copy.games.stardewShort };
  /** La clave de la ruta que elige la pestaña de cada juego: los accesos directos del menú la cambian. */
  const tabKey = {
    deadlock: "dlSection", poe2: "p2Section", valheim: "vhSection", d2r: "d2Section",
    zomboid: "pzSection", rust: "rsSection", terraria: "trSection", stardew: "sdSection",
  } as const satisfies Record<Game, keyof Route>;
  const quickRoute = (game: Game, tab: string): Route => ({ ...gameHome[game], [tabKey[game]]: tab });
  /** La pestaña que se está mirando, para marcar su acceso directo. */
  const activeTab = activeGame ? route[tabKey[activeGame]] : undefined;

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
    <nav className="top" aria-label={copy.brand} ref={nav}>
      <div className="top-in">
        <RouteLink className="top-brand" to={a("home")} onNavigate={onNavigate}>
          {copy.brand}
        </RouteLink>

        <button
          type="button"
          className="top-menu-btn"
          ref={menuBtn}
          aria-expanded={menu}
          aria-controls="top-menu"
          onClick={() => setMenu((v) => !v)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {menu ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          <span className="top-menu-label">{copy.games.menu}</span>
        </button>

        {/* El juego en el que se está: con los juegos dentro del menú, es lo que dice dónde se está. */}
        {activeGame && (
          <RouteLink className="top-here" to={gameHome[activeGame]} active onNavigate={onNavigate}>
            {gameShort[activeGame]}
          </RouteLink>
        )}

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
                    {h.img && (h.pix ? (
                      <img src={h.img} alt="" width={hitIconSize(h.pix)[0]} height={hitIconSize(h.pix)[1]} loading="lazy" decoding="async" className="is-pix" />
                    ) : (
                      <img src={h.img} alt="" width={28} height={28} loading="lazy" decoding="async" className={h.art ? "is-art" : undefined} />
                    ))}
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

      {/* Todos los juegos, por categoría, con el logo de cada uno y sus pestañas más buscadas (2026-10-26). En el
          prerender está en el HTML (oculto): así cada página enlaza a todos los juegos. */}
      <div className="top-menu" id="top-menu" ref={panel} hidden={!menu} aria-label={copy.games.menu} role="region">
        <div className="top-menu-head">
          <span className="top-brand" aria-hidden="true">{copy.brand}</span>
          <button type="button" className="top-menu-close" aria-label={copy.games.close} onClick={() => closeMenu(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="top-menu-in">
          {GAME_GROUPS.map((g) => (
            <div className={`top-menu-group is-${g.id}`} key={g.id}>
              <p className="top-menu-title">
                {copy.games.groups[g.id]}
                <span className="top-menu-count">{g.games.length}</span>
              </p>
              <ul className="top-menu-games">
                {g.games.map((game) => {
                  const [w, h] = GAME_LOGOS[game];
                  const quick = copy.games.quick[game] as Record<string, string>;
                  return (
                    <li className={`top-menu-game${active === game ? " is-here" : ""}`} key={game}>
                      <RouteLink className="top-menu-logo" to={gameHome[game]} active={active === game} onNavigate={pick}>
                        <span
                          className="top-logo"
                          aria-hidden="true"
                          style={{ "--logo": `url(/logos/${game}.png)`, width: w, height: h } as CSSProperties}
                        />
                        <span className="visually-hidden">{gameFull[game]}</span>
                      </RouteLink>
                      <span className="top-menu-quick">
                        {Object.entries(quick).map(([tab, label]) => (
                          <RouteLink
                            key={tab}
                            to={quickRoute(game, tab)}
                            active={active === game && activeTab === tab}
                            onNavigate={pick}
                            aria-label={`${gameFull[game]}: ${label}`}
                          >
                            {label}
                          </RouteLink>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
