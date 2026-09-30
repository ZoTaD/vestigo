import { Fragment, type ReactNode } from "react";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import ShopCard from "./DeadlockShopCard";
import { TIER_CUTS, type Item, type Slot } from "./deadlockItemsData";
import { items as itemSlugs } from "./deadlockSlugs";

const LETRAS = ["S", "A", "B", "C", "D"] as const;
const FAMILIAS: readonly Slot[] = ["weapon", "spirit", "vitality"];

/**
 * La tier list de objetos como tier list (ZoTaD, 2026-09-30): una banda por
 * letra, igual que la de héroes, y adentro las tres familias de la tienda en
 * columnas, cada una del mejor al peor. Contesta de un vistazo "¿qué objetos
 * son S?", que la vista Tienda (ordenada por precio) no contesta.
 *
 * El objeto abierto se ve debajo de su banda, como el héroe abierto.
 */
export default function DeadlockItemsTiers({
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
  const locale = useLocale();
  const c = copy.deadlock.itemsPage;
  const slugDe = (it: Item) => itemSlugs.toSlug.get(String(it.itemId));
  const abierto = openSlug ? items.find((i) => slugDe(i) === openSlug) : undefined;

  const n = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x).toLocaleString(locale, { maximumFractionDigits: 1 });
  const rango: Record<(typeof LETRAS)[number], string> = {
    S: `≥ ${n(TIER_CUTS.S)}`,
    A: `${n(TIER_CUTS.A)} / ${n(TIER_CUTS.S)}`,
    B: `${n(TIER_CUTS.B)} / ${n(TIER_CUTS.A)}`,
    C: `${n(TIER_CUTS.C)} / ${n(TIER_CUTS.B)}`,
    D: `< ${n(TIER_CUTS.C)}`,
  };

  return (
    <div className="dl-itiers">
      <div className="dl-itiers-heads" aria-hidden="true">
        {FAMILIAS.map((f) => (
          <span key={f} className="dl-itiers-head" data-cat={f} />
        ))}
      </div>
      <div className="dl-bands">
        {LETRAS.map((t) => {
          const deLetra = items.filter((i) => i.tier === t);
          if (deLetra.length === 0) return null;
          return (
            <Fragment key={t}>
              <section className="dl-tier dl-itier" data-tier={t} aria-label={`${t} · ${c.tiers.count(deLetra.length)}`}>
                <div className="dl-tier-mark">
                  <span className="dl-tier-letter">{t}</span>
                  <span className="dl-tier-sub">{c.tiers.count(deLetra.length)}</span>
                  <span className="dl-tier-sub">{rango[t]}</span>
                </div>
                <div className="dl-itier-cols">
                  {FAMILIAS.map((f) => (
                    <ul key={f} className="dl-itier-col" data-cat={f}>
                      {deLetra
                        .filter((i) => i.slot === f)
                        .sort((a, b) => b.delta - a.delta)
                        .map((it) => {
                          const slug = slugDe(it);
                          return (
                            <ShopCard
                              key={it.itemId}
                              item={it}
                              showValue
                              label={it.name}
                              onPick={() => onOpenItem(slug === openSlug ? undefined : slug)}
                            />
                          );
                        })}
                    </ul>
                  ))}
                </div>
              </section>
              {abierto?.tier === t && detalle}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
