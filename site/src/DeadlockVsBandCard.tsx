// `DeadlockVsBandCard` y no `DeadlockVsBand`: el módulo de datos se llama
// `deadlockVsBand.ts`, y en Windows dos archivos que sólo difieren en
// mayúsculas son el mismo archivo para el compilador (ver DeadlockPeerCard).
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { SHARE_METRICS, type VsRow, type VsState } from "./deadlockVsBand";

/** Una cifra con su formato: las proporciones como porcentaje. */
export function useVsNumber() {
  const locale = useLocale();
  return (v: number, d: number, key: string) =>
    SHARE_METRICS.has(key)
      ? `${(v * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
      : v.toLocaleString(locale, { maximumFractionDigits: d, minimumFractionDigits: d > 0 ? d : 0 });
}

export const tierOf = (pct: number) => (pct >= 75 ? "high" : pct <= 25 ? "low" : "mid");

/** Las filas "vos · barra · mejor que el N % · mediana", compartidas con Rendimiento. */
export function VsRows({ rows }: { rows: VsRow[] }) {
  const copy = useCopy();
  const c = copy.deadlock.report.vsBand;
  const num = useVsNumber();
  return (
    <ol className="dl-vs-rows">
      {rows.map((r) => (
        <li className="dl-vs-row" key={r.key}>
          <span className="dl-vs-name">{c.metrics[r.key as keyof typeof c.metrics] ?? r.key}</span>
          <span className="dl-vs-mine">{num(r.mine, r.digits, r.key)}</span>
          <span className="dl-vs-track" role="img" aria-label={c.betterThan(r.percentile)} data-tier={tierOf(r.percentile)}>
            <span className="dl-vs-median" style={{ left: "50%" }} />
            <span className="dl-vs-dot" style={{ left: `${r.percentile}%` }} />
          </span>
          <span className="dl-vs-pct" data-tier={tierOf(r.percentile)}>
            {c.betterThan(r.percentile)}
          </span>
          <span className="dl-vs-median-value">{c.median(num(r.median, r.digits, r.key))}</span>
        </li>
      ))}
    </ol>
  );
}

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
  state,
}: {
  /** Viene del perfil (`useVsBand`), que lo comparte con los rasgos. */
  state: VsState;
}) {
  const copy = useCopy();
  const c = copy.deadlock.report.vsBand;

  if (state.status === "idle") return null;

  return (
    <div className="box dl-pcard dl-vs">
      <h2 className="box-title dl-pcard-title">{c.title}</h2>
      {state.status === "loading" && <p className="detail-note">{c.loading}</p>}
      {state.status === "failed" && <p className="detail-note">{c.failed}</p>}
      {state.status === "ready" && (
        <>
          <p className="detail-note dl-vs-lead">{c.lead(copy.deadlock.bands[state.band])}</p>
          <VsRows rows={state.rows} />
          <p className="detail-note dl-vs-note">{c.note}</p>
        </>
      )}
    </div>
  );
}
