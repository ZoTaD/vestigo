/**
 * El bloque "Mercado" de la ficha de una skin o una caja (2026-11-03, etapa 4): una fila por variante que se vende
 * (desgaste × normal, StatTrak, Souvenir) con la mediana de ventas reales de 90, 30 y 7 días y 24 h, las ventas del mes
 * y la línea de tendencia de esas cuatro medianas. Con 14 días o más de serie propia (la foto diaria de Vestigo), además
 * el gráfico del precio más bajo. Sin ninguna venta no se dibuja.
 */
import { useCs2Copy } from "../../cs2Copy";
import { useLoad } from "../../useLoad";
import { loadHistory, loadSales, peekHistory, peekSales, type SaleRow } from "../data";
import { sortRows, useSort } from "../sort";
import { Price, useNum } from "../ui";

/** El orden de las variantes: normal, StatTrak, Souvenir; cada una de FN a BS. */
const ORDER = ["-", "FN", "MW", "FT", "WW", "BS"];
const rank = (v: string) => {
  const [pre, w] = v.includes(" ") ? v.split(" ") : ["", v];
  return (pre === "ST" ? 10 : pre === "SV" ? 20 : 0) + ORDER.indexOf(w);
};
type Key = "variant" | "m90" | "m30" | "m7" | "m24" | "sales";

/**
 * La línea de cuatro puntos (90 → 30 → 7 días → 24 h), verde si termina arriba y roja si abajo. Con menos de tres
 * períodos con ventas no se dibuja: una rayita suelta no dice nada.
 */
export function Trend({ pts }: { pts: (number | null)[] }) {
  const v = pts.filter((p): p is number => p != null);
  if (v.length < 3) return <span className="c2-num is-none">—</span>;
  const min = Math.min(...v), max = Math.max(...v);
  const xy = pts
    .map((p, i) => (p == null ? null : `${(i / (pts.length - 1)) * 92 + 4},${26 - ((p - min) / (max - min || 1)) * 20}`))
    .filter(Boolean)
    .join(" ");
  const up = v[v.length - 1] >= v[0];
  return (
    <svg className={`c2-trend ${up ? "is-up" : "is-down"}`} viewBox="0 0 100 30" width={100} height={30} aria-hidden="true">
      <polyline points={xy} fill="none" strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}

/** El gráfico de la serie diaria propia (precio más bajo por día). */
function History({ serie }: { serie: [string, number][] }) {
  const t = useCs2Copy();
  const num = useNum();
  const v = serie.map((p) => p[1]);
  const min = Math.min(...v), max = Math.max(...v);
  const W = 600, H = 120;
  const xy = serie.map((p, i) => `${(i / (serie.length - 1)) * (W - 8) + 4},${H - 6 - ((p[1] - min) / (max - min || 1)) * (H - 20)}`).join(" ");
  return (
    <figure className="c2-mk-hist">
      <figcaption className="c2-dim">
        {t.mk.history(serie.length)} · {num(min)}–{num(max)} US$
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t.mk.history(serie.length)}>
        <polyline points={xy} fill="none" strokeWidth={2.5} />
      </svg>
    </figure>
  );
}

export default function MarketBlock({ sales, history }: { sales: Record<string, SaleRow> | null | undefined; history: [string, number][] | null | undefined }) {
  const t = useCs2Copy();
  const m = t.mk;
  const num = useNum();
  const rows = Object.entries(sales ?? {}).map(([variant, r]) => ({ variant, r }));
  const { sort, th } = useSort<Key>({ key: "variant", dir: 1 }, []);
  if (!rows.length) return null;
  const shown = sortRows(rows, { variant: (x) => rank(x.variant), m90: (x) => x.r[3], m30: (x) => x.r[2], m7: (x) => x.r[1], m24: (x) => x.r[0], sales: (x) => x.r[4] }, sort);
  // "ST FN" → "StatTrak™ Recién fabricado": el desgaste con su nombre, no la sigla.
  const label = (v: string) => {
    if (v === "-") return t.t.normal;
    const [pre, ab] = v.includes(" ") ? v.split(" ") : ["", v];
    const wear = t.wear[ORDER.indexOf(ab) - 1] ?? ab;
    return pre === "ST" ? `StatTrak™ ${wear}` : pre === "SV" ? `Souvenir ${wear}` : wear;
  };
  return (
    <section className="c2-mk-block">
      <h2 className="c2-h2">{m.block}</h2>
      <p className="c2-lede">{m.blockNote}</p>
      {history && history.length >= 14 && <History serie={history} />}
      <div className="c2-tablewrap">
        <table className="c2-table">
          <thead>
            <tr>
              {th("variant", m.variant)}
              {th("m90", m.m90)}
              {th("m30", m.m30)}
              {th("m7", m.m7)}
              {th("m24", m.m24)}
              {th("sales", m.sales30)}
              <th>
                <span>{m.trend}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ variant, r }) => (
              <tr key={variant}>
                <td>{label(variant)}</td>
                <td data-l={m.m90}>
                  <Price v={r[3]} />
                </td>
                <td data-l={m.m30}>
                  <Price v={r[2]} />
                </td>
                <td data-l={m.m7}>
                  <Price v={r[1]} />
                </td>
                <td data-l={m.m24}>
                  <Price v={r[0]} />
                </td>
                <td data-l={m.sales30} className="c2-num">{num(r[4], 0)}</td>
                <td data-l={m.trend}>
                  <Trend pts={[r[3], r[2], r[1], r[0]]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** El bloque de una ficha por su slug: baja sus ventas y su serie (el prerender ya las trae, ver `preloadRoute`). */
export function MarketBlockFor({ slug }: { slug: string }) {
  const sales = useLoad(`s-${slug}`, () => peekSales(slug), () => loadSales(slug));
  const history = useLoad(`h-${slug}`, () => peekHistory(slug), () => loadHistory(slug));
  return <MarketBlock sales={sales.value} history={history.value} />;
}
