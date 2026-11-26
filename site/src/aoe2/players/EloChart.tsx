/**
 * La curva de ELO del perfil de AoE2 (2026-11-20): SVG propio, sin librería. Recibe `[ts, elo]` ordenados.
 */
import { useLocale } from "../../i18n";

const W = 720;
const H = 220;
const PAD = { l: 44, r: 10, t: 12, b: 26 };

export default function EloChart({ points }: { points: readonly [number, number][] }) {
  const locale = useLocale();
  if (points.length < 2) return null;
  const ts = points.map((p) => p[0]);
  const es = points.map((p) => p[1]);
  const [t0, t1] = [Math.min(...ts), Math.max(...ts)];
  const lo = Math.floor((Math.min(...es) - 10) / 50) * 50;
  const hi = Math.ceil((Math.max(...es) + 10) / 50) * 50;
  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (e: number) => PAD.t + (1 - (e - lo) / Math.max(1, hi - lo)) * (H - PAD.t - PAD.b);
  const paso = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  const lineas: number[] = [];
  for (let v = lo; v <= hi; v += paso) lineas.push(v);
  const d = points.map(([t, e], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(e).toFixed(1)}`).join("");
  const fecha = (t: number) => new Date(t * 1000).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const ult = points[points.length - 1];
  return (
    <svg className="a2-elo" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`ELO ${es[0]} → ${ult[1]}`}>
      {lineas.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="a2-elo-grid" />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="a2-elo-ax">
            {v}
          </text>
        </g>
      ))}
      <text x={PAD.l} y={H - 6} className="a2-elo-ax">
        {fecha(t0)}
      </text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" className="a2-elo-ax">
        {fecha(t1)}
      </text>
      <path d={d} className="a2-elo-line" />
      <circle cx={x(ult[0])} cy={y(ult[1])} r={4} className="a2-elo-dot" />
    </svg>
  );
}
