/**
 * La lista de Objetos de Rust (2026-10-05): casilleros del inventario con el ícono y el nombre, filtro por categoría y
 * buscador. Todos los objetos van en el HTML (el prerender los escribe): son los enlaces por los que Google llega a cada
 * ficha. El filtro y la búsqueda sólo esconden.
 */
import { useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import type { ItemsList } from "./data";
import { filterRows } from "./filter";

type Nav = (r: Route) => void;

export default function ItemList({ list, route, navigate, missing }: { list: ItemsList; route: Route; navigate: Nav; missing: boolean }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => filterRows(list.rows, cat, query), [list.rows, cat, query]);
  return (
    <main className="rs-main">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(list.rows.length.toLocaleString(locale))}</p>
        {missing && <p className="rs-missing" role="status">{t.missing}</p>}
        <label className="rs-search">
          <span className="rs-hd">{t.search}</span>
          <input type="search" value={query} placeholder={t.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="rs-cats" role="group" aria-label={t.search}>
          <button type="button" className={`rs-cat${cat === null ? " is-on" : ""}`} aria-pressed={cat === null} onClick={() => setCat(null)}>
            {t.all}
          </button>
          {list.cats.map((c) => (
            <button type="button" key={c} className={`rs-cat${cat === c ? " is-on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {t.cats[c] ?? c}
            </button>
          ))}
        </div>
        <p className="rs-count-line">{t.count(rows.length.toLocaleString(locale))}</p>
        {rows.length === 0 && <p className="rs-empty">{t.empty}</p>}
        <ul className="rs-grid">
          {rows.map((r) => {
            const name = (lang === "es" && r.es) || r.en;
            return (
              <li key={r.id}>
                <RouteLink className="rs-cell" to={{ ...route, view: "rust", rsSection: "items", detail: r.slug }} onNavigate={navigate} prefetch="press">
                  <span className="rs-slot">
                    <img src={`/rust/items/${r.id}.webp`} alt="" width={64} height={64} loading="lazy" />
                  </span>
                  <span className="rs-cell-name">{name}</span>
                </RouteLink>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
