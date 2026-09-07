import { useMemo } from "react";
import { useCopy, useLang, useLocale } from "./i18n";
import { text } from "./localized";
import { rankLabel, rankOf } from "./deadlockReportData";
import { trailOf, type RankPoint } from "./deadlockRankHistory";

// `DeadlockRankTrail` y no `DeadlockRankHistory`: el módulo de datos se llama
// `deadlockRankHistory.ts`, y en Windows dos archivos que sólo difieren en
// mayúsculas son el mismo archivo para el compilador (ver DeadlockVsBandCard).
/**
 * "Rango en el tiempo": tu rango después de cada clasificatoria de la
 * temporada, como una línea. Es el par del "LP en el tiempo" de TFT, y sigue
 * sus mismas reglas: una sola serie, así que sin leyenda —el título la nombra—;
 * la cifra neta arriba, en el par bueno/malo; rótulos directos sólo en las
 * puntas, porque un número en cada punto convierte una tendencia en una tabla.
 *
 * Lo que agrega sobre TFT son **los cortes de división**: una línea punteada
 * donde empieza Oráculo, rotulada, para que el recorrido se lea contra la
 * escalera y no contra un eje mudo. Sólo los cortes que el recorrido cruza.
 *
 * **La línea va en SVG y los puntos en HTML.** El SVG se estira con
 * `preserveAspectRatio="none"` para ocupar la tarjeta, y un círculo estirado es
 * una elipse; el trazo se salva con `vector-effect`, los puntos no. Como
 * elementos posicionados por porcentaje quedan redondos y, de paso, con su
 * `title` nativo al pasar el mouse.
 *
 * El eje horizontal es **la partida, no la fecha**: la serie es "después de
 * cada clasificatoria", y espaciar por tiempo apretaría en un pixel las diez
 * partidas de un sábado y estiraría la semana sin jugar, que no dice nada del
 * rango. Las fechas van en la frase y en cada punto.
 */

const W = 100;
const H = 40;
/** Aire a los costados, en unidades del viewBox, para que los puntos de las puntas no se corten. */
const PAD_X = 2;
/** Más puntos que esto se funden en la línea: se dibujan las puntas y el pico. */
const MAX_DOTS = 60;

export default function DeadlockRankTrail({ points }: { points: RankPoint[] }) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.report.rankHistory;
  const trail = useMemo(() => trailOf(points), [points]);
  if (!trail) return null;

  const { first, last, peak, net, matches, lo, hi, boundaries } = trail;
  const n = trail.points.length;
  const span = hi - lo;
  const xOf = (i: number) => PAD_X + (i / (n - 1)) * (W - PAD_X * 2);
  const yOf = (score: number) => H - ((score - lo) / span) * H;
  const path = trail.points.map((p, i) => `${xOf(i).toFixed(2)},${yOf(p.score).toFixed(2)}`).join(" ");

  const name = (badge: number) => {
    const r = rankOf(badge);
    return r ? rankLabel(r, lang) : String(badge);
  };
  const division = (badge: number) => {
    const r = rankOf(badge);
    return r ? text(r.name, lang, "") : String(badge);
  };
  const day = (s: number) => new Date(s * 1000).toLocaleDateString(locale, { day: "numeric", month: "short" });

  const drawn = n <= MAX_DOTS ? trail.points.map((p, i) => ({ p, i })) : [
    { p: first, i: 0 },
    { p: last, i: n - 1 },
  ];
  const peakIndex = peak ? trail.points.indexOf(peak) : -1;
  if (peak && n > MAX_DOTS) drawn.push({ p: peak, i: peakIndex });

  const trend = net > 0 ? "up" : net < 0 ? "down" : "flat";

  /**
   * De qué lado va el rótulo de cada corte: **del que la línea queda más
   * lejos.** Quien subió termina arriba a la derecha, justo donde un rótulo
   * a la derecha se le pone encima; quien bajó, al revés. Se mira el promedio
   * de la línea en el quinto de cada punta y se elige la punta más despejada.
   */
  const edge = Math.max(1, Math.round(n / 5));
  const mean = (ps: RankPoint[]) => ps.reduce((a, p) => a + p.score, 0) / ps.length;
  const leftMean = mean(trail.points.slice(0, edge));
  const rightMean = mean(trail.points.slice(-edge));
  const sideOf = (score: number) =>
    Math.abs(leftMean - score) > Math.abs(rightMean - score) ? "left" : "right";

  return (
    <div className="dl-card dl-trail">
      <h2 className="dl-card-title">{c.title}</h2>
      <p className="detail-note dl-trail-lead">{c.lead}</p>

      <p className="dl-trail-net" data-trend={trend}>
        <b>{c.net(net)}</b>
        <span>{c.since(matches, day(first.startTime))}</span>
      </p>

      <div className="dl-trail-plot">
        <svg
          className="dl-trail-chart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={c.alt(name(first.badge), name(last.badge))}
        >
          {boundaries.map((b) => (
            <line
              key={b.badge}
              className="dl-trail-cut"
              x1={0}
              x2={W}
              y1={yOf(b.score).toFixed(2)}
              y2={yOf(b.score).toFixed(2)}
            />
          ))}
          <polyline className="dl-trail-line" points={path} />
        </svg>

        {boundaries.map((b) => (
          <span
            key={b.badge}
            className="dl-trail-cut-label"
            data-side={sideOf(b.score)}
            style={{ top: `${((yOf(b.score) / H) * 100).toFixed(2)}%` }}
            aria-hidden="true"
          >
            {division(b.badge)}
          </span>
        ))}

        {drawn.map(({ p, i }) => (
          <span
            key={p.matchId}
            className={`dl-trail-dot${i === 0 || i === n - 1 ? " is-end" : ""}${i === peakIndex ? " is-peak" : ""}`}
            style={{
              left: `${((xOf(i) / W) * 100).toFixed(2)}%`,
              top: `${((yOf(p.score) / H) * 100).toFixed(2)}%`,
            }}
            title={c.point(name(p.badge), day(p.startTime))}
          />
        ))}
      </div>

      {/* Rótulos directos, sólo en las puntas; el pico, si quedó atrás, entre las dos. */}
      <p className="dl-trail-ends">
        <span>{name(first.badge)}</span>
        {peak && <span className="dl-trail-peak">{c.peak(name(peak.badge))}</span>}
        <span>{name(last.badge)}</span>
      </p>
    </div>
  );
}
