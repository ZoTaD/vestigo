import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import SectionHead from "./SectionHead";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { text } from "./localized";
import { catalog } from "./deadlockData";
import { useHeroKit } from "./deadlockHeroKitData";
import GameImg from "./GameImg";
import {
  DEFAULT_LAYERS,
  MAP,
  MAP_GROUPS,
  MAP_KINDS,
  TIMELINE_MAX_MIN,
  campHealthAt,
  campRange,
  campSoulsAt,
  clock,
  isUpAt,
  timerOf,
  type MapCamp,
  type MapKindId,
  type UnitSize,
} from "./deadlockMapData";
import {
  STOP_PREFIX,
  formatRoute,
  parseRoute,
  routeTotals,
  suggestRoute,
  type RouteHero,
  type Side,
  type Stop,
  type Wing,
} from "./deadlockRoutes";

/**
 * La pestaña Mapa: el mapa de Deadlock con lo que hay en cada lugar y un
 * armador de rutas de farmeo.
 *
 * **Habla el idioma del minimapa del juego** (maqueta A, elegida por ZoTaD el
 * 2026-10-12): fondo oscuro, los triángulos con barras para los campamentos,
 * rombos para los objetivos, los carriles con su color. Quien juega ya sabe
 * leerlo. Debajo va el relieve real del nivel (`map_relief.py`), que es lo que
 * el minimapa no trae: techos, puentes, árboles.
 *
 * Tres cosas alrededor del mapa:
 * - **el reloj**, con los hitos de aparición marcados: lo que todavía no
 *   apareció se ve apagado;
 * - **el panel**, con tres solapas: la ficha de lo que se tocó (con el retrato
 *   de sus criaturas), la ruta y las capas;
 * - **la tabla** de abajo, con todo en texto: es lo que lee un buscador.
 *
 * Tocar una marca abre su ficha; en modo ruta, además la suma como parada. Los
 * tiempos de una ruta son una estimación: ver `deadlockRoutes.ts`.
 *
 * El zoom y el arrastre son propios (es una imagen y un SVG, no un mapa de
 * teselas). Una capa apagada no se monta.
 */

/** El lado del SVG: las posiciones van de 0 a 1 y se multiplican por esto. */
const SIZE = 1000;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 14;
/** El lado del mapa, en píxeles, para el que están pensados los tamaños de las marcas. */
const DESIGN_SIDE = 820;
const ART = "/deadlock/game/map";

/** Los que se dibujan con una imagen del juego: el ancho con el que se pintan. */
const IMAGE: Partial<Record<MapKindId, number>> = {
  "camp-small": 18,
  "camp-medium": 18,
  "camp-large": 18,
  vault: 18,
  shop: 26,
  health: 12,
  midboss: 44,
  statue: 13,
  crate: 11,
  "tough-crate": 15,
};

/**
 * Los que tienen una foto del juego para la ficha y la lista de la ruta. En el
 * mapa siguen con su ícono: a 12 px una foto es una mancha.
 */
const PHOTO: Partial<Record<MapKindId, string>> = { crate: "crate-photo", "tough-crate": "tough-crate-photo" };

/** Los que llevan equipo en el tercer número del punto: 2 Hidden King, 3 Archmother. */
const TEAM_KINDS: MapKindId[] = ["walker", "base-guardian", "shrine", "patron"];

interface Mark {
  /** `c12`, `k45`… para lo que puede ser parada; `walker3` para lo que no. */
  id: string;
  kind: MapKindId;
  x: number;
  y: number;
  /** El grupo de reaparición de un rompible. */
  group: number;
  team?: number;
  camp?: MapCamp;
  /** Si puede ser parada de una ruta. */
  stop: boolean;
}

/** Todo lo que se puede dibujar, una sola vez. */
const MARKS: Mark[] = [
  ...MAP.camps.map((c, i) => ({ id: `c${i}`, kind: c.kind, x: c.x, y: c.y, group: 0, camp: c, stop: true })),
  ...MAP_KINDS.flatMap((kind) =>
    (MAP.points[kind] ?? []).map(([x, y, extra], i) => {
      const team = TEAM_KINDS.includes(kind) ? extra : undefined;
      const prefix = STOP_PREFIX[kind];
      return { id: `${prefix ?? kind}${i}`, kind, x, y, group: team === undefined ? extra ?? 0 : 0, team, stop: prefix !== undefined };
    })
  ),
];
const MARK = new Map(MARKS.map((m) => [m.id, m]));

interface View {
  k: number;
  x: number;
  y: number;
}

type Mode = "inspect" | "route";
type Panel = "info" | "route" | "layers";

/** Lo que la dirección guarda de una ruta: paradas, héroe y minuto. */
function readQuery(): { route: Stop[]; hero: number | null; minute: number | null } {
  if (typeof window === "undefined") return { route: [], hero: null, minute: null };
  const q = new URLSearchParams(window.location.search);
  const minute = Number(q.get("m"));
  return {
    route: parseRoute(q.get("r") ?? ""),
    hero: q.get("h") ? Number(q.get("h")) : null,
    minute: q.get("m") !== null && Number.isFinite(minute) ? Math.min(TIMELINE_MAX_MIN, Math.max(0, minute)) : null,
  };
}

/** `drain_creature_strong` → `drain_creature`: la familia, que es lo que tiene nombre. */
const family = (slug: string) => slug.replace(/_(weak|normal|strong|heavy)$/, "");

export default function DeadlockMap() {
  const copy = useCopy();
  const t = copy.deadlock.map;
  const sides = copy.deadlock.ladder.sides;
  const { lang } = useLang();
  const locale = useLocale();
  const n = (x: number) => Math.round(x).toLocaleString(locale);
  const kit = useHeroKit();

  const [layers, setLayers] = useState<Set<MapKindId>>(() => new Set(DEFAULT_LAYERS));
  const [lanes, setLanes] = useState(true);
  const [minute, setMinute] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  /** El lado del mapa en pantalla: el menor entre el ancho y el alto del cuadro. */
  const [side, setSide] = useState(DESIGN_SIDE);
  // Se abre armando una ruta (ZoTaD, 2026-10-12): es para lo que se viene. "Mirar" queda a un click.
  const [mode, setMode] = useState<Mode>("route");
  const [panel, setPanel] = useState<Panel>("route");
  const [route, setRoute] = useState<Stop[]>([]);
  const [heroId, setHeroId] = useState<number | null>(null);
  /** El daño por segundo escrito a mano; `null` usa el del arma base del héroe. */
  const [dpsOverride, setDpsOverride] = useState<number | null>(null);
  const [team, setTeam] = useState<Side>("amber");
  const [copied, setCopied] = useState(false);

  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const seconds = minute * 60;

  /** La vista entera, centrada en el cuadro. */
  const fit = () => {
    const el = frame.current;
    if (!el) return;
    const s = Math.min(el.clientWidth, el.clientHeight);
    setSide(s);
    setView({ k: 1, x: (el.clientWidth - s) / 2, y: (el.clientHeight - s) / 2 });
  };

  /** Encuadra un grupo de puntos: es lo que se hace al pedir una ruta sugerida. */
  const focus = (points: { x: number; y: number }[]) => {
    const el = frame.current;
    if (!el || points.length === 0) return fit();
    const s = Math.min(el.clientWidth, el.clientHeight);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.12);
    const k = Math.min(6, 0.7 / span);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    setSide(s);
    setView({ k, x: el.clientWidth / 2 - cx * s * k, y: el.clientHeight / 2 - cy * s * k });
  };

  /** Acerca o aleja dejando quieto el punto que está bajo (cx, cy). */
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = frame.current;
    if (!el) return;
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      const px = cx ?? el.clientWidth / 2;
      const py = cy ?? el.clientHeight / 2;
      const ratio = k / v.k;
      return { k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  };

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    // La rueda se escucha a mano: React la registra pasiva y no deja frenar el
    // scroll de la página mientras se hace zoom.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    // Sólo cuando el cuadro cambia de tamaño de verdad: si no, cualquier
    // reacomodo de la página deshacía el encuadre de una ruta.
    let last = "";
    const observer = new ResizeObserver(() => {
      const size = `${el.clientWidth}x${el.clientHeight}`;
      if (size !== last) fit();
      last = size;
    });
    observer.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una ruta compartida llega en la dirección. Se lee después de montar para
  // que el HTML prerenderizado y el primer render del navegador coincidan.
  useEffect(() => {
    const q = readQuery();
    if (q.route.length > 0) {
      setRoute(q.route);
      setMode("route");
      setPanel("route");
    }
    if (q.hero !== null) setHeroId(q.hero);
    if (q.minute !== null) setMinute(q.minute);
  }, []);

  /** Los héroes que tienen stats, por nombre. */
  const heroes = useMemo(() => {
    if (!kit) return [];
    return Object.entries(kit.heroes)
      .filter(([id, row]) => row.stats && catalog.heroes[id])
      .map(([id, row]) => ({
        id: Number(id),
        name: text(catalog.heroes[id].name, lang, id),
        img: catalog.heroes[id].img,
        speed: row.stats.moveSpeed + row.stats.sprintSpeed,
        // Sin arma medida (un héroe recién salido) se usa un daño genérico.
        dps: row.stats.weapon?.sustainedDps || row.stats.weapon?.dps || 40,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [kit, lang, locale]);
  const heroRow = heroes.find((h) => h.id === heroId) ?? heroes[0];
  const hero: RouteHero = { speed: heroRow?.speed ?? 8, dps: dpsOverride ?? heroRow?.dps ?? 40 };
  const totals = useMemo(() => routeTotals(route, hero, minute), [route, hero.speed, hero.dps, minute]); // eslint-disable-line react-hooks/exhaustive-deps

  // La dirección sigue a la ruta, para poder copiarla tal cual.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (route.length > 0) {
      url.searchParams.set("r", formatRoute(route));
      url.searchParams.set("m", String(minute));
      if (heroRow) url.searchParams.set("h", String(heroRow.id));
    } else {
      for (const key of ["r", "m", "h"]) url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [route, minute, heroRow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = () => {
    // El click que sigue a un arrastre no elige nada: lo frena `pick`.
    setTimeout(() => (drag.current = null), 0);
  };

  const toggleStop = (id: string) => {
    const stop = parseRoute(id)[0];
    if (!stop) return;
    setRoute((prev) => (prev.some((p) => p.id === id) ? prev.filter((p) => p.id !== id) : [...prev, stop]));
  };

  /** Tocar una marca: abre su ficha y, armando una ruta, la suma o la saca. */
  const pick = (mark: Mark) => {
    if (drag.current?.moved) return;
    setSelected(mark.id);
    if (mode === "route" && mark.stop) {
      toggleStop(mark.id);
      setPanel("route");
    } else {
      setPanel("info");
    }
  };

  const toggleLayer = (kind: MapKindId) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const suggest = (wing: Wing) => {
    const stops = suggestRoute(team, wing, hero, minute);
    setRoute(stops);
    setMode("route");
    focus(stops);
  };

  const share = () => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {}
    );
  };

  const unitsText = (units: MapCamp["units"]) =>
    (Object.entries(units) as [UnitSize, number][]).map(([size, count]) => t.units[size](count)).join(" · ");
  const creature = (slug: string) => t.creatures[family(slug) as keyof typeof t.creatures] ?? slug;
  const range = (r: [number, number] | null) => (r === null ? "—" : r[0] === r[1] ? n(r[0]) : `${n(r[0])}–${n(r[1])}`);

  /** Qué dice la tabla de los tiempos de un tipo: uno solo, o el abanico de sus grupos. */
  const timing = (kind: MapKindId, key: "initial" | "respawn", group?: number) => {
    const k = MAP.kinds[kind];
    if (k.timers && group === undefined) {
      const used = new Set((MAP.points[kind] ?? []).map((p) => p[2] ?? 0));
      const values = [...new Set(k.timers.filter((_, i) => used.has(i)).map((x) => x[key]))].sort((a, b) => a - b);
      return values.map(clock).join(" / ");
    }
    const timer = timerOf(k, group);
    if (!timer) return "—";
    return key === "initial" && timer.initial === 0 ? t.fromStart : clock(timer[key]);
  };

  const order = useMemo(() => new Map(route.map((s, i) => [s.id, i + 1])), [route]);
  // Lo que está en la ruta se dibuja aunque su capa esté apagada.
  const shown = useMemo(() => MARKS.filter((m) => layers.has(m.kind) || order.has(m.id)), [layers, order]);
  const chosen = selected ? MARK.get(selected) : undefined;
  /** El primer hito de cada cosa, para el reloj. */
  const ticks: [number, string][] = [
    [MAP.kinds["camp-small"].initial ?? 0, t.ticks.small],
    [MAP.kinds.crate.timers?.[0].initial ?? 0, t.ticks.crates],
    [MAP.kinds["camp-medium"].initial ?? 0, t.ticks.medium],
    [MAP.kinds["camp-large"].initial ?? 0, t.ticks.large],
  ];

  const icon = (kind: MapKindId) =>
    IMAGE[kind] ? <img src={`${ART}/${kind}.webp`} alt="" width={IMAGE[kind]} loading="lazy" decoding="async" draggable={false} /> : null;

  return (
    <main className="deadlock deadlock-map">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={t.title}
        accent={t.accent}
        lead={t.lead}
        controls={
          <div className="seg" role="group" aria-label={t.mode.label}>
            {(["route", "inspect"] as Mode[]).map((id) => (
              <button
                key={id}
                type="button"
                data-active={mode === id}
                aria-pressed={mode === id}
                onClick={() => {
                  setMode(id);
                  setPanel(id === "route" ? "route" : "info");
                }}
              >
                {t.mode[id]}
              </button>
            ))}
          </div>
        }
      />

      <div className="page dl-map-tool">
        <section className="dl-map-stage">
          <div
            className="dl-map-frame"
            data-mode={mode}
            ref={frame}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* `--k` es el zoom y `--inv` lo que achica las marcas para que crezcan menos que el mapa. */}
            <div
              className="dl-map-canvas"
              style={
                {
                  width: side,
                  height: side,
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                  "--k": view.k,
                  "--inv": side / DESIGN_SIDE / Math.pow(view.k, 0.6),
                } as CSSProperties
              }
            >
              {/* La imagen principal de la página: sin `lazy`. */}
              <img className="dl-map-relief" src={`${ART}/relief.webp`} alt={t.alt} width={2048} height={2048} draggable={false} />
              <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="dl-map-lines" aria-hidden="true">
                <path className="dl-map-ground" d={MAP.shape.ground} fillRule="evenodd" />
                {lanes &&
                  MAP.ziplines.map((z) => (
                    <polyline
                      key={z.lane}
                      className="dl-map-lane"
                      data-lane={z.lane}
                      points={z.points.map(([x, y]) => `${(x * SIZE).toFixed(1)},${(y * SIZE).toFixed(1)}`).join(" ")}
                    />
                  ))}
                {route.length > 1 && (
                  <polyline
                    className="dl-map-route"
                    points={route.map((s) => `${(s.x * SIZE).toFixed(1)},${(s.y * SIZE).toFixed(1)}`).join(" ")}
                  />
                )}
              </svg>
              <div className="dl-map-marks">
                {shown.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="dl-mk"
                    data-kind={m.kind}
                    data-team={m.team}
                    data-up={isUpAt(MAP.kinds[m.kind], seconds, m.group)}
                    data-n={order.get(m.id)}
                    data-sel={selected === m.id ? "" : undefined}
                    style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
                    title={t.kinds[m.kind][0]}
                    onClick={() => pick(m)}
                  >
                    {icon(m.kind)}
                  </button>
                ))}
              </div>
            </div>

            <div className="dl-map-zoom">
              <button type="button" onClick={() => zoomAt(1.5)} aria-label={t.zoomIn}>
                +
              </button>
              <button type="button" onClick={() => zoomAt(1 / 1.5)} aria-label={t.zoomOut}>
                −
              </button>
              <button type="button" onClick={fit} aria-label={t.zoomReset}>
                ⟲
              </button>
            </div>
          </div>

          <div className="dl-map-clock">
            <label htmlFor="dl-map-minute">{t.minute}</label>
            <div className="dl-map-scrub">
              {/* Los hitos son botones: llevan el reloj al momento en que aparece cada cosa. */}
              <div className="dl-map-ticks">
                {ticks.map(([s, label]) => (
                  <button key={label} type="button" aria-pressed={seconds === s} onClick={() => setMinute(s / 60)}>
                    <b>{clock(s)}</b> {label}
                  </button>
                ))}
              </div>
              <input
                id="dl-map-minute"
                type="range"
                min={0}
                max={TIMELINE_MAX_MIN}
                step={0.5}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
              />
            </div>
            <output htmlFor="dl-map-minute">{clock(seconds)}</output>
          </div>
        </section>

        <aside className="dl-map-panel">
          <div className="dl-map-tabs" role="tablist">
            {(["info", "route", "layers"] as Panel[]).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>
                {t.panel[id]}
                {id === "route" && route.length > 0 && <em>{route.length}</em>}
              </button>
            ))}
          </div>

          {panel === "info" && (
            <div className="dl-map-pane" aria-live="polite">
              {!chosen ? (
                <p className="box-empty">{mode === "route" ? t.route.hint : t.pick}</p>
              ) : (
                <>
                  <h2 className="dl-map-name">{t.kinds[chosen.kind][0]}</h2>
                  <p className="detail-note">{t.about[chosen.kind]}</p>
                  {chosen.camp && chosen.camp.creatures.length > 0 && (
                    <div className="dl-map-portraits">
                      {chosen.camp.creatures.map((slug) => (
                        <figure key={slug}>
                          <img src={`${ART}/${slug}.webp`} alt="" width={84} height={84} loading="lazy" decoding="async" />
                          <figcaption>{creature(slug)}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  {PHOTO[chosen.kind] && (
                    <div className="dl-map-portraits">
                      <img className="is-photo" src={`${ART}/${PHOTO[chosen.kind]}.webp`} alt="" width={84} height={84} loading="lazy" decoding="async" />
                    </div>
                  )}
                  {!chosen.camp && TEAM_KINDS.includes(chosen.kind) && (
                    <div className="dl-map-portraits">
                      <img
                        src={`${ART}/${chosen.kind === "patron" ? `patron-${chosen.team}` : chosen.kind}.webp`}
                        alt=""
                        width={84}
                        height={84}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  )}
                  <dl className="dl-map-facts">
                    {chosen.camp && Object.keys(chosen.camp.units).length > 0 && (
                      <>
                        <dt>{t.facts.units}</dt>
                        <dd>{unitsText(chosen.camp.units)}</dd>
                      </>
                    )}
                    {chosen.camp && (
                      <>
                        <dt>{t.facts.healthAt(clock(seconds))}</dt>
                        <dd>{n(campHealthAt(chosen.camp, minute))}</dd>
                      </>
                    )}
                    {chosen.camp && chosen.camp.souls > 0 && (
                      <>
                        <dt>{t.facts.soulsAt(clock(seconds))}</dt>
                        <dd>{n(campSoulsAt(chosen.camp, minute))}</dd>
                      </>
                    )}
                    {MAP.kinds[chosen.kind].souls !== undefined && (
                      <>
                        <dt>{t.facts.soulsAt(clock(seconds))}</dt>
                        <dd>{n((MAP.kinds[chosen.kind].souls ?? 0) + (MAP.kinds[chosen.kind].soulsPerMinute ?? 0) * minute)}</dd>
                        <dt>{t.facts.dropChance}</dt>
                        <dd>{Math.round((MAP.kinds[chosen.kind].dropChance ?? 1) * 100)}%</dd>
                      </>
                    )}
                    {!chosen.camp && MAP.kinds[chosen.kind].health !== undefined && (
                      <>
                        <dt>{t.facts.health}</dt>
                        <dd>{n(MAP.kinds[chosen.kind].health!)}</dd>
                      </>
                    )}
                    {chosen.team !== undefined && (
                      <>
                        <dt>{t.route.side}</dt>
                        <dd>{chosen.team === 2 ? sides.team0 : sides.team1}</dd>
                      </>
                    )}
                    {timerOf(MAP.kinds[chosen.kind], chosen.group) && (
                      <>
                        <dt>{t.facts.first}</dt>
                        <dd>{timing(chosen.kind, "initial", chosen.group)}</dd>
                        <dt>{t.facts.respawn}</dt>
                        <dd>{timing(chosen.kind, "respawn", chosen.group)}</dd>
                      </>
                    )}
                  </dl>
                  {chosen.stop && (
                    <button
                      type="button"
                      className="dl-map-btn"
                      onClick={() => {
                        toggleStop(chosen.id);
                        setPanel("route");
                      }}
                    >
                      {order.has(chosen.id) ? t.route.removeStop : t.route.addStop}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {panel === "route" && (
            <div className="dl-map-pane">
              <div className="dl-map-field">
                <span>{t.route.hero}</span>
                <div className="dl-map-hero">
                  {heroRow && <GameImg src={heroRow.img} alt="" width={34} height={34} loading="lazy" decoding="async" />}
                  <select
                    aria-label={t.route.hero}
                    value={heroRow?.id ?? ""}
                    onChange={(e) => {
                      setHeroId(Number(e.target.value));
                      setDpsOverride(null);
                    }}
                  >
                    {heroes.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    aria-label={t.route.dps}
                    title={t.route.dps}
                    min={1}
                    step={1}
                    value={Math.round(hero.dps)}
                    onChange={(e) => setDpsOverride(e.target.value === "" ? null : Math.max(1, Number(e.target.value)))}
                  />
                  <abbr title={t.route.dps}>DPS</abbr>
                </div>
              </div>

              <div className="dl-map-field">
                <span>{t.route.suggest}</span>
                <div className="dl-map-row">
                  {(["amber", "sapphire"] as Side[]).map((id) => (
                    <button key={id} type="button" className="dl-map-btn is-ghost" aria-pressed={team === id} onClick={() => setTeam(id)}>
                      {id === "amber" ? sides.team0 : sides.team1}
                    </button>
                  ))}
                </div>
                <div className="dl-map-row">
                  <button type="button" className="dl-map-btn" onClick={() => suggest("west")}>
                    {t.route.west}
                  </button>
                  <button type="button" className="dl-map-btn" onClick={() => suggest("east")}>
                    {t.route.east}
                  </button>
                </div>
              </div>

              {route.length === 0 ? (
                <p className="box-empty">{t.route.empty}</p>
              ) : (
                <>
                  <ol className="dl-map-legs">
                    {totals.legs.map((leg, i) => {
                      const camp = leg.stop.camp !== undefined ? MAP.camps[leg.stop.camp] : undefined;
                      return (
                        <li key={leg.stop.id} data-up={leg.up}>
                          <b className="dl-map-leg-n">{i + 1}</b>
                          {camp?.creatures[0] ? (
                            <img src={`${ART}/${camp.creatures[0]}.webp`} alt="" width={34} height={34} loading="lazy" decoding="async" />
                          ) : PHOTO[leg.stop.kind] ? (
                            <img className="is-photo" src={`${ART}/${PHOTO[leg.stop.kind]}.webp`} alt="" width={34} height={34} loading="lazy" decoding="async" />
                          ) : (
                            <span className="dl-map-leg-ic">{icon(leg.stop.kind)}</span>
                          )}
                          <span className="dl-map-leg-name">
                            {t.kinds[leg.stop.kind][0]}
                            <small>
                              {i > 0 && `${t.route.walk} ${n(leg.travel)} s · `}
                              {t.route.clear} {n(leg.clear)} s{!leg.up && ` · ${t.route.notUp}`}
                            </small>
                          </span>
                          <b className="dl-map-leg-souls">{n(leg.souls)}</b>
                          <button type="button" className="dl-map-leg-x" aria-label={t.route.remove} onClick={() => toggleStop(leg.stop.id)}>
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ol>

                  {/* La cifra es lo que deja la ruta, no un ritmo por minuto: nada
                      reaparece cada minuto (ZoTaD, 2026-10-12). Lo que sí se puede
                      decir es cuándo vuelve a estar entera para repetirla. */}
                  <dl className="dl-map-totals">
                    <div className="is-main">
                      <dt>{t.route.souls}</dt>
                      <dd>+{n(totals.souls)}</dd>
                    </div>
                    <div>
                      <dt>{t.route.time}</dt>
                      <dd>{clock(totals.total)}</dd>
                    </div>
                    <div>
                      <dt>{t.route.repeat}</dt>
                      <dd>{clock(totals.repeatIn)}</dd>
                    </div>
                  </dl>
                  {totals.lastBack && (
                    <p className="dl-map-repeat">
                      {t.route.repeatNote(clock(Math.max(0, totals.repeatIn - totals.total)), t.kinds[totals.lastBack.kind][0])}
                    </p>
                  )}

                  <div className="dl-map-row">
                    <button type="button" className="dl-map-btn" onClick={share}>
                      {copied ? t.route.copied : t.route.share}
                    </button>
                    <button type="button" className="dl-map-btn is-ghost" onClick={() => setRoute((prev) => prev.slice(0, -1))}>
                      {t.route.undo}
                    </button>
                    <button type="button" className="dl-map-btn is-ghost" onClick={() => setRoute([])}>
                      {t.route.clearAll}
                    </button>
                  </div>
                </>
              )}
              <p className="dl-map-note">{t.route.note}</p>
            </div>
          )}

          {panel === "layers" && (
            <div className="dl-map-pane">
              {MAP_GROUPS.map((group) => (
                <fieldset key={group} className="dl-map-group">
                  <legend>{t.groups[group]}</legend>
                  {MAP_KINDS.filter((kind) => MAP.kinds[kind].group === group).map((kind) => (
                    <label key={kind} className="dl-map-layer">
                      <input type="checkbox" checked={layers.has(kind)} onChange={() => toggleLayer(kind)} />
                      <span className="dl-map-layer-name">{t.kinds[kind][1]}</span>
                      <span className="dl-map-layer-n">{MAP.kinds[kind].count}</span>
                    </label>
                  ))}
                  {group === "places" && (
                    <label className="dl-map-layer">
                      <input type="checkbox" checked={lanes} onChange={() => setLanes((v) => !v)} />
                      <span className="dl-map-layer-name">{t.ziplines}</span>
                      <span className="dl-map-layer-n">{MAP.ziplines.length}</span>
                    </label>
                  )}
                </fieldset>
              ))}
              <ul className="dl-map-lanes">
                {MAP.ziplines.map((z) => (
                  <li key={z.lane} data-lane={z.lane}>
                    {t.lanes[String(z.lane) as keyof typeof t.lanes] ?? z.lane}
                  </li>
                ))}
              </ul>
              <p className="dl-map-note">{t.timeNote}</p>
            </div>
          )}
        </aside>
      </div>

      <div className="page">
        <section className="box">
          <div className="box-head">
            <h2 className="box-title">{t.table.title}</h2>
          </div>
          <p className="detail-note">{t.table.lead}</p>
          <div className="dl-map-table-wrap">
            <table className="dl-map-table">
              <thead>
                <tr>
                  <th scope="col">{t.table.what}</th>
                  <th scope="col">{t.table.count}</th>
                  <th scope="col">{t.table.health}</th>
                  <th scope="col">{t.table.souls}</th>
                  <th scope="col">{t.table.first}</th>
                  <th scope="col">{t.table.respawn}</th>
                </tr>
              </thead>
              <tbody>
                {MAP_KINDS.map((kind) => {
                  const k = MAP.kinds[kind];
                  const isCamp = k.group === "jungle";
                  const souls = isCamp ? campRange(kind, (c) => c.souls) : null;
                  return (
                    <tr key={kind}>
                      <th scope="row">{t.kinds[kind][1]}</th>
                      <td>{k.count}</td>
                      <td>{isCamp ? range(campRange(kind, (c) => c.health)) : k.health !== undefined ? n(k.health) : "—"}</td>
                      <td>{souls && souls[1] > 0 ? range(souls) : k.souls ? t.table.crateSouls(n(k.souls), n(k.soulsPerMinute ?? 0), Math.round((k.dropChance ?? 1) * 100)) : "—"}</td>
                      <td>{timing(kind, "initial")}</td>
                      <td>{timing(kind, "respawn")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="dl-tier-note">{t.table.note(sides.team0, sides.team1)}</p>
        </section>
      </div>
    </main>
  );
}
