/**
 * La pestaña Planificador de granja de Stardew Valley (2026-10-26), maqueta A "Barra del juego": el mapa de la granja
 * ocupa todo, abajo van las categorías y la barra de inventario con lo que se coloca, y "Lo colocado" flota en una
 * esquina con la cuenta. Diseño: docs/superpowers/specs/2026-10-26-stardew-planificador-design.md.
 *
 * El prerender sale con la granja estándar vacía y los cultivos de primavera en la barra; lo guardado (o la granja de un
 * enlace) se lee después del primer dibujo. La barra no pasa de ~50 casilleros: no hace falta `LazyRows`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy, type PlannerCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { profit, type CropsData } from "../crops/calc";
import { DEFAULT_STATE, toOpts } from "../crops/state";
import { loadCrops, loadPlanner, peekCrops, peekPlanner, say } from "../data";
import { Box, Gold, Pill, SdLoading, type Nav } from "../ui";
import {
  Board,
  coverage,
  decodePlan,
  deserialize,
  encodePlan,
  erase,
  lines,
  place,
  serialize,
  totals,
  type Cat,
  type Line,
  type Placed,
  type PlannerData,
  type PlannerItem,
  type Season,
} from "./model";
import PlannerMap, { type Stroke } from "./PlannerMap";
import "../../styles/stardew-planner.css";

const CATS: Cat[] = ["crop", "water", "scare", "machine", "path", "tree", "building"];
/** Lo guardado en el navegador: la granja abierta y lo colocado en cada una. */
const STORE = "vestigo:stardew-planner:v1";
const HISTORY = 200;

type Bundle = { plan: PlannerData; crops: CropsData };
const peekBundle = (): Bundle | undefined => {
  const plan = peekPlanner();
  const crops = peekCrops();
  return plan && crops ? { plan, crops } : undefined;
};

export default function StardewPlanner({ route, navigate }: { route: Route; navigate: Nav }) {
  const { value, failed, retry } = useLoad("planner", peekBundle, () => Promise.all([loadPlanner(), loadCrops()]));
  if (!value) return <SdLoading onRetry={failed ? retry : undefined} />;
  return <Planner data={value.plan} crops={value.crops} route={route} navigate={navigate} />;
}

interface Stored {
  farm: string;
  plans: Record<string, string>;
}
function readStore(): Stored | null {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function writeStore(s: Stored): void {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // Sin almacenamiento (ventana privada): la granja vive mientras la pestaña esté abierta.
  }
}

function Planner({ data, crops, route, navigate }: { data: PlannerData; crops: CropsData; route: Route; navigate: Nav }) {
  const t = useStardewCopy();
  const p = t.planner;
  const { lang } = useLang();
  const items = useMemo(() => new Map(data.items.map((it) => [it.id, it])), [data]);
  const [farmKey, setFarmKey] = useState(data.farms[0].key);
  const [season, setSeason] = useState<Season>(0);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [past, setPast] = useState<Placed[][]>([]);
  const [future, setFuture] = useState<Placed[][]>([]);
  const [cat, setCat] = useState<Cat | "erase">("crop");
  const [selId, setSelId] = useState<string | null>("472");
  const [showRanges, setShowRanges] = useState(false);
  const [panel, setPanel] = useState(true);
  const [shared, setShared] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Lo colocado en las otras granjas, para volver a encontrarlo al cambiar de tipo.
  const others = useRef<Record<string, string>>({});
  const farm = data.farms.find((f) => f.key === farmKey) ?? data.farms[0];
  const board = useMemo(() => new Board(farm, items, placed), [farm, items, placed]);
  const cover = useMemo(() => coverage(board), [board]);

  // Lo guardado o la granja del enlace, después del primer dibujo (el prerender es la granja vacía).
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 760px)").matches) setPanel(false);
    let alive = true;
    const stored = readStore();
    if (stored) others.current = stored.plans;
    const apply = (s: ReturnType<typeof deserialize>, fromLink: boolean) => {
      if (!alive) return;
      if (s) {
        setFarmKey(s.farm);
        setSeason(s.season);
        setPlaced(s.placed);
        setShared(fromLink);
      }
      setReady(true);
    };
    if (/^#[pt]=/.test(window.location.hash)) {
      void decodePlan(window.location.hash, data).then((s) => apply(s, true));
    } else if (stored?.plans[stored.farm]) {
      apply(deserialize(stored.plans[stored.farm], data), false);
    } else {
      setReady(true);
    }
    return () => {
      alive = false;
    };
  }, [data]);

  // Se guarda solo; una granja de un enlace, recién cuando se la toca.
  useEffect(() => {
    if (!ready || shared) return;
    const text = serialize({ farm: farmKey, season, placed });
    others.current = { ...others.current, [farmKey]: text };
    writeStore({ farm: farmKey, plans: others.current });
  }, [ready, shared, farmKey, season, placed]);

  const commit = useCallback(
    (before: Placed[], after: Placed[]) => {
      if (before === after) return;
      setPast((h) => [...h.slice(-HISTORY + 1), before]);
      setFuture([]);
      if (shared) {
        setShared(false);
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      }
    },
    [shared],
  );

  // El trazo: lo pintado se ve al instante y queda como un solo paso de Deshacer.
  const live = useRef(placed);
  live.current = placed;
  const strokeStart = useRef<Placed[] | null>(null);
  const strokeErase = useRef(false);
  const selected = cat === "erase" ? null : (selId && items.get(selId)) || null;
  const selRef = useRef(selected);
  selRef.current = selected;
  const stroke: Stroke = useMemo(
    () => ({
      begin(er) {
        strokeStart.current = live.current;
        strokeErase.current = er;
      },
      at(x, y) {
        const b = new Board(farm, items, live.current);
        const next = strokeErase.current ? erase(b, x, y) : selRef.current ? place(b, selRef.current.id, x, y) : b.placed;
        if (next !== live.current) {
          live.current = next;
          setPlaced(next);
        }
      },
      end() {
        if (strokeStart.current) commit(strokeStart.current, live.current);
        strokeStart.current = null;
      },
      cancel() {
        if (strokeStart.current) {
          live.current = strokeStart.current;
          setPlaced(strokeStart.current);
        }
        strokeStart.current = null;
      },
    }),
    [farm, items, commit],
  );

  const undo = useCallback(() => {
    setPast((h) => {
      if (!h.length) return h;
      setFuture((f) => [live.current, ...f]);
      setPlaced(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((h) => [...h, live.current]);
      setPlaced(f[0]);
      return f.slice(1);
    });
  }, []);

  const bar = useMemo(() => {
    if (cat === "erase") return [];
    const list = data.items.filter((it) => it.cat === cat);
    if (cat !== "crop" && cat !== "tree") return list;
    const inSeason = (it: PlannerItem) => !it.seasons || it.seasons.includes(season);
    return [...list.filter(inSeason), ...list.filter((it) => !inSeason(it))];
  }, [data, cat, season]);

  // Teclas: 1–0 eligen casillero, Ctrl+Z / Ctrl+Y deshacen y rehacen, Escape suelta lo elegido.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        setSelId(null);
      } else if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const it = bar[e.key === "0" ? 9 : Number(e.key) - 1];
        if (it) setSelId(it.id);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [bar, undo, redo]);

  const pickFarm = (key: string) => {
    if (key === farmKey) return;
    others.current = { ...others.current, [farmKey]: serialize({ farm: farmKey, season, placed }) };
    const back = others.current[key] ? deserialize(others.current[key], data) : null;
    setFarmKey(key);
    setPlaced(back?.placed ?? []);
    setPast([]);
    setFuture([]);
  };
  const pickCat = (c: Cat | "erase") => {
    setCat(c);
    if (c !== "erase") setSelId(data.items.find((it) => it.cat === c && (!it.seasons || it.seasons.includes(season)))?.id ?? null);
  };
  const share = async () => {
    const hash = await encodePlan({ farm: farmKey, season, placed });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${hash}`);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNote(p.copied);
    } catch {
      setNote(p.copyFail);
    }
    window.setTimeout(() => setNote(null), 4000);
  };
  const clear = () => {
    if (!placed.length || !window.confirm(p.clearAsk)) return;
    commit(placed, []);
    setPlaced([]);
  };

  const outOfSeason = useCallback((id: string) => !!items.get(id)?.seasons && !items.get(id)!.seasons!.includes(season), [items, season]);
  const list = useMemo(() => lines(data.items, placed), [data, placed]);
  const sum = useMemo(() => totals(list), [list]);
  const gain = useMemo(() => {
    const opts = { ...toOpts(DEFAULT_STATE), season, sell: "raw" as const };
    const bySeed = new Map(crops.crops.map((c) => [c.seed, c]));
    let total = 0;
    const each = new Map<string, number>();
    for (const { item, n } of list) {
      const c = item.cat === "crop" && item.seed ? bySeed.get(item.seed) : undefined;
      if (!c) continue;
      const r = profit(c, opts);
      if (r.outOfSeason) continue;
      each.set(item.id, r.net * n);
      total += r.net * n;
    }
    return { total, each };
  }, [list, crops, season]);

  return (
    <main className="sd-main sd-pl">
      <Box className="sd-intro">
        <h1 className="sd-h1">{p.h1}</h1>
        <p className="sd-lede">{p.lede}</p>
      </Box>
      <Box className="sd-pl-box">
        <div className="sd-pl-map">
          <PlannerMap
            board={board}
            cover={cover}
            selected={selected}
            erasing={cat === "erase"}
            showRanges={showRanges}
            outOfSeason={outOfSeason}
            stroke={stroke}
            label={`${p.mapLabel}: ${say(farm.name, lang)}`}
          />
          {panel ? (
            <Panel p={p} lang={lang} list={list} sum={sum} gain={gain} cover={cover} data={data} route={route} navigate={navigate} outOfSeason={outOfSeason} onHide={() => setPanel(false)} />
          ) : (
            <button type="button" className="sd-btn sd-pl-open" onClick={() => setPanel(true)}>
              {p.showPlaced(placed.length)}
            </button>
          )}
        </div>
        <div className="sd-pl-cats" role="group" aria-label={p.cats.crop}>
          {CATS.map((c) => (
            <Pill on={cat === c} onClick={() => pickCat(c)} key={c}>
              {p.cats[c]}
            </Pill>
          ))}
          <Pill on={cat === "erase"} onClick={() => pickCat("erase")}>
            {p.cats.erase}
          </Pill>
        </div>
        {cat !== "erase" && (
          <div className="sd-pl-bar" role="listbox" aria-label={p.cats[cat]}>
            {bar.map((it, i) => (
              <button
                type="button"
                role="option"
                aria-selected={it.id === selId}
                className={`sd-pl-slot${it.id === selId ? " is-on" : ""}${it.seasons && !it.seasons.includes(season) ? " is-off" : ""}`}
                title={`${say(it.name, lang)}${it.seasons && !it.seasons.includes(season) ? ` (${p.outOfSeason})` : ""}`}
                onClick={() => setSelId(it.id)}
                key={it.id}
              >
                <SlotImage it={it} />
                {i < 10 && <kbd>{(i + 1) % 10}</kbd>}
                {it.nozzle && <span className="sd-pl-plus">+</span>}
              </button>
            ))}
          </div>
        )}
        <div className="sd-pl-foot">
          <label className="sd-pl-farm">
            <span className="sd-label">{p.farm}</span>
            <select value={farmKey} onChange={(e) => pickFarm(e.target.value)}>
              {data.farms.map((f) => (
                <option value={f.key} key={f.key}>
                  {say(f.name, lang)}
                </option>
              ))}
            </select>
          </label>
          <span className="sd-chips" role="group" aria-label={p.season}>
            <span className="sd-label">{p.season}</span>
            {t.seasons.map((s, i) => (
              <Pill on={season === i} onClick={() => setSeason(i as Season)} key={s}>
                {s}
              </Pill>
            ))}
          </span>
          <Pill on={showRanges} onClick={() => setShowRanges((v) => !v)}>
            {p.ranges}
          </Pill>
          <span className="sd-pl-acts">
            <button type="button" className="sd-btn" onClick={undo} disabled={!past.length}>
              {p.undo}
            </button>
            <button type="button" className="sd-btn" onClick={redo} disabled={!future.length}>
              {p.redo}
            </button>
            <button type="button" className="sd-btn" onClick={() => void share()}>
              {p.share}
            </button>
            <button type="button" className="sd-btn" onClick={clear} disabled={!placed.length}>
              {p.clear}
            </button>
          </span>
        </div>
        {(note || shared) && (
          <p className="sd-pl-note" role="status">
            {note ?? p.shared}
          </p>
        )}
        <p className="sd-muted sd-pl-help">
          <span className="sd-pl-mouse">{p.helpMouse}</span>
          <span className="sd-pl-touch">{p.helpTouch}</span>
        </p>
      </Box>
      <Box>
        <ul className="sd-pl-about">
          {p.about.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Box>
    </main>
  );
}

/** El dibujo de un casillero de la barra, a un múltiplo entero de su tamaño si entra (los edificios, achicados). */
function SlotImage({ it }: { it: PlannerItem }) {
  // En la barra van la semilla y el retoño (lo que se tiene en la mano), no la planta.
  const src = it.cat === "crop" || it.cat === "tree" ? `/stardew/items/${it.id}.png` : `/stardew/${it.img}`;
  const [w, h] = it.cat === "crop" || it.cat === "tree" ? [16, 16] : [it.iw, it.ih];
  const k = Math.max(w, h) <= 24 ? 2 : Math.max(w, h) <= 48 ? 1 : 44 / Math.max(w, h);
  return <img src={src} alt="" width={Math.round(w * k)} height={Math.round(h * k)} loading="lazy" decoding="async" />;
}

function Panel({
  p,
  lang,
  list,
  sum,
  gain,
  cover,
  data,
  route,
  navigate,
  outOfSeason,
  onHide,
}: {
  p: PlannerCopy;
  lang: "en" | "es";
  list: Line[];
  sum: ReturnType<typeof totals>;
  gain: { total: number; each: Map<string, number> };
  cover: ReturnType<typeof coverage>;
  data: PlannerData;
  route: Route;
  navigate: Nav;
  outOfSeason: (id: string) => boolean;
  onHide: () => void;
}) {
  const matName = (id: string) => (lang === "es" ? data.mats[id]?.[1] : data.mats[id]?.[0]) ?? id;
  const mats = (it: PlannerItem, n: number) => (it.mats ?? []).map(([m, q]) => `${(q * n).toLocaleString(lang)} ${matName(m)}`).join(", ");
  const warnings = [cover.dry.length && p.dry(cover.dry.length), cover.exposed.length && p.exposed(cover.exposed.length), cover.blocked.length && p.blocked(cover.blocked.length)].filter(Boolean) as string[];
  return (
    <aside className="sd-pl-panel" aria-label={p.placed}>
      <div className="sd-pl-ph">
        <span className="sd-label">{p.placed}</span>
        <button type="button" className="sd-pl-hide" onClick={onHide}>
          {p.hide}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="sd-muted">{p.empty}</p>
      ) : (
        <>
          <ul className="sd-pl-rows">
            {list.map(({ item, n }) => {
              const name = say(item.name, lang);
              const to = item.slug
                ? ({ ...route, view: "stardew", sdSection: "items", detail: item.slug } as Route)
                : ({ ...route, view: "stardew", sdSection: "farm", detail: undefined } as Route);
              const off = item.cat === "crop" && outOfSeason(item.id);
              return (
                <li key={item.id} className={off ? "is-off" : undefined}>
                  <SlotImage it={item} />
                  <div>
                    {n.toLocaleString(lang)}{" "}
                    <RouteLink to={to} onNavigate={navigate} className="sd-pl-link">
                      {name}
                    </RouteLink>
                    {item.nozzle && ` + ${matName(item.nozzle)}`}
                    <small>
                      {item.cat === "crop" || item.cat === "tree"
                        ? off
                          ? p.outOfSeason
                          : `${n} × ${(item.price ?? 0).toLocaleString(lang)}g`
                        : mats(item, n)}
                    </small>
                  </div>
                  {item.cat === "building" ? <Gold n={(item.cost ?? 0) * n} /> : gain.each.has(item.id) ? <Gold n={Math.round(gain.each.get(item.id)!)} /> : <span />}
                </li>
              );
            })}
          </ul>
          <dl className="sd-pl-tot">
            {sum.seeds > 0 && (
              <>
                <dt>{p.seeds}</dt>
                <dd>
                  <Gold n={sum.seeds} />
                </dd>
              </>
            )}
            {sum.build > 0 && (
              <>
                <dt>{p.build}</dt>
                <dd>
                  <Gold n={sum.build} />
                </dd>
              </>
            )}
            {sum.mats.length > 0 && (
              <>
                <dt>{p.mats}</dt>
                <dd className="sd-pl-mats">{sum.mats.map(([m, q]) => `${q.toLocaleString(lang)} ${matName(m)}`).join(", ")}</dd>
              </>
            )}
            {gain.each.size > 0 && (
              <>
                <dt title={p.profitNote}>{p.profit}</dt>
                <dd>
                  <Gold n={Math.round(gain.total)} />
                </dd>
              </>
            )}
          </dl>
          {warnings.length > 0 && (
            <ul className="sd-pl-warn">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
