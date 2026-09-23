// `DeadlockBuilderPage` y no `DeadlockBuilder`: la lógica vive en `deadlockBuilder.ts`, y en
// Windows dos archivos que sólo difieren en mayúsculas son el mismo (ver DeadlockVsBandCard).
import { useEffect, useMemo, useState } from "react";
import { useCopy, useLang, useLocale } from "./i18n";
import { PUBLISHED_BAND, useHeroes } from "./deadlockData";
import { useItems, SLOTS, type Item, type Slot } from "./deadlockItemsData";
import { useHeroBuilds } from "./deadlockBuildsData";
import { ConFicha } from "./DeadlockBuildCard";
import {
  addItem,
  removeItem,
  investment,
  overlap,
  encodeBuild,
  decodeBuild,
  upgradesOwned,
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
 * La build vive en el link (`?b=`), sin cuentas: se arma, se copia y se pega.
 */

const SHOP = "/deadlock/shop";
const PRECIOS = [800, 1600, 3200, 6400] as const;
const ROMANO = ["", "I", "II", "III", "IV"];

const escalonDe = (cost: number): number => PRECIOS.indexOf(cost as (typeof PRECIOS)[number]) + 1;

/** Lee `?b=` sin romper en el prerender, donde no hay `window`. */
function buildDelLink(): { heroId: number; items: number[] } | null {
  if (typeof window === "undefined") return null;
  const b = new URLSearchParams(window.location.search).get("b");
  return b ? decodeBuild(b) : null;
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

  // El link manda al entrar. Se lee después de montar para que el HTML del
  // prerender (sin build) y el primer dibujo del cliente sean el mismo.
  useEffect(() => {
    const b = buildDelLink();
    if (b) {
      setHeroId(b.heroId);
      setItems(b.items);
    }
  }, []);

  // Y la build vuelve al link en cada cambio, sin sumar entradas al historial.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (heroId === null) url.searchParams.delete("b");
    else url.searchParams.set("b", encodeBuild(heroId, items));
    window.history.replaceState(window.history.state, "", url);
  }, [heroId, items]);

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

  const medidas = useHeroBuilds(heroId);
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

  const inv = investment(items, lookup);
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
                          owned={items.includes(it.itemId)}
                          upgrade={upgradesOwned(lookup(it.itemId)!, items)}
                          starred={estrella.has(it.itemId) ? c.starred(heroe?.name ?? "") : undefined}
                          showValue={verValor}
                          onPick={() => (items.includes(it.itemId) ? quitar(it.itemId) : agregar(it.itemId))}
                          upgradeOf={it.upgradesFrom.find((u) => items.includes(u.itemId))?.name}
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
    </section>
  );
}

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
function ShopCard({
  item,
  owned,
  upgrade,
  upgradeOf,
  starred,
  showValue,
  compact,
  label,
  onPick,
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
  onPick: () => void;
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
          {item.upgradesTo.length > 0 && (
            <p className="dl-slot-chain">
              {c.upgradesTo}{" "}
              {item.upgradesTo.map((u) => (
                <img key={u.itemId} src={u.img} alt={u.name} title={u.name} width={22} height={22} />
              ))}
            </p>
          )}
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
        {showValue && !compact && (
          <span className="dl-bd-value" data-sign={v >= 1 ? "up" : v <= -1 ? "down" : "flat"}>
            {valor}
          </span>
        )}
      </button>
    </ConFicha>
  );
}
