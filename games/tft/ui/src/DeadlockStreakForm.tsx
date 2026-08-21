import { useCopy } from "./i18n";
import { RANKED_MIN, type Corpus, type Streak, type Form } from "./deadlockMatch";

/**
 * La racha actual y la forma reciente del jugador.
 *
 * Aparte de `Profile` porque es una unidad que no depende de la identidad del
 * jugador ni de a qué héroe filtró la lista de partidas: las tres piezas
 * —racha, forma y de qué corpus salen— siempre miran `rankedCorpus`. "Una
 * racha 'de Lash' salteando las partidas del medio no es una racha, es una
 * selección" (ver el diseño), así que este componente ni recibe el filtro de
 * héroe como prop.
 *
 * Se separó de `DeadlockPlayer.tsx` para no cruzar las ~450 líneas que fija el
 * encargo: el archivo ya tenía 312 antes de este trabajo.
 */
export default function DeadlockStreakForm({
  corpus,
  streak,
  forma,
}: {
  corpus: Corpus;
  streak: Streak | null;
  forma: Form | null;
}) {
  const copy = useCopy();
  const c = copy.deadlock.report.streakForm;

  if (!forma) return null;

  return (
    <div className="dl-rep-form">
      <span className="dl-rep-form-title">{c.title}</span>
      {streak && (
        <p className={`dl-rep-streak ${streak.won ? "is-win" : "is-loss"}`}>
          {streak.won ? c.streakWin(streak.length) : c.streakLoss(streak.length)}
        </p>
      )}
      <div className="dl-rep-form-row">
        {/* El récord es el texto accesible; la tira de abajo es decorativa y
            repite lo mismo con marcas, más reciente a la izquierda. */}
        <span className="dl-rep-form-record">
          {forma.wins}-{forma.losses}
        </span>
        <span className="dl-rep-form-window">{c.window(forma.results.length)}</span>
        <span className="dl-rep-form-strip" aria-hidden="true">
          {forma.results.map((won, i) => (
            <span key={i} className={`dl-rep-form-mark ${won ? "is-win" : "is-loss"}`} />
          ))}
        </span>
      </div>
      {/**
       * De qué corpus salen los números, y **con el modo elegido manda el
       * modo**: decir "sobre 6 clasificatorias" mientras el perfil está filtrado
       * a pelea callejera sería describir otra medición.
       */}
      <p className="dl-rep-corpus-note">
        {corpus.scope !== "all"
          ? c.scoped[corpus.scope](corpus.rows.length)
          : corpus.fallback
            ? c.fallback(corpus.ranked, RANKED_MIN)
            : c.ranked(corpus.ranked)}
      </p>
    </div>
  );
}
