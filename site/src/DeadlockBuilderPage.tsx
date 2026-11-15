// `DeadlockBuilderPage` y no `DeadlockBuilder`: la lógica vive en `deadlockBuilder.ts`, y en
// Windows dos archivos que sólo difieren en mayúsculas son el mismo (ver DeadlockVsBandCard).
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { PUBLISHED_BAND, useHeroes } from "./deadlockData";
import { useItems, SLOTS, type Item, type Slot } from "./deadlockItemsData";
import { useHeroBuilds, bySlot, byPhase } from "./deadlockBuildsData";
import { useHeroKit } from "./deadlockHeroKitData";
import { AbilityOrderEditor, StatsPanel } from "./DeadlockBuilderEditor";
import { ItemIcon } from "./DeadlockItemTip";
import { buildStats } from "./deadlockBuildStats";
import SectionHead from "./SectionHead";
import RouteLink from "./RouteLink";
import GameImg from "./GameImg";
import { heroes as heroSlugs } from "./deadlockSlugs";
import { BUILDS_COPY } from "./deadlockBuildsCopy";
import { copyText } from "./deadlockBuildLinks";
import type { Route } from "./route";
import {
  addCategory,
  addToCategory,
  removeFromCategory,
  moveItem,
  moveCategory,
  removeCategory,
  updateCategory,
  addAbilityPoint,
  encodeGuide,
  decodeGuide,
  encodeAbilityPath,
  decodeAbilityPath,
  newCategoryId,
  GUIDE_DEFAULT_HEIGHT,
  GUIDE_MAX_CATEGORIES,
  GUIDE_MAX_ITEMS,
  GUIDE_NAME_MAX,
  GUIDE_DESC_MAX,
  type GuideCategory,
} from "./deadlockBuildGuide";
import { investment, overlap, encodeBuild, decodeBuild, finalBuild, BUILD_SLOTS, type BuilderItem } from "./deadlockBuilder";
import "./styles/deadlock-builds.css";

/**
 * El Armador de builds (`/deadlock/builder`), rehecho el 2026-11-15.
 *
 * El de antes era la tienda del juego copiada entera: 5.400 px de alto, la
 * build en una cajita al costado y dos modos ("build final" y "guía") que no
 * se explicaban solos. Pedido de ZoTaD: algo que se arme fácil y se entienda.
 * Plan: `docs/plans/2026-11-15-builds-comunidad-plan.md`.
 *
 * Ahora es como el editor del juego, pero compacto:
 * - **Etapas** (las categorías del juego) a la izquierda: se toca una y se le
 *   suman objetos.
 * - **Un buscador de objetos en lista** a la derecha, con filtros de categoría
 *   y precio y el tier de cada objeto, en vez de la tienda gigante.
 * - **Las 12 casillas finales salen solas** de las etapas (`finalBuild`), y de
 *   ahí las stats, la inversión y el parecido con las builds medidas.
 * - Debajo, el orden de habilidades (el mismo editor de antes).
 *
 * Todo vive en el link, como antes: `g` las etapas, `b` las 12 casillas
 * (también lleva el héroe), `a` el orden de habilidades y `n` el nombre. Un
 * link viejo con sólo `b` abre esas casillas como una etapa.
 */

const PRECIOS = [800, 1600, 3200, 6400] as const;
type SlotFilter = Slot | "all";

/** Lee el link sin romper en el prerender, donde no hay `window`. */
function paramsDelLink(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search);
}

const nueva = (name: string): GuideCategory => ({ id: newCategoryId(), name, desc: "", width: 12, height: GUIDE_DEFAULT_HEIGHT, items: [] });

export default function DeadlockBuilder({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const old = copy.deadlock.builder;
  const bc = BUILDS_COPY[lang];
  const c = bc.editor;

  const heroesMeta = useHeroes(PUBLISHED_BAND);
  const itemsMeta = useItems(PUBLISHED_BAND);

  const [heroId, setHeroId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [guia, setGuia] = useState<GuideCategory[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [senda, setSenda] = useState<number[]>([]);
  /** El `a=` del link, hasta que se sepa qué habilidades tiene el héroe. */
  const [sendaPendiente, setSendaPendiente] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const avisoT = useRef<number>();
  const decir = (m: string) => {
    setAviso(m);
    window.clearTimeout(avisoT.current);
    avisoT.current = window.setTimeout(() => setAviso(""), 2600);
  };
  useEffect(() => () => window.clearTimeout(avisoT.current), []);

  // El link manda al entrar. Se lee después de montar para que el HTML del
  // prerender (sin build) y el primer dibujo del cliente sean el mismo.
  useEffect(() => {
    const q = paramsDelLink();
    if (!q) return;
    const d = decodeBuild(q.get("b") ?? "");
    if (d) setHeroId(d.heroId);
    const g = decodeGuide(q.get("g") ?? "");
    if (g.length > 0) {
      setGuia(g);
      setActiva(g[0].id);
    } else if (d && d.items.length > 0) {
      // Un link del Armador viejo: las 12 casillas, como una etapa.
      const una = { ...nueva(BUILDS_COPY[lang].editor.defaultStages[2]), items: d.items.slice(0, GUIDE_MAX_ITEMS) };
      setGuia([una]);
      setActiva(una.id);
    }
    setName((q.get("n") ?? "").slice(0, 80));
    // Sólo si viene: en desarrollo React corre este efecto dos veces, y la
    // segunda lee el link después de que la sincronización borró `a`.
    const a = q.get("a");
    if (a) setSendaPendiente(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const medidas = useHeroBuilds(heroId);
  const kit = useHeroKit();
  const habilidades = useMemo(() => bySlot(medidas?.builds[0]?.abilities ?? []), [medidas]);

  useEffect(() => {
    if (sendaPendiente === null || habilidades.length === 0) return;
    setSenda(decodeAbilityPath(sendaPendiente, (slot) => habilidades[slot - 1]?.id));
    setSendaPendiente(null);
  }, [sendaPendiente, habilidades]);

  const porId = useMemo(() => new Map((itemsMeta?.items ?? []).map((i) => [i.itemId, i])), [itemsMeta]);
  const lookup = (id: number): BuilderItem | undefined => {
    const i = porId.get(id);
    return i ? { itemId: i.itemId, cost: i.cost, slot: i.slot, upgradesFrom: i.upgradesFrom.map((u) => u.itemId), upgradesTo: i.upgradesTo.map((u) => u.itemId) } : undefined;
  };
  const todos = useMemo(() => guia.flatMap((g) => g.items), [guia]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const final = useMemo(() => finalBuild(todos, lookup), [todos, porId]);

  // Y todo vuelve al link en cada cambio, sin sumar entradas al historial.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const poner = (k: string, v: string | null) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    poner("b", heroId === null ? null : encodeBuild(heroId, final));
    poner("g", guia.length > 0 && todos.length > 0 ? encodeGuide(guia) : null);
    poner("n", name.trim() || null);
    if (sendaPendiente === null) {
      const casilla = (id: number) => {
        const i = habilidades.findIndex((h) => h.id === id);
        return i >= 0 ? i + 1 : undefined;
      };
      poner("a", senda.length > 0 ? encodeAbilityPath(senda, casilla) : null);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [heroId, final, guia, todos, name, senda, habilidades, sendaPendiente]);

  const heroes = useMemo(() => [...(heroesMeta?.heroes ?? [])].sort((a, b) => a.name.localeCompare(b.name, lang)), [heroesMeta, lang]);
  const heroe = heroes.find((h) => h.heroId === heroId) ?? null;

  if (!itemsMeta || !heroesMeta) return <p className="detail-note">{copy.deadlock.loading}</p>;

  const nombre = (id: number) => porId.get(id)?.name ?? `#${id}`;
  const stageName = (g: GuideCategory, i: number) => g.name || c.newStage(i + 1);

  const elegirHeroe = (id: number) => {
    if (id === heroId) return;
    setHeroId(id);
    setSenda([]);
    if (guia.length === 0) {
      const g = c.defaultStages.map(nueva);
      setGuia(g);
      setActiva(g[0].id);
    }
  };

  const agregar = (id: number) => {
    let g = guia;
    let destino = activa && g.some((x) => x.id === activa) ? activa : null;
    if (!destino) {
      g = g.length > 0 ? g : c.defaultStages.map(nueva);
      destino = g[0].id;
      setActiva(destino);
    }
    const donde = g.find((x) => x.items.includes(id));
    if (donde) {
      decir(c.already(nombre(id), stageName(donde, g.indexOf(donde))));
      return;
    }
    const dest = g.find((x) => x.id === destino)!;
    if (dest.items.length >= GUIDE_MAX_ITEMS) return;
    setGuia(addToCategory(g, destino, id));
    decir(c.added(nombre(id), stageName(dest, g.indexOf(dest))));
  };
  const sacar = (catId: string, id: number) => {
    setGuia(removeFromCategory(guia, catId, id));
    decir(c.removed(nombre(id)));
  };
  const nuevaEtapa = () => {
    if (guia.length >= GUIDE_MAX_CATEGORIES) return;
    const g = addCategory(guia, c.newStage(guia.length + 1));
    setGuia(g);
    setActiva(g[g.length - 1].id);
  };

  /** Las compras de la build más jugada del héroe, partidas en inicio, mitad y final. */
  const masJugada = medidas?.builds[0];
  const sembrar = () => {
    if (!masJugada) return;
    const g: GuideCategory[] = byPhase(masJugada.buys).map(({ phase, buys }) => ({
      ...nueva(copy.deadlock.buildCard.phase[phase]),
      desc: copy.deadlock.buildCard.phaseRange[phase].slice(0, GUIDE_DESC_MAX),
      items: [...new Set(buys.map((b) => b.itemId))].slice(0, GUIDE_MAX_ITEMS),
    }));
    setGuia(g);
    setActiva(g[0]?.id ?? null);
    if (masJugada.path.length > 0) setSenda(masJugada.path.slice(0, 16));
  };
  const limpiar = () => {
    if (todos.length > 0 && !window.confirm(c.confirmClear)) return;
    const g = c.defaultStages.map(nueva);
    setGuia(g);
    setActiva(g[0].id);
    setSenda([]);
    setName("");
  };
  const copiarLink = async () => decir((await copyText(window.location.href)) ? c.copied : bc.copyFail);

  const inv = investment(final, lookup);
  const base = heroId !== null ? kit?.heroes[String(heroId)]?.stats : undefined;
  const stats = base ? buildStats(base, final.map((id) => porId.get(id)?.mods ?? {}), inv) : [];
  const parecidas = (medidas?.builds ?? [])
    .map((b) => ({ b, n: overlap(final, b.items.map((i) => i.itemId)) }))
    .sort((a, b) => b.n - a.n || b.b.matches - a.b.matches);
  const almasTotal = final.reduce((s, id) => s + (porId.get(id)?.cost ?? 0), 0);
  const heroSlug = heroe ? heroSlugs.toSlug.get(String(heroe.heroId)) : undefined;

  return (
    <section className="deadlock dl-builds dl-ed">
      <SectionHead
        eyebrow={c.kicker}
        title={c.title}
        lead={c.lead}
        controls={
          heroe && (
            <div className="dl-bl-ctas">
              <button type="button" className="dl-bl-btn is-primary" onClick={copiarLink} disabled={todos.length === 0}>
                {c.copyLink}
              </button>
              {masJugada && (
                <button type="button" className="dl-bl-btn" onClick={sembrar}>
                  {c.seed}
                </button>
              )}
              <button type="button" className="dl-bl-btn is-ghost" onClick={limpiar}>
                {c.clear}
              </button>
            </div>
          )
        }
      />

      {!heroe ? (
        <section aria-labelledby="dl-ed-pick">
          <h2 className="dl-bl-h2" id="dl-ed-pick">
            {c.pickHero}
          </h2>
          <ul className="dl-bl-heroes dl-ed-heroes">
            {heroes.map((h) => (
              <li key={h.heroId}>
                <button type="button" className="dl-bl-herocard" onClick={() => elegirHeroe(h.heroId)} style={h.color ? { ["--hero" as string]: h.color } : undefined}>
                  <GameImg src={h.card || h.img} alt="" width={96} height={128} loading="lazy" decoding="async" />
                  <span className="dl-bl-herocard-name">{h.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <div className="dl-ed-bar">
            <label className="dl-ed-hero">
              <GameImg src={heroe.img} alt="" width={44} height={44} />
              <span className="visually-hidden">{c.changeHero}</span>
              <select value={heroe.heroId} onChange={(e) => elegirHeroe(Number(e.target.value))} aria-label={c.changeHero}>
                {heroes.map((h) => (
                  <option key={h.heroId} value={h.heroId}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="dl-bl-search dl-ed-name">
              <span className="visually-hidden">{c.name}</span>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={c.namePlaceholder} aria-label={c.name} />
            </label>
            <span className="dl-ed-total">
              {c.totalSouls} <b className="dl-bl-souls">{almasTotal.toLocaleString(locale)}</b>
            </span>
            {heroSlug && (
              <RouteLink className="dl-bl-btn is-ghost" to={{ ...route, dlSection: "builds", detail: heroSlug }} onNavigate={navigate}>
                {c.openLibrary(heroe.name)}
              </RouteLink>
            )}
          </div>

          <div className="dl-ed-cols">
            <div className="dl-ed-left">
              <div className="dl-bl-step-head">
                <h2 className="dl-bl-h3">{c.stages}</h2>
              </div>
              <p className="dl-bl-dim dl-ed-hint">{c.stagesLead}</p>
              <ol className="dl-ed-stages">
                {guia.map((g, i) => (
                  <Etapa
                    key={g.id}
                    g={g}
                    i={i}
                    total={guia.length}
                    activa={g.id === activa}
                    c={c}
                    nombre={nombre}
                    quitarLabel={old.remove}
                    onSelect={() => setActiva(g.id)}
                    onRename={(v) => setGuia(updateCategory(guia, g.id, { name: v.slice(0, GUIDE_NAME_MAX) }))}
                    onDesc={(v) => setGuia(updateCategory(guia, g.id, { desc: v.slice(0, GUIDE_DESC_MAX) }))}
                    onMove={(dir) => setGuia(moveCategory(guia, g.id, dir))}
                    onRemove={() => {
                      const resto = removeCategory(guia, g.id);
                      setGuia(resto);
                      if (activa === g.id) setActiva(resto[0]?.id ?? null);
                    }}
                    onRemoveItem={(id) => sacar(g.id, id)}
                    onDrop={(from, id, index) => setGuia(moveItem(guia, from, id, g.id, index))}
                  />
                ))}
              </ol>
              {guia.length < GUIDE_MAX_CATEGORIES && (
                <button type="button" className="dl-bl-btn dl-ed-add" onClick={nuevaEtapa}>
                  + {c.addStage}
                </button>
              )}
            </div>

            <aside className="dl-ed-right" aria-label={c.items}>
              <Picker items={itemsMeta.items} enBuild={new Set(todos)} onPick={agregar} c={c} />
            </aside>
          </div>

          <p className="dl-bl-status dl-ed-aviso" role="status" aria-live="polite">
            {aviso}
          </p>

          <div className="dl-ed-below">
            <section className="dl-ed-panel" aria-labelledby="dl-ed-final">
              <h2 className="dl-bl-h3" id="dl-ed-final">
                {c.final}
              </h2>
              <p className="dl-bl-dim dl-bl-fine">{c.finalLead}</p>
              <ol className="dl-ed-slots">
                {Array.from({ length: BUILD_SLOTS }, (_, n) => {
                  const id = final[n];
                  return <li key={id ?? `v${n}`}>{id !== undefined ? <ItemIcon itemId={id} size={56} /> : <span className="dl-ed-slot-empty">
                        <span className="visually-hidden">{old.emptySlot}</span>
                      </span>}</li>;
                })}
              </ol>
              <div className="dl-ed-inv">
                <h3 className="dl-bl-h3">{old.investment}</h3>
                {SLOTS.map((s) => {
                  const v = inv[s];
                  const signo = (b: number) => (s === "spirit" ? `+${b}` : `+${b}%`);
                  return (
                    <div className="dl-ed-inv-row" key={s} data-cat={s}>
                      <span className="dl-ed-inv-name">{old.damage[s]}</span>
                      <span className="dl-bl-souls">{v.souls.toLocaleString(locale)}</span>
                      <b>{signo(v.bonus)}</b>
                      <span className="dl-bl-dim">{v.next ? old.next(v.next.souls.toLocaleString(locale), signo(v.next.bonus)) : old.maxed}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {stats.length > 0 && (
              <section className="dl-ed-panel dl-ed-stats">
                <StatsPanel rows={stats} />
              </section>
            )}

            <section className="dl-ed-panel" aria-labelledby="dl-ed-sim">
              <h2 className="dl-bl-h3" id="dl-ed-sim">
                {old.similar}
              </h2>
              {final.length === 0 ? (
                <p className="dl-bl-dim">{old.noSimilar}</p>
              ) : (
                <ul className="dl-ed-sim">
                  {parecidas.slice(0, 3).map(({ b, n }) => (
                    <li key={b.id}>
                      <b>
                        {n}/{BUILD_SLOTS}
                      </b>
                      <span>
                        {copy.deadlock.buildCard.name(copy.deadlock.buildCard.damage[b.damage], copy.deadlock.buildCard.trait[b.trait])}
                        <span className="dl-bl-dim">
                          {" · "}
                          {old.similarRow(b.matches.toLocaleString(locale), `${(b.winRate * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {habilidades.length > 0 && (
            <div className="dl-ed-abil">
              <AbilityOrderEditor abilities={habilidades} path={senda} onChange={setSenda} onAdd={(id) => setSenda(addAbilityPoint(senda, id))} measured={masJugada?.path} />
            </div>
          )}

          <section className="dl-ed-panel dl-ed-game">
            <h2 className="dl-bl-h3">{c.toGame}</h2>
            <p className="dl-bl-dim">{c.toGameText}</p>
            {heroSlug && (
              <RouteLink className="dl-bl-btn" to={{ ...route, dlSection: "builds", detail: heroSlug }} onNavigate={navigate} search="?t=mine">
                {c.upload}
              </RouteLink>
            )}
          </section>
        </>
      )}
    </section>
  );
}

type EdCopy = (typeof BUILDS_COPY)["en"]["editor"];
const TIPO = "application/x-vestigo-item";

function Etapa({
  g,
  i,
  total,
  activa,
  c,
  nombre,
  quitarLabel,
  onSelect,
  onRename,
  onDesc,
  onMove,
  onRemove,
  onRemoveItem,
  onDrop,
}: {
  g: GuideCategory;
  i: number;
  total: number;
  activa: boolean;
  c: EdCopy;
  nombre: (id: number) => string;
  quitarLabel: (item: string) => string;
  onSelect: () => void;
  onRename: (v: string) => void;
  onDesc: (v: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onRemoveItem: (id: number) => void;
  onDrop: (from: string, id: number, index: number) => void;
}) {
  const [sobre, setSobre] = useState(false);
  const leer = (e: React.DragEvent): { from: string; id: number } | null => {
    try {
      const v = JSON.parse(e.dataTransfer.getData(TIPO)) as { from: string; id: number };
      return typeof v.from === "string" && Number.isInteger(v.id) ? v : null;
    } catch {
      return null;
    }
  };
  return (
    <li
      className="dl-ed-stage"
      data-active={activa || undefined}
      data-over={sobre || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("input,button")) return;
        onSelect();
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TIPO)) return;
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        setSobre(false);
        const d = leer(e);
        if (!d) return;
        e.preventDefault();
        onDrop(d.from, d.id, g.items.length);
      }}
    >
      <div className="dl-ed-stage-head">
        <button type="button" className="dl-ed-stage-pick" aria-pressed={activa} onClick={onSelect} title={c.active}>
          <span className="dl-ed-stage-n">{i + 1}</span>
        </button>
        <input className="dl-ed-stage-name" value={g.name} maxLength={40} onChange={(e) => onRename(e.target.value)} onFocus={onSelect} placeholder={c.newStage(i + 1)} aria-label={c.stageName} />
        {activa && <span className="dl-ed-stage-active">{c.active}</span>}
        <span className="dl-ed-stage-tools">
          <button type="button" aria-label={c.moveUp} title={c.moveUp} disabled={i === 0} onClick={() => onMove(-1)}>
            ▲
          </button>
          <button type="button" aria-label={c.moveDown} title={c.moveDown} disabled={i === total - 1} onClick={() => onMove(1)}>
            ▼
          </button>
          <button type="button" aria-label={c.removeStage} title={c.removeStage} onClick={onRemove}>
            ✕
          </button>
        </span>
      </div>
      <input className="dl-ed-stage-desc" value={g.desc} maxLength={80} onChange={(e) => onDesc(e.target.value)} onFocus={onSelect} placeholder={c.stageNote} aria-label={c.stageNote} />
      <ul className="dl-ed-stage-items">
        {g.items.map((id, k) => (
          <li
            key={id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TIPO, JSON.stringify({ from: g.id, id }));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(TIPO)) e.preventDefault();
            }}
            onDrop={(e) => {
              e.stopPropagation();
              setSobre(false);
              try {
                const d = JSON.parse(e.dataTransfer.getData(TIPO)) as { from: string; id: number };
                e.preventDefault();
                onDrop(d.from, d.id, k);
              } catch {
                /* no era un objeto */
              }
            }}
          >
            <button type="button" className="dl-ed-item" onClick={() => onRemoveItem(id)} aria-label={quitarLabel(nombre(id))} title={quitarLabel(nombre(id))}>
              <ItemIcon itemId={id} size={52} tip={false} />
              <span className="dl-ed-item-x" aria-hidden="true">
                ✕
              </span>
            </button>
          </li>
        ))}
        {g.items.length === 0 && <li className="dl-bl-dim dl-ed-stage-empty">{activa ? c.emptyStage : c.emptyStageIdle}</li>}
      </ul>
    </li>
  );
}

function Picker({ items, enBuild, onPick, c }: { items: Item[]; enBuild: Set<number>; onPick: (id: number) => void; c: EdCopy }) {
  const { lang } = useLang();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [slot, setSlot] = useState<SlotFilter>("all");
  const [precio, setPrecio] = useState<number>(0);
  const cats = useCopy().deadlock.builder.cats;
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items
      .filter((i) => (slot === "all" || i.slot === slot) && (!precio || i.cost === precio) && (!t || i.name.toLowerCase().includes(t)))
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, lang));
  }, [items, q, slot, precio, lang]);
  let ultimo = -1;
  return (
    <>
      <label className="dl-bl-search dl-ed-search">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span className="visually-hidden">{c.search}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={c.search}
          aria-describedby="dl-ed-search-hint"
          onKeyDown={(e) => {
            // Enter suma el primero de la lista: con el teclado no hay que cruzar los filtros.
            if (e.key === "Enter" && q.trim() && lista[0]) {
              e.preventDefault();
              onPick(lista[0].itemId);
              setQ("");
            }
          }}
        />
      </label>
      <span className="visually-hidden" id="dl-ed-search-hint">
        {c.searchHint}
      </span>
      <div className="dl-bl-chips" role="group" aria-label={c.items}>
        {(["all", ...SLOTS] as SlotFilter[]).map((s) => (
          <button key={s} type="button" className="dl-bl-chip" data-slot={s} aria-pressed={slot === s} onClick={() => setSlot(s)}>
            {s === "all" ? c.all : cats[s]}
          </button>
        ))}
      </div>
      <div className="dl-bl-chips dl-ed-prices" role="group" aria-label={c.allPrices}>
        {[0, ...PRECIOS].map((p) => (
          <button key={p} type="button" className="dl-bl-chip" aria-pressed={precio === p} onClick={() => setPrecio(p)}>
            {p ? p.toLocaleString(locale) : c.allPrices}
          </button>
        ))}
      </div>
      <ul className="dl-ed-pool">
        {lista.length === 0 && <li className="dl-bl-dim dl-ed-pool-empty">{c.noItems}</li>}
        {lista.map((i) => {
          const grupo = i.cost !== ultimo;
          ultimo = i.cost;
          const ya = enBuild.has(i.itemId);
          return (
            <li key={i.itemId}>
              {grupo && <span className="dl-ed-pool-group">{i.cost.toLocaleString(locale)}</span>}
              <span className="dl-ed-pool-row" data-has={ya || undefined}>
                <ItemIcon itemId={i.itemId} size={36} />
                <button type="button" className="dl-ed-pool-btn" onClick={() => onPick(i.itemId)} aria-pressed={ya}>
                  <span className="dl-ed-pool-name">{i.name}</span>
                  {ya && <span className="dl-ed-pool-in">{c.inBuild}</span>}
                  <span className="dl-ed-pool-tier" data-tier={i.tier} title={c.delta}>
                    {i.tier}
                  </span>
                  <span className="dl-ed-pool-plus" aria-hidden="true">
                    +
                  </span>
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
