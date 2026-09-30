import { useState, type ReactNode } from "react";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import ShopCard from "./DeadlockShopCard";
import type { Item, Slot } from "./deadlockItemsData";
import { items as itemSlugs } from "./deadlockSlugs";

const PRECIOS = [800, 1600, 3200, 6400] as const;
/** El orden de las columnas de la tienda del juego (arma, espíritu, vitalidad). */
const COLUMNAS: readonly Slot[] = ["weapon", "spirit", "vitality"];
type Vista = "all" | Slot;
const VISTAS: readonly Vista[] = ["all", "weapon", "spirit", "vitality"];

/**
 * La pestaña Objetos vista como la tienda del juego.
 *
 * Desde City Never Sleeps (2026-09-29) la tienda del juego muestra las tres
 * categorías juntas, en columnas con su cabecera ("Stock up! / Big deal! / Feel
 * good!"), y una barra lateral para ver todo o una sola; los escalones llevan
 * los pricetags nuevos ($800 a "Premium $6400 Quality"). Esto es esa tienda, con
 * lo nuestro encima: cada tarjeta lleva su letra de la tier list y su ventaja,
 * la ficha del juego al pasar el mouse, y al tocarla se abre el objeto con sus
 * números debajo (`detalle`).
 */
export default function DeadlockItemsShop({
  items,
  openSlug,
  onOpenItem,
  detalle,
}: {
  items: Item[];
  openSlug?: string;
  onOpenItem: (slug?: string) => void;
  /** El objeto abierto, dibujado por la pestaña con su fila de números. */
  detalle?: ReactNode;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.builder;
  const [vista, setVista] = useState<Vista>("all");
  const columnas = vista === "all" ? COLUMNAS : [vista];

  const tarjetas = (slot: Slot, precio: number) =>
    items
      .filter((it) => it.slot === slot && it.cost === precio)
      .sort((a, b) => a.name.localeCompare(b.name, lang))
      .map((it) => {
        const slug = itemSlugs.toSlug.get(String(it.itemId));
        return (
          <ShopCard
            key={it.itemId}
            item={it}
            grade={it.tier || undefined}
            showValue
            label={it.name}
            onPick={() => onOpenItem(slug === openSlug ? undefined : slug)}
          />
        );
      });

  return (
    <div className="dl-shop2 dl-items-shop" data-view={vista}>
      <nav className="dl-shop2-rail" role="tablist" aria-label={c.shop}>
        {VISTAS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={v === vista}
            data-view={v}
            className="dl-shop2-tab"
            title={v === "all" ? c.all : c.cats[v]}
            onClick={() => setVista(v)}
          >
            <img src={`/deadlock/game/ui/cns/tab-${v}.webp`} alt="" width={46} height={46} />
            <span className="visually-hidden">{v === "all" ? c.all : c.cats[v]}</span>
          </button>
        ))}
      </nav>

      <div className="dl-shop2-paper" role="tabpanel">
        <div className="dl-shop2-heads" data-cols={columnas.length}>
          {columnas.map((s) => (
            <span key={s} className="dl-shop2-head" data-cat={s} aria-hidden="true" />
          ))}
        </div>
        {PRECIOS.map((precio, i) => (
          <section className="dl-shop2-tier" key={precio} data-tier={i + 1} aria-label={precio.toLocaleString(locale)}>
            <img
              className="dl-shop2-price"
              src={`/deadlock/game/ui/cns/pricetag-${i + 1}.webp`}
              alt={precio.toLocaleString(locale)}
              width={i === 3 ? 84 : 96}
              height={i === 3 ? 84 : 58}
            />
            <div className="dl-shop2-row" data-cols={columnas.length}>
              {columnas.map((s) => (
                <ul className="dl-shop2-cell dl-bd-cards" data-cat={s} key={s}>
                  {tarjetas(s, precio)}
                </ul>
              ))}
            </div>
          </section>
        ))}
      </div>
      {detalle}
    </div>
  );
}
