import { useCopy, useLang, useLocale } from "./i18n";
import { ConFicha } from "./DeadlockBuildCard";
import type { Item } from "./deadlockItemsData";

export const SHOP = "/deadlock/shop";
const PRECIOS = [800, 1600, 3200, 6400] as const;
const ROMANO = ["", "I", "II", "III", "IV"];
export const escalonDe = (cost: number): number => PRECIOS.indexOf(cost as (typeof PRECIOS)[number]) + 1;

/**
 * Una tarjeta de la tienda, como la del juego: el dibujo a todo el ancho, el
 * nombre abajo y las cintas encima.
 *
 * - "ACTIVO" / "IMBUIR" salen del catálogo (`is_active_item` e `imbue` de la API).
 * - La estrella azul marca lo que trae la build más jugada del héroe.
 * - "ADQUIRIDO" cuando ya está en tu build: la tarjeta se apaga, como en el juego.
 * - La cinta "MEJORA" y el brillo cuando comprarla mejora algo que tenés. En
 *   inglés el juego no trae la cinta con texto, así que se escribe con CSS.
 *
 * `compact` es la casilla de la build: un cuadrado con la esquina del color de
 * la categoría y el escalón en romano, como el inventario del juego.
 */
export default function ShopCard({
  item,
  owned,
  upgrade,
  upgradeOf,
  starred,
  showValue,
  compact,
  label,
  grade,
  onPick,
  liProps,
}: {
  item: Item;
  owned?: boolean;
  upgrade?: boolean;
  upgradeOf?: string;
  /** El texto de la estrella; ausente, no hay estrella. */
  starred?: string;
  showValue?: boolean;
  compact?: boolean;
  label?: string;
  /** La letra de la tier list de objetos (S, A…), arriba a la izquierda. */
  grade?: string;
  onPick: () => void;
  /** Para arrastrarla en el editor de la guía. */
  liProps?: React.LiHTMLAttributes<HTMLLIElement>;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.builder;
  const locale = useLocale();
  const tier = escalonDe(item.cost);
  const v = Math.round(item.delta * 10) / 10;
  const valor = (v >= 0 ? "+" : "−") + Math.abs(v).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <ConFicha
      item={{ itemId: item.itemId, name: item.name, img: item.img, cost: item.cost, slot: item.slot, tier }}
      className={compact ? "dl-bd-card is-compact" : "dl-bd-card"}
      liProps={liProps}
      datos={{
        "data-cat": item.slot,
        "data-tier": tier,
        ...(owned && !compact ? { "data-owned": "" } : {}),
        ...(upgrade && !compact ? { "data-upgrade": "" } : {}),
      }}
      cabecera={
        <>
          {upgradeOf && <p className="dl-slot-when">{c.upgradesYour(upgradeOf)}</p>}
          {starred && <p className="dl-slot-when">{starred}</p>}
          {/* "Mejora para" ya lo dice la ficha del juego, al pie. */}
          <p className="dl-slot-when">{c.value(valor)}</p>
        </>
      }
    >
      <button
        type="button"
        className="dl-bd-card-btn"
        onClick={onPick}
        aria-label={label ?? (owned ? c.remove(item.name) : c.add(item.name))}
        aria-pressed={compact ? undefined : !!owned}
        style={{ backgroundImage: `url(${SHOP}/card_${item.slot}_t${tier}.webp)` }}
      >
        <span className="dl-bd-card-art">
          <img src={item.img} alt="" width={96} height={96} loading="lazy" />
          {!compact && item.active && <span className="dl-bd-tag">{c.activeTag}</span>}
          {!compact && item.imbue && <span className="dl-bd-tag is-imbue">{c.imbueTag}</span>}
        </span>
        {!compact && <span className="dl-bd-card-name">{item.name}</span>}
        {compact && <span className="dl-bd-card-tier" aria-hidden="true">{ROMANO[tier]}</span>}
        {!compact && starred && (
          <span className="dl-bd-star" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="10" height="10">
              <path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5 3.8 13.8l1-4.6L1.3 6l4.7-.5z" fill="#fff" />
            </svg>
          </span>
        )}
        {!compact && owned && <span className="dl-bd-owned" aria-hidden="true">{c.owned}</span>}
        {!compact && upgrade &&
          (lang === "es" ? (
            <img className="dl-bd-upgrade" src={`${SHOP}/upgrade_es.webp`} alt="" width={40} height={39} />
          ) : (
            <span className="dl-bd-upgrade is-text" aria-hidden="true">{c.upgradeSticker}</span>
          ))}
        {grade && !compact && (
          <span className="dl-bd-grade" data-grade={grade} aria-hidden="true">
            {grade}
          </span>
        )}
        {showValue && !compact && (
          <span className="dl-bd-value" data-sign={v >= 1 ? "up" : v <= -1 ? "down" : "flat"}>
            {valor}
          </span>
        )}
      </button>
    </ConFicha>
  );
}
