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
 * La pestaña Mapa: nuestro mapa de Deadlock, con lo que hay en cada lugar y un
 * armador de rutas de farmeo.
 *
 * El mapa es propio: la forma se calca del minimapa del juego a vectores
 * (`map_data.py`), así que no se pixela al acercar y se pinta con el estilo del
 * sitio. Cada cosa lleva su ícono —los campamentos usan el triángulo con barras
 * del juego— y su color.
 *
 * Dos modos sobre el mismo mapa: **mirar** (tocar una marca abre su ficha) y
 * **armar una ruta** (tocar una marca la suma como parada). La ruta se mide con
 * el héroe y el minuto elegidos; ver `deadlockRoutes.ts` para lo que esa
 * estimación cuenta y lo que no.
 *
 * El zoom y el arrastre son propios: es un SVG, no un mapa de teselas. Una capa
 * apagada no se monta: con las 665 cajas y estatuas prendidas el SVG pasa de
 * cien nodos a ochocientos.
 */

/** El lado del SVG: las posiciones van de 0 a 1 y se multiplican por esto. */
const SIZE = 1000;
const MAX_ZOOM = 12;

/** El tamaño de cada ícono con la vista entera, en unidades del SVG. Ver `iconSize`. */
const ICON: Record<MapKindId, number> = {
  "camp-small": 15,
  "camp-medium": 17,
  "camp-large": 19,
  vault: 16,
  midboss: 26,
  crate: 6,
  statue: 7.5,
  health: 10,
  buff: 15,
  walker: 17,
  "base-guardian": 12,
  shrine: 14,
  patron: 22,
  shop: 14,
};

/**
 * Los íconos, dibujados en una caja de 2×2 centrada en el origen.
 *
 * Los campamentos son el triángulo del minimapa del juego: solo el chico, con
 * una barra el mediano y con dos el grande.
 */
const GLYPH: Record<MapKindId, string> = {
  "camp-small": "M0 -0.85L0.85 0.7H-0.85Z",
  "camp-medium": "M0 -1L0.8 0.3H-0.8ZM-0.8 0.55H0.8V0.95H-0.8Z",
  "camp-large": "M0 -1L0.72 0H-0.72ZM-0.8 0.2H0.8V0.52H-0.8ZM-0.8 0.68H0.8V1H-0.8Z",
  vault: "M-0.8 -0.9H0.8V0.9H-0.8ZM0 -0.42A0.42 0.42 0 1 0 0 0.42A0.42 0.42 0 1 0 0 -0.42Z",
  midboss: "M0 -1L0.3 -0.4L0.95 -0.3L0.48 0.15L0.6 0.8L0 0.5L-0.6 0.8L-0.48 0.15L-0.95 -0.3L-0.3 -0.4Z",
  crate: "M-0.8 -0.8H0.8V0.8H-0.8Z",
  statue: "M0 -1L0.8 0L0 1L-0.8 0Z",
  health: "M-0.32 -0.95H0.32V-0.32H0.95V0.32H0.32V0.95H-0.32V0.32H-0.95V-0.32H-0.32Z",
  buff: "M0.2 -1L-0.7 0.15H-0.05L-0.25 1L0.7 -0.2H0.05Z",
  walker: "M-0.75 -0.9H0.75V0.25L0 1L-0.75 0.25Z",
  "base-guardian": "M-0.75 -0.9H0.75V0.25L0 1L-0.75 0.25Z",
  shrine: "M0 -1L0.75 -0.35V0.9H-0.75V-0.35Z",
  patron: "M-0.95 -0.7L-0.45 -0.1L0 -0.95L0.45 -0.1L0.95 -0.7V0.85H-0.95Z",
  shop: "M-0.9 -0.15L0 -0.95L0.9 -0.15H0.65V0.9H-0.65V-0.15Z",
};

/** Los que llevan equipo en el tercer número del punto: 2 Hidden King, 3 Archmother. */
const TEAM_KINDS: MapKindId[] = ["walker", "base-guardian", "shrine", "patron"];

interface View {
  k: number;
  x: number;
  y: number;
}

/** Lo elegido para la ficha: un campamento por índice, o un tipo entero. */
type Selection = { camp: number } | { kind: MapKindId } | null;
type Mode = "inspect" | "route";

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
  const [selected, setSelected] = useState<Selection>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>("inspect");
  const [route, setRoute] = useState<Stop[]>([]);
  const [heroId, setHeroId] = useState<number | null>(null);
  /** El daño por segundo escrito a mano; `null` usa el del arma base del héroe. */
  const [dpsOverride, setDpsOverride] = useState<number | null>(null);
  const [side, setSide] = useState<Side>("amber");
  const [copied, setCopied] = useState(false);

  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const seconds = minute * 60;

  // Una ruta compartida llega en la dirección. Se lee después de montar para
  // que el HTML prerenderizado y el primer render del navegador coincidan.
  useEffect(() => {
    const q = readQuery();
    if (q.route.length > 0) {
      setRoute(q.route);
      setMode("route");
      setLayers((prev) => new Set([...prev, ...q.route.map((s) => s.kind)]));
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

  /** Deja la vista adentro del cuadro: sin esto un arrastre largo pierde el mapa. */
  const clamp = (v: View, side: number): View => {
    const k = Math.min(MAX_ZOOM, Math.max(1, v.k));
    const min = side - side * k;
    return { k, x: Math.min(0, Math.max(min, v.x)), y: Math.min(0, Math.max(min, v.y)) };
  };

  /** Acerca o aleja dejando quieto el punto que está bajo (cx, cy). */
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const size = frame.current?.clientWidth ?? 0;
    if (size === 0) return;
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
      const px = cx ?? size / 2;
      const py = cy ?? size / 2;
      const ratio = k / v.k;
      return clamp({ k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio }, size);
    });
  };

  // La rueda se escucha a mano: React la registra pasiva y no deja frenar el
  // scroll de la página mientras se hace zoom.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const size = frame.current?.clientWidth ?? 0;
    setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }, size));
  };
  const onPointerUp = () => {
    // El click que sigue a un arrastre no elige nada: lo frena `pick`.
    setTimeout(() => (drag.current = null), 0);
  };

  /** Tocar una marca: abre su ficha y, armando una ruta, la suma o la saca. */
  const pick = (s: Selection, stopId?: string) => {
    if (drag.current?.moved) return;
    setSelected(s);
    if (mode !== "route" || !stopId) return;
    const stop = parseRoute(stopId)[0];
    if (!stop) return;
    setRoute((prev) => (prev.some((p) => p.id === stop.id) ? prev.filter((p) => p.id !== stop.id) : [...prev, stop]));
  };

  const toggle = (kind: MapKindId) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const suggest = (wing: Wing) => {
    const stops = suggestRoute(side, wing, hero, minute);
    setRoute(stops);
    setMode("route");
    setLayers((prev) => new Set([...prev, ...stops.map((s) => s.kind)]));
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

  const range = (r: [number, number] | null) => (r === null ? "—" : r[0] === r[1] ? n(r[0]) : `${n(r[0])}–${n(r[1])}`);

  /** Qué dice la tabla de los tiempos de un tipo: uno solo, o el abanico de sus grupos. */
  const timing = (kind: MapKindId, key: "initial" | "respawn") => {
    const k = MAP.kinds[kind];
    if (k.timers) {
      const used = new Set((MAP.points[kind] ?? []).map((p) => p[2] ?? 0));
      const values = [...new Set(k.timers.filter((_, i) => used.has(i)).map((x) => x[key]))].sort((a, b) => a - b);
      return values.map(clock).join(" / ");
    }
    const timer = timerOf(k);
    if (!timer) return "—";
    return key === "initial" && timer.initial === 0 ? t.fromStart : clock(timer[key]);
  };

  // Al acercar, el ícono crece en pantalla pero menos que el mapa (raíz del
  // zoom): así de lejos se ve y de cerca no tapa lo que tiene al lado.
  const iconSize = (kind: MapKindId) => (ICON[kind] * 1.25) / Math.sqrt(view.k);
  const glyph = (kind: MapKindId, x: number, y: number) =>
    `translate(${(x * SIZE).toFixed(1)} ${(y * SIZE).toFixed(1)}) scale(${(iconSize(kind) / 2).toFixed(2)})`;

  const camps = useMemo(() => MAP.camps.map((c, i) => ({ c, i })).filter(({ c }) => layers.has(c.kind)), [layers]);
  const inRoute = useMemo(() => new Map(route.map((s, i) => [s.id, i + 1])), [route]);
  const chosenCamp = selected && "camp" in selected ? MAP.camps[selected.camp] : null;
  const chosenKind: MapKindId | null = chosenCamp ? chosenCamp.kind : selected && "kind" in selected ? selected.kind : null;
  const badge = 15 / Math.sqrt(view.k);

  return (
    <main className="deadlock deadlock-map">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={t.title}
        accent={t.accent}
        lead={t.lead}
        controls={
          <div className="seg" role="group" aria-label={t.mode.label}>
            {(["inspect", "route"] as Mode[]).map((id) => (
              <button key={id} type="button" data-active={mode === id} aria-pressed={mode === id} onClick={() => setMode(id)}>
                {t.mode[id]}
              </button>
            ))}
          </div>
        }
      />

      <div className="page has-rail dl-map-page">
        <div className="page-main">
          <section className="box dl-map-box">
            <div
              className="dl-map-frame"
              data-mode={mode}
              ref={frame}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div className="dl-map-canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
                {/* `--k` es el zoom: los trazos se dividen por él en el CSS, porque
                    `non-scaling-stroke` no descuenta la escala que pone el contenedor. */}
                <svg
                  viewBox={`0 0 ${SIZE} ${SIZE}`}
                  className="dl-map-marks"
                  style={{ "--k": view.k } as CSSProperties}
                  role="img"
                  aria-label={t.alt}
                >
                  <path className="dl-map-buildings" d={MAP.shape.silhouette} fillRule="evenodd" />
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

                  {MAP_KINDS.filter((kind) => layers.has(kind) && MAP.points[kind]).map((kind) => (
                    <g key={kind} className="dl-map-kind" data-kind={kind}>
                      {MAP.points[kind]!.map(([x, y, extra], i) => {
                        const isTeam = TEAM_KINDS.includes(kind);
                        const prefix = STOP_PREFIX[kind];
                        const stopId = prefix ? `${prefix}${i}` : undefined;
                        return (
                          <path
                            key={i}
                            className="dl-map-mark"
                            d={GLYPH[kind]}
                            transform={glyph(kind, x, y)}
                            data-team={isTeam ? extra : undefined}
                            data-up={isUpAt(MAP.kinds[kind], seconds, isTeam ? 0 : extra)}
                            data-on={(chosenKind === kind && !chosenCamp) || (stopId && inRoute.has(stopId)) ? "" : undefined}
                            onClick={() => pick({ kind }, stopId)}
                          />
                        );
                      })}
                    </g>
                  ))}

                  {camps.map(({ c, i }) => (
                    <path
                      key={i}
                      className="dl-map-mark"
                      d={GLYPH[c.kind]}
                      transform={glyph(c.kind, c.x, c.y)}
                      data-kind={c.kind}
                      data-up={isUpAt(MAP.kinds[c.kind], seconds)}
                      data-on={chosenCamp === c || inRoute.has(`c${i}`) ? "" : undefined}
                      onClick={() => pick({ camp: i }, `c${i}`)}
                    >
                      <title>{t.kinds[c.kind][0]}</title>
                    </path>
                  ))}

                  {route.length > 0 && (
                    <g className="dl-map-route">
                      <polyline points={route.map((s) => `${(s.x * SIZE).toFixed(1)},${(s.y * SIZE).toFixed(1)}`).join(" ")} />
                      {route.map((s, i) => (
                        <g key={s.id} transform={`translate(${(s.x * SIZE + badge * 0.9).toFixed(1)} ${(s.y * SIZE - badge * 0.9).toFixed(1)})`}>
                          <circle r={badge * 0.62} />
                          <text fontSize={badge * 0.8} dy="0.35em">
                            {i + 1}
                          </text>
                        </g>
                      ))}
                    </g>
                  )}
                </svg>
              </div>

              <div className="dl-map-zoom">
                <button type="button" onClick={() => zoomAt(1.5)} aria-label={t.zoomIn}>
                  +
                </button>
                <button type="button" onClick={() => zoomAt(1 / 1.5)} aria-label={t.zoomOut}>
                  −
                </button>
                <button type="button" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label={t.zoomReset}>
                  ⟲
                </button>
              </div>
            </div>

            <div className="dl-map-time">
              <label htmlFor="dl-map-minute">{t.minute}</label>
              <input
                id="dl-map-minute"
                type="range"
                min={0}
                max={TIMELINE_MAX_MIN}
                step={0.5}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
              />
              <output htmlFor="dl-map-minute">{clock(seconds)}</output>
            </div>
            <p className="dl-tier-note">{mode === "route" ? t.route.hint : t.timeNote}</p>
          </section>

          {/* La ruta va debajo del mapa y a lo ancho: es una lista de tramos con
              cuatro cifras cada uno, y en el costado no entraba. */}
          <section className="box dl-map-route-box">
            <div className="box-head">
              <h2 className="box-title">{t.route.title}</h2>
            </div>
            <p className="detail-note">{t.route.lead}</p>

            <div className="dl-map-route-setup">
              <label>
                <span>{t.route.hero}</span>
                <span className="dl-map-hero">
                  {heroRow && <GameImg src={heroRow.img} alt="" width={24} height={24} loading="lazy" decoding="async" />}
                  <select
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
                </span>
              </label>
              <label>
                <span>{t.route.dps}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={Math.round(hero.dps)}
                  onChange={(e) => setDpsOverride(e.target.value === "" ? null : Math.max(1, Number(e.target.value)))}
                />
              </label>
              <div className="dl-map-suggest">
                <span>{t.route.suggest}</span>
                <div className="seg" role="group" aria-label={t.route.side}>
                  {(["amber", "sapphire"] as Side[]).map((id) => (
                    <button key={id} type="button" data-active={side === id} aria-pressed={side === id} onClick={() => setSide(id)}>
                      {id === "amber" ? sides.team0 : sides.team1}
                    </button>
                  ))}
                </div>
                <button type="button" className="dl-map-btn" onClick={() => suggest("west")}>
                  {t.route.west}
                </button>
                <button type="button" className="dl-map-btn" onClick={() => suggest("east")}>
                  {t.route.east}
                </button>
              </div>
            </div>
            <p className="dl-tier-note">{t.route.speed(hero.speed.toLocaleString(locale, { maximumFractionDigits: 1 }))}</p>

            {route.length === 0 ? (
              <p className="box-empty">{t.route.empty}</p>
            ) : (
              <>
                <ol className="dl-map-legs">
                  {totals.legs.map((leg, i) => (
                    <li key={leg.stop.id} data-up={leg.up}>
                      <span className="dl-map-leg-n">{i + 1}</span>
                      <span className="dl-map-swatch" data-kind={leg.stop.kind} aria-hidden="true" />
                      <span className="dl-map-leg-name">
                        {t.kinds[leg.stop.kind][0]}
                        {!leg.up && <em> · {t.route.notUp}</em>}
                      </span>
                      <span className="dl-map-leg-num" title={t.route.walk}>
                        {i === 0 ? "—" : `${n(leg.travel)} s`}
                      </span>
                      <span className="dl-map-leg-num" title={t.route.clear}>
                        {n(leg.clear)} s
                      </span>
                      <span className="dl-map-leg-num is-souls">{n(leg.souls)}</span>
                      <button
                        type="button"
                        className="dl-map-leg-x"
                        aria-label={t.route.remove}
                        onClick={() => setRoute((prev) => prev.filter((p) => p.id !== leg.stop.id))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ol>

                <dl className="dl-map-totals">
                  <div>
                    <dt>{t.route.time}</dt>
                    <dd>{clock(totals.total)}</dd>
                  </div>
                  <div>
                    <dt>{t.route.walk}</dt>
                    <dd>{clock(totals.travel)}</dd>
                  </div>
                  <div>
                    <dt>{t.route.clear}</dt>
                    <dd>{clock(totals.clear)}</dd>
                  </div>
                  <div>
                    <dt>{t.route.souls}</dt>
                    <dd>{n(totals.souls)}</dd>
                  </div>
                  <div className="is-main">
                    <dt>{t.route.rate}</dt>
                    <dd>{n(totals.soulsPerMin)}</dd>
                  </div>
                </dl>

                <div className="dl-map-route-actions">
                  <button type="button" className="dl-map-btn" onClick={share}>
                    {copied ? t.route.copied : t.route.share}
                  </button>
                  <button type="button" className="dl-map-btn" onClick={() => setRoute((prev) => prev.slice(0, -1))}>
                    {t.route.undo}
                  </button>
                  <button type="button" className="dl-map-btn" onClick={() => setRoute([])}>
                    {t.route.clearAll}
                  </button>
                </div>
              </>
            )}
            <p className="dl-tier-note">{t.route.note}</p>
          </section>
        </div>

        <aside className="page-rail is-first">
          <div className="box">
            <h2 className="box-title">{t.layers}</h2>
            {MAP_GROUPS.map((group) => (
              <fieldset key={group} className="dl-map-group">
                <legend>{t.groups[group]}</legend>
                {MAP_KINDS.filter((kind) => MAP.kinds[kind].group === group).map((kind) => (
                  <label key={kind} className="dl-map-layer">
                    <input type="checkbox" checked={layers.has(kind)} onChange={() => toggle(kind)} />
                    <svg className="dl-map-icon" data-kind={kind} viewBox="-1.2 -1.2 2.4 2.4" aria-hidden="true">
                      <path d={GLYPH[kind]} />
                    </svg>
                    <span className="dl-map-layer-name">{t.kinds[kind][1]}</span>
                    <span className="dl-map-layer-n">{MAP.kinds[kind].count}</span>
                  </label>
                ))}
                {group === "places" && (
                  <label className="dl-map-layer">
                    <input type="checkbox" checked={lanes} onChange={() => setLanes((v) => !v)} />
                    <span className="dl-map-swatch" data-kind="zipline" aria-hidden="true" />
                    <span className="dl-map-layer-name">{t.ziplines}</span>
                    <span className="dl-map-layer-n">{MAP.ziplines.length}</span>
                  </label>
                )}
                {group === "places" && (
                  <ul className="dl-map-lanes">
                    {MAP.ziplines.map((z) => (
                      <li key={z.lane} data-lane={z.lane}>
                        {t.lanes[String(z.lane) as keyof typeof t.lanes] ?? z.lane}
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            ))}
          </div>

          <div className="box dl-map-info" aria-live="polite">
            <h2 className="box-title">{chosenKind ? t.kinds[chosenKind][0] : t.pickTitle}</h2>
            {!chosenKind && <p className="box-empty">{t.pick}</p>}
            {chosenKind && (
              <>
                <p className="detail-note">{t.about[chosenKind]}</p>
                <dl className="dl-map-facts">
                  {chosenCamp && Object.keys(chosenCamp.units).length > 0 && (
                    <>
                      <dt>{t.facts.units}</dt>
                      <dd>{unitsText(chosenCamp.units)}</dd>
                    </>
                  )}
                  {chosenCamp ? (
                    <>
                      <dt>{t.facts.healthAt(clock(seconds))}</dt>
                      <dd>{n(campHealthAt(chosenCamp, minute))}</dd>
                      {chosenCamp.souls > 0 && (
                        <>
                          <dt>{t.facts.soulsAt(clock(seconds))}</dt>
                          <dd>{n(campSoulsAt(chosenCamp, minute))}</dd>
                        </>
                      )}
                    </>
                  ) : (
                    MAP.kinds[chosenKind].health !== undefined && (
                      <>
                        <dt>{t.facts.health}</dt>
                        <dd>{n(MAP.kinds[chosenKind].health!)}</dd>
                      </>
                    )
                  )}
                  <dt>{t.facts.first}</dt>
                  <dd>{timing(chosenKind, "initial")}</dd>
                  <dt>{t.facts.respawn}</dt>
                  <dd>{timing(chosenKind, "respawn")}</dd>
                </dl>
              </>
            )}
          </div>
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
                      <th scope="row">
                        <svg className="dl-map-icon" data-kind={kind} viewBox="-1.2 -1.2 2.4 2.4" aria-hidden="true">
                          <path d={GLYPH[kind]} />
                        </svg>
                        {t.kinds[kind][1]}
                      </th>
                      <td>{k.count}</td>
                      <td>{isCamp ? range(campRange(kind, (c) => c.health)) : k.health !== undefined ? n(k.health) : "—"}</td>
                      <td>{souls && souls[1] > 0 ? range(souls) : k.souls ? t.table.crateSouls(n(k.souls)) : "—"}</td>
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
