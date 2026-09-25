import { useCopy } from "./deadlockCopy";
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
 * Es un `.seg`, el mismo control segmentado que elige la banda (dirección A,
 * 2026-09-16): una elección entre pocas, con la elegida rellena.
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
    <div className="seg is-wrap dl-scope" role="group" aria-label={c.label}>
      {MATCH_SCOPES.map((s) => {
        const n = counts[s];
        return (
          <button
            key={s}
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
