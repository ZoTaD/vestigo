import { useState, type FormEvent } from "react";
import heroesJson from "@deadlock/heroes.json";
import { buildHeroes, patchMovers, PUBLISHED_BAND, type Hero } from "./deadlockData";
import { buildItems as buildDlItems } from "./deadlockItemsData";
import { heroes as heroSlugs, items as dlItemSlugs } from "./deadlockSlugs";
import { text } from "./localized";
import { tftSummary } from "./tftSummary";
import { useCopy, useLang, useLocale } from "./i18n";
import { lastProfile } from "./lastProfile";
import { storedSearch } from "./lastSearch";
import { setPendingSearch } from "./pendingSearch";
import RouteLink from "./RouteLink";
import type { Route } from "./route";

/**
 * La portada, desde el rediseño del 2026-09-06.
 *
 * **Deja de ser un folleto y pasa a ser una puerta.** Antes: eslogan, párrafo,
 * dos cifras de vanidad y dos bloques con "Entrar". Nadie tenía nada para
 * hacer en el primer pantallazo. Ahora, en orden de lectura:
 *
 * 1. El eslogan, a un tercio del tamaño.
 * 2. **El buscador**, grande, con el juego a elegir y "último visto" a un
 *    clic: buscarse es el caso de uso número uno de un sitio de stats.
 * 3. **"Hoy en el meta"**: cinco datos que cambian todos los días y enlazan a
 *    la página que los explica. Es el motivo de volver que la portada no tenía.
 * 4. Los juegos, con un botón que dice a dónde va.
 *
 * Todo lo que muestra sale de los archivos que ya viajan en el bundle, así que
 * está en el HTML prerenderizado y no puede desviarse de las tier lists que
 * anuncia. Ver docs/design/2026-09-06-como-presentamos-los-datos-diseno.md §4.1.
 */
export default function Home({
  route,
  navigate,
}: {
  route: Route;
  navigate: (route: Route) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();

  const num = (x: number) => x.toLocaleString(locale);
  const pct = (x: number) =>
    `${(x * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const pts = (x: number) => x.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const place = (x: number) =>
    x.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* --- Hoy en el meta: Deadlock ---------------------------------------- */
  const heroes = buildHeroes(PUBLISHED_BAND, lang);
  const bestHero = heroes.reduce<Hero | null>((b, h) => (!b || h.winRate > b.winRate ? h : b), null);
  const rising = patchMovers(heroes, 1).up[0] ?? null;
  const mostPlayed = heroes.reduce<Hero | null>(
    (b, h) => (!b || h.pickRate > b.pickRate ? h : b),
    null
  );
  const dlItems = buildDlItems(PUBLISHED_BAND, lang);
  const bestValue = dlItems.reduce<(typeof dlItems)[number] | null>(
    (b, i) => (!b || i.delta > b.delta ? i : b),
    null
  );

  /* --- Hoy en el meta: TFT --------------------------------------------- */
  // Lo poco de TFT que la portada necesita viene resumido del build
  // (`tftSummary.ts`): la portada no importa las comps ni el catálogo.
  const bestComp = tftSummary.best;
  const bestTftItem = tftSummary.bestItem;

  const bandName = copy.deadlock.bands[PUBLISHED_BAND];

  /* --- Buscador ---------------------------------------------------------- */
  const [game, setGame] = useState<"deadlock" | "tft">("deadlock");
  const [query, setQuery] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setPendingSearch(q);
    navigate(
      game === "tft"
        ? { ...route, view: "tft", section: "player", detail: undefined }
        : { ...route, view: "deadlock", dlSection: "player", detail: undefined }
    );
  };
  const lastDl = lastProfile();
  const lastTft = storedSearch();

  /* --- Cifras del pie ---------------------------------------------------- */
  const matchesRead = tftSummary.sampleSize + heroesJson.matches;
  const measured = [tftSummary.generatedAt, heroesJson.generatedAt]
    .map((d) => Date.parse(d))
    .filter((t) => !Number.isNaN(t));
  const days = measured.length
    ? Math.max(0, Math.floor((Date.now() - Math.max(...measured)) / 86_400_000))
    : null;
  const freshness =
    days === null
      ? "—"
      : days === 0
        ? copy.home.fresh.today
        : days === 1
          ? copy.home.fresh.yesterday
          : copy.home.fresh.days(days);

  const toHero = (h: Hero): Route => ({
    ...route,
    view: "deadlock",
    dlSection: "meta",
    detail: heroSlugs.toSlug.get(String(h.heroId)),
  });

  return (
    <main className="home">
      {/* Cabecera: el eslogan y el buscador, lado a lado ---------------- */}
      <section className="home-hero">
        <div className="home-hero-text">
          <p className="home-eyebrow">{copy.home.eyebrow}</p>
          <h1 className="home-title">
            {copy.home.title} <span className="home-title-break">{copy.home.titleBreak}</span>
          </h1>
          <p className="home-lead">{copy.home.lead}</p>
        </div>

        <form className="home-search box" onSubmit={submit} role="search">
          <p className="box-title">{copy.home.search.label}</p>
          <div className="seg home-search-game" role="group" aria-label={copy.home.search.label}>
            <button type="button" data-active={game === "deadlock"} onClick={() => setGame("deadlock")}>
              {copy.games.deadlock}
            </button>
            <button type="button" data-active={game === "tft"} onClick={() => setGame("tft")}>
              {copy.games.tftShort}
            </button>
          </div>
          <div className="home-search-row">
            <label className="field home-search-field">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={copy.home.search.placeholder[game]}
                aria-label={copy.home.search.placeholder[game]}
                autoComplete="off"
              />
            </label>
            <button className="btn" type="submit">
              {copy.home.search.go}
            </button>
          </div>
          {(lastDl || lastTft) && (
            <p className="home-last">
              <span className="home-last-label">{copy.home.search.lastSeen}</span>
              {lastDl && (
                <RouteLink
                  className="home-last-link"
                  to={{ ...route, view: "deadlock", dlSection: "player", detail: String(lastDl.accountId) }}
                  onNavigate={navigate}
                >
                  {lastDl.name} <small>· {copy.games.deadlock}</small>
                </RouteLink>
              )}
              {lastTft && (
                <RouteLink
                  className="home-last-link"
                  to={{ ...route, view: "tft", section: "player", detail: undefined }}
                  onNavigate={navigate}
                >
                  {lastTft.query} <small>· {copy.games.tftShort}</small>
                </RouteLink>
              )}
            </p>
          )}
        </form>
      </section>

      {/* Hoy en el meta ------------------------------------------------- */}
      <section className="home-today">
        <h2 className="home-h2">
          {copy.home.today.heading}
          <span className="home-h2-note">{copy.shell.measuredAt(freshness)}</span>
        </h2>

        <ul className="today-cards">
          {bestHero && (
            <li className="today-card" data-game="deadlock">
              <RouteLink className="today-link" to={toHero(bestHero)} onNavigate={navigate}>
                <span className="today-kicker">
                  {copy.games.deadlock} · {copy.home.today.bestHero}
                </span>
                <span className="today-body">
                  {bestHero.img && <img src={bestHero.img} alt="" width={48} height={48} loading="lazy" />}
                  <span className="today-name">{bestHero.name}</span>
                </span>
                <span className="today-figure">
                  <b>{pct(bestHero.winRate)}</b>
                  <small>
                    {copy.home.today.wins} · {copy.home.today.band(bandName)}
                  </small>
                </span>
              </RouteLink>
            </li>
          )}

          {(rising ?? mostPlayed) && (
            <li className="today-card" data-game="deadlock">
              <RouteLink className="today-link" to={toHero((rising ?? mostPlayed)!)} onNavigate={navigate}>
                <span className="today-kicker">
                  {copy.games.deadlock} · {rising ? copy.home.today.rising : copy.home.today.mostPlayed}
                </span>
                <span className="today-body">
                  {(rising ?? mostPlayed)!.img && (
                    <img src={(rising ?? mostPlayed)!.img} alt="" width={48} height={48} loading="lazy" />
                  )}
                  <span className="today-name">{(rising ?? mostPlayed)!.name}</span>
                </span>
                <span className="today-figure">
                  {rising ? (
                    <>
                      <b className="delta is-up">▲ {pts(rising.trend ?? 0)}</b>
                      <small>{copy.home.today.wins}</small>
                    </>
                  ) : (
                    <>
                      <b>{pct(mostPlayed!.pickRate)}</b>
                      <small>
                        {copy.home.today.use} · {copy.home.today.band(bandName)}
                      </small>
                    </>
                  )}
                </span>
              </RouteLink>
            </li>
          )}

          {bestValue && (
            <li className="today-card" data-game="deadlock">
              <RouteLink
                className="today-link"
                to={{
                  ...route,
                  view: "deadlock",
                  dlSection: "items",
                  detail: dlItemSlugs.toSlug.get(String(bestValue.itemId)),
                }}
                onNavigate={navigate}
              >
                <span className="today-kicker">
                  {copy.games.deadlock} · {copy.home.today.bestValue}
                </span>
                <span className="today-body">
                  {bestValue.img && <img src={bestValue.img} alt="" width={48} height={48} loading="lazy" />}
                  <span className="today-name">{bestValue.name}</span>
                </span>
                <span className="today-figure">
                  <b>{pct(bestValue.winRateRaw)}</b>
                  <small>{copy.home.today.over(pts(bestValue.delta))}</small>
                </span>
              </RouteLink>
            </li>
          )}

          {bestComp && (
            <li className="today-card" data-game="tft">
              <RouteLink
                className="today-link"
                to={{ ...route, view: "tft", section: "meta", detail: bestComp.slug }}
                onNavigate={navigate}
              >
                <span className="today-kicker">
                  {copy.games.tftShort} · {copy.home.today.bestComp}
                </span>
                <span className="today-body">
                  <span className="today-name">{text(bestComp.name, lang)}</span>
                </span>
                <span className="today-figure">
                  <b>{place(bestComp.avgPlacement)}</b>
                  <small>
                    {copy.home.today.placement} · {copy.home.today.set(tftSummary.set)}
                  </small>
                </span>
              </RouteLink>
            </li>
          )}

          {bestTftItem && (
            <li className="today-card" data-game="tft">
              <RouteLink
                className="today-link"
                to={{ ...route, view: "tft", section: "items", detail: bestTftItem.slug }}
                onNavigate={navigate}
              >
                <span className="today-kicker">
                  {copy.games.tftShort} · {copy.home.today.bestItem}
                </span>
                <span className="today-body">
                  {bestTftItem.img && <img src={bestTftItem.img} alt="" width={48} height={48} loading="lazy" />}
                  <span className="today-name">{text(bestTftItem.name, lang)}</span>
                </span>
                <span className="today-figure">
                  <b>{place(bestTftItem.avgPlacement)}</b>
                  <small>{copy.home.today.better(pts(Math.abs(bestTftItem.delta)))}</small>
                </span>
              </RouteLink>
            </li>
          )}
        </ul>
      </section>

      {/* Los juegos ------------------------------------------------------ */}
      <section className="home-games">
        <h2 className="home-h2">{copy.home.games.heading}</h2>

        <ul className="game-list">
          <li className="game-panel" data-panel="tft">
            <div className="game-panel-main">
              <h3 className="game-panel-name">{copy.games.tft}</h3>
              <p className="game-panel-note">{copy.home.games.tft}</p>
              <div className="game-panel-ctas">
                <RouteLink
                  className="game-cta"
                  to={{ ...route, view: "tft", section: "meta", detail: undefined }}
                  onNavigate={navigate}
                >
                  {copy.home.games.tftCta(tftSummary.set, num(tftSummary.compsCount))}
                  <Arrow />
                </RouteLink>
                <RouteLink
                  className="game-cta is-ghost"
                  to={{ ...route, view: "tft", section: "player", detail: undefined }}
                  onNavigate={navigate}
                >
                  {copy.home.games.profile}
                </RouteLink>
              </div>
            </div>
            <div className="game-panel-figures">
              <p className="game-figure">
                <b>{bestComp ? place(bestComp.avgPlacement) : "—"}</b>
                <span>{copy.home.figures.placement(bestComp ? text(bestComp.name, lang) : "")}</span>
              </p>
              <p className="game-figure is-second">
                <b>{num(tftSummary.sampleSize)}</b>
                <span>{copy.home.figures.matchesSet(tftSummary.set)}</span>
              </p>
            </div>
          </li>

          <li className="game-panel" data-panel="deadlock">
            <div className="game-panel-main">
              <h3 className="game-panel-name">{copy.games.deadlock}</h3>
              <p className="game-panel-note">{copy.home.games.deadlock}</p>
              <div className="game-panel-ctas">
                <RouteLink
                  className="game-cta"
                  to={{ ...route, view: "deadlock", dlSection: "meta", detail: undefined }}
                  onNavigate={navigate}
                >
                  {copy.home.games.deadlockCta(num(heroes.length))}
                  <Arrow />
                </RouteLink>
                <RouteLink
                  className="game-cta is-ghost"
                  to={{ ...route, view: "deadlock", dlSection: "player", detail: undefined }}
                  onNavigate={navigate}
                >
                  {copy.home.games.profile}
                </RouteLink>
              </div>
            </div>
            <div className="game-panel-figures">
              <p className="game-figure">
                <b>
                  {bestHero ? pct(bestHero.winRate).replace("%", "") : "—"}
                  <i>&#8201;%</i>
                </b>
                <span>{copy.home.figures.winRate(bestHero?.name ?? "")}</span>
              </p>
              <p className="game-figure is-second">
                <b>{num(heroesJson.matches)}</b>
                <span>{copy.home.figures.matchesBand(copy.home.figures.topBand)}</span>
              </p>
            </div>
          </li>

          {/* Dota 2 se anuncia, no se enlaza: no existe la ruta todavía. El
              panel se dibuja igual, con la cifra en blanco, porque un hueco a
              propósito dice "todavía no" mejor que una fila apagada. */}
          <li className="game-panel" data-panel="dota" data-soon="true">
            <div className="game-panel-main">
              <h3 className="game-panel-name">{copy.games.dota}</h3>
              <p className="game-panel-note">{copy.home.games.dota}</p>
              <span className="game-cta" aria-disabled="true">
                {copy.home.games.soonCta}
              </span>
            </div>
            <div className="game-panel-figures">
              <p className="game-figure">
                <b aria-hidden="true">—</b>
                <span>{copy.home.figures.unmeasured}</span>
              </p>
            </div>
          </li>
        </ul>
      </section>

      {/* Las cifras de confianza, chicas y al pie: dicen de qué está hecho el
          sitio, no qué hacer en él. */}
      <p className="home-counts">
        <span>
          <b>{num(matchesRead)}</b> {copy.home.counts.matches}
        </span>
        <span>
          {copy.home.counts.measured} <b>{freshness}</b>
        </span>
      </p>
    </main>
  );
}

/** El único icono de la página. Trazo, no emoji, para que escale con el texto. */
function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}
