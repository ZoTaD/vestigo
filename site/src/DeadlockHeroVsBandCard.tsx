// `DeadlockHeroVsBandCard` y no `DeadlockHeroVsBand`: los datos viven en
// `deadlockHeroVsBand.ts` y en Windows los dos nombres serían el mismo archivo.
import { useLang } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { text } from "./localized";
import { heroImg, heroName } from "./deadlockReportData";
import GameImg from "./GameImg";
import type { HeroVsState } from "./deadlockHeroVsBand";

/**
 * "Tus héroes contra tu banda": una fila por héroe con el percentil general
 * grande y las cuatro métricas en chico. Cada cifra es "mejor que el N % de tu
 * banda con ese héroe", así que 50 es la mediana y todas se leen igual,
 * muertes incluidas (ahí menos es mejor y el percentil ya viene dado vuelta).
 */

const KEYS = ["souls", "damage", "kda", "deaths"] as const;

export default function DeadlockHeroVsBandCard({ state, band }: { state: HeroVsState; band: string }) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report.heroVs;

  if (state.status === "idle") return null;

  return (
    <div className="box dl-pcard dl-herovs">
      <h2 className="box-title dl-pcard-title">{c.title}</h2>
      <p className="detail-note">{c.lead(band)}</p>
      {state.status === "loading" && <p className="detail-note">{c.loading}</p>}
      {state.status === "failed" && <p className="detail-note">{c.failed}</p>}
      {state.status === "ready" && state.rows.length === 0 && <p className="detail-note">{c.none}</p>}
      {state.status === "ready" && state.rows.length > 0 && (
        <>
          <div className="dl-herovs-head" aria-hidden="true">
            <span />
            <span>{c.overall}</span>
            {KEYS.map((k) => (
              <span key={k} title={c.colsFull[k]}>
                {c.cols[k]}
              </span>
            ))}
          </div>
          <ul className="dl-herovs-rows">
            {state.rows.map((r) => {
              const n = heroName(r.heroId);
              return (
                <li key={r.heroId}>
                  <span className="dl-herovs-hero" title={c.matches(r.matches)}>
                    <GameImg src={heroImg(r.heroId) ?? ""} alt="" width={26} height={26} loading="lazy" decoding="async" />
                    <span className="dl-herovs-name">{n ? text(n, lang, "") : r.heroId}</span>
                  </span>
                  <b className="dl-herovs-overall" data-tone={tone(r.overall)}>
                    {r.overall}
                  </b>
                  {r.percentiles.map((p, i) => (
                    <span
                      key={KEYS[i]}
                      className="dl-herovs-p"
                      data-tone={p === null ? undefined : tone(p)}
                      title={c.colsFull[KEYS[i]]}
                    >
                      {p ?? "—"}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Tres tonos alrededor de la mediana: por encima, parejo y por debajo. */
function tone(p: number): "up" | "flat" | "down" {
  return p >= 60 ? "up" : p <= 40 ? "down" : "flat";
}
