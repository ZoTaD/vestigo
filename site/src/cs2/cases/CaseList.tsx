/**
 * La lista de cajas (2026-11-03), estética Dust II: imagen, nombre, tipo, fecha, precio, valor esperado y "devuelve"
 * (verde si recupera lo que cuesta abrirla, rojo si no). Cada encabezado ordena; filtro por tipo y buscador; ~200 filas
 * de a tandas.
 */
import { useMemo, useState } from "react";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCs2Copy, type Cs2Kind } from "../../cs2Copy";
import type { CasePrice, CaseRow } from "../data";
import { sortRows, useSort } from "../sort";
import { Img, Pct, Price, useNum, type Nav } from "../ui";

/** El alto de una fila (imagen de 76 px y su relleno), medido en el navegador. */
const ROW = 93;
const KINDS: (Cs2Kind | "all")[] = ["all", "case", "terminal", "souvenir", "package"];
type Key = "name" | "date" | "price" | "ev" | "ret";

export default function CaseList({ rows, prices, route, navigate }: { rows: CaseRow[]; prices: Record<string, CasePrice>; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const num = useNum();
  const [kind, setKind] = useState<Cs2Kind | "all">("case");
  const [q, setQ] = useState("");
  const { sort, th } = useSort<Key>({ key: "date", dir: -1 }, ["name"]);
  const cols = useMemo(
    (): Record<Key, (r: CaseRow) => string | number | null | undefined> => ({
      name: (r) => r.name,
      date: (r) => r.date,
      price: (r) => prices[r.slug]?.price,
      ev: (r) => prices[r.slug]?.ev,
      ret: (r) => prices[r.slug]?.ret,
    }),
    [prices],
  );
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return sortRows(rows.filter((r) => (kind === "all" || r.kind === kind) && (!qq || r.name.toLowerCase().includes(qq))), cols, sort);
  }, [rows, cols, kind, sort, q]);
  return (
    <main className="c2-main">
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabs.cases}</h1>
        <p className="c2-lede">{t.seo.cases.description}</p>
      </header>
      <div className="c2-filters">
        <input type="search" placeholder={t.t.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.t.search} />
        <div className="c2-seg" role="group">
          {KINDS.map((k) => (
            <button type="button" key={k} className={k === kind ? "is-on" : ""} aria-pressed={k === kind} onClick={() => setKind(k)}>
              {k === "all" ? t.t.all : t.kind[k]}
            </button>
          ))}
        </div>
        <span className="c2-dim">{t.t.count(num(shown.length, 0))}</span>
      </div>
      <div className="c2-tablewrap">
        <table className="c2-table">
          <thead>
            <tr>
              {th("name", t.t.caseCol)}
              {th("date", t.t.date)}
              {th("price", t.t.price)}
              {th("ev", t.t.ev)}
              {th("ret", t.t.returns, { title: t.t.returnsHint })}
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
                        {skipSprite(i, 60) ? <Img img={null} w={112} h={76} /> : <Img img={r.img} w={112} h={76} />}
                        <span className="c2-nm-t">
                          <strong>{r.name}</strong>
                          <span className="c2-nm-s">
                            {t.kind[r.kind]} · {t.t.skinsN(r.n)}
                          </span>
                        </span>
                      </RouteLink>
                    </td>
                    <td data-l={t.t.date} className="c2-num c2-dim">{r.date ? r.date.replaceAll("-", "/") : "—"}</td>
                    <td data-l={t.t.price}>
                      <Price v={p?.price} />
                    </td>
                    <td data-l={t.t.ev}>
                      <Price v={p?.ev} />
                    </td>
                    <td data-l={t.t.returns}>{p?.ret != null ? <Pct v={p.ret} d={0} className={p.ret >= 1 ? "is-up" : "is-down"} /> : <span className="c2-num is-none">—</span>}</td>
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
