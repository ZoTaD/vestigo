import { useCopy } from "./i18n";

/**
 * The front door.
 *
 * Deliberately game-agnostic: it says what Vestigo does for a player, and the
 * games it does it for are a strip near the bottom, so adding the next one is a
 * row rather than a rewrite.
 *
 * It also carries no sample sizes. How many matches back the meta belongs on the
 * meta page, where it qualifies a figure someone is reading; on the front page it
 * would only invite a reader to judge the product by a number that grows on its
 * own every night.
 *
 * The one thing it does state plainly, above the fold, is that all of this
 * happens between games and never during one. That is the line Riot's policy
 * draws, and reviewers should not have to hunt for our answer to it.
 */
export default function Home({
  onTft,
  onDeadlock,
}: {
  onTft: (section: "meta" | "player") => void;
  onDeadlock: () => void;
}) {
  const copy = useCopy();
  const CARDS = ["metrics", "charts", "correlations"] as const;

  return (
    <main className="home">
      <header className="masthead">
        <p className="eyebrow">{copy.home.eyebrow}</p>
        <h1 className="title">
          {copy.home.title}
          <span className="title-break">{copy.home.titleBreak}</span>
        </h1>
        <p className="standfirst">{copy.home.lead}</p>
      </header>

      <section className="home-cards">
        {CARDS.map((key) => (
          <article className="home-card" key={key}>
            <h2 className="home-card-title">{copy.home.cards[key].title}</h2>
            <p className="home-card-body">{copy.home.cards[key].body}</p>
          </article>
        ))}
      </section>

      <section className="home-games">
        <h2 className="home-games-title">{copy.home.games.heading}</h2>
        <ul className="game-list">
          <li className="game-row">
            <span className="game-name">{copy.games.tft}</span>
            <span className="game-note">{copy.home.games.tft}</span>
            <button className="home-cta" onClick={() => onTft("meta")}>
              {copy.home.games.cta}
            </button>
          </li>
          <li className="game-row">
            <span className="game-name">{copy.games.deadlock}</span>
            <span className="game-note">{copy.home.games.deadlock}</span>
            <button className="home-cta" onClick={onDeadlock}>
              {copy.home.games.cta}
            </button>
          </li>
          {/* Dota 2 se anuncia, no se enlaza — mismo criterio que la barra
              superior (Nav.tsx): no existe la ruta todavía, así que un botón
              llevaría a una página vacía. `aria-disabled` en vez de esconderlo,
              para que el anuncio también llegue a quien usa lector de pantalla. */}
          <li className="game-row" data-soon="true">
            <span className="game-name">
              {copy.games.dota}
              <em className="topgame-soon">{copy.games.soon}</em>
            </span>
            <span className="game-note">{copy.home.games.dota}</span>
            <span className="home-cta" aria-disabled="true">
              {copy.home.games.soonCta}
            </span>
          </li>
        </ul>
      </section>

      <section className="home-stance">
        <h2 className="home-stance-title">{copy.home.stance.title}</h2>
        <p className="home-stance-body">{copy.home.stance.body}</p>
      </section>
    </main>
  );
}
