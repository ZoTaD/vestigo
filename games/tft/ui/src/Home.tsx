import { useState, type FormEvent } from "react";
import heroesJson from "@deadlock/heroes.json";
import { buildHeroes, patchMovers, PUBLISHED_BAND, type Hero } from "./deadlockData";
import { buildItems as buildDlItems } from "./deadlockItemsData";
import { heroes as heroSlugs, items as dlItemSlugs } from "./deadlockSlugs";
import { useCopy, useLang, useLocale } from "./i18n";
import { lastProfile } from "./lastProfile";
import { setPendingSearch } from "./pendingSearch";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import vhMeta from "@valheim/meta.json";

/** Las fichas de la enciclopedia de Valheim (sin biomas ni jefes, que son guías). */
const VH_ENTRIES = Object.entries(vhMeta.counts).reduce((n, [k, v]) => (k === "biomes" || k === "bosses" ? n : n + v), 0);

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

  const bandName = copy.deadlock.bands[PUBLISHED_BAND];

  /* --- Buscador ---------------------------------------------------------- */
  // Sólo Deadlock desde el 2026-09-15 (ver `route.ts`): el selector de juego
  // que había acá se fue con TFT, y vuelve el día que haya un segundo juego.
  const [query, setQuery] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setPendingSearch(q);
    navigate({ ...route, view: "deadlock", dlSection: "player", detail: undefined });
  };
  const lastDl = lastProfile();

  /* --- Cifras del pie ---------------------------------------------------- */
  const matchesRead = heroesJson.matches;
  const measuredAt = Date.parse(heroesJson.generatedAt);
  const days = Number.isNaN(measuredAt)
    ? null
    : Math.max(0, Math.floor((Date.now() - measuredAt) / 86_400_000));
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
          <div className="home-search-row">
            <label className="field home-search-field">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={copy.home.search.placeholder.deadlock}
                aria-label={copy.home.search.placeholder.deadlock}
                autoComplete="off"
              />
            </label>
            <button className="btn" type="submit">
              {copy.home.search.go}
            </button>
          </div>
          {lastDl && (
            <p className="home-last">
              <span className="home-last-label">{copy.home.search.lastSeen}</span>
              <RouteLink
                className="home-last-link"
                to={{ ...route, view: "deadlock", dlSection: "player", detail: String(lastDl.accountId) }}
                onNavigate={navigate}
              >
                {lastDl.name} <small>· {copy.games.deadlock}</small>
              </RouteLink>
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
        </ul>
      </section>

      {/* Los juegos ------------------------------------------------------ */}
      <section className="home-games">
        <h2 className="home-h2">{copy.home.games.heading}</h2>

        <ul className="game-list">
          {/* El panel de TFT que abría esta lista salió el 2026-09-15 (ver
              `route.ts`). Sus estilos siguen en `home.css` bajo
              `[data-panel="tft"]`, para el día que vuelva. */}
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

          {/* Valheim salió de "Pronto" el 2026-09-24: la enciclopedia y la Crónica. */}
          <li className="game-panel" data-panel="valheim">
            <div className="game-panel-main">
              <h3 className="game-panel-name">{copy.games.valheim}</h3>
              <p className="game-panel-note">{copy.home.games.valheimLive}</p>
              <div className="game-panel-ctas">
                <RouteLink className="game-cta" to={{ ...route, view: "valheim", vhSection: "home", detail: undefined }} onNavigate={navigate}>
                  {copy.home.games.valheimCta(num(VH_ENTRIES))}
                  <Arrow />
                </RouteLink>
                <RouteLink className="game-cta is-ghost" to={{ ...route, view: "valheim", vhSection: "patches", detail: undefined }} onNavigate={navigate}>
                  {copy.home.games.valheimPatches}
                </RouteLink>
              </div>
            </div>
            <div className="game-panel-figures">
              <p className="game-figure">
                <b>{num(VH_ENTRIES)}</b>
                <span>{copy.home.games.valheimEntries}</span>
              </p>
              <p className="game-figure is-second">
                <b>{vhMeta.counts.biomes}</b>
                <span>{copy.home.games.valheimBiomes}</span>
              </p>
            </div>
          </li>
        </ul>

        {/* Los que vienen, en el orden de la hoja de ruta (2026-09-23). Se
            anuncian y no se enlazan: no existe la ruta todavía. Van chicos y
            en fila, debajo del que ya existe: cuatro paneles del tamaño del de
            Deadlock taparían el único juego que se puede usar. */}
        <h3 className="home-soon-heading">{copy.home.games.soonHeading}</h3>
        <ul className="game-soon-list">
          {(
            [
              ["dota", copy.games.dota, copy.home.games.dota],
              ["poe2", copy.games.poe2, copy.home.games.poe2],
              ["diablo2", copy.games.diablo2, copy.home.games.diablo2],
            ] as const
          ).map(([id, nombre, nota]) => (
            <li className="game-soon" data-panel={id} key={id}>
              <h4 className="game-soon-name">{nombre}</h4>
              <p className="game-soon-note">{nota}</p>
              <span className="game-soon-tag">{copy.home.games.soonCta}</span>
            </li>
          ))}
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
