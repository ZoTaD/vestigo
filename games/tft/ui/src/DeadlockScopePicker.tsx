import { useCopy } from "./i18n";
import { MATCH_SCOPES, type MatchScope } from "./deadlockMatch";

/**
 * En qué modo mirar el perfil: todas, clasificatorias, normales o pelea
 * callejera.
 *
 * **Manda sobre el perfil entero, no sobre la lista.** Elegir "clasificatorias"
 * cambia también el winrate, el KDA, las almas por minuto, los héroes más
 * jugados y la forma reciente — que es el punto: un winrate que mezcla ranked
 * con pelea callejera no contesta "¿cómo voy?" en ninguno de los dos.
 *
 * **Cada pastilla dice cuántas partidas tiene.** Una opción que no lo dice
 * obliga a apretarla para descubrir que está vacía, y hay cuentas que no
 * jugaron nunca un modo. Las que están en cero se deshabilitan en vez de
 * esconderse: que el modo exista y no lo hayas jugado también es información.
 *
 * Hereda `.dl-band-pills` del selector de banda: es el mismo control —una fila
 * de pastillas, todas visibles— y copiar su CSS sería mantener dos.
 */
export default function DeadlockScopePicker({
  scope,
  counts,
  onChange,
}: {
  scope: MatchScope;
  counts: Record<MatchScope, number>;
  onChange: (scope: MatchScope) => void;
}) {
  const copy = useCopy();
  const c = copy.deadlock.report.scopes;

  return (
    <div className="dl-scope-picker band-controls dl-band-pills" role="group" aria-label={c.label}>
      {MATCH_SCOPES.map((s) => {
        const n = counts[s];
        return (
          <button
            key={s}
            className="dl-band-pill dl-scope-pill"
            data-active={scope === s}
            aria-pressed={scope === s}
            disabled={n === 0}
            title={c.title[s]}
            onClick={() => onChange(s)}
          >
            {c.name[s]}
            <em className="dl-scope-count">{n}</em>
          </button>
        );
      })}
    </div>
  );
}
