/**
 * Mapas de CoH3 (2026-11-04): la lista por modo (jugadores, tamaño, puntos, ingresos) y la ficha de cada mapa con un
 * plano de sus puntos (dibujado con las coordenadas de los datos: victoria, combustible, munición, estratégicos y
 * salidas) y el porcentaje de victorias de cada facción ahí, de las estadísticas de partidas.
 */
import { useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { useCoh3Copy } from "../../coh3Copy";
import { tr, type L10n } from "../data";
import { SettledImg } from "../../SettledImg";
import { Coh3Loading, FactionTag, Panel, sortRows, useCohGame, useNum, useSort, type Nav } from "../ui";
import type { CohGame } from "../../route";
import { GAMES } from "../games";
import { loadSummary, peekSummary, wr, type Summary } from "../stats/data";
import { useMoreCopy } from "./copy";
import "./more.css";

export interface MapRow {
  slug: string;
  name: L10n;
  desc?: L10n | null;
  players: number;
  layout: string;
  size: [number, number];
  area: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } | null;
  points: { kind: string; tier: string | null; x: number; y: number }[];
  counts: Record<string, number>;
  income: { fuel?: number; manpower?: number; munition?: number } | null;
  community?: boolean;
  /** La imagen del mapa visto desde arriba (`/coh3/<minimap>.webp`), que cubre `size` entero centrada en 0,0. */
  minimap?: string | null;
}

type Mod<T> = { default: T };
type Coh2Map = { id: string; name: L10n; players: number; size: [number, number] | null; points: { x: number; y: number; kind: string }[]; minimap: string | null };

/** El tipo de punto de CoH2 (`ebp_name`) con la clave de CoH3; lo que no es un punto del mapa queda afuera. */
function tipoCoh2(k: string): string | null {
  if (k.includes("victory")) return "victory";
  if (k.startsWith("starting_position")) return "starting_position";
  if (k.includes("fuel")) return "fuel";
  if (k.includes("munition")) return "munitions";
  if (k.startsWith("territory_point") || k.includes("radio_tower")) return "strategic";
  return null;
}

/** Un mapa de CoH2 (`games/coh2/tools/maps.py`) con la forma de los de CoH3. */
export function fromCoh2(m: Coh2Map): MapRow {
  const points: MapRow["points"] = [];
  for (const p of m.points) {
    const kind = tipoCoh2(p.kind);
    if (kind) points.push({ kind, tier: null, x: p.x, y: p.y });
  }
  const counts: Record<string, number> = {};
  for (const p of points) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  const half = Math.max(1, Math.round(m.players / 2));
  return {
    slug: m.id,
    name: { en: m.name.en || m.name.es || m.id, es: m.name.es || m.name.en || null },
    players: m.players,
    layout: `${half}v${half}`,
    size: m.size ?? [0, 0],
    area: null,
    points,
    counts,
    income: null,
    minimap: m.minimap,
  };
}

// Uno por juego (2026-11-06). CoH2 deja afuera los escenarios de prueba.
const cache: Partial<Record<CohGame, MapRow[]>> = {};
/** `maps.json` entero de un juego: lo piden la lista y la ficha. */
export const loadMaps = (game: CohGame = "coh3"): Promise<MapRow[]> => {
  const hit = cache[game];
  if (hit) return Promise.resolve(hit);
  if (game === "coh2")
    return (import("@coh2/maps.json") as Promise<Mod<unknown>>).then(
      (m) => (cache.coh2 = (m.default as { list: Coh2Map[] }).list.filter((x) => !/test/.test(x.id) && x.players > 0 && (x.name.en || x.name.es)).map(fromCoh2)),
    );
  return (import("@coh3/maps.json") as Promise<Mod<unknown>>).then((m) => (cache.coh3 = m.default as MapRow[]));
};
export const peekMaps = (game: CohGame = "coh3") => cache[game] ?? null;

function useMaps() {
  const game = useCohGame();
  const [v, setV] = useState(() => peekMaps(game));
  useEffect(() => {
    if (v) return;
    let vivo = true;
    loadMaps(game).then((x) => vivo && setV(x), () => undefined);
    return () => {
      vivo = false;
    };
  }, [v, game]);
  return v;
}

export default function Coh3Maps({ route, navigate }: { route: Route; navigate: Nav }) {
  const maps = useMaps();
  if (!maps) return <Coh3Loading />;
  const m = route.detail ? maps.find((x) => x.slug === route.detail) : null;
  if (route.detail) return m ? <MapPage m={m} route={route} navigate={navigate} /> : <NotFound />;
  return <MapList maps={maps} route={route} navigate={navigate} />;
}

function NotFound() {
  const c = useCoh3Copy();
  return (
    <main className="c3-main">
      <Panel>
        <p>{c.t.notFound}</p>
      </Panel>
    </main>
  );
}

const LAYOUTS = ["1v1", "2v2", "3v3", "4v4"];
type Key = "name" | "layout" | "vp" | "fuel" | "mu" | "size";

function MapList({ maps, route, navigate }: { maps: MapRow[]; route: Route; navigate: Nav }) {
  const t = useMoreCopy();
  const { lang } = useLang();
  const num = useNum();
  const [lay, setLay] = useState("");
  const [comm, setComm] = useState(false);
  const { sort, th } = useSort<Key>({ key: "layout", dir: 1 }, ["name", "layout"]);
  const rows = maps.filter((m) => (!lay || m.layout === lay) && (comm || !m.community));
  const cols: Record<Key, (m: MapRow) => string | number | null> = {
    name: (m) => tr(m.name, lang).replace(/^\(\d\)\s*/, ""),
    layout: (m) => `${m.layout} ${tr(m.name, lang)}`,
    vp: (m) => m.counts.victory ?? 0,
    fuel: (m) => m.income?.fuel ?? null,
    mu: (m) => m.income?.munition ?? null,
    size: (m) => (m.size ? m.size[0] * m.size[1] : null),
  };
  return (
    <main className="c3-main c3-maps">
      <header className="c3-head">
        <div className="c3-k">{t.maps.k}</div>
        <h1 className="c3-h1">{t.maps.h1}</h1>
        <p className="c3-lede">{t.maps.lede}</p>
      </header>
      <div className="c3-filters">
        <div className="c3-seg" role="group" aria-label={t.maps.layout}>
          <button type="button" aria-pressed={!lay} onClick={() => setLay("")}>
            {t.all}
          </button>
          {LAYOUTS.map((l) => (
            <button key={l} type="button" aria-pressed={lay === l} onClick={() => setLay(l)}>
              {l}
            </button>
          ))}
        </div>
        <label className="c3-check">
          <input type="checkbox" checked={comm} onChange={(e) => setComm(e.target.checked)} /> {t.maps.community}
        </label>
      </div>
      <Panel className="c3-tablepanel">
        <table className="c3-table is-stack">
          <thead>
            <tr>
              {th("name", t.maps.name)}
              {th("layout", t.maps.layout, { className: "is-l" })}
              {th("vp", t.maps.vp)}
              {th("fuel", t.maps.fuelMin)}
              {th("mu", t.maps.muMin)}
              {th("size", t.maps.size)}
            </tr>
          </thead>
          <tbody>
            {sortRows(rows, cols, sort).map((m) => {
              const to: Route = { ...route, view: "coh3", c3Section: "maps", detail: m.slug };
              return (
                <tr key={m.slug} className="is-link" onClick={() => navigate(to)}>
                  <td>
                    <RouteLink to={to} onNavigate={navigate} className="c3-nm">
                      <MiniMap m={m} size={52} />
                      <span className="c3-nm-t">
                        <strong>{tr(m.name, lang).replace(/^\(\d\)\s*/, "")}</strong>
                        {m.community && <small>{t.maps.communityTag}</small>}
                      </span>
                    </RouteLink>
                  </td>
                  <td className="is-l" data-l={t.maps.layout}>
                    {m.layout}
                  </td>
                  <td data-l={t.maps.vp}>{num(m.counts.victory ?? 0)}</td>
                  <td data-l={t.maps.fuelMin}>{m.income?.fuel != null ? num(m.income.fuel, 1) : "—"}</td>
                  <td data-l={t.maps.muMin}>{m.income?.munition != null ? num(m.income.munition, 1) : "—"}</td>
                  <td data-l={t.maps.size}>{m.size ? `${num(m.size[0])} × ${num(m.size[1])}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </main>
  );
}

const KIND_ORDER = ["victory", "strategic", "fuel", "munitions", "starting_position"];

/** Los puntos de un mapa (victoria, recursos, salidas) en SVG sobre `W`×`H`; `x`/`y` pasan de metros a píxeles. */
function Points({ m, W, H, x, y, size }: { m: MapRow; W: number; H: number; x: (v: number) => number; y: (v: number) => number; size: number }) {
  const r = Math.max(2.5, size / 60);
  const pts = [...m.points].sort((p, q) => KIND_ORDER.indexOf(q.kind) - KIND_ORDER.indexOf(p.kind));
  return (
    <>
      {pts.map((p, i) =>
        p.kind === "starting_position" ? (
          <rect key={i} x={x(p.x) - r} y={y(p.y) - r} width={r * 2} height={r * 2} className={`c3-pt is-${p.kind}`} />
        ) : p.kind === "victory" ? (
          <polygon key={i} points={`${x(p.x)},${y(p.y) - r * 1.6} ${x(p.x) + r * 1.4},${y(p.y) + r} ${x(p.x) - r * 1.4},${y(p.y) + r}`} className={`c3-pt is-${p.kind}`} />
        ) : (
          <circle key={i} cx={x(p.x)} cy={y(p.y)} r={p.tier === "high" ? r * 1.4 : r} className={`c3-pt is-${p.kind}`} />
        ),
      )}
    </>
  );
}

/**
 * El mapa visto desde arriba con sus puntos encima (arriba es el norte). La imagen cubre `size` entero, centrada en
 * 0,0, como las coordenadas de los puntos. En las miniaturas de la lista (`size` < 120) va la imagen sola, que los
 * puntos no se distinguen. Sin imagen queda el plano de puntos sobre el área jugable.
 */
export function MiniMap({ m, size = 360, labels = false, lazy = true }: { m: MapRow; size?: number; labels?: boolean; lazy?: boolean }) {
  const game = useCohGame();
  const t = useMoreCopy();
  const [mw, mh] = m.size ?? [0, 0];
  if (m.minimap && mw && mh) {
    const W = size, H = Math.round((size * mh) / mw);
    const x = (v: number) => ((v + mw / 2) / mw) * W;
    const y = (v: number) => H - ((v + mh / 2) / mh) * H;
    const img = { src: `/${game}/${m.minimap}.webp`, alt: labels ? t.maps.planLabel : "", width: W, height: H, className: "c3-mini-img" };
    return (
      <span className="c3-mini has-img" style={{ width: W, aspectRatio: `${W} / ${H}` }}>
        {lazy ? <SettledImg {...img} /> : <img {...img} decoding="async" />}
        {size >= 120 && (
          <svg className="c3-mini-pts" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <Points m={m} W={W} H={H} x={x} y={y} size={size} />
          </svg>
        )}
      </span>
    );
  }
  const a = m.area;
  if (!a || !a.width || !a.height) return <span className="c3-mini is-empty" style={{ width: size, height: size }} aria-hidden="true" />;
  const W = size, H = Math.round((size * a.height) / a.width);
  const x = (v: number) => ((v - a.minX) / a.width) * W;
  const y = (v: number) => H - ((v - a.minY) / a.height) * H;
  return (
    <svg className="c3-mini" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role={labels ? "img" : undefined} aria-hidden={labels ? undefined : true} aria-label={labels ? t.maps.planLabel : undefined}>
      <rect width={W} height={H} className="c3-mini-bg" />
      <Points m={m} W={W} H={H} x={x} y={y} size={size} />
    </svg>
  );
}

function MapPage({ m, route, navigate }: { m: MapRow; route: Route; navigate: Nav }) {
  const t = useMoreCopy();
  const c = useCoh3Copy();
  const { lang } = useLang();
  const num = useNum();
  const game = useCohGame();
  const [s, setS] = useState<Summary | null>(() => peekSummary(game));
  useEffect(() => {
    if (s) return;
    let vivo = true;
    loadSummary(game).then((x) => vivo && setS(x), () => undefined);
    return () => {
      vivo = false;
    };
  }, [s]);
  const stats = s?.modes[m.layout as "1v1"]?.maps[m.slug];
  const name = tr(m.name, lang).replace(/^\(\d\)\s*/, "");
  const legend = useMemo(() => KIND_ORDER.filter((k) => m.counts[k]), [m]);
  return (
    <main className="c3-main c3-map">
      <p className="c3-crumb">
        <RouteLink to={{ ...route, view: "coh3", c3Section: "maps", detail: undefined }} onNavigate={navigate}>
          {t.maps.h1}
        </RouteLink>{" "}
        › {m.layout}
      </p>
      <header className="c3-head">
        <h1 className="c3-h1">{name}</h1>
        {m.desc && <p className="c3-desc">{tr(m.desc, lang)}</p>}
      </header>
      <div className="c3-grid2">
        <Panel k={t.maps.plan}>
          <div className="c3-mapwrap">
            <MiniMap m={m} size={520} labels lazy={false} />
          </div>
          <ul className="c3-maplegend">
            {legend.map((k) => (
              <li key={k}>
                <i className={`is-${k}`} /> {t.maps.kinds[k]} <b>{num(m.counts[k])}</b>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="c3-stack">
          <Panel k={t.maps.facts}>
            <div className="c3-facts">
              <div className="c3-fact">
                <small>{t.maps.layout}</small>
                <b>{m.layout}</b>
              </div>
              {m.size && (
                <div className="c3-fact">
                  <small>{t.maps.size}</small>
                  <b>
                    {num(m.size[0])} × {num(m.size[1])}
                  </b>
                </div>
              )}
              {m.income?.fuel != null && (
                <div className="c3-fact">
                  <small>{t.maps.fuelMin}</small>
                  <b>{num(m.income.fuel, 1)}</b>
                </div>
              )}
              {m.income?.munition != null && (
                <div className="c3-fact">
                  <small>{t.maps.muMin}</small>
                  <b>{num(m.income.munition, 1)}</b>
                </div>
              )}
              {m.income?.manpower != null && (
                <div className="c3-fact">
                  <small>{t.maps.mpMin}</small>
                  <b>{num(m.income.manpower, 1)}</b>
                </div>
              )}
            </div>
            <p className="c3-note">{t.maps.incomeNote}</p>
          </Panel>
          <Panel k={t.maps.winrates} lede={stats ? t.maps.winratesLede(num(stats.g), m.layout) : t.maps.noStats}>
            {stats && (
              <ul className="c3-mapwr">
                <li>
                  <span>{t.maps.axis}</span>
                  <b className={stats.axisW / stats.g >= 0.5 ? "c3-up" : "c3-down"}>{num((stats.axisW / stats.g) * 100, 1)} %</b>
                </li>
                {GAMES[game].factions.map((f) => {
                  const p = wr(stats.f[f]);
                  return (
                    <li key={f}>
                      <FactionTag f={f} size={22} />
                      <b className={p == null ? "" : p >= 0.5 ? "c3-up" : "c3-down"}>{p == null ? c.t.none : `${num(p * 100, 1)} %`}</b>
                      <small className="c3-dim">{stats.f[f] ? num(stats.f[f]!.g) : ""}</small>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}
