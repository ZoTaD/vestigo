import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { PUBLISHED_BAND, useHeroes } from "./deadlockData";
import { bandRangeOf } from "./deadlockVsBand";
import { FIT_MIN_MATCHES, heroFit } from "./deadlockHeroFit";
import type { HeroStat } from "./deadlockHeroStats";
import GameImg from "./GameImg";

/**
 * "Te conviene jugar más": hasta tres héroes con los que te va mejor que a la
 * gente de tu rango. La cuenta está en `deadlockHeroFit.ts`.
 *
 * **Sin rango se compara contra la banda publicada**, y la bajada la nombra:
 * una cuenta sin clasificatorias igual tiene carrera, y la tier list que ve
 * cualquiera que entra al sitio es una referencia honesta si se dice cuál es.
 */
export default function DeadlockHeroFitCard({
  stats,
  badge,
}: {
  /** La carrera por héroe, la misma de "Tus héroes". */
  stats: HeroStat[];
  /** `rango*10 + subnivel`; 0 sin rango. */
  badge: number;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.report.heroFit;
  const band = bandRangeOf(badge)?.band ?? PUBLISHED_BAND;
  const meta = useHeroes(band);

  // Sin ningún héroe con el piso de partidas no hay nada que decir, ni
  // siquiera "ninguno": sería hablarle a una cuenta nueva de un número que
  // todavía no puede tener.
  if (!meta || !stats.some((s) => s.matches >= FIT_MIN_MATCHES)) return null;

  const porId = new Map(meta.heroes.map((h) => [h.heroId, h]));
  const lista = heroFit(stats, new Map(meta.heroes.map((h) => [h.heroId, h.winRate])));
  const pct = (x: number) => `${(x * 100).toLocaleString(locale, { maximumFractionDigits: 0 })}%`;

  return (
    <div className="box dl-pcard dl-fit">
      <h2 className="box-title dl-pcard-title">{c.title}</h2>
      <p className="detail-note dl-fit-lead">{c.lead(copy.deadlock.bands[band], FIT_MIN_MATCHES)}</p>

      {lista.length === 0 ? (
        <p className="detail-note">{c.none}</p>
      ) : (
        <ol className="dl-fit-list">
          {lista.map((f) => {
            const h = porId.get(f.heroId);
            const ventaja = Math.round((f.winRate - f.bandWinRate) * 100);
            return (
              <li className="dl-fit-row" key={f.heroId}>
                <GameImg src={h?.img ?? ""} alt="" width={36} height={36} loading="lazy" />
                <span className="dl-fit-hero">
                  <span className="dl-fit-name">{h?.name ?? `#${f.heroId}`}</span>
                  {/* Dos renglones cortos y no uno largo: la tarjeta vive en la
                      columna angosta del perfil y "Vos: 63% en 16 partidas"
                      no entraba. */}
                  <span className="dl-fit-you">{c.you(pct(f.winRate))}</span>
                  <span className="dl-fit-you">{c.games(f.matches)}</span>
                </span>
                <span className="dl-fit-edge">
                  <span className="dl-fit-pts">+{ventaja}</span>
                  <span className="dl-fit-band">{c.band(pct(f.bandWinRate))}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
