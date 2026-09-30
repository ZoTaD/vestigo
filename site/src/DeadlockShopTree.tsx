import { Fragment, useState, type ReactNode } from "react";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import type { Item, Slot } from "./deadlockItemsData";
import filtrosJson from "@deadlock/shop-filters.json";

/**
 * Los filtros de la tienda nueva (City Never Sleeps): qué objeto cae en qué
 * filtro, calculado por `build:shop-filters` con la misma regla que el juego.
 */
interface ShopFilters {
  categories: { key: string; en: string; es: string; color: string }[];
  groups: { key: string; en: string; es: string }[];
  filters: {
    key: string;
    category: string;
    group?: string;
    groupPath?: string[];
    en: string;
    es: string;
    iconUrl?: string;
  }[];
  items: Record<string, string[]>;
}
const SF = filtrosJson as unknown as ShopFilters;
/** El sigilo de cada categoría (sigil_*_psd del juego, en ui/cns). */
const SIGILO: Record<string, string> = {
  Physical: "physical",
  Spirit: "spirit",
  Defense: "defense",
  Mobility: "mobility",
  Disruption: "disruption",
  Misc: "misc",
};

const PRECIOS = [800, 1600, 3200, 6400] as const;
/** El orden de las columnas de la tienda del juego (arma, espíritu, vitalidad). */
const COLUMNAS: readonly Slot[] = ["weapon", "spirit", "vitality"];
type Vista = "all" | Slot;
const VISTAS: readonly Vista[] = ["all", "weapon", "spirit", "vitality"];

/**
 * La tienda nueva del juego (City Never Sleeps, 2026-09-29), para Objetos y el
 * armador.
 *
 * Como en el juego: las tres categorías juntas, en columnas con su cabecera
 * ("Stock up! / Big deal! / Feel good!"), una barra lateral para ver todo o una
 * sola, los escalones con los pricetags nuevos ($800 a "Premium $6400
 * Quality") y los filtros por categoría (Físico, Espíritu, Defensa, Movilidad,
 * Interrupción, Misceláneo) con sus subfiltros. Cada lugar pone su tarjeta
 * (`renderCard`): Objetos con la letra de la tier list, el armador con
 * adquirido, mejora y arrastre.
 */
export default function DeadlockShopTree({
  items,
  renderCard,
  children,
}: {
  items: Item[];
  renderCard: (item: Item) => ReactNode;
  /** Lo que va debajo de la tienda (el detalle del objeto abierto, una nota). */
  children?: ReactNode;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.builder;
  const [vista, setVista] = useState<Vista>("all");
  const columnas = vista === "all" ? COLUMNAS : [vista];
  const [abierta, setAbierta] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const f = c.filters;
  // Se ven los objetos con cualquiera de los filtros elegidos (sin elegir, todos).
  const pasa = (it: Item) => elegidos.size === 0 || (SF.items[String(it.itemId)] ?? []).some((k) => elegidos.has(k));
  const visibles = items.filter((it) => (vista === "all" || it.slot === vista) && pasa(it));
  const alternar = (key: string) =>
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const texto = (x: { en: string; es: string }) => (lang === "es" ? x.es : x.en);
  const deCategoria = (cat: string) => SF.filters.filter((x) => x.category === cat);

  const tarjetas = (slot: Slot, precio: number) =>
    visibles
      .filter((it) => it.slot === slot && it.cost === precio)
      .sort((a, b) => a.name.localeCompare(b.name, lang))
      .map((it) => <Fragment key={it.itemId}>{renderCard(it)}</Fragment>);

  return (
    <div className="dl-shop2" data-view={vista}>
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

      <div className="dl-shop2-filters" role="group" aria-label={f.label}>
        {SF.categories.map((cat) => {
          const cuantos = deCategoria(cat.key).filter((x) => elegidos.has(x.key)).length;
          return (
            <button
              key={cat.key}
              type="button"
              className="dl-sf-cat"
              data-cat={cat.key}
              data-on={cuantos > 0 || undefined}
              aria-expanded={abierta === cat.key}
              style={{ "--sf": cat.color } as React.CSSProperties}
              onClick={() => setAbierta(abierta === cat.key ? null : cat.key)}
            >
              <span
                className="dl-sf-sigil"
                aria-hidden="true"
                style={{ "--sigil": `url(/deadlock/game/ui/cns/sigil-${SIGILO[cat.key]}.webp)` } as React.CSSProperties}
              />
              {texto(cat)}
              {cuantos > 0 && <span className="dl-sf-count">{cuantos}</span>}
            </button>
          );
        })}
        {elegidos.size > 0 && (
          <span className="dl-sf-status">
            <span>{f.count(visibles.length)}</span>
            <button type="button" className="dl-sf-clear" onClick={() => setElegidos(new Set())}>
              {f.clear}
            </button>
          </span>
        )}
      </div>

      {abierta && (
        <div
          className="dl-sf-panel"
          data-cat={abierta}
          style={{ "--sf": SF.categories.find((x) => x.key === abierta)?.color } as React.CSSProperties}
        >
          {(() => {
            const lista = deCategoria(abierta);
            // Los sueltos primero y después cada grupo con su título, como el menú del juego.
            const bloques: { titulo?: string; filtros: typeof lista }[] = [];
            for (const x of lista) {
              const g = x.groupPath?.[0] ?? x.group;
              const titulo = g ? texto(SF.groups.find((gr) => gr.key === g) ?? { en: g, es: g }) : undefined;
              const ultimo = bloques[bloques.length - 1];
              if (ultimo && ultimo.titulo === titulo) ultimo.filtros.push(x);
              else bloques.push({ titulo, filtros: [x] });
            }
            return bloques.map((b, i) => (
              <div className="dl-sf-block" key={i}>
                {b.titulo && <p className="dl-sf-group">{b.titulo}</p>}
                <ul className="dl-sf-list">
                  {b.filtros.map((x) => (
                    <li key={x.key}>
                      <button
                        type="button"
                        className="dl-sf-opt"
                        aria-pressed={elegidos.has(x.key)}
                        onClick={() => alternar(x.key)}
                      >
                        <span className="dl-sf-box" aria-hidden="true" />
                        {x.iconUrl && <img src={x.iconUrl} alt="" width={18} height={18} />}
                        {texto(x)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ));
          })()}
        </div>
      )}

      <div className="dl-shop2-paper" role="tabpanel">
        <div className="dl-shop2-heads" data-cols={columnas.length}>
          {columnas.map((s) => (
            <span key={s} className="dl-shop2-head" data-cat={s} aria-hidden="true" />
          ))}
        </div>
        {PRECIOS.map(
          (precio, i) =>
            visibles.some((it) => it.cost === precio) && (
              <section
                className="dl-shop2-tier"
                key={precio}
                data-tier={i + 1}
                aria-label={precio.toLocaleString(locale)}
              >
                <img
                  className="dl-shop2-price"
                  src={`/deadlock/game/ui/cns/pricetag-${i + 1}.webp`}
                  alt={precio.toLocaleString(locale)}
                  width={i === 3 ? 84 : 96}
                  height={i === 3 ? 84 : 58}
                />
                <div className="dl-shop2-row" data-cols={columnas.length}>
                  {columnas.map((s) => (
                    <ul className="dl-shop2-cell" data-cat={s} key={s}>
                      {tarjetas(s, precio)}
                    </ul>
                  ))}
                </div>
              </section>
            ),
        )}
      </div>
      {children}
    </div>
  );
}
