/**
 * El buscador de la portada de Rust (2026-10-05): escribe y te lleva a la ficha. La lista se pide recién al enfocar el
 * campo (no viaja con la portada); hasta ocho resultados, con Enter abre el primero. En el prerender es sólo el campo.
 */
import { useState } from "react";
import { useLang } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useRustCopy } from "../rustCopy";
import { loadList, peekList, type ListRow } from "./items/data";
import { filterRows } from "./items/filter";

type Nav = (r: Route) => void;

export default function RustSearch({ route, navigate }: { route: Route; navigate: Nav }) {
  const c = useRustCopy();
  const { lang } = useLang();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ListRow[] | null>(() => peekList()?.rows ?? null);
  const want = () => {
    if (!rows) loadList().then((l) => setRows(l.rows), () => undefined);
  };
  const hits = rows && query.trim() ? filterRows(rows, null, query).slice(0, 8) : [];
  const to = (r: ListRow): Route => ({ ...route, view: "rust", rsSection: "items", detail: r.slug });
  return (
    <form
      className="rs-find"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (hits[0]) navigate(to(hits[0]));
      }}
    >
      <label>
        <span className="rs-hd">{c.home.searchLabel}</span>
        <input type="search" value={query} placeholder={c.items.searchPlaceholder} onFocus={want} onChange={(e) => (want(), setQuery(e.target.value))} />
      </label>
      {hits.length > 0 && (
        <ul className="rs-find-hits">
          {hits.map((r) => (
            <li key={r.id}>
              <RouteLink className="rs-ref" to={to(r)} onNavigate={navigate}>
                <img src={`/rust/items/${r.id}.webp`} alt="" width={28} height={28} />
                <span>{(lang === "es" && r.es) || r.en}</span>
              </RouteLink>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
