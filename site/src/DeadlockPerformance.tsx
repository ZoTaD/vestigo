import { useCopy } from "./deadlockCopy";
import { PERF_GROUPS, compare, type VsRow, type VsState } from "./deadlockVsBand";
import { VsRows, tierOf, useVsNumber } from "./DeadlockVsBandCard";

/**
 * Pestaña Rendimiento del perfil: tus promedios contra los de tu banda, en
 * cinco grupos (pelea, puntería, almas, objetivos, seguir vivo) y con una
 * tarjeta arriba que dice en palabras qué te distingue.
 *
 * Sale de los mismos dos pedidos que "vos contra tu banda" (`useVsBand`): no
 * suma tráfico, sólo lee más claves de la respuesta.
 */

/** Todas las filas de todos los grupos, medidas. */
export function perfRows(state: VsState): { id: (typeof PERF_GROUPS)[number]["id"]; rows: VsRow[] }[] {
  if (state.status !== "ready") return [];
  return PERF_GROUPS.map((g) => ({ id: g.id, rows: compare(state.mine, state.bandFile, g.metrics) })).filter(
    (g) => g.rows.length > 0
  );
}

/**
 * Lo mejor y lo peor contra la banda. Sólo cuenta lo que se aleja de la
 * mediana (≥ 60 o ≤ 40): un 52 % no distingue a nadie.
 */
function standouts(state: VsState, take: { strong: number; weak: number }) {
  const todas = perfRows(state).flatMap((g) => g.rows);
  const strong = todas.filter((r) => r.percentile >= 60).sort((a, b) => b.percentile - a.percentile);
  const weak = todas.filter((r) => r.percentile <= 40).sort((a, b) => a.percentile - b.percentile);
  return { strong: strong.slice(0, take.strong), weak: weak.slice(0, take.weak) };
}

function StandoutList({ rows }: { rows: VsRow[] }) {
  const copy = useCopy();
  const c = copy.deadlock.report;
  const num = useVsNumber();
  return (
    <ul className="dl-perf-list">
      {rows.map((r) => (
        <li key={r.key} className="dl-perf-item" data-tier={tierOf(r.percentile)}>
          <span className="dl-perf-name">{c.vsBand.metrics[r.key as keyof typeof c.vsBand.metrics] ?? r.key}</span>
          <span className="dl-perf-value">{num(r.mine, r.digits, r.key)}</span>
          <span className="dl-perf-line">{c.performance.line(r.percentile)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Lo que te distingue". En el Resumen va corta (2 + 1) y con el enlace a la
 * pestaña; en Rendimiento, larga (3 + 3).
 */
export function DeadlockStandoutCard({ state, compact, onMore }: { state: VsState; compact?: boolean; onMore?: () => void }) {
  const copy = useCopy();
  const c = copy.deadlock.report;
  if (state.status === "idle" || state.status === "failed") return null;
  if (state.status === "loading") {
    return (
      <div className="box dl-pcard dl-perf">
        <h2 className="box-title dl-pcard-title">{c.performance.standoutTitle}</h2>
        <p className="detail-note">{c.vsBand.loading}</p>
      </div>
    );
  }
  const { strong, weak } = standouts(state, compact ? { strong: 2, weak: 1 } : { strong: 3, weak: 3 });
  return (
    <div className="box dl-pcard dl-perf">
      <h2 className="box-title dl-pcard-title">{c.performance.standoutTitle}</h2>
      <p className="detail-note dl-vs-lead">{c.performance.standoutLead(copy.deadlock.bands[state.band])}</p>
      <h3 className="dl-perf-sub">{c.performance.strengths}</h3>
      {strong.length > 0 ? <StandoutList rows={strong} /> : <p className="detail-note">{c.performance.noStrength}</p>}
      <h3 className="dl-perf-sub">{c.performance.weaknesses}</h3>
      {weak.length > 0 ? <StandoutList rows={weak} /> : <p className="detail-note">{c.performance.noWeakness}</p>}
      {onMore && (
        <button type="button" className="dl-perf-more" onClick={onMore}>
          {c.performance.seeAll} →
        </button>
      )}
    </div>
  );
}

/** La pestaña entera: la tarjeta larga y un grupo por tarjeta. */
export default function DeadlockPerformance({ state }: { state: VsState }) {
  const copy = useCopy();
  const c = copy.deadlock.report;
  const grupos = perfRows(state);
  return (
    <>
      <DeadlockStandoutCard state={state} />
      {state.status === "idle" && (
        <div className="box dl-pcard">
          <p className="detail-note">{c.performance.noRank}</p>
        </div>
      )}
      {state.status === "failed" && (
        <div className="box dl-pcard">
          <p className="detail-note">{c.vsBand.failed}</p>
        </div>
      )}
      {grupos.map((g) => (
        <div className="box dl-pcard dl-vs" key={g.id}>
          <h2 className="box-title dl-pcard-title">{c.performance.groups[g.id].title}</h2>
          <p className="detail-note dl-vs-lead">{c.performance.groups[g.id].lead}</p>
          <VsRows rows={g.rows} />
        </div>
      ))}
    </>
  );
}
