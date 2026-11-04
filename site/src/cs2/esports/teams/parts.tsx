/**
 * Piezas de las fichas de la etapa 6b de CS2 (2026-11-03): la bandera (SVG de `flag-icons`, nunca emoji: Windows los
 * muestra como letras), el gráfico de progresión en el ranking de Valve y los mosaicos de mapas con la imagen del mapa.
 */
import { useCs2Copy } from "../../../cs2Copy";
import { useNum } from "../../ui";
import type { MapStat } from "./data";
import { lpSlug } from "./data";

/** La bandera de un país por su código de dos letras; sin código, nada. */
export function Flag({ code, size = 18 }: { code: string | null | undefined; size?: number }) {
  if (!code) return null;
  return <img className="c2-flag" src={`/cs2/flags/${code}.svg`} alt={code.toUpperCase()} width={Math.round(size * 4 / 3)} height={size} loading="lazy" decoding="async" />;
}

const STEPS = [1, 5, 10, 20, 30, 50, 100, 150, 200, 300, 400, 500];

/**
 * Los puestos que lleva el eje: redondos, del 1 al peor puesto (que va siempre), salteando los que quedarían a menos de
 * 16 px del anterior. Con una escala hasta el 253, el 5, el 10 y el 20 se pisaban.
 */
export function rankTicks(max: number, y: (r: number) => number): number[] {
  const out: number[] = [];
  for (const v of STEPS.filter((s) => s < max).concat(max)) {
    if (!out.length || y(v) - y(out[out.length - 1]) >= 16) out.push(v);
    else if (v === max) out[out.length - 1] = max;
  }
  return out;
}

/** El puesto en el mundial mes a mes (el 1 arriba). Con menos de dos meses, nada. */
export function RankChart({ history, label }: { history: { date: string; rank: number }[]; label: string }) {
  if (history.length < 2) return null;
  const W = 640, H = 220, L = 34, R = 14;
  const max = Math.max(10, ...history.map((p) => p.rank));
  const x = (i: number) => L + (i / (history.length - 1)) * (W - L - R);
  const y = (r: number) => 14 + ((r - 1) / (max - 1)) * (H - 44);
  const ticks = rankTicks(max, y);
  const years = history.map((p, i) => [p.date.slice(0, 4), i] as const).filter(([yr, i]) => i === 0 || history[i - 1].date.slice(0, 4) !== yr);
  const last = history[history.length - 1];
  return (
    <svg className="c2-tm-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="c2-tm-grid" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" className="c2-tm-ax">
            {v}
          </text>
        </g>
      ))}
      {years.map(([yr, i]) => (
        <text key={yr} x={x(i)} y={H - 8} className="c2-tm-ax">
          {yr}
        </text>
      ))}
      <polyline points={history.map((p, i) => `${x(i)},${y(p.rank)}`).join(" ")} className="c2-tm-line" />
      <circle cx={x(history.length - 1)} cy={y(last.rank)} r={6} className="c2-tm-dot" />
    </svg>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Los mosaicos de mapas: imagen del mapa de fondo, porcentaje ganado grande y la barra de rondas por lado. */
export function MapTiles({ maps }: { maps: MapStat[] }) {
  const t = useCs2Copy();
  const num = useNum();
  return (
    <ul className="c2-tm-tiles">
      {maps.map((m) => {
        const ct = pct(m.ct_w, m.ct_p), tt = pct(m.t_w, m.t_p);
        return (
          <li key={m.map} className="c2-tm-tile">
            <img src={`/cs2/maps/${lpSlug(m.map)}.webp`} alt="" width={640} height={360} loading="lazy" decoding="async" />
            <div className="c2-tm-tile-in">
              <h3>{m.map}</h3>
              <p className="c2-tm-wr">
                {num((m.won / m.played) * 100, 0)}&#8201;%<small>{m.played === 1 ? t.tm.onePlayed : t.tm.wonOf(m.won, m.played)}</small>
              </p>
              {m.ct_p + m.t_p > 0 && (
                <>
                  <p className="c2-tm-sides">
                    <span>
                      {t.tm.defending} <b>{ct}&#8201;%</b>
                    </span>
                    <span>
                      {t.tm.attacking} <b>{tt}&#8201;%</b>
                    </span>
                  </p>
                  <span className="c2-tm-bar" aria-hidden="true">
                    <i className="is-ct" style={{ flex: ct || 1 }} />
                    <i className="is-t" style={{ flex: tt || 1 }} />
                  </span>
                  <small className="c2-tm-best">{t.tm.stronger(ct >= tt ? "ct" : "t")}</small>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
