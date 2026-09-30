import type { ReactNode } from "react";
import ShopCard from "./DeadlockShopCard";
import DeadlockShopTree from "./DeadlockShopTree";
import type { Item } from "./deadlockItemsData";
import { items as itemSlugs } from "./deadlockSlugs";

/**
 * La pestaña Objetos vista como la tienda del juego (la tienda nueva de City
 * Never Sleeps, ver DeadlockShopTree), con lo nuestro encima: cada tarjeta lleva
 * su letra de la tier list y su ventaja, la ficha del juego al pasar el mouse, y
 * al tocarla se abre el objeto con sus números debajo (`detalle`).
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
  return (
    <DeadlockShopTree
      items={items}
      renderCard={(it) => {
        const slug = itemSlugs.toSlug.get(String(it.itemId));
        return (
          <ShopCard
            item={it}
            grade={it.tier || undefined}
            showValue
            label={it.name}
            onPick={() => onOpenItem(slug === openSlug ? undefined : slug)}
          />
        );
      }}
    >
      {detalle}
    </DeadlockShopTree>
  );
}
