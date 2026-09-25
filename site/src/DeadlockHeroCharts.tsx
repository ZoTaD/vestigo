import { useEffect, useRef, useState } from "react";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { dailySplit, type DayPoint } from "./deadlockHeroKitData";
import type { MasteryBucket } from "./deadlockMasteryData";

/**
 * Los tres gráficos de la página de un héroe, en SVG a mano.
 *
 * **Se dibujan al ancho real de su caja**, no con un `viewBox` que se estira: un
 * gráfico de 900 de ancho encogido a un teléfono deja los rótulos en 5 px. El
 * ancho se mide con `ResizeObserver`; en el prerender no hay DOM y se usa uno de
 * escritorio, que el primer efecto corrige.
 */

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Victorias por día, con el parche marcado y el promedio de antes y después. */
export function DailyChart({ daily, patch, name }: { daily: DayPoint[]; patch?: string; name: string }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.numbers;
  const locale = useLocale();
  const { ref, w } = useWidth(820);
  const h = w < 520 ? 220 : 300;

  const pts = daily.map((d) => ({ day: d[0], wr: d[2] / d[1] }));
  if (pts.length < 2) return <div ref={ref} />;

  const pad = { l: 40, r: 12, t: 22, b: 28 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const vals = pts.map((p) => p.wr);
  // El eje se abre a pares de puntos alrededor de los datos, y siempre muestra el 50 %.
  const lo = Math.floor(Math.min(0.5, ...vals) * 50) / 50;
  const hi = Math.ceil(Math.max(0.5, ...vals) * 50) / 50;
  const X = (i: number) => pad.l + (iw * i) / (pts.length - 1);
  const Y = (v: number) => pad.t + (ih * (hi - v)) / (hi - lo || 1);
  const guias: number[] = [];
  for (let g = lo; g <= hi + 1e-9; g += 0.02) guias.push(Math.round(g * 100) / 100);

  const corte = patch?.slice(0, 10);
  const iPatch = corte ? pts.findIndex((p) => p.day >= corte) : -1;
  // La raya va entre el día del parche y el siguiente: no se sabe a qué hora del
  // día cayó cada partida, así que ese día queda de frontera (ver `dailySplit`).
  const xPatch = iPatch > 0 ? X(pts[iPatch].day === corte ? iPatch + 0.5 : iPatch - 0.5) : null;
  const { before, after } = dailySplit(daily, patch);
  const pct = (v: number) => `${(v * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  const fecha = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short" });

  const linea = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.wr).toFixed(1)}`).join(" ");
  const area = `${pad.l},${pad.t + ih} ${linea} ${X(pts.length - 1).toFixed(1)},${pad.t + ih}`;
  const marcas = [0, Math.round((pts.length - 1) / 3), Math.round((2 * (pts.length - 1)) / 3), pts.length - 1];

  return (
    <div ref={ref} className="dl-hp-chart">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t.timelineAria(name)}>
        {guias.map((g) => (
          <g key={g}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={Y(g)}
              y2={Y(g)}
              className={g === 0.5 ? "dl-hp-axis is-mid" : "dl-hp-axis"}
            />
            <text x={pad.l - 8} y={Y(g) + 4} textAnchor="end" className="dl-hp-tick">
              {Math.round(g * 100)}%
            </text>
          </g>
        ))}
        {xPatch !== null && (
          <g>
            <rect x={xPatch} y={pad.t} width={w - pad.r - xPatch} height={ih} className="dl-hp-after" />
            <line x1={xPatch} x2={xPatch} y1={pad.t - 8} y2={pad.t + ih} className="dl-hp-patch" />
            <text x={xPatch + 6} y={pad.t + 4} className="dl-hp-patch-label">
              {t.patch} {fecha(corte!)}
            </text>
          </g>
        )}
        {before !== undefined && xPatch !== null && (
          <g>
            <line x1={pad.l} x2={xPatch} y1={Y(before)} y2={Y(before)} className="dl-hp-avg" />
            <text x={pad.l + 6} y={Y(before) - 7} className="dl-hp-avg-label">
              {t.before} {pct(before)}
            </text>
          </g>
        )}
        {after !== undefined && (
          <g>
            <line x1={xPatch ?? pad.l} x2={w - pad.r} y1={Y(after)} y2={Y(after)} className="dl-hp-avg is-after" />
            <text x={w - pad.r - 4} y={Y(after) + 17} textAnchor="end" className="dl-hp-avg-label is-after">
              {t.after} {pct(after)}
            </text>
          </g>
        )}
        <polygon points={area} className="dl-hp-area" />
        <polyline points={linea} className="dl-hp-line" />
        <circle cx={X(pts.length - 1)} cy={Y(pts[pts.length - 1].wr)} r={4} className="dl-hp-dot" />
        {marcas.map((i, k) => (
          <text
            key={k}
            x={X(i)}
            y={h - 8}
            textAnchor={k === 0 ? "start" : k === marcas.length - 1 ? "end" : "middle"}
            className="dl-hp-tick"
          >
            {fecha(pts[i].day)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Victorias según cuántas partidas lleva el jugador con el héroe. */
export function MasteryBars({ buckets, name }: { buckets: MasteryBucket[]; name: string }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.numbers;
  const locale = useLocale();
  const { ref, w } = useWidth(360);
  const h = 170;
  if (buckets.length === 0) return <div ref={ref} />;

  const gap = 10;
  const bw = (w - gap * (buckets.length - 1)) / buckets.length;
  const vals = buckets.map((b) => b.winRate);
  const lo = Math.min(0.46, Math.floor(Math.min(...vals) * 50) / 50);
  const hi = Math.max(0.56, Math.ceil(Math.max(...vals) * 50) / 50);
  const top = 22;
  const base = h - 36;
  const Y = (v: number) => top + ((base - top) * (hi - v)) / (hi - lo);
  const ultimo = buckets.length - 1;
  const rango = (i: number) => {
    const desde = buckets[i].from;
    const hasta = buckets[i + 1]?.from;
    return hasta !== undefined ? `${desde}–${hasta - 1}` : `${desde}+`;
  };

  return (
    <div ref={ref} className="dl-hp-chart">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t.masteryAria(name)}>
        {buckets.map((b, i) => {
          const x = i * (bw + gap);
          const y = Y(b.winRate);
          return (
            <g key={b.from}>
              <rect x={x} y={y} width={bw} height={base - y} rx={2} className={i === ultimo ? "dl-hp-bar is-top" : "dl-hp-bar"} />
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" className="dl-hp-bar-value">
                {(b.winRate * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
              </text>
              <text x={x + bw / 2} y={base + 16} textAnchor="middle" className="dl-hp-tick">
                {rango(i)}
              </text>
            </g>
          );
        })}
        <line x1={0} x2={w} y1={Y(0.5)} y2={Y(0.5)} className="dl-hp-axis is-mid is-dashed" />
        <text x={0} y={h - 2} className="dl-hp-tick is-faint">
          {t.masteryAxis}
        </text>
      </svg>
    </div>
  );
}
