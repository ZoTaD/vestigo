import type { Lang } from "./i18n";
import { text } from "./localized";
import type { ParsedMatch } from "./deadlockMatch";
import { heroName } from "./deadlockReportData";
import { MATCH_TABS_COPY } from "./deadlockMatchTabsCopy";
import type { StoryFact } from "./deadlockMatchStory";

/**
 * "Por qué ganó…": los hechos de `matchStory` escritos en el idioma de la
 * página. Va arriba de la Repetición (cada hecho lleva a su momento) y en "Tu
 * informe" (sólo texto).
 */

const TEAM = ["Hidden King", "Archmother"] as const;

const mmss = (s: number): string => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export default function DeadlockStoryCard({
  match,
  story,
  lang,
  onPick,
}: {
  match: ParsedMatch;
  story: StoryFact[];
  lang: Lang;
  /** Si viene, cada hecho es un botón que lleva a su momento. */
  onPick?: (f: StoryFact) => void;
}) {
  if (story.length === 0) return null;
  const c = MATCH_TABS_COPY[lang].story;
  const hero = (slot: number) => {
    const p = match.players.find((x) => x.slot === slot);
    const n = p ? heroName(p.heroId) : null;
    return n ? text(n, lang, "") : "?";
  };
  const pts = (v: number) =>
    `${v >= 0 ? "+" : "−"}${(Math.round(Math.abs(v) * 10) / 10).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  const winner = match.winningTeam === 1 ? 1 : 0;

  const line = (f: StoryFact): string => {
    switch (f.kind) {
      case "turn": {
        const [a, b] = f.fight.deaths;
        // Matados por el ganador primero: el ganador perdió los suyos.
        const won = f.winner === 0 ? b : a;
        const lost = f.winner === 0 ? a : b;
        return c.turn(mmss(f.t), TEAM[f.winner], won, lost, f.pts, f.phase);
      }
      case "comeback":
        return c.comeback(TEAM[f.team], Math.round(f.low * 100), mmss(f.t));
      case "control":
        return c.control(TEAM[f.team]);
      case "collapse":
        return c.collapse(TEAM[f.team], f.n, mmss(f.from), mmss(f.to));
      case "boss":
        return c.boss(TEAM[f.team], f.n, mmss(f.t));
      case "carry":
        return c.carry(hero(f.slot), pts(f.v));
      case "sink":
        return c.sink(hero(f.slot), pts(f.v));
      case "farm":
        return c.farm(hero(f.slot), pts(f.v));
    }
  };

  return (
    <div className="dl-story" data-side={winner === 0 ? "amber" : "sapphire"}>
      <h3 className="dl-story-title">{c.title(TEAM[winner])}</h3>
      <ul className="dl-story-list">
        {story.map((f, i) => (
          <li key={i} data-kind={f.kind}>
            {onPick ? (
              <button type="button" onClick={() => onPick(f)} title={c.jump}>
                {line(f)}
              </button>
            ) : (
              line(f)
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
