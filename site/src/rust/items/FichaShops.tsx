/**
 * Dónde se compra un objeto de Rust (2026-10-05; salió de `ItemFicha.tsx` el 2026-10-06). Una línea por oferta: la
 * tienda, cuántos da y a qué precio. Cada tienda enlaza su ficha en Tiendas, con lo demás que vende; el slug sale de
 * `shops.json` (~2 KB con gzip), que se pide aparte: hasta que llega, los nombres van sin enlace.
 */
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { useLoad } from "../../useLoad";
import { loadShopIndex, peekShopIndex } from "../shops/data";
import { say, type Ficha } from "./data";
import type { Nav } from "./parts";

export function ShopsSection({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const shops = useLoad(ficha.shops.length ? "shop-index" : null, () => peekShopIndex() ?? undefined, loadShopIndex).value;
  if (!ficha.shops.length) return null;
  const name = say(ficha.name, lang);
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.shops}</h2>
      <ul className="rs-shops">
        {ficha.shops.map((s, i) => {
          // La ficha nombra la tienda (`shops` de site_data.py), no su clave: se busca por el nombre en inglés.
          const shop = shops?.byName.get(s.shop.en);
          return (
            <li key={i}>
              {shop ? (
                <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "shops", detail: shop.slug }} onNavigate={navigate}>
                  <b>{say(s.shop, lang)}</b>
                </RouteLink>
              ) : (
                <b>{say(s.shop, lang)}</b>
              )}
              <span>{t.shopRow(s.amount, s.bp ? `${name} (${t.blueprint})` : name, s.price, say(s.currency.name, lang))}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
