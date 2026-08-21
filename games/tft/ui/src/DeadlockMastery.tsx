import { useCopy, useLocale } from "./i18n";
import { useMastery } from "./deadlockMasteryData";

/**
 * Cuánto rinde un héroe según cuántas veces lo jugaste.
 *
 * Vive **adentro de la fila desplegable del héroe**, al lado de la tarjeta de
 * build, y no en una pestaña propia. Eso no es preferencia estética: el
 * 2026-07-30 se publicó `/deadlock/builds` como pestaña aparte y se retiró el
 * mismo día, porque lo que hacía falta era desplegar la fila. La maestría es una
 * propiedad del héroe y va donde vive el héroe.
 *
 * **Si el héroe no tiene curva, el panel no aparece.** Un tramo suelto no dice
 * nada, y el hueco es más honesto que un gráfico de un punto.
 */

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function DeadlockMastery({ heroId }: { heroId: number }) {
  const copy = useCopy();
  const locale = useLocale();
  const hero = useMastery(heroId);
  if (!hero) return null;

  const t = copy.deadlock.mastery;
  const primero = hero.buckets[0];
  const ultimo = hero.buckets[hero.buckets.length - 1];
  const winrates = hero.buckets.map((b) => b.winRate);
  const piso = Math.min(...winrates);
  const techo = Math.max(...winrates);
  // El eje arranca en el tramo más bajo y no en cero: la diferencia interesante
  // son puntos de winrate, y un eje desde cero los aplastaría contra el techo.
  const alto = (wr: number) => (techo > piso ? 0.18 + (0.82 * (wr - piso)) / (techo - piso) : 1);

  return (
    <section className="dl-mastery">
      <h3 className="dl-mastery-title">{t.title}</h3>
      <p className="detail-note dl-mastery-lead">
        {t.lead(pct(primero.winRate), primero.from, pct(ultimo.winRate), ultimo.from)}
      </p>

      <ol className="dl-mastery-curve">
        {hero.buckets.map((b) => (
          <li key={b.from} className="dl-mastery-step">
            <span className="dl-mastery-wr">{pct(b.winRate)}</span>
            <span className="dl-mastery-track">
              <span className="dl-mastery-bar" style={{ height: `${(alto(b.winRate) * 100).toFixed(1)}%` }} />
            </span>
            <span className="dl-mastery-games">{t.games(b.from)}</span>
            <span className="dl-mastery-n">{b.matches.toLocaleString(locale)}</span>
          </li>
        ))}
      </ol>

      {/* Lo que el número NO controla, dicho acá y no escondido: la banda fija el
          nivel de la sala, no la habilidad de la persona. */}
      <p className="detail-note dl-mastery-note">{t.caveat}</p>
    </section>
  );
}
