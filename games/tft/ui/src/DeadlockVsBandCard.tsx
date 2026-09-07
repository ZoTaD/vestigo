// `DeadlockVsBandCard` y no `DeadlockVsBand`: el módulo de datos se llama
// `deadlockVsBand.ts`, y en Windows dos archivos que sólo difieren en
// mayúsculas son el mismo archivo para el compilador (ver DeadlockPeerCard).
import { useCopy, useLocale } from "./i18n";
import { useVsBand } from "./deadlockVsBand";

/**
 * "Vos contra tu banda": seis métricas, tu promedio contra la mediana de los
 * jugadores que juegan en salas de tu banda, y en qué percentil caés.
 *
 * Es la respuesta de Vestigo al "performance rank" de Statlocker y al
 * percentil opaco de Deadlock Labs: el número se dice **contra tu banda y con
 * la mediana al lado**, para que "estás en el 71 %" tenga con qué compararse.
 * Ver docs/design/2026-08-25-que-mas-podemos-hacer-en-deadlock.md, punto 10.
 */
export default function DeadlockVsBandCard({
  accountId,
  badge,
}: {
  accountId: number | null;
  /** `rango*10 + subnivel`; 0 sin rango, y entonces la tarjeta no se dibuja. */
  badge: number;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.report.vsBand;
  const state = useVsBand(accountId, badge);

  if (state.status === "idle") return null;

  const num = (v: number, d: number, key: string) =>
    key === "accuracy"
      ? `${(v * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
      : v.toLocaleString(locale, { maximumFractionDigits: d, minimumFractionDigits: d > 0 ? d : 0 });

  return (
    <div className="dl-card dl-vs">
      <h2 className="dl-card-title">{c.title}</h2>
      {state.status === "loading" && <p className="detail-note">{c.loading}</p>}
      {state.status === "failed" && <p className="detail-note">{c.failed}</p>}
      {state.status === "ready" && (
        <>
          <p className="detail-note dl-vs-lead">{c.lead(copy.deadlock.bands[state.band])}</p>
          <ol className="dl-vs-rows">
            {state.rows.map((r) => (
              <li className="dl-vs-row" key={r.key}>
                <span className="dl-vs-name">{c.metrics[r.key as keyof typeof c.metrics] ?? r.key}</span>
                <span className="dl-vs-mine">{num(r.mine, r.digits, r.key)}</span>
                <span
                  className="dl-vs-track"
                  role="img"
                  aria-label={c.betterThan(r.percentile)}
                  data-tier={r.percentile >= 75 ? "high" : r.percentile <= 25 ? "low" : "mid"}
                >
                  <span className="dl-vs-median" style={{ left: "50%" }} />
                  <span className="dl-vs-dot" style={{ left: `${r.percentile}%` }} />
                </span>
                <span className="dl-vs-pct" data-tier={r.percentile >= 75 ? "high" : r.percentile <= 25 ? "low" : "mid"}>
                  {c.betterThan(r.percentile)}
                </span>
                <span className="dl-vs-median-value">{c.median(num(r.median, r.digits, r.key))}</span>
              </li>
            ))}
          </ol>
          <p className="detail-note dl-vs-note">{c.note}</p>
        </>
      )}
    </div>
  );
}
