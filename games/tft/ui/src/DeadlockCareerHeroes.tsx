import { useCopy, useLang } from "./i18n";
import { text } from "./catalog";
import { heroImg, heroName } from "./deadlockReportData";
import type { HeroStat } from "./deadlockHeroStats";

/**
 * Tu carrera con cada héroe: partidas, winrate y **precisión**.
 *
 * **No sigue al filtro de modo, y la tarjeta lo dice en su bajada.** El dato es
 * la carrera entera y viene de otro endpoint; hacerlo seguir al selector sería
 * prometer un recorte que la fuente no hace. Es la misma solución que ya usa la
 * columna de maestría de la pestaña de héroes: cuando una cifra mide otra cosa
 * que las de al lado, se dice ahí mismo y no en una nota al pie.
 *
 * **La precisión es la columna que justifica la tarjeta.** Winrate por héroe lo
 * publican los ocho sitios del género; precisión por héroe en el perfil, ninguno
 * (relevado el 2026-08-25). Y es de las pocas cifras del sitio que habla de la
 * mano del jugador y no de sus decisiones de compra.
 */

/** Cuántas filas se dibujan. */
const TOP = 5;

export default function DeadlockCareerHeroes({ stats }: { stats: HeroStat[] }) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report.career;

  const lista = stats.slice(0, TOP);
  if (lista.length === 0) return null;

  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="dl-card">
      <h2 className="dl-card-title">{c.title}</h2>
      {/* La ventana, dicha antes de los números y no después: quien lee "48%"
          debajo de un perfil filtrado a clasificatorias tiene que saber ya que
          ese 48 no es de las clasificatorias. */}
      <p className="detail-note dl-career-note">{c.lead}</p>

      <div className="dl-career-head" aria-hidden="true">
        <span />
        <span>{c.cols.matches}</span>
        <span>{c.cols.winRate}</span>
        <span>{c.cols.accuracy}</span>
      </div>

      <ul className="dl-career">
        {lista.map((h) => {
          const n = heroName(h.heroId);
          const nombre = n ? text(n, lang, "") : String(h.heroId);
          return (
            <li className="dl-career-row" key={h.heroId}>
              <span className="dl-career-hero">
                <img src={heroImg(h.heroId) ?? ""} alt="" width={26} height={26} loading="lazy" />
                <span className="dl-career-name">{nombre}</span>
              </span>
              <span className="dl-career-num">{h.matches}</span>
              <span className="dl-career-num" title={c.record(h.wins, h.matches - h.wins)}>
                {pct(h.winRate)}
              </span>
              {/* El hueco va con una raya y nunca con un cero: un cero diría
                  "no acertó un tiro", la ausencia dice "no sé". Es la regla que
                  el proyecto ya aplica en la tabla de héroes. */}
              <span className="dl-career-num" title={h.critRate !== null ? c.crit(pct(h.critRate)) : undefined}>
                {h.accuracy !== null ? pct(h.accuracy) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
