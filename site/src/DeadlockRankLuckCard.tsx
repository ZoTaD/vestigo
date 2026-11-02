import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import RankBadge from "./DeadlockRankBadge";
import { badgeOfScore, type LuckState } from "./deadlockRankLuck";

/**
 * "Suerte de rango": el rango medio de tus compañeros contra el de tus rivales.
 *
 * Dos insignias, una frase con la diferencia y dos líneas con lo que pasó en
 * las partidas desparejas. Es una tarjeta del costado: angosta y baja, para que
 * la columna de al lado de las partidas no termine antes que la lista.
 */
export default function DeadlockRankLuckCard({ state }: { state: LuckState }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.report.luck;

  if (state.status === "idle") return null;

  return (
    <div className="box dl-pcard dl-luck">
      <h2 className="box-title dl-pcard-title">{c.title}</h2>
      {state.status === "loading" && <p className="detail-note">{c.loading}</p>}
      {state.status === "failed" && <p className="detail-note">{c.failed}</p>}
      {state.status === "ready" && !state.luck && <p className="detail-note">{c.thin}</p>}
      {state.status === "ready" && state.luck && (() => {
        const l = state.luck;
        const n = l.matches.length;
        const gap = l.mates - l.enemies;
        const parejo = Math.abs(gap) < 0.25;
        return (
          <>
            <p className="detail-note dl-luck-lead">{c.lead(n)}</p>
            <div className="dl-luck-sides">
              <figure>
                <RankBadge badge={badgeOfScore(l.mates)} height={44} />
                <figcaption>{c.mates}</figcaption>
              </figure>
              <span className="dl-luck-vs" aria-hidden="true">
                vs
              </span>
              <figure>
                <RankBadge badge={badgeOfScore(l.enemies)} height={44} />
                <figcaption>{c.enemies}</figcaption>
              </figure>
            </div>
            <p className="dl-luck-gap" data-sign={parejo ? "even" : gap > 0 ? "up" : "down"}>
              {parejo
                ? c.even
                : (() => {
                    const v = Math.round(Math.abs(gap) * 10) / 10;
                    return c.gap(v.toLocaleString(locale), v === 1, gap > 0);
                  })()}
            </p>
            <ul className="dl-luck-split">
              {l.lower > 0 && <li>{c.lower(l.lower, n, l.lowerWon)}</li>}
              {l.higher > 0 && <li>{c.higher(l.higher, n, l.higherWon)}</li>}
            </ul>
          </>
        );
      })()}
    </div>
  );
}
