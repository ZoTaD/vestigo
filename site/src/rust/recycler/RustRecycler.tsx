/**
 * La pestaña Reciclador de Rust (2026-10-06): una sola página (`/rust/recycler`, `/es/rust/reciclador`) con lo que da
 * cada objeto que se recicla, en la recicladora que se elija. Es "Reciclaje" de la ficha de un objeto puesto en tabla,
 * con las mismas cuentas (`items/recycle.ts`): la chatarra primero y en su columna, para ordenar por ella ("qué conviene
 * reciclar"), y lo demás al lado. Diseño: docs/design/2026-10-05-rust.md.
 *
 * Son ~780 filas: la tabla va de a tandas (`LazyRows`), y el prerender la escribe entera (en la recicladora de entrada y
 * ordenada por chatarra), que son los enlaces por los que Google llega a cada ficha. La recicladora, el orden y la
 * búsqueda sólo cambian lo que se dibuja.
 */
import { useMemo, useState, type ReactNode } from "react";
import { LazyRows } from "../../LazyRows";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { useLoad } from "../../useLoad";
import RsLoading from "../RsLoading";
import { say, type RecyclerKey } from "../items/data";
import { nb } from "../items/format";
import { loadRecycler, peekRecycler, type RecyclerData } from "./data";
import { DEFAULT_RECYCLER, recycleRows, sortRecycleRows, type RecycleOut, type RecycleRow, type RecycleSort } from "./model";
import "../../styles/rust-items.css";
import "../../styles/rust-recycler.css";

type Nav = (r: Route) => void;

/**
 * El alto de una fila (47 px medidos a 1.400 px: ícono de 28 px y una línea de "también da"), de respaldo hasta que se
 * dibuja la primera tanda, que se mide sola. A 390 px "también da" va una cosa por renglón (~92 px) y manda la medida.
 */
const RS_RECYCLE_ROW = 47;

export default function RustRecycler({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("recycler", () => peekRecycler() ?? undefined, loadRecycler);
  if (data.failed) return <RsLoading onRetry={data.retry} />;
  if (!data.value) return <RsLoading />;
  return <RecyclerTable data={data.value} route={route} navigate={navigate} />;
}

function RecyclerTable({ data, route, navigate }: { data: RecyclerData; route: Route; navigate: Nav }) {
  const c = useRustCopy();
  const t = c.recycler;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  const recyclers = data.file.recyclers;
  const [key, setKey] = useState<RecyclerKey>(DEFAULT_RECYCLER);
  const [sort, setSort] = useState<RecycleSort>("scrap");
  const [query, setQuery] = useState("");
  const eff = recyclers.find((r) => r.key === key)?.eff ?? recyclers[0]?.eff ?? 0;
  const all = useMemo(() => recycleRows(data.file, eff, data.known), [data, eff]);
  const rows = useMemo(() => sortRecycleRows(all, sort, query, lang, locale), [all, sort, query, lang, locale]);
  const pct = Object.fromEntries(recyclers.map((r) => [r.key, nb(c.items.pct(Math.round(r.eff * 100)))])) as Record<RecyclerKey, string>;
  const yieldText = (o: RecycleOut) =>
    o.yield.n === 0 ? nb(c.items.chance(o.yield.pct)) : o.yield.pct ? `× ${num(o.yield.n)} + ${nb(c.items.pct(o.yield.pct))}` : `× ${num(o.yield.n)}`;
  const link = (r: { id: string; slug: string | null; name: RecycleRow["name"] }, children: ReactNode) =>
    r.slug ? (
      // `press`: con ~780 enlaces, precargar cada ficha al pasar el mouse por la tabla sería un pedido por fila.
      <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "items", detail: r.slug }} onNavigate={navigate} prefetch="press">
        {children}
      </RouteLink>
    ) : (
      <span className="rs-ref">{children}</span>
    );
  return (
    <main className="rs-main rs-recycler">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(all.length.toLocaleString(locale))}</p>
        {recyclers.length > 0 && <p className="rs-ficha-note">{t.effNote(pct)}</p>}
      </section>
      <section className="rs-pnl">
        <div className="rs-recycler-tools">
          <div>
            <span className="rs-hd" id="rs-recycler-pick">{t.pick}</span>
            <div className="rs-cats" role="group" aria-labelledby="rs-recycler-pick">
              {recyclers.map((r) => (
                <button type="button" key={r.key} className={`rs-cat${r.key === key ? " is-on" : ""}`} aria-pressed={r.key === key} onClick={() => setKey(r.key)}>
                  {c.items.recyclers[r.key]} <span className="rs-recycler-eff">{pct[r.key]}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="rs-hd" id="rs-recycler-sort">{t.sortBy}</span>
            <div className="rs-cats" role="group" aria-labelledby="rs-recycler-sort">
              {(["scrap", "name"] as const).map((s) => (
                <button type="button" key={s} className={`rs-cat${s === sort ? " is-on" : ""}`} aria-pressed={s === sort} onClick={() => setSort(s)}>
                  {t.sorts[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="rs-search">
          <span className="rs-hd">{c.items.search}</span>
          <input type="search" value={query} placeholder={c.items.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <p className="rs-count-line">{t.count(rows.length, rows.length.toLocaleString(locale))}</p>
        {rows.length === 0 && <p className="rs-empty">{t.empty}</p>}
        <table className="rs-table rs-recycler-table">
          <thead>
            <tr>
              <th scope="col">{t.item}</th>
              <th scope="col">{t.scrap}</th>
              <th scope="col">{t.gives}</th>
            </tr>
          </thead>
          <tbody>
            {/* La clave cambia con la recicladora y el orden: las tandas se arman de nuevo en vez de quedar con el alto de antes. */}
            <LazyRows key={`${key}-${sort}`} items={rows} rowHeight={RS_RECYCLE_ROW} tag="tr" eager render={(r) => (
              <tr key={r.id}>
                <th scope="row">
                  {link(r, <>
                    <img src={`/rust/items/${r.id}.webp`} alt="" width={28} height={28} loading="lazy" decoding="async" />
                    <span>{say(r.name, lang)}</span>
                  </>)}
                </th>
                <td className="rs-recycler-scrap">{r.scrap > 0 ? num(r.scrap) : "—"}</td>
                <td>
                  {r.out.length > 0 && (
                    <ul className="rs-yields">
                      {r.out.map((o) => (
                        <li key={o.id}>
                          {link(o, <>
                            <img src={`/rust/items/${o.id}.webp`} alt="" width={24} height={24} loading="lazy" decoding="async" />
                            <span>{say(o.name, lang)}</span>
                            <b>{yieldText(o)}</b>
                          </>)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            )} />
          </tbody>
        </table>
      </section>
    </main>
  );
}
