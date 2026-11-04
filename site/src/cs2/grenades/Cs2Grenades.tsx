/**
 * La pestaña Granadas de CS2 (2026-11-04), maqueta A "Radar" elegida por ZoTaD: el radar real del mapa con un pin por
 * destino (cuántas formas hay de llegar); al tocar uno aparecen las flechas desde cada lugar donde se tira, y al costado
 * la ficha del lineup: cómo tirarla, la técnica en palabras y el setpos para practicarla.
 *
 * Sin mapa en la dirección, la lista de mapas. El lado, el destino y el lineup elegidos viajan en la dirección
 * (`?s=ct&d=window&l=3535834e`) para compartirlos; el prerender dibuja el estado de arranque (lado T, nada elegido).
 */
import { useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import { useLang } from "../../i18n";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { Cs2Loading, type Nav } from "../ui";
import { GRENADE_TYPES, loadLineupIndex, loadMap, peekLineupIndex, peekMap, tx, type GrenadeType, type Lineup, type MapLineups, type Side } from "./data";
import { PRACTICE, useGrCopy } from "./copy";

/** La foto de cada mapa (`site/public/cs2/maps`), por su clave en los datos. */
const PHOTO: Record<string, string> = { dust2: "dust-ii" };
const photo = (map: string) => `/cs2/maps/${PHOTO[map] ?? map}.webp`;

export default function Cs2Grenades({ route, navigate }: { route: Route; navigate: Nav }) {
  const idx = useLoad("lineups", peekLineupIndex, loadLineupIndex);
  const map = route.detail ?? null;
  const data = useLoad(map ? `lineups:${map}` : null, () => (map ? peekMap(map) : undefined), () => loadMap(map!));
  if (idx.failed || data.failed) return <Cs2Loading onRetry={idx.failed ? idx.retry : data.retry} />;
  if (!idx.value || (map && data.value === undefined)) return <Cs2Loading />;
  if (!map) return <Hub route={route} navigate={navigate} />;
  return <MapView key={map} m={data.value ?? null} route={route} navigate={navigate} />;
}

function MapStrip({ route, navigate, on }: { route: Route; navigate: Nav; on?: string }) {
  const maps = peekLineupIndex()?.maps ?? [];
  const t = useGrCopy();
  return (
    <nav className="c2-gr-maps" aria-label={t.allMaps}>
      {maps.map((m) => (
        <RouteLink key={m.map} className={`c2-gr-map${m.map === on ? " is-on" : ""}`} to={{ ...route, view: "cs2", c2Section: "grenades", detail: m.map }} onNavigate={navigate} active={m.map === on}>
          <img src={photo(m.map)} alt="" width={112} height={63} loading="lazy" decoding="async" />
          <span>{m.name}</span>
        </RouteLink>
      ))}
    </nav>
  );
}

function Hub({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useGrCopy();
  const maps = peekLineupIndex()?.maps ?? [];
  return (
    <main className="c2-main c2-gr">
      <header className="c2-head">
        <h1 className="c2-h1">{t.hubH1}</h1>
        <p className="c2-lede">{t.hubLede}</p>
      </header>
      <ul className="c2-gr-hub">
        {maps.map((m) => (
          <li key={m.map}>
            <RouteLink className="c2-gr-card" to={{ ...route, view: "cs2", c2Section: "grenades", detail: m.map }} onNavigate={navigate}>
              <img src={photo(m.map)} alt="" width={640} height={360} loading="lazy" decoding="async" />
              <span className="c2-gr-card-t">
                <b>{m.name}</b>
                <span>{t.count(m.count)}</span>
                <span className="c2-gr-card-n">
                  {GRENADE_TYPES.filter((k) => m.counts[k]).map((k) => (
                    <span key={k}>
                      <i className={`c2-gr-dot is-${k}`} aria-hidden="true" />
                      {m.counts[k]} {t.typePlural[k].toLowerCase()}
                    </span>
                  ))}
                </span>
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>
      <p className="c2-note">{t.credit}</p>
    </main>
  );
}

/** La curva de una flecha de donde se tira a donde cae: se arquea hacia un costado, como el vuelo de la granada. */
export function arrowPath(l: Pick<Lineup, "from" | "to">): string {
  const [x1, y1] = l.from, [x2, y2] = l.to;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(80, len * 0.2);
  const cx = (x1 + x2) / 2 - (dy / len) * bend, cy = (y1 + y2) / 2 + (dx / len) * bend;
  return `M${x1},${y1} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2},${y2}`;
}

type Sel = { side: Side; dest: number | null; pick: string | null };

/** El estado inicial que trae la dirección (sólo en el navegador; el prerender arranca en T sin nada elegido). */
function readQuery(m: MapLineups): Sel {
  const q = new URLSearchParams(window.location.search);
  const side: Side = q.get("s") === "ct" ? "ct" : "t";
  const dIdx = m.dests.findIndex((d) => d.id === q.get("d"));
  const pick = m.lineups.find((l) => l.id === q.get("l"))?.id ?? null;
  return { side, dest: dIdx >= 0 ? dIdx : null, pick };
}

function writeQuery(m: MapLineups, s: Sel) {
  const q = new URLSearchParams(window.location.search);
  const set = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k));
  set("s", s.side === "ct" ? "ct" : null);
  set("d", s.dest != null ? m.dests[s.dest].id : null);
  set("l", s.pick);
  const qs = q.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

function MapView({ m, route, navigate }: { m: MapLineups | null; route: Route; navigate: Nav }) {
  const t = useGrCopy();
  const { lang } = useLang();
  const [sel, setSel] = useState<Sel>({ side: "t", dest: null, pick: null });
  const [types, setTypes] = useState<Set<GrenadeType>>(() => new Set(GRENADE_TYPES));
  const [noJump, setNoJump] = useState(false);
  const [names, setNames] = useState(true);
  const [floor, setFloor] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!m) return;
    const s = readQuery(m);
    setSel(s);
    if (s.dest != null) setFloor(m.dests[s.dest].floor);
  }, [m]);
  useEffect(() => {
    if (m) writeQuery(m, sel);
  }, [m, sel]);

  const vis = useMemo(
    () => (m ? m.lineups.filter((l) => l.side === sel.side && types.has(l.type) && !(noJump && l.tech.includes("jump"))) : []),
    [m, sel.side, types, noJump],
  );
  const byDest = useMemo(() => {
    const g = new Map<number, Lineup[]>();
    for (const l of vis) g.set(l.dest, [...(g.get(l.dest) ?? []), l]);
    return g;
  }, [vis]);

  if (!m)
    return (
      <main className="c2-main c2-gr">
        <MapStrip route={route} navigate={navigate} />
        <p className="c2-lede">{t.notFound}</p>
      </main>
    );

  const dest = sel.dest != null && byDest.has(sel.dest) ? sel.dest : null;
  const list = dest != null ? byDest.get(dest)! : [];
  const pick = list.find((l) => l.id === sel.pick) ?? list[0] ?? null;
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
  };
  const choose = (d: number | null, l: string | null = null) => {
    setSel((s) => ({ ...s, dest: d, pick: l }));
    if (d != null) setFloor(m.dests[d].floor);
  };
  const toggleType = (k: GrenadeType) =>
    setTypes((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const sideCount = (k: GrenadeType) => m.lineups.filter((l) => l.side === sel.side && l.type === k).length;
  const destsShown = [...byDest.keys()].sort((a, b) => byDest.get(b)!.length - byDest.get(a)!.length || tx(m.dests[a].name, lang).localeCompare(tx(m.dests[b].name, lang)));

  return (
    <main className="c2-main c2-gr" data-lang={route.lang}>
      <header className="c2-gr-head">
        <div className="c2-head">
          <h1 className="c2-h1">{t.h1(m.name)}</h1>
          <p className="c2-lede">{t.lede}</p>
        </div>
        <MapStrip route={route} navigate={navigate} on={m.map} />
      </header>

      <div className="c2-filters c2-gr-bar">
        <span className="c2-gr-lbl">{t.sideLbl}</span>
        <div className="c2-seg">
          {(["t", "ct"] as const).map((s) => (
            <button type="button" key={s} className={sel.side === s ? "is-on" : ""} aria-pressed={sel.side === s} onClick={() => setSel({ side: s, dest: null, pick: null })}>
              <b className={`c2-gr-side is-${s}`}>{t.side[s]}</b> {t.sideLong[s]}
            </button>
          ))}
        </div>
        <span className="c2-gr-lbl">{t.typeLbl}</span>
        <div className="c2-seg">
          {GRENADE_TYPES.filter((k) => m.lineups.some((l) => l.type === k)).map((k) => (
            <button type="button" key={k} className={types.has(k) ? "is-on" : ""} aria-pressed={types.has(k)} onClick={() => toggleType(k)}>
              <i className={`c2-gr-dot is-${k}`} aria-hidden="true" />
              {t.type[k]} <span className="c2-gr-n">{sideCount(k)}</span>
            </button>
          ))}
        </div>
        <span className="c2-gr-lbl">{t.throwLbl}</span>
        <div className="c2-seg">
          <button type="button" className={noJump ? "is-on" : ""} aria-pressed={noJump} onClick={() => setNoJump((v) => !v)}>
            {t.noJump}
          </button>
          <button type="button" className={names ? "is-on" : ""} aria-pressed={names} onClick={() => setNames((v) => !v)}>
            {t.names}
          </button>
        </div>
        {m.floors === 2 && (
          <div className="c2-seg">
            {t.floor.map((f, i) => (
              <button type="button" key={f} className={floor === i ? "is-on" : ""} aria-pressed={floor === i} onClick={() => setFloor(i)}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="c2-gr-grid">
        <div className="c2-gr-radar">
          <div className="c2-gr-radar-in">
            <img src={`/cs2/radar/${m.map}${floor ? "-lower" : ""}.webp`} alt="" width={1024} height={1024} decoding="async" />
            <svg viewBox="0 0 1024 1024" role="img" aria-label={t.radarLabel(m.name)}>
              {dest != null &&
                list
                  .filter((l) => l.from[2] === floor || m.dests[dest].floor === floor)
                  .map((l) => (
                    <g key={l.id} className={`c2-gr-way${pick?.id === l.id ? " is-on" : ""}`} onClick={() => setSel((s) => ({ ...s, pick: l.id }))}>
                      <path d={arrowPath(l)} />
                      <circle cx={l.from[0]} cy={l.from[1]} r={11} />
                    </g>
                  ))}
              {destsShown
                .filter((di) => m.dests[di].floor === floor)
                .map((di) => {
                  const d = m.dests[di];
                  const ls = byDest.get(di)!;
                  const tps = GRENADE_TYPES.filter((k) => ls.some((l) => l.type === k));
                  const on = dest === di;
                  return (
                    <g
                      key={d.id}
                      className={`c2-gr-pin${on ? " is-on" : dest != null ? " is-dim" : ""}`}
                      tabIndex={0}
                      role="button"
                      aria-pressed={on}
                      aria-label={t.pinLabel(tx(d.name, lang), ls.length)}
                      onClick={() => choose(on ? null : di)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          choose(on ? null : di);
                        }
                      }}
                    >
                      <circle className="c2-gr-ring" cx={d.x} cy={d.y} r={19} />
                      <text x={d.x} y={d.y}>
                        {ls.length}
                      </text>
                      {tps.map((k, i) => (
                        <circle key={k} className={`c2-gr-tdot is-${k}`} cx={d.x - (tps.length - 1) * 5.5 + i * 11} cy={d.y + 27} r={5.5} />
                      ))}
                      {names && (
                        <text className="c2-gr-name" x={d.x} y={d.y - 28}>
                          {tx(d.name, lang)}
                        </text>
                      )}
                    </g>
                  );
                })}
            </svg>
          </div>
          <p className="c2-gr-legend">
            {GRENADE_TYPES.map((k) => (
              <span key={k}>
                <i className={`c2-gr-dot is-${k}`} aria-hidden="true" />
                {t.type[k]}
              </span>
            ))}
            <span className="c2-gr-legend-n">{t.legendCount}</span>
          </p>
        </div>

        <div className="c2-gr-side-col">
          <section className="c2-panel c2-gr-panel" aria-live="polite">
            {dest == null ? (
              <>
                <h2 className="c2-h2">{t.dests}</h2>
                <p className="c2-dim">{t.destsLede(t.side[sel.side])}</p>
                {destsShown.length === 0 ? (
                  <p>{t.nothing}</p>
                ) : (
                  <ul className="c2-gr-dests">
                    {destsShown.map((di) => {
                      const ls = byDest.get(di)!;
                      return (
                        <li key={m.dests[di].id}>
                          <button type="button" onClick={() => choose(di)}>
                            <span className="c2-gr-dots">
                              {GRENADE_TYPES.filter((k) => ls.some((l) => l.type === k)).map((k) => (
                                <i key={k} className={`c2-gr-dot is-${k}`} aria-hidden="true" />
                              ))}
                            </span>
                            <b>{tx(m.dests[di].name, lang)}</b>
                            <span className="c2-gr-n">{ls.length}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div className="c2-gr-ph">
                  <h2 className="c2-h2">{tx(m.dests[dest].name, lang)}</h2>
                  <button type="button" className="c2-gr-x" onClick={() => choose(null)}>
                    {t.dests}
                  </button>
                </div>
                <p className="c2-dim">{t.ways(list.length)}</p>
                <ul className="c2-gr-ways">
                  {list.map((l) => (
                    <li key={l.id}>
                      <button type="button" className={pick?.id === l.id ? "is-on" : ""} aria-pressed={pick?.id === l.id} onClick={() => setSel((s) => ({ ...s, pick: l.id }))}>
                        <i className={`c2-gr-dot is-${l.type}`} aria-hidden="true" />
                        <b>{tx(l.title, lang)}</b>
                        {/* Lo que distingue a dos lineups con el mismo título: desde qué spawn, o cómo se tira. */}
                        <small>{l.variant ? t.from(l.variant) : l.tech.filter((k) => k !== "stand" && k !== "left").map((k) => t.tech[k]).join(" · ")}</small>
                      </button>
                    </li>
                  ))}
                </ul>
                {pick && (
                  <div className="c2-gr-ficha">
                    <p className="c2-gr-techs">
                      {pick.tech.map((k) => (
                        <span key={k}>{t.tech[k]}</span>
                      ))}
                    </p>
                    {pick.desc && (
                      <p className="c2-gr-aim">
                        <b>{t.aim}:</b> {tx(pick.desc, lang)}
                      </p>
                    )}
                    <div className="c2-gr-cmd">
                      <code>{pick.setpos}</code>
                      <button type="button" className="c2-btn" onClick={() => copy(pick.id, pick.setpos)}>
                        {copied === pick.id ? t.copied : t.copySetpos}
                      </button>
                    </div>
                    <p className="c2-note">{t.setposHint}</p>
                  </div>
                )}
              </>
            )}
          </section>
          <section className="c2-panel c2-gr-practice">
            <h2 className="c2-h2">{t.practice}</h2>
            <p className="c2-dim">{t.practiceLede}</p>
            <button type="button" className="c2-btn is-ghost" onClick={() => copy("practice", PRACTICE)}>
              {copied === "practice" ? t.copied : t.copyPractice}
            </button>
          </section>
        </div>
      </div>
      <p className="c2-note">{t.credit}</p>
    </main>
  );
}
