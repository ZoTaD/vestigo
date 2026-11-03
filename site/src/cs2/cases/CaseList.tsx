/**
 * La lista de cajas (2026-11-03): tabla densa con imagen, nombre, tipo, fecha, precio, valor esperado y "devuelve"
 * (verde si recupera lo que cuesta abrirla, rojo si no). Filtro por tipo, buscador y orden; ~200 filas de a tandas.
 */
import { useMemo, useState } from "react";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCs2Copy, type Cs2Kind } from "../../cs2Copy";
import type { CasePrice, CaseRow } from "../data";
import { Img, Pct, Price, useNum, type Nav } from "../ui";

/** El alto de una fila (imagen de 48 px y su relleno), medido en el navegador. */
const ROW = 61;
const KINDS: (Cs2Kind | "all")[] = ["all", "case", "terminal", "souvenir", "package"];
type Sort = "date" | "return" | "price" | "name";

export function sortCases(rows: CaseRow[], prices: Record<string, CasePrice>, sort: Sort): CaseRow[] {
  const by: Record<Sort, (a: CaseRow, b: CaseRow) => number> = {
    date: (a, b) => (b.date ?? "").localeCompare(a.date ?? ""),
    return: (a, b) => (prices[b.slug]?.ret ?? -1) - (prices[a.slug]?.ret ?? -1),
    price: (a, b) => (prices[b.slug]?.price ?? -1) - (prices[a.slug]?.price ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...rows].sort(by[sort]);
}

export default function CaseList({ rows, prices, route, navigate }: { rows: CaseRow[]; prices: Record<string, CasePrice>; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const num = useNum();
  const [kind, setKind] = useState<Cs2Kind | "all">("case");
  const [sort, setSort] = useState<Sort>("date");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return sortCases(rows.filter((r) => (kind === "all" || r.kind === kind) && (!qq || r.name.toLowerCase().includes(qq))), prices, sort);
  }, [rows, prices, kind, sort, q]);
  return (
    <main className="c2-main">
      <header className="c2-head">
        <h1 className="c2-h1">{t.seo.cases.title}</h1>
        <p className="c2-lede">{t.seo.cases.description}</p>
      </header>
      <div className="c2-filters">
        <input type="search" placeholder={t.t.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.t.search} />
        <div className="c2-seg" role="group">
          {KINDS.map((k) => (
            <button type="button" key={k} className={k === kind ? "is-on" : ""} onClick={() => setKind(k)}>
              {k === "all" ? t.t.all : t.kind[k]}
            </button>
          ))}
        </div>
        <label>
          {t.t.sort}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="date">{t.t.sortDate}</option>
            <option value="return">{t.t.sortReturn}</option>
            <option value="price">{t.t.sortPrice}</option>
            <option value="name">{t.t.sortName}</option>
          </select>
        </label>
        <span className="c2-dim">{t.t.count(num(shown.length, 0))}</span>
      </div>
      <div className="c2-tablewrap">
        <table className="c2-table">
          <thead>
            <tr>
              <th>{t.t.caseCol}</th>
              <th>{t.t.date}</th>
              <th>{t.t.price}</th>
              <th>{t.t.ev}</th>
              <th title={t.t.returnsHint}>{t.t.returns}</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="c2-dim">
                  {t.t.none}
                </td>
              </tr>
            )}
            <LazyRows
              items={shown}
              rowHeight={ROW}
              tag="tr"
              eager
              margin={300}
              render={(r, i) => {
                const p = prices[r.slug];
                return (
                  <tr key={r.slug}>
                    <td>
                      <RouteLink className="c2-nm" to={{ ...route, view: "cs2", c2Section: "cases", detail: r.slug }} onNavigate={navigate} prefetch="press">
                        {skipSprite(i, 60) ? <Img img={null} w={64} h={48} /> : <Img img={r.img} w={64} h={48} />}
                        <span className="c2-nm-t">
                          <span>{r.name}</span>
                          <span className="c2-nm-s">
                            {t.kind[r.kind]} · {t.t.skinsN(r.n)}
                          </span>
                        </span>
                      </RouteLink>
                    </td>
                    <td className="c2-num c2-dim">{r.date ? r.date.replaceAll("-", "/") : "—"}</td>
                    <td>
                      <Price v={p?.price} />
                    </td>
                    <td>
                      <Price v={p?.ev} />
                    </td>
                    <td>{p?.ret != null ? <Pct v={p.ret} d={0} className={p.ret >= 1 ? "is-up" : "is-down"} /> : <span className="c2-num is-none">—</span>}</td>
                  </tr>
                );
              }}
            />
          </tbody>
        </table>
      </div>
    </main>
  );
}
