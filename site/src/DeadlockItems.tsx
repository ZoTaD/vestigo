import { useState } from "react";
import SectionHead from "./SectionHead";
import Chevron from "./Chevron";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import {
  useItems,
  typeIconUrl,
  soulIcon,
  scatterOf,
  shopMap,
  COSTS,
  OPEN_COSTS,
  type Item,
  type Slot,
} from "./deadlockItemsData";
import { UsageVsEdge, ShopHeatmap, Callouts } from "./DeadlockItemCharts";
import { ItemDetailPanel } from "./DeadlockItemCard";
import { type BandId } from "./deadlockData";
import { items as itemSlugs } from "./deadlockSlugs";
import { ItemIcon } from "./DeadlockItemTip";
import DeadlockItemsShop from "./DeadlockItemsShop";

/**
 * La tier list de ítems de Deadlock.
 *
 * Comparte el esqueleto de la tier list de héroes —`.tool-head`, grupos que se
 * pliegan, chips que sólo aparecen cuando hay algo que decir— porque es el mismo
 * producto contestando una pregunta hermana. Lo que cambia es el eje: allá la
 * lista se parte por letra de tier, acá **por precio**, porque la pregunta que uno
 * se hace en la tienda del juego es "tengo N almas, ¿qué compro?".
 *
 * Archivo aparte de `Deadlock.tsx` a propósito: ese ya tiene dos vistas y 400
 * líneas, y una tercera lo volvería difícil de sostener.
 */

const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

/**
 * El delta con dos decimales y signo, que es el número grande de cada fila.
 *
 * Dos decimales y no uno: la diferencia entre +0,79 y +0,80 es la que separa un
 * A de un B, y redondear a una décima haría que dos ítems con la misma cifra en
 * pantalla cayeran en tiers distintos.
 */
const delta = (n: number): string => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;

const TIER_ORDER = ["S", "A", "B", "C", "D"];


/**
 * Una fila de objeto, dirección A del rediseño (2026-09-16).
 *
 * Una grilla fija —letra, ícono, nombre, tres cifras, flecha— que se alinea
 * con los rótulos de columna del encabezado del grupo, así las cifras se leen
 * como tabla y no hace falta repetir "Edge / Win rate / Pick rate" en cada
 * fila. El estante ya no pinta un filo a la izquierda: va como palabra, en el
 * color del estante.
 */
function ItemRow({
  item,
  base,
  cost,
  open,
  onToggle,
}: {
  item: Item;
  base: number;
  cost: string;
  open: boolean;
  onToggle: () => void;
}) {
  const copy = useCopy();
  const c = copy.deadlock.itemsPage;
  const sign = item.delta > 0 ? "up" : item.delta < 0 ? "down" : "flat";

  return (
    <li className="dl-irow" data-thin={item.thinData === true} data-open={open}>
      <button
        className="dl-irow-btn"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={c.detail.toggle(item.name)}
      >
        <span className="dl-irow-tier" aria-hidden="true">
          {item.tier}
        </span>

        <span className="dl-irow-face">
          {item.img ? (
            <ItemIcon itemId={item.itemId} img={item.img} size={40} focusable={false} />
          ) : (
            <span className="dl-portrait-fallback">{item.name.slice(0, 2)}</span>
          )}
        </span>

        <span className="dl-irow-id">
          <span className="dl-irow-name">{item.name}</span>
          <span className="dl-irow-meta">
            <span className="dl-irow-slot" data-slot={item.slot}>
              {c.slots[item.slot as Slot]}
            </span>
            {/* Qué da el ítem, con el ícono del propio juego. No es el estante:
                medido, 57 de 156 dan más de un tipo y hay ítems del estante de
                vitalidad que dan daño de espíritu. */}
            {item.types.map((t) => (
              <img
                key={t}
                className="dl-type"
                src={typeIconUrl(t)}
                alt={c.types[t as keyof typeof c.types] ?? t}
                title={c.types[t as keyof typeof c.types] ?? t}
                width={16}
                height={16}
                loading="lazy"
              />
            ))}
          </span>
        </span>

        {/* El rótulo de cada cifra va en el encabezado del grupo; acá queda
            oculto a la vista y presente para el lector de pantalla, y en
            teléfono —donde no hay encabezado de columnas— se muestra. */}
        <span className="dl-irow-nums">
        <span className="dl-irow-num is-edge" data-sign={sign} title={c.deltaWhy(delta(item.delta), pct(base))}>
          {delta(item.delta)}
          <small className="dl-irow-lab">{c.stats.delta}</small>
        </span>
        <span className="dl-irow-num">
          {pct(item.winRateRaw)}
          <small className="dl-irow-lab">{c.stats.winRate}</small>
        </span>
        <span className="dl-irow-num is-dim">
          {pct(item.pickRate)}
          <small className="dl-irow-lab">{c.stats.pickRate}</small>
        </span>
        </span>

        <Chevron className="dl-irow-chev" />
      </button>

      {/* La ficha se monta sólo al abrir. Con 156 filas, montarlas todas sería
          pedir el archivo de fichas en cuanto carga la página, que es
          exactamente lo que este reparto evita. */}
      {open && (
        <div className="dl-irow-fold">
          <ItemDetailPanel item={item} cost={cost} />
        </div>
      )}
    </li>
  );
}

/**
 * Un precio que se abre y se cierra: una caja con el precio, lo que gana el
 * promedio de ese precio y cuántos objetos hay, y adentro las filas.
 *
 * La animación es `grid-template-rows: 0fr → 1fr` sobre un contenedor con
 * `overflow: hidden`: es la única forma de animar hacia "lo que mida el
 * contenido" sin que JavaScript mida nada. El contenido **se monta siempre**,
 * aunque esté plegado, así Ctrl+F lo encuentra y Google lo indexa.
 */
function CostGroup({
  cost,
  items,
  base,
  open,
  onToggle,
  openSlug,
  onOpenItem,
}: {
  cost: number;
  items: Item[];
  base: number;
  open: boolean;
  onToggle: () => void;
  /** El slug del ítem con la ficha abierta, si hay uno. Vive en la URL. */
  openSlug?: string;
  onOpenItem: (slug?: string) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.itemsPage;
  const precio = cost.toLocaleString(locale);
  const alma = soulIcon();

  return (
    <section className="dl-shelf" data-cost={cost} data-open={open}>
      <button
        className="dl-shelf-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={c.costGroup(precio, items.length)}
      >
        <span className="dl-shelf-price">
          {alma && <img src={alma} alt="" width={18} height={18} />}
          {precio}
        </span>
        {/* La base va en el encabezado y no en una nota al pie: es contra este
            número que se resta cada fila del grupo, así que tiene que estar a la
            vista de las filas que explica. */}
        <span className="dl-shelf-base">{c.baseline(pct(base))}</span>
        <span className="dl-shelf-count">{c.itemCount(items.length)}</span>
        <Chevron className="dl-shelf-chev" />
      </button>

      <div className="dl-fold">
        <div className="dl-fold-inner">
          <div className="dl-irow-cols" aria-hidden="true">
            <span>{c.stats.delta}</span>
            <span>{c.stats.winRate}</span>
            <span>{c.stats.pickRate}</span>
          </div>
          <ol className="dl-irows">
            {items.map((i) => {
              const slug = itemSlugs.toSlug.get(String(i.itemId));
              return (
                <ItemRow
                  key={i.itemId}
                  item={i}
                  base={base}
                  cost={precio}
                  open={!!slug && slug === openSlug}
                  onToggle={() => onOpenItem(slug === openSlug ? undefined : slug)}
                />
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default function DeadlockItems({
  band,
  picker,
  open,
  onOpen,
}: {
  band: BandId;
  picker: React.ReactNode;
  /** El slug del ítem con la ficha abierta, si la URL trae uno. */
  open?: string;
  onOpen: (slug?: string) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.itemsPage;
  const meta = useItems(band);

  /**
   * Qué precios están abiertos.
   *
   * Arrancan los dos caros y **el criterio no es "los caros primero"**: es que
   * ahí está la decisión. El encogimiento estimado da k=296 en los de 3200 contra
   * k=1225 en los de 800, o sea que entre dos ítems baratos casi no hay
   * diferencia real que encontrar. De paso la página abre con la mitad de las
   * filas dibujadas.
   *
   * No se reinicia al cambiar de banda: si abriste los de 800, los querés
   * abiertos también cuando mirás Arcanista.
   */
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(OPEN_COSTS));
  /** El estante elegido (arma, vitalidad, espíritu), o todos. */
  const [slot, setSlot] = useState<Slot | null>(null);
  /**
   * Tienda (como el juego) o lista. Arranca en la tienda —pedido de ZoTaD del
   * 2026-09-23: "siempre copiando el juego"— y se recuerda en este navegador.
   */
  const [vista, setVista] = useState<"shop" | "list">(() => {
    try {
      return localStorage.getItem("vestigo.dlItemsView") === "list" ? "list" : "shop";
    } catch {
      return "shop";
    }
  });
  const cambiarVista = (v: "shop" | "list") => {
    setVista(v);
    try {
      localStorage.setItem("vestigo.dlItemsView", v);
    } catch {
      /* sin almacenamiento: la elección dura la visita */
    }
  };
  const selector = (
    <div className="seg dl-items-views" role="group" aria-label={c.views.label}>
      {(["shop", "list"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={vista === v} data-active={vista === v} onClick={() => cambiarVista(v)}>
          {c.views[v]}
        </button>
      ))}
    </div>
  );
  const alternar = (cost: number) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (!next.delete(cost)) next.add(cost);
      return next;
    });

  /**
   * El precio del ítem que la URL abre, para forzar su grupo visible — mismo
   * motivo que el tier forzado en `Deadlock.tsx`.
   */
  const openCost = open
    ? meta?.items.find((i) => itemSlugs.toSlug.get(String(i.itemId)) === open)?.cost
    : undefined;
  const abiertosEfectivo = openCost !== undefined ? new Set(abiertos).add(openCost) : abiertos;

  const scatter = meta ? scatterOf(meta.items) : null;
  const celdas = meta ? shopMap(meta.items) : [];

  return (
    <main className="deadlock deadlock-items">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={c.title}
        accent={c.titleBreak}
        lead={[c.lead, copy.deadlock.note]}
        controls={picker}
        meta={
          meta && (
            <span className="dl-meta-line">
              {`${copy.deadlock.sample(
                meta.file.matches.toLocaleString(locale),
                meta.file.from,
                meta.file.to
              )} · ${
                meta.file.crossesPatch
                  ? copy.deadlock.patch.includes(meta.file.patch.title)
                  : copy.deadlock.patch.since(meta.file.patch.title)
              }`}
            </span>
          )
        }
      />

      {!meta ? (
        <p className="dl-loading-note">{c.loading}</p>
      ) : vista === "shop" ? (
        <div className="dl-items-shopview">
          {selector}
          <p className="detail-note dl-items-shopnote">{c.shopNote}</p>
          <DeadlockItemsShop
            items={meta.items}
            openSlug={open}
            onOpenItem={onOpen}
            detalle={(() => {
              const it = open ? meta.items.find((i) => itemSlugs.toSlug.get(String(i.itemId)) === open) : undefined;
              if (!it) return null;
              return (
                <section className="box dl-items-shop-detail">
                  <ol className="dl-irows">
                    <ItemRow
                      item={it}
                      base={meta.file.costBaselines[String(it.cost)] ?? 0.5}
                      cost={it.cost.toLocaleString(locale)}
                      open
                      onToggle={() => onOpen(undefined)}
                    />
                  </ol>
                </section>
              );
            })()}
          />
        </div>
      ) : (
        /**
         * Dos columnas: la lista a la izquierda y lo que la resume a la derecha.
         *
         * La lista contesta "¿qué compro con N almas?" y hay que recorrerla; los
         * gráficos contestan "¿qué está pasando en la tienda?" de una mirada. Son
         * dos preguntas distintas y apiladas se estorbaban — la franja que había
         * antes empujaba la primera fila de ítem a la segunda pantalla.
         *
         * La columna derecha es `position: sticky`, así que los gráficos siguen
         * ahí mientras se baja por los 156 ítems.
         */
        <div className="page has-rail dl-items-page">
          <div className="page-main">
            {/* Todo lo que la lista muestra se puede filtrar (Baymard): el
                estante de cada ítem ya iba como chip en la fila; acá manda. */}
            {selector}
            <div className="chips dl-slot-chips" role="group" aria-label={c.allSlots}>
              <button type="button" className="chip" data-active={slot === null} onClick={() => setSlot(null)}>
                {c.allSlots}
              </button>
              {(["weapon", "vitality", "spirit"] as Slot[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  className="chip"
                  data-slot={s}
                  data-active={slot === s}
                  onClick={() => setSlot(slot === s ? null : s)}
                >
                  <img src={typeIconUrl(s === "weapon" ? "bullet_damage" : s === "vitality" ? "health" : "tech_damage")} alt="" width={18} height={18} />
                  {c.slots[s]}
                </button>
              ))}
            </div>

            {COSTS.map((cost) => {
              const delGrupo = meta.items
                .filter((i) => i.cost === cost && (slot === null || i.slot === slot))
                .sort(
                  (a, b) =>
                    TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.delta - a.delta
                );
              if (delGrupo.length === 0) return null;
              return (
                <CostGroup
                  key={cost}
                  cost={cost}
                  items={delGrupo}
                  base={meta.file.costBaselines[String(cost)] ?? 0.5}
                  open={abiertosEfectivo.has(cost)}
                  onToggle={() => alternar(cost)}
                  openSlug={open}
                  onOpenItem={onOpen}
                />
              );
            })}

            <p className="dl-tier-note">{c.footnote}</p>
          </div>

          <aside className="dl-items-aside" aria-label={c.charts.aside}>
            {scatter && <UsageVsEdge scatter={scatter} band={copy.deadlock.bands[band]} />}
            {scatter && <Callouts scatter={scatter} />}
            <ShopHeatmap cells={celdas} />
          </aside>
        </div>
      )}
    </main>
  );
}
