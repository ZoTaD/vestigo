import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLang, useLocale } from "./i18n";
import { ItemDetailPanel } from "./DeadlockItemCard";
import { catalog } from "./deadlockData";
import { asItem } from "./deadlockBuildsData";
import { text } from "./localized";

/**
 * Cualquier ícono de objeto, con la ficha del juego al pasar el mouse.
 *
 * Es el mismo comportamiento que `ConFicha` le da a los objetos de las builds,
 * para los lugares que sólo tienen el id del objeto: el informe de partida, la
 * ficha de héroe, los cambios recomendados, Vestigo News. Pedido de ZoTaD el
 * 2026-09-23: "al poner el mouse sobre uno aparezca la tarjeta original".
 *
 * La ficha es `ItemDetailPanel`, la misma de la pestaña de objetos (con las
 * texturas del tooltip del juego). Se dibuja en un portal para que ningún
 * `overflow: hidden` la recorte, y se recoloca contra los bordes de la pantalla.
 * Un id que el catálogo no conoce devuelve el ícono tal cual, sin ficha.
 */
export default function ItemTip({
  itemId,
  children,
  className,
  focusable = true,
}: {
  itemId: number;
  children: ReactNode;
  className?: string;
  /** `false` adentro de un botón o enlace: ahí el foco ya lo tiene el padre. */
  focusable?: boolean;
}) {
  const { lang } = useLang();
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);
  const ficha = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const raw = (catalog as unknown as { items: Record<string, CatalogItem> }).items[String(itemId)];

  useLayoutEffect(() => {
    if (!abierto) return;
    const ancla = caja.current?.getBoundingClientRect();
    const f = ficha.current?.getBoundingClientRect();
    if (!ancla || !f) return;
    const margen = 8;
    const left = Math.min(
      Math.max(margen, ancla.left + ancla.width / 2 - f.width / 2),
      window.innerWidth - f.width - margen
    );
    const abajo = ancla.bottom + 6;
    const top = abajo + f.height > window.innerHeight - margen ? Math.max(margen, ancla.top - f.height - 6) : abajo;
    setPos({ top, left });
  }, [abierto]);

  if (!raw) return <span className={className}>{children}</span>;

  const item = asItem({
    itemId,
    name: text(raw.name, lang, ""),
    img: raw.img,
    cost: raw.cost,
    slot: raw.slot,
    tier: raw.tier,
  });

  return (
    <span
      ref={caja}
      className={className ? `dl-itemtip ${className}` : "dl-itemtip"}
      tabIndex={focusable ? 0 : undefined}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
      onFocus={() => setAbierto(true)}
      onBlur={() => setAbierto(false)}
    >
      {children}
      {abierto &&
        createPortal(
          <div ref={ficha} className="dl-slot-pop" role="tooltip" style={{ top: pos.top, left: pos.left }}>
            <ItemDetailPanel item={item} cost={raw.cost.toLocaleString(locale)} />
          </div>,
          document.querySelector<HTMLElement>("[data-theme]") ?? document.body
        )}
    </span>
  );
}

interface CatalogItem {
  name: { en: string; es: string };
  img: string;
  cost: number;
  tier?: number;
  slot: string;
  active?: boolean;
  imbue?: boolean;
}

/**
 * La tarjeta del objeto tal como la dibuja la tienda del juego: el reverso de
 * su categoría y escalón (`card_<slot>_t<n>`), el dibujo arriba a todo el ancho,
 * las cintas ACTIVO / IMBUIR y el nombre en la franja de abajo. Es la misma
 * tarjeta del armador (mismas clases `.dl-bd-card-*`), sin el botón.
 *
 * Con `name={false}` queda sólo la parte del dibujo, para lugares chicos: el
 * nombre ya está al lado, o aparece en la ficha al pasar el mouse.
 */
export function GameCard({
  itemId,
  width,
  img,
  name = true,
  className,
}: {
  itemId: number;
  width: number;
  img?: string;
  name?: boolean;
  className?: string;
}) {
  const { lang } = useLang();
  const raw = (catalog as unknown as { items: Record<string, CatalogItem> }).items[String(itemId)];
  const src = img ?? raw?.img ?? "";
  const tier = raw?.tier ?? 1;
  const slot = raw?.slot ?? "weapon";
  const es = lang === "es";
  return (
    <span
      className={`dl-gcard${name ? "" : " is-art"}${className ? ` ${className}` : ""}`}
      data-tier={tier}
      data-cat={slot}
      style={{ width, backgroundImage: `url(/deadlock/shop/card_${slot}_t${tier}.webp)`, fontSize: width * 0.105 }}
    >
      <span className="dl-bd-card-art">
        {src && <img src={src} alt="" width={width} height={width} loading="lazy" />}
        {name && raw?.active && <span className="dl-bd-tag">{es ? "Activo" : "Active"}</span>}
        {name && raw?.imbue && <span className="dl-bd-tag is-imbue">{es ? "Imbuir" : "Imbue"}</span>}
      </span>
      {name && raw && <span className="dl-bd-card-name">{text(raw.name, lang, "")}</span>}
    </span>
  );
}

/**
 * El objeto como lo muestra el juego: su tarjeta de la tienda (`GameCard`), y
 * con la ficha del juego al pasar el mouse.
 *
 * `tip={false}` donde el objeto ya vive dentro de una ficha o de un `ConFicha`
 * (la ficha no se abre dos veces); `focusable={false}` adentro de un botón.
 */
export function ItemIcon({
  itemId,
  size,
  img,
  tip = true,
  focusable = true,
  className,
}: {
  itemId: number;
  size: number;
  /** La imagen, si el llamador ya la tiene; si no, sale del catálogo. */
  img?: string;
  tip?: boolean;
  focusable?: boolean;
  className?: string;
}) {
  const raw = (catalog as unknown as { items: Record<string, CatalogItem> }).items[String(itemId)];
  // La tarjeta del juego; el nombre sólo cuando entra (a menos de 72 px no se lee).
  const icon = <GameCard itemId={itemId} width={size} img={img} name={size >= 72} className={className} />;
  return tip && raw ? (
    <ItemTip itemId={itemId} focusable={focusable}>
      {icon}
    </ItemTip>
  ) : (
    icon
  );
}
