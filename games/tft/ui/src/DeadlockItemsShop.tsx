import { useState, type ReactNode } from "react";
import { useCopy, useLang } from "./i18n";
import ShopCard, { SHOP } from "./DeadlockShopCard";
import { SLOTS, type Item, type Slot } from "./deadlockItemsData";
import { items as itemSlugs } from "./deadlockSlugs";

const PRECIOS = [800, 1600, 3200, 6400] as const;

/**
 * La pestaña Objetos vista como la tienda del juego (pedido de ZoTaD, 2026-09-23,
 * con una captura de la tienda "Fairfax" de al lado).
 *
 * Es el mismo catálogo del armador —el lomo con las tres pestañas, el papel de
 * cada categoría con los recuadros de $800 a $6.400 impresos, las tarjetas del
 * juego— sin la parte de armar la build: cada tarjeta lleva su letra de la tier
 * list y su ventaja, la ficha del juego al pasar el mouse, y al tocarla se abre
 * el objeto con sus números debajo de la tienda (`detalle`).
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
  const c = copy.deadlock.builder;
  // Si la URL abre un objeto, la tienda arranca en su categoría.
  const abierto = openSlug ? items.find((i) => itemSlugs.toSlug.get(String(i.itemId)) === openSlug) : undefined;
  const [cat, setCat] = useState<Slot>(abierto?.slot ?? "weapon");
  const enCat = items.filter((i) => i.slot === cat);

  return (
    <div className="dl-bd-shop dl-items-shop">
      <div className="dl-bd-catalog">
        <div className="dl-bd-tabs" role="tablist" aria-label={c.shop}>
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === cat}
              aria-label={c.cats[s]}
              title={c.cats[s]}
              className="dl-bd-tab"
              data-cat={s}
              onClick={() => setCat(s)}
            >
              <img
                src={s === cat ? `${SHOP}/tab_${s}.webp` : `${SHOP}/tabsm_${s}.webp`}
                alt=""
                width={95}
                height={s === cat ? 271 : 93}
              />
            </button>
          ))}
        </div>

        <div className="dl-bd-paper" role="tabpanel" data-cat={cat}>
          {PRECIOS.map((precio, i) => (
            <div className="dl-bd-tier" key={precio} data-tier={i + 1}>
              <span className="dl-bd-price">
                <img src={`${SHOP}/currency.webp`} alt="" width={13} height={24} />
                {precio}
              </span>
              <ul className="dl-bd-cards">
                {enCat
                  .filter((it) => it.cost === precio)
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
                  })}
              </ul>
            </div>
          ))}
        </div>
      </div>
      {detalle}
    </div>
  );
}
