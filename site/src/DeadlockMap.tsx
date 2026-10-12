import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import SectionHead from "./SectionHead";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
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

/**
 * La pestaña Mapa: el minimapa del juego con lo que hay en cada lugar.
 *
 * Tres controles sobre una sola imagen: **capas** (qué tipos se dibujan),
 * **minuto** (qué apareció ya, y cuánto dan los campamentos a esa altura) y
 * **el punto elegido**, que abre su ficha. Debajo va la misma información en
 * una tabla, que es lo que se lee en el teléfono y lo que indexa un buscador.
 *
 * El zoom y el arrastre son propios: es una imagen de 1024 px, no un mapa de
 * teselas, y una librería de mapas pesaría más que la página entera. Una capa
 * apagada no se monta: con las 665 cajas y estatuas prendidas el SVG pasa de
 * cien nodos a ochocientos.
 */

/** El lado del SVG: las posiciones van de 0 a 1 y se multiplican por esto. */
const SIZE = 1000;
const MAX_ZOOM = 6;

/** El radio de cada marca con la vista entera, en unidades del SVG. Ver `r` para el zoom. */
const RADIUS: Record<MapKindId, number> = {
  "camp-small": 6,
  "camp-medium": 7.5,
  "camp-large": 9,
  vault: 7.5,
  midboss: 11,
  crate: 2.6,
  statue: 3.2,
  health: 4.5,
  buff: 7,
  walker: 7,
  "base-guardian": 5,
  shrine: 6,
  patron: 9,
  shop: 6,
};

/** Los que llevan equipo en el tercer número del punto: 2 Hidden King, 3 Archmother. */
const TEAM_KINDS: MapKindId[] = ["walker", "base-guardian", "shrine", "patron"];

interface View {
  k: number;
  x: number;
  y: number;
}

/** Lo elegido: un campamento por índice, o un tipo entero. */
type Selection = { camp: number } | { kind: MapKindId } | null;

export default function DeadlockMap() {
  const copy = useCopy();
  const t = copy.deadlock.map;
  const sides = copy.deadlock.ladder.sides;
  const locale = useLocale();
  const n = (x: number) => Math.round(x).toLocaleString(locale);

  const [layers, setLayers] = useState<Set<MapKindId>>(() => new Set(DEFAULT_LAYERS));
  const [ziplines, setZiplines] = useState(true);
  const [minute, setMinute] = useState(10);
  const [selected, setSelected] = useState<Selection>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });

  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const seconds = minute * 60;

  /** Deja la vista adentro del cuadro: sin esto un arrastre largo pierde el mapa. */
  const clamp = (v: View, side: number): View => {
    const k = Math.min(MAX_ZOOM, Math.max(1, v.k));
    const min = side - side * k;
    return { k, x: Math.min(0, Math.max(min, v.x)), y: Math.min(0, Math.max(min, v.y)) };
  };

  /** Acerca o aleja dejando quieto el punto que está bajo (cx, cy). */
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const side = frame.current?.clientWidth ?? 0;
    if (side === 0) return;
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
      const px = cx ?? side / 2;
      const py = cy ?? side / 2;
      const ratio = k / v.k;
      return clamp({ k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio }, side);
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
    const side = frame.current?.clientWidth ?? 0;
    setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }, side));
  };
  const onPointerUp = () => {
    // El click que sigue a un arrastre no elige nada: lo frena `pick`.
    setTimeout(() => (drag.current = null), 0);
  };
  const pick = (s: Selection) => {
    if (drag.current?.moved) return;
    setSelected(s);
  };

  const toggle = (kind: MapKindId) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

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

  const camps = useMemo(() => MAP.camps.map((c, i) => ({ c, i })).filter(({ c }) => layers.has(c.kind)), [layers]);
  // Al acercar, la marca crece en pantalla pero menos que el mapa (raíz del
  // zoom): dividir por el zoom entero la dejaba más chica que su propio borde
  // y las cajas se veían como puntos negros.
  const r = (kind: MapKindId) => (RADIUS[kind] * 1.6) / Math.sqrt(view.k);
  const chosenCamp = selected && "camp" in selected ? MAP.camps[selected.camp] : null;
  const chosenKind: MapKindId | null = chosenCamp ? chosenCamp.kind : selected && "kind" in selected ? selected.kind : null;

  return (
    <main className="deadlock deadlock-map">
      <SectionHead eyebrow={copy.deadlock.eyebrow} title={t.title} accent={t.accent} lead={t.lead} />

      <div className="page has-rail dl-map-page">
        <div className="page-main">
          <section className="box dl-map-box">
            <div
              className="dl-map-frame"
              ref={frame}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                className="dl-map-canvas"
                style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
              >
                {/* La imagen principal de la página: sin `lazy`. */}
                <img src="/deadlock/game/minimap/midtown.webp" alt={t.alt} width={1024} height={1024} draggable={false} />
                {/* `--k` es el zoom: los trazos se dividen por él en el CSS, porque
                    `non-scaling-stroke` no descuenta la escala que pone el contenedor. */}
                <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="dl-map-marks" style={{ "--k": view.k } as CSSProperties}>
                  {ziplines &&
                    MAP.ziplines.map((z) => {
                      const points = z.points.map(([x, y]) => `${(x * SIZE).toFixed(1)},${(y * SIZE).toFixed(1)}`).join(" ");
                      // Dos trazos: uno oscuro debajo para que el color del carril
                      // se lea igual sobre la calle clara y sobre un edificio.
                      return (
                        <g key={z.lane} className="dl-map-zip" data-lane={z.lane}>
                          <polyline className="dl-map-zip-case" points={points} />
                          <polyline className="dl-map-zip-line" points={points} />
                        </g>
                      );
                    })}

                  {MAP_KINDS.filter((kind) => layers.has(kind) && MAP.points[kind]).map((kind) => (
                    <g key={kind} className="dl-map-kind" data-kind={kind}>
                      {MAP.points[kind]!.map(([x, y, extra], i) => {
                        const team = TEAM_KINDS.includes(kind) ? extra : undefined;
                        const up = isUpAt(MAP.kinds[kind], seconds, TEAM_KINDS.includes(kind) ? 0 : extra);
                        return (
                          <circle
                            key={i}
                            className="dl-map-mark"
                            data-team={team}
                            data-up={up}
                            data-on={chosenKind === kind && !chosenCamp ? "" : undefined}
                            cx={x * SIZE}
                            cy={y * SIZE}
                            r={r(kind)}
                            onClick={() => pick({ kind })}
                          />
                        );
                      })}
                    </g>
                  ))}

                  {camps.map(({ c, i }) => (
                    <circle
                      key={i}
                      className="dl-map-mark"
                      data-kind={c.kind}
                      data-up={isUpAt(MAP.kinds[c.kind], seconds)}
                      data-on={chosenCamp === c ? "" : undefined}
                      cx={c.x * SIZE}
                      cy={c.y * SIZE}
                      r={r(c.kind)}
                      onClick={() => pick({ camp: i })}
                    >
                      <title>{t.kinds[c.kind][0]}</title>
                    </circle>
                  ))}
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
            <p className="dl-tier-note">{t.timeNote}</p>
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
                    <span className="dl-map-swatch" data-kind={kind} aria-hidden="true" />
                    <span className="dl-map-layer-name">{t.kinds[kind][1]}</span>
                    <span className="dl-map-layer-n">{MAP.kinds[kind].count}</span>
                  </label>
                ))}
                {group === "places" && (
                  <label className="dl-map-layer">
                    <input type="checkbox" checked={ziplines} onChange={() => setZiplines((v) => !v)} />
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
                        <span className="dl-map-swatch" data-kind={kind} aria-hidden="true" />
                        {t.kinds[kind][1]}
                      </th>
                      <td>{k.count}</td>
                      <td>{isCamp ? range(campRange(kind, (c) => c.health)) : k.health !== undefined ? n(k.health) : "—"}</td>
                      <td>{souls && souls[1] > 0 ? range(souls) : "—"}</td>
                      <td>{timing(kind, "initial")}</td>
                      <td>{timing(kind, "respawn")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="dl-tier-note">
            {t.table.note(sides.team0, sides.team1)}
          </p>
        </section>
      </div>
    </main>
  );
}
