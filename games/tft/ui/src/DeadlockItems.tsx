import { useState } from "react";
import { useCopy, useLocale } from "./i18n";
import {
  useItems,
  typeIconUrl,
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

  return (
    <li className="dl-item" data-thin={item.thinData === true} data-slot={item.slot} data-open={open}>
      <button
        className="dl-item-open"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={c.detail.toggle(item.name)}
      >
      <span className="dl-item-tier" aria-hidden="true">
        {item.tier}
      </span>

      <span className="dl-item-face">
        {item.img ? (
          <img src={item.img} alt="" loading="lazy" width={44} height={44} />
        ) : (
          <span className="dl-portrait-fallback">{item.name.slice(0, 2)}</span>
        )}
      </span>

      <span className="dl-identity">
        <span className="dl-name">{item.name}</span>
        <span className="dl-chips">
          <span className="dl-chip" data-kind="slot">
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
              width={14}
              height={14}
              loading="lazy"
            />
          ))}
        </span>
      </span>

      {/* El delta al doble de tamaño y el winrate crudo al lado: el primero es la
          respuesta y el segundo es de dónde salió. */}
      <span className="stats dl-stats">
        <span
          className="stat stat-primary"
          data-sign={item.delta > 0 ? "up" : item.delta < 0 ? "down" : "flat"}
          title={c.deltaWhy(delta(item.delta), pct(base))}
        >
          <span className="stat-value">{delta(item.delta)}</span>
          <span className="stat-label">{c.stats.delta}</span>
        </span>
        <span className="stat">
          <span className="stat-value">{pct(item.winRateRaw)}</span>
          <span className="stat-label">{c.stats.winRate}</span>
        </span>
        <span className="stat">
          <span className="stat-value">{pct(item.pickRate)}</span>
          <span className="stat-label">{c.stats.pickRate}</span>
        </span>
      </span>

        <span className="dl-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {/* La ficha se monta sólo al abrir. Con 156 filas, montarlas todas sería
          pedir el archivo de fichas en cuanto carga la página, que es
          exactamente lo que este reparto evita. */}
      {open && (
        <div className="dl-item-fold">
          <ItemDetailPanel item={item} cost={cost} />
        </div>
      )}
    </li>
  );
}

/**
 * Un precio que se abre y se cierra.
 *
 * La animación es `grid-template-rows: 0fr → 1fr` sobre un contenedor con
 * `overflow: hidden`, igual que los tiers de héroes: es la única forma de animar
 * hacia "lo que mida el contenido" sin que JavaScript mida nada. El contenido
 * **se monta siempre**, aunque esté plegado, así Ctrl+F lo encuentra y Google lo
 * indexa.
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

  return (
    <section className="tier-group dl-cost" data-cost={cost} data-open={open}>
      <button
        className="tier-head dl-cost-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={c.costGroup(precio, items.length)}
      >
        <span className="dl-souls">
          <span className="dl-souls-mark" aria-hidden="true">
            ◈
          </span>
          {precio}
        </span>
        {/* La base va en el encabezado y no en una nota al pie: es contra este
            número que se resta cada fila del grupo, así que tiene que estar a la
            vista de las filas que explica. */}
        <span className="dl-cost-base">{c.baseline(pct(base))}</span>
        <span className="tier-count">{items.length}</span>
        <span className="dl-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      <div className="dl-fold">
        <div className="dl-fold-inner">
          <ol className="dl-list dl-item-list">
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
      <div className="tool-head">
        <header className="masthead">
          <p className="eyebrow">{copy.deadlock.eyebrow}</p>
          <h1 className="title">
            {c.title}
            <span className="title-break">{c.titleBreak}</span>
          </h1>
          <p className="standfirst">{c.lead}</p>
        </header>

        <div className="tool-controls">{picker}</div>

        {/* La misma ficha de la medición que la tier list de héroes: cruza el
            ancho al pie del encabezado, entre dos reglas. Eran dos notas
            apiladas en la columna del selector, donde se leían como una
            aclaración de ese control y no como de qué está hecha la página. */}
        {meta && (
          <p className="detail-note dl-meta-line">
            {`${copy.deadlock.sample(
              meta.file.matches.toLocaleString(locale),
              meta.file.from,
              meta.file.to
            )} · ${copy.deadlock.patch.since(meta.file.patch.title)}`}
          </p>
        )}
      </div>

      {!meta ? (
        <p className="detail-note dl-loading">{c.loading}</p>
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
        <div className="dl-split">
          <div className="tiers dl-split-list">
            {COSTS.map((cost) => {
              const delGrupo = meta.items
                .filter((i) => i.cost === cost)
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

            <p className="detail-note dl-footnote">{c.footnote}</p>
          </div>

          <aside className="dl-split-aside" aria-label={c.charts.aside}>
            {scatter && <UsageVsEdge scatter={scatter} band={copy.deadlock.bands[band]} />}
            {scatter && <Callouts scatter={scatter} />}
            <ShopHeatmap cells={celdas} />
          </aside>
        </div>
      )}
    </main>
  );
}
