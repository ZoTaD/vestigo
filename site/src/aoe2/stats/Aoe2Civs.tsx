/**
 * Civilizaciones de AoE2 (2026-11-20): la tabla de % de victorias por modo, banda de ELO y período, con la muestra de
 * cada cifra; y la ficha de cada civ (`/aoe2/civilizations/<slug>`): por banda, mejores y peores mapas y matchups, y la
 * duración promedio. La ficha completa (bonos, unidades) llega con la etapa 2.
 */
import { useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { sortRows, useSort } from "../../coh3/ui";
import { Aoe2Loading, CivShield, MuestraChica, Panel, civBySlug, type Nav } from "../ui";
import { BANDS, SMALL, avgMinutes, civTable, matchup, type CivRow, type Summary } from "./data";
import { CivOpenings, OpeningsView } from "./Openings";
import CivBonos from "../encyclopedia/CivBonos";
import { Civ, FILTROS_INICIALES, StatFilters, WrBar, mapIcon, mapLabel, pct, useSummary, type Filters } from "./parts";

export default function Aoe2Civs({ route, navigate }: { route: Route; navigate: Nav }) {
  const s = useSummary();
  const [f, setF] = useState<Filters>(FILTROS_INICIALES);
  if (s === undefined) return <Aoe2Loading />;
  if (s === null) return <SinDatos />;
  return (
    <>
      <StatFilters f={f} set={setF} s={s} />
      {route.detail && civBySlug(route.detail) ? (
        <Ficha slug={route.detail} s={s} f={f} route={route} navigate={navigate} />
      ) : (
        <>
          <Tabla s={s} f={f} route={route} navigate={navigate} />
          <OpeningsView s={s} f={f} />
        </>
      )}
    </>
  );
}

export function SinDatos() {
  const t = useAoe2Copy();
  return (
    <Panel>
      <p>{t.st.noData}</p>
    </Panel>
  );
}

type Key = "civ" | "wr" | "trend" | "pick" | "games";
function Tabla({ s, f, route, navigate }: { s: Summary; f: Filters; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const filas = useMemo(() => civTable(s, f), [s, f]);
  const { sort, th } = useSort<Key>({ key: "wr", dir: -1 }, ["civ"]);
  const cols: Record<Key, (r: CivRow) => string | number | null> = {
    civ: (r) => civBySlug(r.civ)?.name[lang] ?? r.civ,
    wr: (r) => r.wr,
    trend: (r) => r.trend,
    pick: (r) => r.pick,
    games: (r) => r.games,
  };
  const partidas = Math.round(filas.reduce((a, r) => a + (r.pick ? r.games / r.pick : 0), 0) / Math.max(1, filas.filter((r) => r.pick).length));
  if (!filas.length) return <SinDatos />;
  return (
    <Panel h={t.st.civsH} sub={t.st.civsSub(partidas)}>
      <table className="a2-table a2-civtable">
        <thead>
          <tr>
            {th("civ", t.st.cols.civ)}
            {th("wr", t.st.cols.wr, { className: "num" })}
            <th className="a2-hide-s" aria-hidden="true" />
            {th("trend", t.st.cols.trend, { className: "num a2-hide-s", title: t.st.trendTip })}
            {th("pick", t.st.cols.pick, { className: "num a2-hide-m" })}
            {th("games", t.st.cols.games, { className: "num" })}
          </tr>
        </thead>
        <tbody>
          {sortRows(filas, cols, sort).map((r) => (
            <tr key={r.civ}>
              <td>
                <RouteLink to={{ ...route, view: "aoe2", a2Section: "civilizations", detail: r.civ }} onNavigate={navigate}>
                  <Civ slug={r.civ} />
                </RouteLink>
              </td>
              <td className={`num ${r.wr >= 0.5 ? "a2-up" : "a2-down"}`}>
                <b>{pct(r.wr)}</b>
              </td>
              <td className="a2-hide-s a2-barcell">
                <WrBar wr={r.wr} />
              </td>
              <td className={`num a2-hide-s ${r.trend == null ? "" : r.trend >= 0 ? "a2-up" : "a2-down"}`}>{r.trend == null ? "–" : `${r.trend >= 0 ? "▲" : "▼"} ${Math.abs(r.trend * 100).toFixed(1)}`}</td>
              <td className="num a2-hide-m">{pct(r.pick)}</td>
              <td className="num">
                {r.games.toLocaleString(lang)}
                {r.small && <MuestraChica games={r.games} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Ficha({ slug, s, f, route, navigate }: { slug: string; s: Summary; f: Filters; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const c = civBySlug(slug)!;
  const w = s.windows[f.window];
  const porBanda = BANDS.map((b) => ({ b, r: civTable(s, { ...f, band: b }).find((x) => x.civ === slug) }));
  const mapas = Object.entries(w?.map ?? {})
    .map(([k, [g, v]]) => ({ k: k.split("|"), g, v }))
    .filter(({ k }) => k[0] === f.mode && k[2] === slug)
    .map(({ k, g, v }) => ({ map: k[1], games: g, wr: v / g }))
    .filter((m) => m.games >= 20);
  const rivales = (civTable(s, { ...f, mode: "rm1v1" }).map((r) => r.civ).filter((x) => x !== slug))
    .map((o) => ({ o, ...matchup(s, f.window, f.band, slug, o) }))
    .filter((m) => m.wr != null && m.games >= 20);
  const ordenar = <T extends { wr: number | null }>(xs: T[], desc: boolean) => [...xs].sort((a, b) => ((desc ? -1 : 1) * ((a.wr ?? 0) - (b.wr ?? 0)))).slice(0, 5);
  const min = avgMinutes(s, f.window, f.mode, slug);
  return (
    <>
      <Panel className="a2-who">
        <div className="a2-who-row">
          <CivShield civ={c} size={64} />
          <h1 className="a2-alias">{c.name[lang]}</h1>
        </div>
        {min != null && <p className="a2-note">{t.st.avgGame(min)}</p>}
      </Panel>
      <CivBonos slug={slug} route={route} navigate={navigate} />
      <Panel h={t.st.detailBands}>
        <ul className="a2-cards">
          {porBanda.map(({ b, r }) => (
            <li key={b}>
              <small>{t.st.bands[b]}</small>
              <b className={r && r.wr < 0.5 ? "a2-down" : undefined}>{pct(r?.wr ?? null)}</b>
              <span>
                {t.st.cols.games}: {(r?.games ?? 0).toLocaleString(lang)}
                {r && r.games < SMALL && <MuestraChica games={r.games} />}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <CivOpenings s={s} f={f} civ={slug} />
      <div className="a2-cols">
        <Lista h={t.st.bestMaps} xs={ordenar(mapas, true).map((m) => ({ key: m.map, icon: mapIcon(m.map), label: mapLabel(m.map, lang), wr: m.wr, games: m.games }))} />
        <Lista h={t.st.worstMaps} xs={ordenar(mapas, false).map((m) => ({ key: m.map, icon: mapIcon(m.map), label: mapLabel(m.map, lang), wr: m.wr, games: m.games }))} />
      </div>
      <div className="a2-cols">
        <Lista h={t.st.bestVs} xs={ordenar(rivales, true).map((m) => ({ key: m.o, civ: m.o, wr: m.wr!, games: m.games }))} />
        <Lista h={t.st.worstVs} xs={ordenar(rivales, false).map((m) => ({ key: m.o, civ: m.o, wr: m.wr!, games: m.games }))} />
      </div>
    </>
  );
}

function Lista({ h, xs }: { h: string; xs: { key: string; icon?: string; label?: string; civ?: string; wr: number; games: number }[] }) {
  const t = useAoe2Copy();
  return (
    <Panel h={h}>
      {xs.length ? (
        <ul className="a2-vs">
          {xs.map((x) => (
            <li key={x.key}>
              {x.civ ? (
                <Civ slug={x.civ} size={24} />
              ) : (
                <span className="a2-civ">
                  <img src={x.icon} alt="" width={24} height={24} loading="lazy" decoding="async" />
                  {x.label}
                </span>
              )}
              <span className={x.wr >= 0.5 ? "a2-up" : "a2-down"}>{t.st.vsLine(pct(x.wr), x.games)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-note">–</p>
      )}
    </Panel>
  );
}
