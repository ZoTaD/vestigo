import type { Lang } from "./i18n";
import { MATCH_TABS_COPY } from "./deadlockMatchTabsCopy";
import { matchAverage, type PlayerCoaching } from "./deadlockCoaching";

/**
 * "Cómo jugó": en qué usó el tiempo y las tres lecturas del coaching con
 * posiciones, comparadas con el promedio de la partida. Va en el desglose de
 * la Repetición y en el informe de cada jugador.
 */

const TONES = ["fighting", "farming", "moving", "dead"] as const;

export default function DeadlockCoachCard({
  coach,
  all,
  lang,
}: {
  coach: PlayerCoaching;
  all: Map<number, PlayerCoaching>;
  lang: Lang;
}) {
  const c = MATCH_TABS_COPY[lang].coach;
  const total = TONES.reduce((s, k) => s + coach.time[k], 0) || 1;
  const avgAlone = matchAverage(all, (x) => x.deathsAlone);
  const fmtAvg = avgAlone.toLocaleString(lang, { maximumFractionDigits: 1 });
  // Mejor o peor que el promedio de la partida, para el color de la línea.
  const tone = (mine: number, avg: number, lowIsGood = true) =>
    Math.abs(mine - avg) < 0.75 ? undefined : (mine < avg) === lowIsGood ? "is-good" : "is-bad";
  const missedAvg = matchAverage(all, (x) => x.fightsMissed);
  const awayAvg = matchAverage(all, (x) => x.structuresAway.length);

  return (
    <div className="dl-coach">
      <h4 className="dl-coach-title">{c.title}</h4>
      <div className="dl-coach-bar" role="img" aria-label={TONES.map((k) => `${c.time[k]} ${Math.round((coach.time[k] / total) * 100)}%`).join(", ")}>
        {TONES.map((k) => (
          <i key={k} className={`is-${k}`} style={{ width: `${(coach.time[k] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="dl-coach-legend">
        {TONES.map((k) => (
          <li key={k}>
            <i className={`is-${k}`} aria-hidden="true" />
            {c.time[k]} <b>{Math.round(coach.time[k] / 60)}′</b>
          </li>
        ))}
      </ul>
      <ul className="dl-coach-lines">
        {coach.deaths > 0 && (
          <li className={tone(coach.deathsAlone, avgAlone)}>{c.alone(coach.deathsAlone, coach.deaths, fmtAvg)}</li>
        )}
        {coach.fightsAlive > 0 && (
          <li className={tone(coach.fightsMissed, missedAvg)}>
            {c.fights(coach.fightsPresent, coach.fightsAlive, coach.fightsLate, coach.fightsMissed)}
          </li>
        )}
        {coach.structuresAlive > 0 && (
          <li className={tone(coach.structuresAway.length, awayAvg)}>{c.away(coach.structuresAway.length, coach.structuresAlive)}</li>
        )}
      </ul>
      <p className="dl-coach-note">{c.note}</p>
    </div>
  );
}
