import { useCopy } from "./deadlockCopy";
import { SEASONS, currentSeason, type SeasonPick } from "./deadlockSeasons";

/**
 * Qué temporada mira el perfil.
 *
 * Va pegado al selector de modo y con el mismo `.seg`: son dos lupas sobre el
 * mismo historial, primero la temporada y encima el modo. **Sólo aparece si la
 * cuenta jugó en más de una**: con una sola es un control que no elige nada.
 * Cada pastilla dice cuántas partidas tiene, como las del modo.
 */
export default function DeadlockSeasonPicker({
  pick,
  counts,
  total,
  onChange,
}: {
  pick: SeasonPick;
  counts: Map<number, number>;
  /** Todas las partidas del historial, para "All time". */
  total: number;
  onChange: (pick: SeasonPick) => void;
}) {
  const copy = useCopy();
  const c = copy.deadlock.report.seasons;
  const jugadas = SEASONS.filter((s) => (counts.get(s.id) ?? 0) > 0);
  if (jugadas.length < 2) return null;
  const vigente = currentSeason().id;

  return (
    <div className="seg is-wrap dl-scope dl-season" role="group" aria-label={c.label}>
      {[...jugadas].reverse().map((s) => (
        <button
          key={s.id}
          data-active={pick === s.id}
          aria-pressed={pick === s.id}
          title={c.title(s.id, s.id === vigente)}
          onClick={() => onChange(s.id)}
        >
          {c.name(s.id)}
          <em className="dl-scope-count">{counts.get(s.id)}</em>
        </button>
      ))}
      <button data-active={pick === "all"} aria-pressed={pick === "all"} title={c.allTitle} onClick={() => onChange("all")}>
        {c.all}
        <em className="dl-scope-count">{total}</em>
      </button>
    </div>
  );
}
