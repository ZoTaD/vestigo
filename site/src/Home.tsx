import type { CSSProperties, ReactNode } from "react";
import heroesJson from "@deadlock/heroes.json";
import { buildHeroes, patchMovers, PUBLISHED_BAND, type Hero } from "./deadlockData";
import { buildItems as buildDlItems } from "./deadlockItemsData";
import { heroes as heroSlugs, items as dlItemSlugs } from "./deadlockSlugs";
import { useCopy, useLang, useLocale } from "./i18n";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import type { Game } from "./Nav";
import { AOE2_OCULTO, GAME_LOGOS, logoFile } from "./gameGroups";
import pzMeta from "@zomboid/meta.json";
import c2Meta from "@cs2/meta.json";
import c3Meta from "@coh3/meta.json";
import a2Meta from "@aoe2/meta.json";

/**
 * La portada, desde el 2026-11-17: **oscura y para elegir juego** (maqueta A, elegida por ZoTaD).
 *
 * Antes era papel claro con el lema "Every game leaves a trace", "Hoy en el meta", las herramientas y un panel por
 * juego. Ahora, en orden de lectura:
 *
 * 1. "Pick a game" y una línea que dice qué hay.
 * 2. Un mosaico con el arte de cada juego: Deadlock grande (el que más cambia día a día, con el mejor héroe del
 *    momento y su color), el resto alrededor. Cada cuadro entero es el enlace.
 * 3. "Hoy en Deadlock": los cuatro datos del día, cada uno a su ficha.
 *
 * Todo lo que muestra sale de los archivos que ya viajan en el bundle, así que está en el HTML prerenderizado.
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
  const p = copy.home.pick;

  const num = (x: number) => x.toLocaleString(locale);
  const pct = (x: number) =>
    `${(x * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const pts = (x: number) => x.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  /* --- Deadlock: los datos del día --------------------------------------- */
  const heroes = buildHeroes(PUBLISHED_BAND, lang);
  const bestHero = heroes.reduce<Hero | null>((b, h) => (!b || h.winRate > b.winRate ? h : b), null);
  const movers = patchMovers(heroes, 2).up;
  const mostPlayed = heroes.reduce<Hero | null>((b, h) => (!b || h.pickRate > b.pickRate ? h : b), null);
  const dlItems = buildDlItems(PUBLISHED_BAND, lang);
  const bestValue = dlItems.reduce<(typeof dlItems)[number] | null>((b, i) => (!b || i.delta > b.delta ? i : b), null);

  const measuredAt = Date.parse(heroesJson.generatedAt);
  const days = Number.isNaN(measuredAt) ? null : Math.max(0, Math.floor((Date.now() - measuredAt) / 86_400_000));
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
  const go = (to: Partial<Route>): Route => ({ ...route, detail: undefined, ...to }) as Route;

  return (
    <main className="home">
      <section className="home-head">
        <h1 className="home-title">{p.title}</h1>
        <p className="home-lead">{p.lead}</p>
      </section>

      <section className="home-grid" aria-label={copy.games.menu}>
        <Tile
          game="deadlock"
          name={copy.games.deadlock}
          to={go({ view: "deadlock", dlSection: "meta" })}
          navigate={navigate}
          note={p.notes.deadlock(num(heroesJson.matches))}
          tag={p.updated(freshness)}
          style={bestHero?.color ? ({ "--hero": bestHero.color } as CSSProperties) : undefined}
          art={bestHero?.card ? <img className="home-tile-hero" src={bestHero.card} alt="" width={280} height={380} decoding="async" /> : null}
          figures={[
            bestHero && [pct(bestHero.winRate), p.winRateOf(bestHero.name)],
            [num(heroesJson.matches), p.matches],
          ]}
        />
        <Tile
          game="valheim"
          name={copy.games.valheim}
          to={go({ view: "valheim", vhSection: "home" })}
          navigate={navigate}
          note={p.notes.valheim}
          art={<img className="home-tile-emblem" src="/valheim/art/boss_eikthyr.webp" alt="" width={92} height={92} loading="lazy" decoding="async" />}
        />
        <Tile
          game="zomboid"
          name={copy.games.zomboid}
          to={go({ view: "zomboid", pzSection: "home" })}
          navigate={navigate}
          note={p.notes.zomboid}
          figures={[
            [num(pzMeta.counts.items), copy.home.games.zomboidItems],
            [num(pzMeta.counts.recipes + pzMeta.counts.buildRecipes), copy.home.games.zomboidRecipes],
          ]}
        />
        <Tile
          game="stardew"
          name={copy.games.stardew}
          to={go({ view: "stardew", sdSection: "home" })}
          navigate={navigate}
          note={p.notes.stardew}
        />
        <Tile
          game="cs2"
          name={copy.games.cs2}
          to={go({ view: "cs2", c2Section: "cases" })}
          navigate={navigate}
          note={p.notes.cs2}
          figures={[
            [num(c2Meta.counts.skins), copy.home.games.cs2Skins],
            [num(c2Meta.counts.cases), copy.home.games.cs2Cases],
          ]}
        />
        <Tile
          game="coh3"
          name={copy.games.coh3}
          to={go({ view: "coh3", c3Section: "home" })}
          navigate={navigate}
          note={p.notes.coh3}
          figures={[
            [num(c3Meta.counts.units), copy.home.games.coh3Units],
            [num(c3Meta.counts.weapons), copy.home.games.coh3Weapons],
          ]}
        />
        {!AOE2_OCULTO && (
        <Tile
          game="aoe2"
          name={copy.games.aoe2}
          to={go({ view: "aoe2", a2Section: "home" })}
          navigate={navigate}
          note={p.notes.aoe2}
          figures={[
            [num(a2Meta.civs), copy.home.games.aoe2Civs],
            [num(6), copy.home.games.aoe2Leaderboards],
          ]}
        />
        )}
      </section>

      <section className="home-today">
        <h2 className="home-h2">
          {p.today(copy.games.deadlock)}
          <span className="home-h2-note">{copy.shell.measuredAt(freshness)}</span>
        </h2>
        <ul className="home-facts">
          {bestHero && (
            <Fact to={toHero(bestHero)} navigate={navigate} img={bestHero.card} kicker={copy.home.today.bestHero} name={bestHero.name} value={pct(bestHero.winRate)} />
          )}
          {movers[0] && (
            <Fact to={toHero(movers[0])} navigate={navigate} img={movers[0].card} kicker={copy.home.today.rising} name={movers[0].name} value={`+${pts(movers[0].trend ?? 0)}`} />
          )}
          {mostPlayed && (
            <Fact to={toHero(mostPlayed)} navigate={navigate} img={mostPlayed.card} kicker={copy.home.today.mostPlayed} name={mostPlayed.name} value={pct(mostPlayed.pickRate)} />
          )}
          {bestValue ? (
            <Fact
              to={{ ...route, view: "deadlock", dlSection: "items", detail: dlItemSlugs.toSlug.get(String(bestValue.itemId)) }}
              navigate={navigate}
              img={bestValue.img}
              square
              kicker={copy.home.today.bestValue}
              name={bestValue.name}
              value={pct(bestValue.winRateRaw)}
            />
          ) : (
            movers[1] && (
              <Fact to={toHero(movers[1])} navigate={navigate} img={movers[1].card} kicker={p.climbing} name={movers[1].name} value={`+${pts(movers[1].trend ?? 0)}`} />
            )
          )}
        </ul>
      </section>
    </main>
  );
}

/** Un cuadro del mosaico: el arte del juego de fondo (en `home.css`, por `data-game`), su logo, una línea y cifras. */
function Tile({
  game,
  name,
  to,
  navigate,
  note,
  tag,
  art,
  figures,
  style,
}: {
  game: Game;
  name: string;
  to: Route;
  navigate: (route: Route) => void;
  note: string;
  tag?: string;
  art?: ReactNode;
  figures?: (readonly [string, string] | null | undefined)[];
  style?: CSSProperties;
}) {
  const [w, h] = GAME_LOGOS[game];
  const scale = game === "deadlock" ? 1.9 : 1.35;
  return (
    <RouteLink className="home-tile" data-game={game} to={to} onNavigate={navigate} style={style}>
      <span className="home-tile-art" aria-hidden="true" />
      {art}
      {tag && <span className="home-tile-tag">{tag}</span>}
      <span
        className="home-tile-logo"
        aria-hidden="true"
        style={{ "--logo": `url(/logos/${logoFile(game)})`, width: Math.round(w * scale), height: Math.round(h * scale) } as CSSProperties}
      />
      <h3 className="visually-hidden">{name}</h3>
      <span className="home-tile-note">{note}</span>
      {figures && figures.some(Boolean) && (
        <span className="home-tile-figs">
          {figures.filter((f): f is readonly [string, string] => !!f).map(([v, label]) => (
            <span key={label}>
              <b>{v}</b>
              {label}
            </span>
          ))}
        </span>
      )}
    </RouteLink>
  );
}

/** Un dato de "Hoy en Deadlock": retrato, qué es, quién y la cifra. */
function Fact({
  to,
  navigate,
  img,
  square,
  kicker,
  name,
  value,
}: {
  to: Route;
  navigate: (route: Route) => void;
  img: string;
  square?: boolean;
  kicker: string;
  name: string;
  value: string;
}) {
  return (
    <li>
      <RouteLink className="home-fact" to={to} onNavigate={navigate}>
        {img && (
          <img className={square ? "is-square" : undefined} src={img} alt="" width={52} height={square ? 52 : 70} loading="lazy" decoding="async" />
        )}
        <span>
          <small>{kicker}</small>
          <strong>{name}</strong>
          <b>{value}</b>
        </span>
      </RouteLink>
    </li>
  );
}
