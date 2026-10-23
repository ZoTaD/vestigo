/**
 * La ficha de un objeto de Stardew Valley (2026-10-22), la de la maqueta A: la cabecera con el sprite grande en su
 * casillero, el nombre, la descripción del juego y las etiquetas (categoría, estaciones, energía y salud); los precios
 * por calidad, con un selector de profesión si alguna lo sube; y después cada cruce sólo si tiene algo: a quién le
 * encanta (retratos enlazados a Aldeanos), en qué paquete va, en qué se transforma, en qué se usa, con qué se fabrica y
 * dónde se consigue.
 *
 * Recibe la ficha ya cargada: todo lo que nombra viene en sus `refs`. Lo único de afuera son los nombres de las salas
 * del Centro Comunitario (`bundles.json`), que `preloadItemsRoute` deja bajados antes de dibujar.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import meta from "@stardew/meta.json";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { QUALITIES, useStardewCopy, type Profession, type Taste } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { loadBundles, machineTime, peekBundles, refName, say, type Ficha, type MachineIn, type Pair, type Ref, type Source } from "../data";
import { roomAnchor } from "../bundles/progress";
import { Box, Gold, Slot, Sprite, type Nav } from "../ui";

const CATEGORIES = meta.categories as unknown as Record<string, Pair>;
const GIFT_TASTES: Exclude<Taste, "neutral">[] = ["love", "like", "dislike", "hate"];

/** Las letras de la palabra más larga del nombre: el título se achica para que entre entera, sin cortarla. */
const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

/** Las estaciones en las que se consigue, juntando cultivo, árbol, pesca y recolección. */
function seasonsOf(sources: Source[]): number[] {
  const all = new Set<number>();
  for (const s of sources) if ("seasons" in s) for (const n of s.seasons) all.add(n);
  return [...all].sort();
}

export default function ItemPage({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useStardewCopy();
  const c = t.items;
  const { lang } = useLang();
  const locale = useLocale();
  const name = say(ficha.name, lang);
  const desc = say(ficha.desc, lang);
  const cat = CATEGORIES[String(ficha.cat)];
  const seasons = seasonsOf(ficha.sources);
  const pros = Object.keys(ficha.prices.pro) as Profession[];
  const [pro, setPro] = useState<Profession | null>(null);
  const prices = (pro && ficha.prices.pro[pro]) || ficha.prices.base;
  const rooms = useLoad(ficha.bundles.length ? "bundles" : null, () => peekBundles() ?? undefined, loadBundles);
  const tastes = GIFT_TASTES.filter((g) => ficha.tastes[g]?.length);
  const { make, use } = ficha.recipes;
  // Los cruces van en una sola caja, como en la maqueta A: sin ninguno, la ficha es la cabecera con los precios.
  const hasCross =
    tastes.length > 0 ||
    ficha.bundles.length > 0 ||
    ficha.machines.in.length > 0 ||
    ficha.machines.madeIn.length > 0 ||
    use.length > 0 ||
    make.length > 0 ||
    ficha.sources.length > 0;

  const itemRoute = (slug: string): Route => ({
    ...route,
    view: "stardew",
    sdSection: "items",
    detail: slug,
  });

  /** Otro objeto, con su casillero y su nombre, enlazado a su ficha. Sin ref (un producto sin ficha) va el nombre solo. */
  const item = (id: string, fallback?: Pair, extra?: ReactNode) => {
    const r: Ref | undefined = ficha.refs[id];
    const label = fallback ? say(fallback, lang) : r ? refName(r, lang) : id;
    const body = (
      <>
        <Slot>{r && <Sprite id={id} w={r[4]} h={r[5]} size={40} />}</Slot>
        <span>
          <b>{label}</b>
          {extra}
        </span>
      </>
    );
    return r ? (
      <RouteLink className="sd-ref" to={itemRoute(r[0])} onNavigate={navigate} prefetch="press">
        {body}
      </RouteLink>
    ) : (
      <span className="sd-ref">{body}</span>
    );
  };

  /** Un ingrediente: un objeto, o una categoría ("cualquier producto animal") con su nombre del juego. */
  const ingredient = (id: string, n: number) => {
    const qty = <small>× {n}</small>;
    if (!id.startsWith("-")) return item(id, undefined, qty);
    const group = CATEGORIES[id];
    return (
      <span className="sd-ref">
        <Slot />
        <span>
          <b>{group ? say(group, lang) : id}</b>
          {qty}
        </span>
      </span>
    );
  };

  const time = (minutes: number, days: number) => {
    const tm = machineTime(minutes, days);
    return tm ? c.time(tm) : null;
  };
  const seasonNames = (list: number[]) => (list.length === 4 ? c.src.allYear : list.map((n) => t.seasons[n]).join(", "));

  return (
    <main className="sd-main sd-ficha">
      <RouteLink
        className="sd-back"
        to={{
          ...route,
          view: "stardew",
          sdSection: "items",
          detail: undefined,
        }}
        onNavigate={navigate}
      >
        ← {c.back}
      </RouteLink>

      <Box className="sd-top">
        <div className="sd-head">
          <span className="sd-slot sd-slot-big">
            {/* Los objetos grandes (máquinas, muebles) miden 16×32; el resto, 16×16. */}
            <Sprite id={ficha.id} w={16} h={ficha.id.startsWith("(BC)") ? 32 : 16} size={96} lazy={false} />
          </span>
          <div className="sd-title">
            <h1 className="sd-h1 sd-name" style={{ "--sd-word": longestWord(name) } as CSSProperties}>
              {name}
            </h1>
            {desc && <p className="sd-desc">{desc}</p>}
            <ul className="sd-tags">
              {cat && <li>{say(cat, lang)}</li>}
              {seasons.length > 0 && <li>{seasonNames(seasons)}</li>}
              {ficha.energy && (
                <li className="sd-tag-food">
                  +{ficha.energy[0]} {c.energy} · +{ficha.energy[1]} {c.health}
                </li>
              )}
            </ul>
          </div>
        </div>
        {ficha.prices.base[0] > 0 && (
          <section className="sd-prices" aria-labelledby="sd-prices-h">
            <div className="sd-prices-head">
              <h2 className="sd-h2" id="sd-prices-h">
                {c.sellPrice}
              </h2>
              {pros.length > 0 && (
                <div className="sd-pick sd-pro" role="group" aria-label={c.profession}>
                  {[null, ...pros].map((p) => (
                    <button
                      type="button"
                      className={`sd-pill${p === pro ? " is-on" : ""}`}
                      aria-pressed={p === pro}
                      onClick={() => setPro(p)}
                      key={p ?? "none"}
                    >
                      {p ? t.professions[p] : c.noProfession}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <dl className="sd-quality">
              {QUALITIES.map((q, i) => (
                <div key={q} data-q={q}>
                  <dt>{t.qualities[q]}</dt>
                  <dd>
                    <Gold n={prices[i]} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </Box>

      {hasCross && (
        <Box className="sd-cross">
          {tastes.length > 0 && (
            <section className="sd-sec sd-gifts">
              {tastes.map((g) => (
                <div key={g} className="sd-taste" data-taste={g}>
                  <h2 className="sd-h3">{c.tasteHeads[g]}</h2>
                  <ul className="sd-people">
                    {ficha.tastes[g]!.map((key) => {
                      const r = ficha.refs[key];
                      const who = r ? refName(r, lang) : key;
                      const face = (
                        <img
                          className="sd-portrait"
                          src={`/stardew/portraits/${key.toLowerCase()}.png`}
                          alt=""
                          width={48}
                          height={48}
                          loading="lazy"
                          decoding="async"
                        />
                      );
                      return (
                        <li key={key}>
                          {r ? (
                            <RouteLink
                              className="sd-person"
                              to={{
                                ...route,
                                view: "stardew",
                                sdSection: "villagers",
                                detail: r[0],
                              }}
                              onNavigate={navigate}
                              title={who}
                            >
                              {face}
                              <span>{who}</span>
                            </RouteLink>
                          ) : (
                            <span className="sd-person">
                              {face}
                              <span>{who}</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {ficha.bundles.length > 0 && (
            <section className="sd-sec" aria-labelledby="sd-bundles-h">
              <h2 className="sd-h2" id="sd-bundles-h">
                {c.bundlesTitle}
              </h2>
              <ul className="sd-rows">
                {ficha.bundles.map(([room, index, qty, quality], i) => {
                  const sala = rooms.value?.find((s) => s.room === room);
                  const bundle = sala?.bundles.find((b) => b.index === index);
                  return (
                    <li key={i}>
                      <RouteLink
                        className="sd-row"
                        to={{
                          ...route,
                          view: "stardew",
                          sdSection: "bundles",
                          detail: undefined,
                        }}
                        onNavigate={navigate}
                        hash={roomAnchor(room)}
                      >
                        <b>{bundle ? say(bundle.name, lang) : room}</b>
                        <span className="sd-muted">{sala ? say(sala.name, lang) : ""}</span>
                        <span className="sd-row-end">{c.bundleNeed(qty, quality > 0 ? t.qualities[QUALITIES[quality]] : null)}</span>
                      </RouteLink>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {(ficha.machines.in.length > 0 || ficha.machines.madeIn.length > 0) && (
            <section className="sd-sec sd-machines">
              {ficha.machines.in.length > 0 && (
                <>
                  <h2 className="sd-h2">{c.turnsInto}</h2>
                  <ul className="sd-rows">
                    {ficha.machines.in.map((m, i) => (
                      <li className="sd-flow" key={i}>
                        {item(m.machine, undefined, m.count > 1 && <small>{c.perBatch(m.count)}</small>)}
                        <span className="sd-arrow" aria-hidden="true">
                          →
                        </span>
                        {product(m)}
                        <span className="sd-row-end">
                          {m.price > 0 && <Gold n={m.price} />}
                          {time(m.minutes, m.days) && <small>{time(m.minutes, m.days)}</small>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {ficha.machines.madeIn.length > 0 && (
                <>
                  <h2 className="sd-h2">{c.madeIn}</h2>
                  <ul className="sd-rows">
                    {ficha.machines.madeIn.map(([machine, minutes, days]) => (
                      <li className="sd-flow" key={machine}>
                        {item(machine)}
                        <span className="sd-row-end">{time(minutes, days) && <small>{time(minutes, days)}</small>}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {use.length > 0 && (
            <section className="sd-sec">
              <h2 className="sd-h2">{c.usedIn}</h2>
              <ul className="sd-ings">
                {use.map(([kind, key, out]) => (
                  <li key={`${kind}-${key}`}>{item(out, undefined, <small>{c.kinds[kind]}</small>)}</li>
                ))}
              </ul>
            </section>
          )}

          {make.length > 0 && (
            <section className="sd-sec">
              <h2 className="sd-h2">{c.madeWith}</h2>
              {make.map(([kind, key, qty, ings]) => (
                <div className="sd-recipe" key={key}>
                  <p className="sd-muted">
                    {c.kinds[kind]}
                    {qty > 1 && ` · ${c.yields(qty)}`}
                  </p>
                  <ul className="sd-ings">
                    {ings.map(([id, n]) => (
                      <li key={id}>{ingredient(id, n)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {ficha.sources.length > 0 && (
            <section className="sd-sec">
              <h2 className="sd-h2">{c.whereTitle}</h2>
              <ul className="sd-rows">
                {ficha.sources.map((s, i) => (
                  <li className="sd-source" key={i}>
                    {source(s)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Box>
      )}
    </main>
  );

  /** El producto de una máquina: su ficha si la tiene, con el nombre armado ("Vino de Melón") si es de sabor. */
  function product(m: MachineIn) {
    return item(m.out, m.outName, m.stack > 1 && <small>× {m.stack}</small>);
  }

  /** Una forma de conseguirlo: qué es, de quién o dónde, y la cifra o las estaciones a la derecha. */
  function source(s: Source): ReactNode {
    switch (s.k) {
      case "crop":
        return (
          <>
            <span className="sd-src-k">{c.src.crop}</span>
            {item(s.seed, undefined, <small>{[c.src.grow(s.days), s.regrow > 0 && c.src.regrow(s.regrow)].filter(Boolean).join(" · ")}</small>)}
            <span className="sd-row-end">{seasonNames(s.seasons)}</span>
          </>
        );
      case "tree":
        return (
          <>
            <span className="sd-src-k">{c.src.tree}</span>
            {item(s.sapling, undefined, <small>{c.src.mature(s.days)}</small>)}
            <span className="sd-row-end">{seasonNames(s.seasons)}</span>
          </>
        );
      case "shop":
        return (
          <>
            <span className="sd-src-k">{c.src.shop}</span>
            <b>{say(s.shop, lang)}</b>
            <span className="sd-row-end">
              <Gold n={s.price} />
            </span>
          </>
        );
      case "fish":
      case "forage":
        return (
          <>
            <span className="sd-src-k">{s.k === "fish" ? c.src.fish : c.src.forage}</span>
            <b>{s.where.map((w) => say(w, lang)).join(", ")}</b>
            <span className="sd-row-end">{seasonNames(s.seasons)}</span>
          </>
        );
      case "monster":
        return (
          <>
            <span className="sd-src-k">{c.src.monster}</span>
            {s.slug ? (
              <RouteLink className="sd-src-link" to={{ ...route, view: "stardew", sdSection: "mines", detail: s.slug }} onNavigate={navigate} prefetch="press">
                {say(s.who, lang)}
              </RouteLink>
            ) : (
              <b>{say(s.who, lang)}</b>
            )}
            <span className="sd-row-end">
              {(s.rate * 100).toLocaleString(locale, {
                maximumFractionDigits: 1,
              })}{" "}
              %
            </span>
          </>
        );
    }
  }
}
