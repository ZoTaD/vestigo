/**
 * La pestaña Mercado de CS2 (2026-11-03, etapa 4), maqueta A "Pizarra": Suben y Bajan lado a lado y Más vendidas abajo,
 * con ventas reales de Skinport (`prices/market.json`). Período, ventas mínimas y tipo arriba; cada tabla se ordena
 * tocando el encabezado (por defecto, por el cambio o por las ventas). Cada fila lleva a su ficha.
 */
import { useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { useCs2Copy } from "../../cs2Copy";
import { loadMarket, loadPriceDate, peekMarket, peekPriceDate } from "../data";
import { sortRows, useSort } from "../sort";
import { Cs2Loading, Img, Price, useNum, type Nav } from "../ui";
import { change, movers, PERIOD_MEDIANS, type MarketKind, type MarketRow, type Period } from "./movers";

const PERIODS: Period[] = ["7v30", "1v7", "30v90"];
const MIN_SALES = [30, 100, 500];
const KINDS: MarketKind[] = ["all", "skins", "cases"];
type Key = "name" | "now" | "change" | "sales";

function Board({ rows, period, title, tone, initial, route, navigate }: { rows: MarketRow[]; period: Period; title: string; tone?: "up" | "down"; initial: { key: Key; dir: 1 | -1 }; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const m = t.mk;
  const num = useNum();
  const [bi, ni] = PERIOD_MEDIANS[period];
  const { sort, th } = useSort<Key>(initial, ["name"]);
  const shown = sortRows(rows, { name: (r) => r[0], now: (r) => r[ni], change: (r) => change(r, period), sales: (r) => r[8] }, sort);
  return (
    <section className="c2-mk-board">
      <h2 className={`c2-h2${tone ? ` is-${tone}` : ""}`}>{title}</h2>
      {/* Cuatro columnas y el nombre que puede partirse: dos tablas lado a lado entran sin scroll horizontal. */}
      <div className="c2-tablewrap">
        <table className="c2-table c2-mk-table">
          <thead>
            <tr>
              {th("name", m.item)}
              {th("now", `${m.periodBefore[period]} → ${m.periodNow[period]}`, { title: m.price })}
              {th("change", m.change)}
              {th("sales", m.sales)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="c2-dim">
                  {m.none}
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const c = change(r, period);
              const isCase = r[2] === "case";
              return (
                <tr key={r[0]} className={isCase ? "" : `is-${r[2]}`}>
                  <td>
                    <RouteLink className="c2-nm" to={{ ...route, view: "cs2", c2Section: isCase ? "cases" : "skins", detail: r[1] }} onNavigate={navigate}>
                      <Img img={r[1]} w={56} h={38} />
                      <span className="c2-nm-t">
                        <strong>{r[0]}</strong>
                      </span>
                    </RouteLink>
                  </td>
                  <td className="c2-mk-pr">
                    <span className="c2-dim">
                      <Price v={r[bi]} />
                    </span>{" "}
                    → <Price v={r[ni]} />
                  </td>
                  <td>{c == null ? <span className="c2-num is-none">—</span> : <span className={`c2-num c2-mk-ch ${c >= 0 ? "is-up" : "is-down"}`}>{c >= 0 ? "+" : "−"}{num(Math.abs(c) * 100, 0)}&#8201;%</span>}</td>
                  <td className="c2-num">{num(r[8], 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Cs2Market({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const m = t.mk;
  const num = useNum();
  const data = useLoad("market", () => peekMarket() ?? undefined, () => Promise.all([loadMarket(), loadPriceDate()]));
  const [period, setPeriod] = useState<Period>("7v30");
  const [minSales, setMinSales] = useState(100);
  const [kind, setKind] = useState<MarketKind>("all");
  const mv = useMemo(() => (data.value ? movers(data.value, period, minSales, kind) : null), [data.value, period, minSales, kind]);
  if (data.failed) return <Cs2Loading onRetry={data.retry} />;
  if (!mv) return <Cs2Loading />;
  const date = peekPriceDate();
  return (
    <main className="c2-main c2-mk">
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabH1.market}</h1>
        <p className="c2-lede">{t.seo.market.description}</p>
      </header>
      <div className="c2-filters">
        <div className="c2-seg" role="group">
          {PERIODS.map((p) => (
            <button type="button" key={p} className={period === p ? "is-on" : ""} aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {m.period[p]}
            </button>
          ))}
        </div>
        <div className="c2-seg" role="group">
          {KINDS.map((k) => (
            <button type="button" key={k} className={kind === k ? "is-on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {m.kinds[k]}
            </button>
          ))}
        </div>
        <label>
          {m.minSales}
          <select value={minSales} onChange={(e) => setMinSales(Number(e.target.value))}>
            {MIN_SALES.map((n) => (
              <option key={n} value={n}>
                {num(n, 0)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="c2-mk-cols">
        <Board key={`u-${period}`} rows={mv.up} period={period} title={m.up} tone="up" initial={{ key: "change", dir: -1 }} route={route} navigate={navigate} />
        <Board key={`d-${period}`} rows={mv.down} period={period} title={m.down} tone="down" initial={{ key: "change", dir: 1 }} route={route} navigate={navigate} />
      </div>
      <Board key={`t-${period}`} rows={mv.top} period={period} title={m.top} initial={{ key: "sales", dir: -1 }} route={route} navigate={navigate} />
      <p className="c2-note">
        {m.note}
        {date ? ` ${t.home.pricesOf(date)}.` : ""}
      </p>
    </main>
  );
}
