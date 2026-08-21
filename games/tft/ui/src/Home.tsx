import compsJson from "@data/comps.json";
import heroesJson from "@deadlock/heroes.json";
import { catalog, text } from "./catalog";
import { catalog as dlCatalog } from "./deadlockData";
import { useCopy, useLang, useLocale } from "./i18n";

/**
 * The front door.
 *
 * **It is the one page with its own skin.** Everything else on the site is the
 * códex — gold on midnight — and every game repaints those variables for itself.
 * The home is neither: it is Vestigo's own identity, printed on paper, and the
 * games enter as full-bleed panels each in its own darkness. That is the whole
 * point of the layout below, and why `styles/home.css` exists as a separate
 * sheet scoped to `[data-place="home"]` instead of more rules in `codex.css`.
 *
 * It is also deliberately short: masthead, the games, the footer. Nothing else.
 * A front page that explains the product in three cards is a front page nobody
 * reads; the games are what someone came for, so they start above the fold.
 *
 * **Every figure on it is measured, and none of them is typed here.** They come
 * out of the two files that already ride in the bundle — `comps.json` for TFT and
 * `heroes.json` for Deadlock's published band — so the page cannot drift away
 * from the tier lists it is advertising, and the numbers are in the prerendered
 * HTML rather than arriving after a round trip.
 */
export default function Home({
  onTft,
  onDeadlock,
}: {
  onTft: (section: "meta" | "player") => void;
  onDeadlock: () => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();

  const num = (x: number) => x.toLocaleString(locale);

  /** The strongest comp and the strongest hero, straight from the tier lists. */
  const comp = compsJson.comps[0];
  const hero = heroesJson.heroes[0];

  const compName = text(catalog.champions[comp.carry]?.name, lang, comp.carry);
  const heroName = text(dlCatalog.heroes[String(hero.heroId)]?.name, lang, "");

  const matchesRead = compsJson.sampleSize + heroesJson.matches;

  /**
   * How stale the freshest of the two measurements is.
   *
   * The strip says "measured yesterday" and it has to keep being true on its
   * own: a hardcoded word would be a lie the morning after it shipped, and this
   * is the one number on the page a visitor uses to decide whether to trust the
   * rest of it.
   */
  const measured = [compsJson.generatedAt, heroesJson.generatedAt]
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

  return (
    <main className="home">
      <header className="masthead">
        <p className="eyebrow">{copy.home.eyebrow}</p>
        <h1 className="title">
          {copy.home.title}
          <span className="title-break">{copy.home.titleBreak}</span>
        </h1>

        <div className="home-lede">
          <p className="standfirst">{copy.home.lead}</p>
          {/* El rótulo va antes que la cifra porque en una lista de definiciones
              ése es el orden válido; la hoja los da vuelta con `column-reverse`
              para que se lea el número primero. */}
          <dl className="home-counts">
            <div className="home-count">
              <dt>{copy.home.counts.matches}</dt>
              <dd>{num(matchesRead)}</dd>
            </div>
            <div className="home-count">
              <dt>{copy.home.counts.measured}</dt>
              <dd>{freshness}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="home-games">
        <h2 className="home-games-title">{copy.home.games.heading}</h2>

        <ul className="game-list">
          <li className="game-panel" data-panel="tft">
            <div className="game-panel-main">
              <h3 className="game-panel-name">{copy.games.tft}</h3>
              <p className="game-panel-note">{copy.home.games.tft}</p>
              <button className="home-cta" onClick={() => onTft("meta")}>
                {copy.home.games.cta}
                <Arrow />
              </button>
            </div>
            <div className="game-panel-figures">
              <p className="game-figure">
                <b>{comp.avgPlacement.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                <span>{copy.home.figures.placement(compName)}</span>
              </p>
              <p className="game-figure is-second">
                <b>{num(compsJson.sampleSize)}</b>
                <span>{copy.home.figures.matchesSet(String(catalog.set))}</span>
              </p>
            </div>
          </li>

          <li className="game-panel" data-panel="deadlock">
            <div className="game-panel-main">
              <h3 className="game-panel-name">{copy.games.deadlock}</h3>
              <p className="game-panel-note">{copy.home.games.deadlock}</p>
              <button className="home-cta" onClick={onDeadlock}>
                {copy.home.games.cta}
                <Arrow />
              </button>
            </div>
            <div className="game-panel-figures">
              <p className="game-figure">
                <b>
                  {(hero.winRate * 100).toLocaleString(locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  <i>&#8201;%</i>
                </b>
                <span>{copy.home.figures.winRate(heroName)}</span>
              </p>
              <p className="game-figure is-second">
                <b>{num(heroesJson.matches)}</b>
                <span>{copy.home.figures.matchesBand(copy.home.figures.topBand)}</span>
              </p>
            </div>
          </li>

          {/* Dota 2 se anuncia, no se enlaza — mismo criterio que la barra
              superior (Nav.tsx): no existe la ruta todavía, así que un botón
              llevaría a una página vacía. El panel se dibuja igual, con la cifra
              en blanco, porque un hueco a propósito dice "todavía no" mejor que
              una fila apagada. `aria-disabled` para que el anuncio también
              llegue a quien usa lector de pantalla. */}
          <li className="game-panel" data-panel="dota" data-soon="true">
            <div className="game-panel-main">
              <h3 className="game-panel-name">{copy.games.dota}</h3>
              <p className="game-panel-note">{copy.home.games.dota}</p>
              <span className="home-cta" aria-disabled="true">
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
    </main>
  );
}

/** El único icono de la página. Trazo, no emoji, para que escale con el texto. */
function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h13M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
    </svg>
  );
}
