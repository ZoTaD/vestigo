import { useState } from "react";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { catalog } from "./deadlockData";
import type { Slot } from "./deadlockItemsData";
import { ItemIcon } from "./DeadlockItemTip";
import { usePopular, type PopularPhase } from "./deadlockPopularData";

const PRECIOS = [800, 1600, 3200, 6400] as const;
const FASES: readonly PopularPhase[] = ["early", "mid", "late"];
/** El orden de las columnas de la tienda del juego, que no es el del resto del sitio. */
const COLUMNAS: readonly Slot[] = ["weapon", "spirit", "vitality"];

interface CatalogItem {
  slot: Slot;
  cost: number;
}

/**
 * Los objetos populares de un héroe, como la pantalla "Popular Items" de la
 * tienda del juego (City Never Sleeps, 2026-09-29; pedido de ZoTaD con una
 * captura): el cartel rojo arriba, las tres columnas de la tienda —arma,
 * espíritu, vitalidad— con sus cabeceras "Stock up! / Big deal! / Feel good!",
 * los escalones de precio y las tarjetas del juego. Se elige la fase de la
 * partida, como en el juego, y cada tarjeta dice en qué parte de las partidas
 * se compra.
 *
 * Convive con nuestras builds (que miden qué rinde): esto es qué se compra.
 */
export default function DeadlockPopularCard({ heroId, heroName }: { heroId: number; heroName: string }) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const t = copy.deadlock.heroPage.popular;
  const hero = usePopular(heroId);
  const [fase, setFase] = useState<PopularPhase>("early");

  if (hero === undefined) return null;
  const items = (catalog as unknown as { items: Record<string, CatalogItem> }).items;
  const entradas = hero?.phases[fase] ?? [];
  const pct = (x: number) => Math.round(x * 100).toLocaleString(locale);
  const fecha = hero ? new Date(hero.updatedAt).toLocaleDateString(locale, { day: "numeric", month: "long" }) : "";

  return (
    <section className="dl-popular" id="dl-popular" aria-labelledby="dl-popular-title">
      {/* El cartel del juego ("POPULAR ITEMS — grab 'em while they're hot!").
          El título de verdad va aparte, para los lectores de pantalla. */}
      <header className="dl-pop-banner">
        <h3 id="dl-popular-title" className="visually-hidden">
          {t.title}
        </h3>
      </header>

      <div className="dl-pop-bar">
        <p className="dl-pop-lead">{t.lead(heroName)}</p>
        <div className="seg dl-pop-phases" role="tablist" aria-label={t.title}>
          {FASES.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={f === fase}
              data-active={f === fase}
              onClick={() => setFase(f)}
            >
              <img src={`/deadlock/game/ui/cns/phase-${f}.webp`} alt="" width={20} height={19} />
              {t.phases[f]}
            </button>
          ))}
        </div>
      </div>

      {!hero || entradas.length === 0 ? (
        <p className="detail-note">{t.empty}</p>
      ) : (
        <div className="dl-pop-paper" role="tabpanel">
          <div className="dl-pop-cols" aria-hidden="true" />
          {PRECIOS.map((precio) => {
            const fila = COLUMNAS.map((slot) =>
              entradas.filter((e) => items[String(e.itemId)]?.slot === slot && items[String(e.itemId)]?.cost === precio)
            );
            if (fila.every((c) => c.length === 0)) return null;
            return (
              <div className="dl-pop-tier" key={precio}>
                <span className="dl-pop-price">{precio.toLocaleString(locale)}</span>
                {fila.map((celda, i) => (
                  <ul className="dl-pop-cell" data-slot={COLUMNAS[i]} key={COLUMNAS[i]}>
                    {celda.map((e) => (
                      <li
                        key={e.itemId}
                        className="dl-pop-item"
                        title={`${t.pick(pct(e.pick))} · ${t.wins(pct(e.winrate))}`}
                      >
                        <ItemIcon itemId={e.itemId} size={84} />
                        <span className="dl-pop-pick" data-hot={e.pick >= 0.4 || undefined}>
                          {pct(e.pick)}
                          <small>%</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {hero && (
        <p className="dl-pop-updated" lang={lang}>
          {t.updated(fecha)}
        </p>
      )}
    </section>
  );
}
