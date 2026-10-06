/**
 * La pestaña Tiendas de Rust (2026-10-06): la lista de las tiendas de NPC (`/rust/shops`) o las ofertas de una
 * (`/rust/shops/outpost`, `/es/rust/tiendas/puesto-avanzado`). Diseño: docs/design/2026-10-05-rust.md.
 *
 * Los datos no viajan en este chunk (`data.ts`): bajan `shops.json` y la lista de Objetos, una vez para la lista y las
 * fichas. Si la ficha no existe se muestra la lista con una nota, como en Objetos y Cajas.
 */
import type { CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { useLoad } from "../../useLoad";
import RsLoading from "../RsLoading";
import { say } from "../items/data";
import { longestWord } from "../items/format";
import { RefLink } from "../items/parts";
import { loadShops, peekShops, type Shops } from "./data";
import { shopName, type ShopEntry, type ShopRow } from "./model";
import "../../styles/rust-items.css";
import "../../styles/rust-shops.css";

type Nav = (r: Route) => void;

export default function RustShops({ route, navigate }: { route: Route; navigate: Nav }) {
  const shops = useLoad("shops", () => peekShops() ?? undefined, loadShops);
  if (shops.failed) return <RsLoading onRetry={shops.retry} />;
  if (!shops.value) return <RsLoading />;
  const entry = route.detail ? shops.value.bySlug.get(route.detail) : undefined;
  if (entry) return <ShopFicha shops={shops.value} entry={entry} route={route} navigate={navigate} key={entry.key} />;
  return <ShopList shops={shops.value} route={route} navigate={navigate} missing={!!route.detail} />;
}

/** Las cinco tiendas en el orden del archivo (las zonas seguras primero), con cuántas ofertas tienen y lo más caro que venden. */
function ShopList({ shops, route, navigate, missing }: { shops: Shops; route: Route; navigate: Nav; missing: boolean }) {
  const t = useRustCopy().shops;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <main className="rs-main rs-shops-tab">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(shops.index.length.toLocaleString(locale))}</p>
        {missing && <p className="rs-missing" role="status">{t.missing}</p>}
      </section>
      <section className="rs-pnl">
        <ul className="rs-shop-list">
          {shops.index.map((e) => (
            <li key={e.key}>
              <RouteLink className="rs-shop" to={{ ...route, view: "rust", rsSection: "shops", detail: e.slug }} onNavigate={navigate}>
                <span className="rs-shop-head">
                  <b className="rs-shop-name">{shopName(e, lang)}</b>
                  <span className="rs-shop-n">{t.count(e.n, e.n.toLocaleString(locale))}</span>
                </span>
                <span className="rs-shop-icons" aria-hidden="true">
                  {(shops.preview.get(e.key) ?? []).map((it) => (
                    <img key={it.id} src={`/rust/items/${it.id}.webp`} alt="" width={40} height={40} loading="lazy" decoding="async" />
                  ))}
                </span>
              </RouteLink>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

/**
 * Las ofertas de una tienda en dos tablas: lo que se paga con chatarra (de lo más barato a lo más caro) y lo que se paga
 * con otra cosa (agrupado por lo que se paga). El orden sale de `shopRows` (model.ts). Son 46 filas como mucho (el
 * Bandit Camp): van todas de una, sin `LazyRows`.
 */
function ShopFicha({ shops, entry, route, navigate }: { shops: Shops; entry: ShopEntry; route: Route; navigate: Nav }) {
  const c = useRustCopy();
  const t = c.shops;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const name = shopName(entry, lang);
  const rows = shops.rows.get(entry.key) ?? { scrap: [], other: [] };
  return (
    <main className="rs-main rs-ficha rs-shop-ficha">
      <RouteLink className="rs-back" to={{ ...route, view: "rust", rsSection: "shops", detail: undefined }} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <section className="rs-pnl rs-ficha-top rs-shop-top">
        <div className="rs-title">
          <p className="rs-hd">{c.tabs.shops}</p>
          <h1 className="rs-h1" style={{ "--rs-word": longestWord(name) } as CSSProperties}>
            {name}
          </h1>
          <p className="rs-lede">{t.sells(entry.n, num(entry.n))}</p>
        </div>
      </section>
      {rows.scrap.length > 0 && <OrderTable title={t.scrapTable} note={t.scrapNote} rows={rows.scrap} scrap route={route} navigate={navigate} />}
      {rows.other.length > 0 && <OrderTable title={t.otherTable} note={t.otherNote} rows={rows.other} route={route} navigate={navigate} />}
    </main>
  );
}

/** `scrap`: la tabla de lo que se paga con chatarra; en el celular la moneda va sólo con su ícono (lo dice el título). */
function OrderTable({ title, note, rows, scrap = false, route, navigate }: { title: string; note: string; rows: ShopRow[]; scrap?: boolean; route: Route; navigate: Nav }) {
  const c = useRustCopy();
  const t = c.shops;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{title}</h2>
      <p className="rs-ficha-note">{note}</p>
      <table className={`rs-table rs-shop-table${scrap ? " rs-shop-scrap" : ""}`}>
        <thead>
          <tr>
            <th scope="col">{t.item}</th>
            <th scope="col">{t.amount}</th>
            <th scope="col">{t.price}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.item.id}-${r.currency.id}-${r.amount}-${i}`}>
              <th scope="row">
                <RefLink r={r.item} route={route} navigate={navigate}>
                  <img src={`/rust/items/${r.item.id}.webp`} alt="" width={28} height={28} loading="lazy" decoding="async" />
                  <span>{say(r.item.name, lang)}</span>
                </RefLink>
                {r.bp && <em className="rs-tag">{c.items.blueprint}</em>}
              </th>
              <td>× {num(r.amount)}</td>
              <td>
                <RefLink r={r.currency} route={route} navigate={navigate}>
                  <span className="rs-price">{num(r.price)}</span>
                  <img src={`/rust/items/${r.currency.id}.webp`} alt="" width={24} height={24} loading="lazy" decoding="async" />
                  <span className="rs-cur">{say(r.currency.name, lang)}</span>
                </RefLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
