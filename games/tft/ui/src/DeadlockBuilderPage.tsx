// `DeadlockBuilderPage` y no `DeadlockBuilder`: la lógica vive en `deadlockBuilder.ts`, y en
// Windows dos archivos que sólo difieren en mayúsculas son el mismo (ver DeadlockVsBandCard).
import { useEffect, useMemo, useState } from "react";
import { useCopy, useLang, useLocale } from "./i18n";
import { PUBLISHED_BAND, useHeroes } from "./deadlockData";
import { useItems, SLOTS, type Item, type Slot } from "./deadlockItemsData";
import { useHeroBuilds, bySlot, byPhase } from "./deadlockBuildsData";
import { useHeroKit } from "./deadlockHeroKitData";
import ShopCard, { SHOP } from "./DeadlockShopCard";
import { GuideEditor, AbilityOrderEditor, StatsPanel, empezarArrastre } from "./DeadlockBuilderEditor";
import { buildStats } from "./deadlockBuildStats";
import {
  addCategory,
  addToCategory,
  moveItem,
  addAbilityPoint,
  encodeGuide,
  decodeGuide,
  encodeAbilityPath,
  decodeAbilityPath,
  newCategoryId,
  GUIDE_DEFAULT_HEIGHT,
  type GuideCategory,
} from "./deadlockBuildGuide";
import {
  addItem,
  removeItem,
  investment,
  overlap,
  encodeBuild,
  decodeBuild,
  upgradesOwned,
  ownedWithComponents,
  BUILD_SLOTS,
  type BuilderItem,
  type AddResult,
} from "./deadlockBuilder";

/**
 * El armador de builds: la tienda del juego, copiada, y a la derecha tu build.
 *
 * **La tienda se dibuja con las texturas del propio juego** —el fondo de papel
 * de cada categoría, las pestañas, el reverso de tarjeta por escalón y los
 * sellos de "comprado" y "MEJORA"—, sacadas del bucket de deadlock-api y
 * achicadas a `public/deadlock/shop/` (el fondo original pesa 1,6 MB; acá 35 KB).
 * Es lo que ZoTaD pidió el 2026-09-22: que se sienta la tienda del juego.
 *
 * Lo que agrega Vestigo encima: el valor medido de cada objeto (opcional, para
 * no ensuciar la tienda), la inversión de almas con la escalera del juego y el
 * parecido con las builds que se miden en la tier list.
 *
 * Dos modos (pedido de ZoTaD, 2026-09-22): en "Build final" el clic en la
 * tienda llena las 12 casillas, de las que salen las stats; en "Guía de compra"
 * llena la categoría elegida del editor de builds, que copia el del juego.
 * Debajo va el orden de los puntos de habilidad, también como la grilla del
 * juego.
 *
 * Todo vive en el link, sin cuentas: `b=` la build, `g=` la guía y `a=` el
 * orden de habilidades.
 */

const PRECIOS = [800, 1600, 3200, 6400] as const;

type Modo = "build" | "guide";

/** Lee el link sin romper en el prerender, donde no hay `window`. */
function paramsDelLink(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search);
}

export default function DeadlockBuilder() {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.builder;

  const heroesMeta = useHeroes(PUBLISHED_BAND);
  const itemsMeta = useItems(PUBLISHED_BAND);

  const [heroId, setHeroId] = useState<number | null>(null);
  const [items, setItems] = useState<number[]>([]);
  const [cat, setCat] = useState<Slot>("weapon");
  const [verValor, setVerValor] = useState(false);
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [modo, setModo] = useState<Modo>("build");
  const [guia, setGuia] = useState<GuideCategory[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [senda, setSenda] = useState<number[]>([]);
  /** El `a=` del link, hasta que se sepa qué habilidades tiene el héroe. */
  const [sendaPendiente, setSendaPendiente] = useState<string | null>(null);

  // El link manda al entrar. Se lee después de montar para que el HTML del
  // prerender (sin build) y el primer dibujo del cliente sean el mismo.
  useEffect(() => {
    const q = paramsDelLink();
    if (!q) return;
    const b = q.get("b");
    const d = b ? decodeBuild(b) : null;
    if (d) {
      setHeroId(d.heroId);
      setItems(d.items);
    }
    const g = decodeGuide(q.get("g") ?? "");
    if (g.length > 0) {
      setGuia(g);
      setActiva(g[0].id);
      setModo("guide");
    }
    // Sólo si viene: en desarrollo React corre este efecto dos veces, y la
    // segunda lee el link después de que la sincronización borró `a` (todavía
    // no había senda). Pisar con null perdía el orden del link.
    const a = q.get("a");
    if (a) setSendaPendiente(a);
  }, []);

  const medidas = useHeroBuilds(heroId);
  const kit = useHeroKit();
  /** Las cuatro habilidades del héroe, en el orden de las casillas del juego. */
  const habilidades = useMemo(() => bySlot(medidas?.builds[0]?.abilities ?? []), [medidas]);

  // El orden de habilidades del link se resuelve cuando llegan las habilidades.
  useEffect(() => {
    if (sendaPendiente === null || habilidades.length === 0) return;
    setSenda(decodeAbilityPath(sendaPendiente, (slot) => habilidades[slot - 1]?.id));
    setSendaPendiente(null);
  }, [sendaPendiente, habilidades]);

  // Y todo vuelve al link en cada cambio, sin sumar entradas al historial.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const poner = (k: string, v: string | null) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    poner("b", heroId === null ? null : encodeBuild(heroId, items));
    poner("g", guia.length > 0 ? encodeGuide(guia) : null);
    if (sendaPendiente === null) {
      const casilla = (id: number) => {
        const i = habilidades.findIndex((h) => h.id === id);
        return i >= 0 ? i + 1 : undefined;
      };
      poner("a", senda.length > 0 ? encodeAbilityPath(senda, casilla) : null);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [heroId, items, guia, senda, habilidades, sendaPendiente]);

  const porId = useMemo(() => new Map((itemsMeta?.items ?? []).map((i) => [i.itemId, i])), [itemsMeta]);
  const lookup = (id: number): BuilderItem | undefined => {
    const i = porId.get(id);
    return i
      ? {
          itemId: i.itemId,
          cost: i.cost,
          slot: i.slot,
          upgradesFrom: i.upgradesFrom.map((u) => u.itemId),
          upgradesTo: i.upgradesTo.map((u) => u.itemId),
        }
      : undefined;
  };

  const heroes = useMemo(
    () => [...(heroesMeta?.heroes ?? [])].sort((a, b) => a.name.localeCompare(b.name, lang)),
    [heroesMeta, lang]
  );
  const heroe = heroes.find((h) => h.heroId === heroId) ?? null;

  if (!itemsMeta || !heroesMeta) return <p className="detail-note">{copy.deadlock.loading}</p>;

  const nombre = (id: number) => porId.get(id)?.name ?? `#${id}`;

  const agregar = (id: number) => {
    const r: AddResult = addItem(items, id, lookup);
    setItems(r.items);
    const s = c.status;
    setAviso(
      r.result === "added"
        ? s.added(nombre(id))
        : r.result === "upgraded"
          ? s.upgraded(nombre(id), nombre(r.replaced))
          : r.result === "duplicate" || r.result === "has-upgrade"
            ? s[r.result](nombre(id))
            : s[r.result]
    );
  };

  const quitar = (id: number) => setItems(removeItem(items, id));

  /** En modo guía, el clic va a la categoría elegida; sin ninguna, crea una. */
  const agregarAGuia = (id: number) => {
    let g = guia;
    let destino = activa && g.some((x) => x.id === activa) ? activa : null;
    if (!destino) {
      g = addCategory(g, c.editor.newCategory);
      destino = g[g.length - 1].id;
      setActiva(destino);
    }
    setGuia(addToCategory(g, destino, id));
    const cat = g.find((x) => x.id === destino);
    setAviso(c.addedTo(nombre(id), cat?.name || c.editor.newCategory));
  };

  const alClicTienda = (id: number) => {
    if (modo === "guide") agregarAGuia(id);
    else if (items.includes(id)) quitar(id);
    else agregar(id);
  };

  const nuevaCategoria = () => {
    const g = addCategory(guia, c.editor.newCategory);
    setGuia(g);
    setActiva(g[g.length - 1].id);
    setModo("guide");
  };

  /** Inicio / Medio / Final con el orden de compra real de la build más jugada. */
  const masJugada = medidas?.builds[0];
  const sembrar = masJugada
    ? () => {
        // Inicio y medio juego lado a lado, el final a todo el ancho: se ve la
        // compra entera sin bajar, como un editor del juego bien acomodado.
        const g: GuideCategory[] = byPhase(masJugada.buys).map(({ phase, buys }, i, todas) => ({
          id: newCategoryId(),
          name: copy.deadlock.buildCard.phase[phase],
          desc: copy.deadlock.buildCard.phaseRange[phase],
          width: i === todas.length - 1 && todas.length % 2 === 1 ? 12 : 6,
          height: GUIDE_DEFAULT_HEIGHT,
          items: [...new Set(buys.map((b) => b.itemId))],
        }));
        setGuia(g);
        setActiva(g[0]?.id ?? null);
        setModo("guide");
      }
    : undefined;

  const soltarDesdeTienda = (catId: string, itemId: number, index: number) => {
    const g = addToCategory(guia, catId, itemId);
    setGuia(moveItem(g, catId, itemId, catId, index));
    setActiva(catId);
  };

  const inv = investment(items, lookup);
  // Lo que la tienda apaga: la build y los componentes que consumió cada objeto.
  const adquiridos = ownedWithComponents(items, lookup);
  const base = heroId !== null ? kit?.heroes[String(heroId)]?.stats : undefined;
  const stats = base ? buildStats(base, items.map((id) => porId.get(id)?.mods ?? {}), inv) : [];
  const parecidas = (medidas?.builds ?? [])
    .map((b) => ({ b, n: overlap(items, b.items.map((i) => i.itemId)) }))
    .sort((a, b) => b.n - a.n || b.b.matches - a.b.matches);

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* Sin permiso de portapapeles el link sigue en la barra de direcciones. */
    }
  };

  const enCat = itemsMeta.items.filter((i) => i.slot === cat);
  // La estrella azul del juego marca los objetos de la build elegida; acá, los
  // de la build más jugada del héroe según la tier list.
  const estrella = new Set((medidas?.builds[0]?.items ?? []).map((i) => i.itemId));

  return (
    <section className="deadlock dl-builder">
      <header className="dl-bd-head">
        <div className="dl-bd-intro">
          <span className="dl-bd-kicker">{c.kicker}</span>
          <h1 className="dl-bd-title">{c.title}</h1>
          <p className="dl-bd-lead">{c.lead}</p>
        </div>
        <div className="dl-bd-heroes" role="group" aria-label={c.pickHero}>
          {heroes.map((h) => (
            <button
              key={h.heroId}
              type="button"
              className="dl-bd-hero"
              aria-pressed={h.heroId === heroId}
              title={h.name}
              onClick={() => {
                if (h.heroId !== heroId) {
                  setHeroId(h.heroId);
                  setItems([]);
                  setSenda([]);
                  setAviso("");
                }
              }}
            >
              <img src={h.img} alt={h.name} width={40} height={40} loading="lazy" />
            </button>
          ))}
        </div>
      </header>

      <div className="dl-bd-body">
        {/* ── La tienda ─────────────────────────────────────────── */}
        <div className="dl-bd-shop">
          <div className="dl-bd-toolbar">
            <div className="dl-bd-modes" role="group" aria-label={c.modes.build}>
              {(["build", "guide"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}>
                  {c.modes[m]}
                </button>
              ))}
            </div>
            <span className="dl-bd-modehint">{c.modeHint[modo]}</span>
            <label className="dl-bd-valuetoggle">
              <input type="checkbox" checked={verValor} onChange={(e) => setVerValor(e.target.checked)} />
              {c.showValue}
            </label>
          </div>

          {/* Las pestañas van en el lomo izquierdo del catálogo, como en el
              juego: la elegida es la larga, pegada al papel. */}
          <div className="dl-bd-catalog">
            <div className="dl-bd-tabs" role="tablist" aria-label={c.shop}>
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={s === cat}
                  aria-label={c.cats[s]}
                  title={c.cats[s]}
                  className="dl-bd-tab"
                  data-cat={s}
                  onClick={() => setCat(s)}
                >
                  <img
                    src={s === cat ? `${SHOP}/tab_${s}.webp` : `${SHOP}/tabsm_${s}.webp`}
                    alt=""
                    width={95}
                    height={s === cat ? 271 : 93}
                  />
                </button>
              ))}
            </div>

            {/* El papel entero del juego, con sus recuadros impresos. Cada
                escalón pone sus tarjetas adentro del recuadro que el juego
                dibujó para él; ver `deadlock-builder.css`. */}
            <div className="dl-bd-paper" role="tabpanel" data-cat={cat}>
              {PRECIOS.map((precio, i) => (
                <div className="dl-bd-tier" key={precio} data-tier={i + 1}>
                  <span className="dl-bd-price">
                    <img src={`${SHOP}/currency.webp`} alt="" width={13} height={24} />
                    {precio}
                  </span>
                  <ul className="dl-bd-cards">
                    {enCat
                      .filter((it) => it.cost === precio)
                      .sort((a, b) => a.name.localeCompare(b.name, lang))
                      .map((it) => (
                        <ShopCard
                          key={it.itemId}
                          item={it}
                          owned={adquiridos.has(it.itemId)}
                          // Un componente apagado por su mejora no se saca con un clic:
                          // lo dice el nombre accesible en vez de prometer "Quitar".
                          label={!items.includes(it.itemId) && adquiridos.has(it.itemId) ? `${it.name} — ${c.owned}` : undefined}
                          upgrade={upgradesOwned(lookup(it.itemId)!, items)}
                          starred={estrella.has(it.itemId) ? c.starred(heroe?.name ?? "") : undefined}
                          showValue={verValor}
                          onPick={() => alClicTienda(it.itemId)}
                          upgradeOf={it.upgradesFrom.find((u) => items.includes(u.itemId))?.name}
                          liProps={{
                            draggable: true,
                            onDragStart: (e) => empezarArrastre(e, { from: "shop", itemId: it.itemId }),
                          }}
                        />
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          {verValor && <p className="detail-note dl-bd-valuenote">{c.valueNote}</p>}
        </div>

        {/* ── Tu build y sus números ─────────────────────────────
            Al costado de la tienda y pegado mientras se scrollea: ZoTaD quiere
            ver la tienda y cómo va quedando la build a la vez, sin tener que
            bajar. La tienda se achica con la altura de la pantalla para
            entrar entera (ver `.dl-bd-paper` en el CSS). */}
        <aside className="dl-bd-side" aria-label={c.yourBuild}>
          <div className="dl-bd-build-head">
            {heroe && <img src={heroe.img} alt="" width={44} height={44} className="dl-bd-build-hero" />}
            <h2 className="dl-bd-build-title">
              {c.yourBuild}
              {heroe && <span className="dl-bd-build-heroname">{heroe.name}</span>}
            </h2>
            <span className="dl-bd-count">{c.slotsUsed(items.length, BUILD_SLOTS)}</span>
          </div>

          {heroId === null ? (
            <p className="detail-note dl-bd-bar-empty">{c.pickHero}</p>
          ) : (
            <>
              <ol className="dl-bd-slots">
                {Array.from({ length: BUILD_SLOTS }, (_, n) => {
                  const it = items[n] !== undefined ? porId.get(items[n]) : undefined;
                  return it ? (
                    <ShopCard key={it.itemId} item={it} compact onPick={() => quitar(it.itemId)} label={c.remove(it.name)} />
                  ) : (
                    <li key={`vacia-${n}`} className="dl-bd-empty" aria-label={c.emptySlot} />
                  );
                })}
              </ol>

              {/* Como abajo a la izquierda en la tienda del juego: el valor de lo
                  comprado y las tres barras de inversión en vertical. */}
              <div className="dl-bd-gamebar">
                <div className="dl-bd-vbars" aria-hidden="true">
                  {SLOTS.map((s) => (
                    <span key={s} className="dl-bd-vbar" data-cat={s}>
                      <span className="dl-bd-vbar-track">
                        <span style={{ height: `${Math.min(100, (inv[s].souls / 28800) * 100)}%` }} />
                      </span>
                      <img src={`${SHOP}/tabicon_${s}.webp`} alt="" width={18} height={18} />
                    </span>
                  ))}
                </div>
                <div className="dl-bd-total">
                  <span className="dl-bd-total-n">
                    <img src={`${SHOP}/currency.webp`} alt="" width={16} height={30} />
                    {inv.total.toLocaleString(locale)}
                  </span>
                  <span className="dl-bd-total-label">{c.itemValue}</span>
                </div>
              </div>

              <div className="dl-bd-actions">
                <button type="button" className="dl-bd-primary" onClick={copiarLink} disabled={items.length === 0}>
                  {copiado ? c.copied : c.copyLink}
                </button>
                {medidas?.builds[0] && (
                  <button
                    type="button"
                    className="dl-bd-secondary"
                    onClick={() => setItems(medidas.builds[0].items.map((i) => i.itemId).slice(0, BUILD_SLOTS))}
                  >
                    {c.loadMostPlayed}
                  </button>
                )}
                <button type="button" className="dl-bd-secondary" onClick={() => setItems([])} disabled={items.length === 0}>
                  {c.clear}
                </button>
              </div>
            </>
          )}
          <p className="dl-bd-aviso" aria-live="polite">{aviso}</p>
          {heroId !== null && (
            <>
              {stats.length > 0 && <StatsPanel rows={stats} />}

              <div className="dl-bd-inv">
                <h3 className="dl-bd-sub">{c.investment}</h3>
                {SLOTS.map((s) => {
                  const v = inv[s];
                  const signo = (b: number) => (s === "spirit" ? `+${b}` : `+${b}%`);
                  return (
                    <div className="dl-bd-inv-row" key={s} data-cat={s}>
                      <span className="dl-bd-inv-name">{c.damage[s]}</span>
                      <span className="dl-bd-inv-souls">{v.souls.toLocaleString(locale)}</span>
                      <span className="dl-bd-inv-bonus">{signo(v.bonus)}</span>
                      <span className="dl-bd-inv-next">
                        {v.next ? c.next(v.next.souls.toLocaleString(locale), signo(v.next.bonus)) : c.maxed}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="dl-bd-similar">
                <h3 className="dl-bd-sub">{c.similar}</h3>
                {items.length === 0 ? (
                  <p className="detail-note">{c.noSimilar}</p>
                ) : (
                  <ul>
                    {parecidas.slice(0, 3).map(({ b, n }) => (
                      <li key={b.id} className="dl-bd-sim">
                        <span className="dl-bd-sim-n">
                          {n}/{BUILD_SLOTS}
                        </span>
                        <span className="dl-bd-sim-text">
                          <span className="dl-bd-sim-name">
                            {copy.deadlock.buildCard.name(
                              copy.deadlock.buildCard.damage[b.damage],
                              copy.deadlock.buildCard.trait[b.trait]
                            )}
                          </span>
                          <span className="dl-bd-sim-meta">
                            {c.similarRow(b.matches.toLocaleString(locale), `${(b.winRate * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </>
          )}
        </aside>
      </div>

      {/* ── Debajo: el orden de habilidades y el editor de la guía ── */}
      {heroId !== null && (
        <div className="dl-bd-below">
          {habilidades.length > 0 && (
            <AbilityOrderEditor
              abilities={habilidades}
              path={senda}
              onChange={setSenda}
              onAdd={(id) => setSenda(addAbilityPoint(senda, id))}
              measured={masJugada?.path}
            />
          )}
          <GuideEditor
            guide={guia}
            active={modo === "guide" ? activa : null}
            porId={porId}
            onChange={setGuia}
            onSelect={(id) => {
              setActiva(id);
              setModo("guide");
            }}
            onAddCategory={nuevaCategoria}
            onSeed={sembrar}
            onDropFromShop={soltarDesdeTienda}
          />
        </div>
      )}
    </section>
  );
}
