import { useState, type CSSProperties } from "react";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { catalog } from "./deadlockData";
import { text, type Localized } from "./localized";
import { soulIcon, type Slot } from "./deadlockItemsData";
import {
  useHeroBuilds,
  badgesFor,
  byPhase,
  bySlot,
  upgradePriority,
  MIN_CONVICCION,
  type BuildView,
  type BuyView,
  type ItemRef,
} from "./deadlockBuildsData";
import { ConFicha } from "./DeadlockBuildCard";
import { GameCard, ItemIcon } from "./DeadlockItemTip";
import GameImg from "./GameImg";
import { PopularHeroContext, bestPhases, usePopular, type PopularPhase } from "./deadlockPopularData";

/**
 * La build de un héroe dibujada como la tienda del juego (ZoTaD, 2026-09-30).
 *
 * Reemplaza en la página de build a la tarjeta de paneles sueltos y a la de
 * Populares: arriba se elige qué mirar —los Populares del juego, cada build
 * medida o la nuestra en beta— y todo cae en el mismo papel de tres columnas de
 * la tienda (arma, espíritu, vitalidad, con sus escalones y pricetags). En una
 * build, cada tarjeta lleva su número de compra; los componentes que después se
 * mejoran van apagados; la inversión de almas va en las tres barras verticales
 * de la tienda. Debajo, el orden de compra en una tira y la senda de habilidades
 * en la pizarra del escondite.
 */

const PRECIOS = [800, 1600, 3200, 6400] as const;
const COLUMNAS: readonly Slot[] = ["weapon", "spirit", "vitality"];
const TOPE_ALMAS = 28_800;
const ROMANO = ["", "I", "II", "III"];

interface CatalogItem {
  name: Localized;
  img: string;
  cost: number;
  slot: string;
  tier?: number;
}

type Vista = { kind: "popular" } | { kind: "build"; i: number } | { kind: "reco" };

/** Una tarjeta del tablero: el objeto y lo que se le pega encima. */
interface Pieza {
  ref: ItemRef;
  /** Número de compra (builds) o % de partidas (Populares). */
  sticker?: string;
  hot?: boolean;
  fase?: PopularPhase;
  apagada?: boolean;
  clave?: boolean;
  mejora?: boolean;
}

export default function DeadlockBuildShop({
  heroId,
  heroName,
  heroWinRate,
}: {
  heroId: number;
  heroName: string;
  heroWinRate?: number;
}) {
  return (
    <PopularHeroContext.Provider value={heroId}>
      <Tablero heroId={heroId} heroName={heroName} heroWinRate={heroWinRate} />
    </PopularHeroContext.Provider>
  );
}

function Tablero({ heroId, heroName, heroWinRate }: { heroId: number; heroName: string; heroWinRate?: number }) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.buildCard;
  const b = c.board;
  const datos = useHeroBuilds(heroId);
  const popular = usePopular(heroId);
  const [vista, setVista] = useState<Vista>({ kind: "build", i: 0 });

  if (!datos) return <p className="detail-note dl-build-loading">{copy.deadlock.loading}</p>;
  if (datos.builds.length === 0) return <p className="detail-note">{c.none}</p>;

  const items = (catalog as unknown as { items: Record<string, CatalogItem> }).items;
  const refDe = (id: number): ItemRef | null => {
    const it = items[String(id)];
    return it ? { itemId: id, name: text(it.name, lang, "?"), img: it.img, cost: it.cost, slot: it.slot, tier: it.tier } : null;
  };

  const reco = datos.recommended;
  const etiquetas = badgesFor(datos.builds);
  const numeral = (() => {
    const vistos = new Map<string, number>();
    return datos.builds.map((x) => {
      const clave = `${x.damage}|${x.trait}`;
      const n = (vistos.get(clave) ?? 0) + 1;
      vistos.set(clave, n);
      return datos.builds.filter((y) => `${y.damage}|${y.trait}` === clave).length > 1 ? ` ${"I".repeat(n)}` : "";
    });
  })();

  const build: BuildView = datos.builds[vista.kind === "build" ? Math.min(vista.i, datos.builds.length - 1) : 0];
  const compras: BuyView[] = vista.kind === "reco" && reco ? reco.buys : build.buys;

  // ── Las piezas del tablero ───────────────────────────────────────────────
  let piezas: Pieza[] = [];
  if (vista.kind === "popular") {
    if (popular) {
      piezas = [...bestPhases(popular).entries()]
        .flatMap(([id, p]) => {
          const ref = refDe(id);
          return ref
            ? [{ ref, sticker: `${Math.round(p.pick * 100)}%`, hot: p.pick >= 0.4, fase: p.phase } as Pieza]
            : [];
        })
        .sort((x, y) => parseInt(y.sticker!) - parseInt(x.sticker!));
    }
  } else {
    // Los componentes que después se mejoran: aparecen en la cadena de un
    // objeto comprado más adelante.
    const finales = vista.kind === "reco" && reco ? reco.items : build.items;
    const componentes = new Set(finales.flatMap((f) => f.chain.slice(0, -1)));
    const claves = new Set(finales.filter((f) => f.carries).map((f) => f.itemId));
    piezas = compras.map((cmp, n) => ({
      ref: cmp,
      sticker: String(n + 1),
      apagada: componentes.has(cmp.itemId),
      clave: claves.has(cmp.itemId) || cmp.edge !== undefined,
      mejora: cmp.upgrade,
    }));
  }

  const titulo =
    vista.kind === "popular"
      ? b.popular
      : vista.kind === "reco"
        ? c.ourPick
        : c.name(c.damage[build.damage], c.trait[build.trait]) + numeral[vista.i];

  const esBuild = vista.kind !== "popular";

  return (
    <div className="dl-bshop" id="dl-build" data-kind={vista.kind}>
      {/* El selector: los Populares del juego, las builds medidas y la nuestra. */}
      <div className="dl-bshop-tabs" role="tablist" aria-label={heroName}>
        <button
          type="button"
          role="tab"
          aria-selected={vista.kind === "popular"}
          className="dl-bshop-tab is-popular"
          onClick={() => setVista({ kind: "popular" })}
        >
          <img src="/deadlock/game/ui/cns/tab-popular.webp" alt="" width={22} height={22} />
          {b.popular}
        </button>
        {datos.builds.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={vista.kind === "build" && vista.i === i}
            className="dl-bshop-tab"
            onClick={() => setVista({ kind: "build", i })}
          >
            {etiquetas[i].map((e) => (
              <span key={e} className="dl-bshop-badge" data-badge={e}>
                {e === "played" ? c.mostPlayed : c.bestWinRate}
              </span>
            ))}
            {c.name(c.damage[x.damage], c.trait[x.trait]) + numeral[i]}
          </button>
        ))}
        {reco && (
          <button
            type="button"
            role="tab"
            aria-selected={vista.kind === "reco"}
            className="dl-bshop-tab is-reco"
            onClick={() => setVista({ kind: "reco" })}
          >
            <span className="dl-bshop-badge" data-badge="beta">
              {c.beta}
            </span>
            {c.ourPick}
          </button>
        )}
      </div>

      {/* El cartel: el de Populares del juego, o la franja de builds con el nombre. */}
      <header className="dl-bshop-banner" data-kind={vista.kind}>
        {esBuild ? (
          <>
            <h3 className="dl-bshop-title">{titulo}</h3>
            {vista.kind === "build" && (
              <p className="dl-bshop-sample">
                {c.sample(build.matches.toLocaleString(locale), (build.winRate * 100).toFixed(1))}
                {build.edgeScore !== undefined ? (
                  <span title={c.edgeScoreWhy}>
                    {c.edgeScore((build.edgeScore >= 0 ? "+" : "−") + Math.abs(build.edgeScore).toFixed(1))}
                  </span>
                ) : (
                  heroWinRate !== undefined && (
                    <span>
                      {c.vsHero(
                        ((build.winRate - heroWinRate) * 100 >= 0 ? "+" : "−") +
                          Math.abs((build.winRate - heroWinRate) * 100).toFixed(1),
                        (heroWinRate * 100).toFixed(1)
                      )}
                    </span>
                  )
                )}
                {build.commitment !== undefined && build.commitment < MIN_CONVICCION && (
                  <span className="dl-bshop-blend" title={c.blendedWhy((build.commitment * 100).toFixed(0))}>
                    {c.blended}
                  </span>
                )}
              </p>
            )}
          </>
        ) : (
          <h3 className="visually-hidden">{b.popular}</h3>
        )}
      </header>

      {vista.kind === "reco" && reco && (
        <div className="dl-bshop-swaps">
          {reco.swaps.length === 0 ? (
            <p className="detail-note">{c.recoNone}</p>
          ) : (
            <ul>
              {reco.swaps.map((s) => (
                <li key={s.in.itemId}>
                  <ItemIcon itemId={s.out.itemId} img={s.out.img} size={30} />
                  <span className="dl-bshop-out">{s.out.name}</span>
                  <span aria-hidden="true">→</span>
                  <ItemIcon itemId={s.in.itemId} img={s.in.img} size={30} />
                  <span className="dl-bshop-in">{s.in.name}</span>
                  <small>{c.recoWhy((s.edgeIn - s.edgeOut).toFixed(2), s.support.toLocaleString(locale))}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="dl-bshop-body">
        {/* Las tres barras de inversión de la tienda, como abajo a la izquierda en el juego. */}
        {esBuild && vista.kind === "build" && <Inversion build={build} />}
        {!esBuild && <p className="dl-bshop-lead">{b.popularLead}</p>}

        <div className="dl-bshop-paper">
          <div className="dl-bshop-heads" aria-hidden="true">
            {COLUMNAS.map((s) => (
              <span key={s} className="dl-bshop-head" data-cat={s} />
            ))}
          </div>
          {PRECIOS.map((precio, t) => {
            const fila = COLUMNAS.map((s) => piezas.filter((p) => p.ref.slot === s && p.ref.cost === precio));
            if (fila.every((x) => x.length === 0)) return null;
            return (
              <section className="dl-bshop-tier" key={precio} data-tier={t + 1}>
                <img
                  className="dl-bshop-price"
                  src={`/deadlock/game/ui/cns/pricetag-${t + 1}.webp`}
                  alt={precio.toLocaleString(locale)}
                  width={80}
                  height={48}
                />
                <div className="dl-bshop-row">
                  {fila.map((celda, i) => (
                    <ul className="dl-bshop-cell" key={COLUMNAS[i]}>
                      {celda.map((p) => (
                        <ConFicha
                          key={`${p.ref.itemId}-${p.sticker}`}
                          item={p.ref}
                          className="dl-bshop-item"
                          datos={{
                            ...(p.apagada ? { "data-faded": "" } : {}),
                            ...(p.clave ? { "data-key": "" } : {}),
                          }}
                        >
                          <GameCard itemId={p.ref.itemId} img={p.ref.img} width={76} />
                          {p.sticker && (
                            <span
                              className="dl-bshop-sticker"
                              data-kind={esBuild ? "order" : "pick"}
                              data-hot={p.hot || undefined}
                              title={esBuild ? b.order(Number(p.sticker)) : undefined}
                            >
                              {p.fase && (
                                <img src={`/deadlock/game/ui/cns/phase-${p.fase}.webp`} alt="" width={14} height={13} />
                              )}
                              {p.sticker}
                            </span>
                          )}
                          {p.mejora && (
                            <span className="dl-bshop-up" title={c.upgradeStep} aria-label={c.upgradeStep}>
                              ↑
                            </span>
                          )}
                          {p.clave && <span className="dl-bshop-key">{c.keyItem}</span>}
                        </ConFicha>
                      ))}
                    </ul>
                  ))}
                </div>
              </section>
            );
          })}
          {esBuild && <p className="dl-bshop-faded-note">{b.faded}</p>}
        </div>
      </div>

      {/* El orden de compra, en una tira: el tablero dice QUÉ y dónde, esto dice CUÁNDO. */}
      {esBuild && <OrdenDeCompra buys={compras} />}

      {/* La senda de habilidades, en la pizarra del escondite. En Populares se
          muestra la de la build más jugada. */}
      <Pizarra
        build={build}
        from={vista.kind === "popular" ? c.name(c.damage[build.damage], c.trait[build.trait]) + numeral[0] : undefined}
      />

      {datos.counters.length > 0 && (
        <section className="dl-panel dl-counters">
          <h4 className="dl-panel-head" id="dl-counters">
            {c.counters}
          </h4>
          <ul className="dl-counter-list">
            {datos.counters.map((x) => (
              <ConFicha key={x.itemId} item={x} className="dl-counter-item">
                <ItemIcon itemId={x.itemId} img={x.img} size={30} tip={false} />
                <span className="dl-counter-name">{x.name}</span>
                <span className="dl-counter-vs">{c.against(x.foes.join(", "))}</span>
              </ConFicha>
            ))}
          </ul>
        </section>
      )}

      {datos.crossesPatch && <p className="dl-provisional">{c.crossesPatch}</p>}
      <p className="detail-note dl-build-foot">
        {c.foot(copy.deadlock.bands[datos.band] ?? datos.band, datos.from, datos.to)}
      </p>
    </div>
  );
}

/** Las tres barras verticales de inversión de la tienda del juego. */
function Inversion({ build }: { build: BuildView }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.buildCard;
  return (
    <aside className="dl-bshop-souls" aria-label={c.damageSplit}>
      <p className="dl-bshop-souls-title">{c.damageSplit}</p>
      <div className="dl-bshop-bars">
        {(["weapon", "vitality", "spirit"] as const).map((k) => {
          const v = build.damageSplit[k];
          return (
            <div key={k} className="dl-bshop-bar" data-cat={k} title={c.investment(v.souls.toLocaleString(locale))}>
              <span className="dl-bshop-bonus">
                {v.bonus > 0 ? `+${v.bonus}${k === "spirit" ? "" : "%"}` : "—"}
              </span>
              <span className="dl-bshop-track">
                <span style={{ "--fill": `${Math.min(100, (v.souls / TOPE_ALMAS) * 100)}%` } as CSSProperties} />
              </span>
              <span className="dl-bshop-souls-n">{(v.souls / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}k</span>
              <img src={`/deadlock/game/ui/cns/tab-${k}.webp`} alt={c.damage[k]} width={30} height={30} />
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/** La tira del orden de compra, partida en los tres tramos de la partida. */
function OrdenDeCompra({ buys }: { buys: BuyView[] }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.buildCard;
  const soul = soulIcon();
  if (buys.length === 0) return null;
  let n = 0;
  return (
    <section className="dl-bshop-order" id="dl-buy">
      <h4 className="dl-bshop-sec">{c.buyOrder}</h4>
      <div className="dl-bshop-phases">
        {byPhase(buys).map(({ phase, buys: tramo }) => (
          <div key={phase} className="dl-bshop-phase" data-phase={phase}>
            <p className="dl-bshop-phase-head">
              <img src={`/deadlock/game/ui/cns/phase-${phase}.webp`} alt="" width={20} height={19} />
              {c.phase[phase]}
              <span>{c.phaseRange[phase]}</span>
            </p>
            <ol className="dl-bshop-seq">
              {tramo.map((i) => {
                n += 1;
                return (
                  <ConFicha key={`${i.itemId}-${n}`} item={i} className="dl-bshop-step">
                    <span className="dl-bshop-n">{n}</span>
                    <GameCard itemId={i.itemId} img={i.img} width={54} name={false} />
                    {i.upgrade && (
                      <span className="dl-bshop-up" title={c.upgradeStep} aria-label={c.upgradeStep}>
                        ↑
                      </span>
                    )}
                    <span className="dl-bshop-cost">
                      {soul && <GameImg src={soul} alt="" width={10} height={10} />}
                      {i.cost.toLocaleString(locale)}
                    </span>
                  </ConFicha>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * La senda de habilidades en la pizarra del escondite, como una tablatura de
 * tiza: una fila por habilidad (en el orden del juego) y una columna por punto.
 * En cada columna, la marca en la fila de la habilidad que se sube: ◆ el
 * desbloqueo, I, II y III las mejoras; la III va encerrada en un círculo.
 * Arriba, las cuatro en el orden en que conviene subirlas.
 */
function Pizarra({ build, from }: { build: BuildView; from?: string }) {
  const copy = useCopy();
  const c = copy.deadlock.buildCard;
  const b = c.board;
  if (build.abilities.length === 0 || build.path.length === 0) return null;
  const orden = upgradePriority(build.abilities, build.path);
  const filas = bySlot(build.abilities);
  const fila = new Map(filas.map((a, i) => [a.id, i]));
  const subidas = new Map<number, number>();
  const pasos = build.path.flatMap((id, n) => {
    if (!fila.has(id)) return [];
    const k = (subidas.get(id) ?? 0) + 1;
    subidas.set(id, k);
    return [{ n: n + 1, id, nivel: k - 1 }];
  });
  const nombre = new Map(filas.map((a) => [a.id, a.name.replace(/ /g, " ")]));

  return (
    <section className="dl-bshop-chalk" id="dl-skills">
      <h4 className="dl-bshop-chalk-title">{c.skillPath}</h4>
      {from && <p className="dl-bshop-chalk-from">{b.skillsFrom(from)}</p>}
      {orden.length >= 2 && (
        <ol className="dl-chalk-prio" aria-label={c.priority}>
          {orden.map((a, i) => (
            <li key={a.id}>
              <span className="dl-chalk-rank">{c.priorityRank(i + 1)}</span>
              <GameImg src={a.img} alt="" width={52} height={52} loading="lazy" />
              <span className="dl-chalk-name">{a.name.replace(/ /g, " ")}</span>
            </li>
          ))}
        </ol>
      )}
      <div
        className="dl-chalk-tab"
        role="img"
        aria-label={pasos.map((p) => `${p.n}: ${nombre.get(p.id)} ${p.nivel === 0 ? b.unlock : b.upgrade(p.nivel)}`).join(", ")}
        style={{ "--steps": pasos.length } as CSSProperties}
      >
        {pasos.map((p) => (
          <span key={`n${p.n}`} className="dl-chalk-n" style={{ gridColumn: p.n + 1 }} aria-hidden="true">
            {p.n}
          </span>
        ))}
        {filas.map((a, r) => (
          <span key={a.id} className="dl-chalk-row" style={{ gridRow: r + 2 }} aria-hidden="true">
            <GameImg src={a.img} alt="" width={30} height={30} loading="lazy" />
          </span>
        ))}
        {pasos.map((p) => (
          <span
            key={`m${p.n}`}
            className="dl-chalk-mark"
            data-level={p.nivel}
            style={{ gridColumn: p.n + 1, gridRow: (fila.get(p.id) ?? 0) + 2 }}
            title={`${b.step(p.n)} · ${nombre.get(p.id)} · ${p.nivel === 0 ? b.unlock : b.upgrade(p.nivel)}`}
            aria-hidden="true"
          >
            {p.nivel === 0 ? "◆" : ROMANO[p.nivel] ?? p.nivel}
          </span>
        ))}
      </div>
    </section>
  );
}
