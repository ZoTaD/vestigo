/**
 * La pestaña Ranking de AoE2 (2026-11-20): selector de modo, el n.º 1 destacado, la tabla ordenable (de a 200 filas
 * con "Cargar más"), filtro por país sobre lo cargado y el buscador de jugadores. Los datos salen de `/api/aoe2/*`.
 * "Subieron hoy" y la distribución de ELO llegan con las fotos diarias del colector (Task 8).
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import RouteLink from "../../RouteLink";
import { LazyRows } from "../../LazyRows";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { countryName } from "../../coh3/live/ui";
import { sortRows, useSort } from "../../coh3/ui";
import { Aoe2Loading, ModePicker, Panel, type Aoe2Mode, type Nav } from "../ui";
import { LEADERBOARD_OF, type Aoe2Row, type SearchResult } from "../api/wel";
import { climbers, countriesOf, percentileOf, type Bucket } from "./logic";

/** La foto diaria del colector (`games/aoe2/stats/ladder/<id>.json`). */
type LadderSnap = { date: string; total: number; hist: Bucket[]; top: [number, number, string?][]; prev?: { date: string; top: [number, number, string?][] } };
const FOTOS = import.meta.glob<{ default: LadderSnap }>("../../../../games/aoe2/stats/ladder/*.json");
const fotoDe = (id: number) => FOTOS[`../../../../games/aoe2/stats/ladder/${id}.json`]?.().then((m) => m.default) ?? Promise.resolve(null);

const PAGINA = 200;
type Key = "rank" | "player" | "elo" | "max" | "wins" | "wr" | "streak" | "last";
const COLS: Record<Key, (r: Aoe2Row) => string | number> = {
  rank: (r) => r.rank,
  player: (r) => r.alias.toLowerCase(),
  elo: (r) => r.elo,
  max: (r) => r.maxElo,
  wins: (r) => r.wins,
  wr: (r) => r.wins / Math.max(1, r.wins + r.losses),
  streak: (r) => r.streak,
  last: (r) => r.lastMatch,
};

export default function Aoe2Leaderboards({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const [mode, setMode] = useState<Aoe2Mode>("rm1v1");
  const [rows, setRows] = useState<Aoe2Row[]>([]);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [intento, setIntento] = useState(0);
  const [pais, setPais] = useState("");
  const { sort, th } = useSort<Key>({ key: "rank", dir: 1 }, ["rank", "player"]);

  const cargar = (desde: number, reemplazar: boolean) => {
    setEstado("cargando");
    return fetch(`/api/aoe2/leaderboard?id=${LEADERBOARD_OF[mode]}&start=${desde}&count=${PAGINA}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { total: number; rows: Aoe2Row[] }) => {
        setTotal(d.total);
        setRows((prev) => (reemplazar ? d.rows : [...prev, ...d.rows]));
        setEstado("ok");
      })
      .catch(() => setEstado("error"));
  };
  useEffect(() => {
    setRows([]);
    setPais("");
    void cargar(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, intento]);

  const [foto, setFoto] = useState<LadderSnap | null>(null);
  useEffect(() => {
    setFoto(null);
    let vivo = true;
    void fotoDe(LEADERBOARD_OF[mode]).then((f) => vivo && setFoto(f));
    return () => {
      vivo = false;
    };
  }, [mode]);
  const paises = useMemo(() => countriesOf(rows), [rows]);
  const vista = useMemo(() => sortRows(pais ? rows.filter((r) => r.country === pais) : rows, COLS, sort), [rows, pais, sort]);
  const ahora = Math.floor(Date.now() / 1000);
  const top = rows[0];
  const perfil = (id: number): Route => ({ ...route, view: "aoe2", a2Section: "players", detail: String(id) });

  return (
    <>
      <ModePicker value={mode} onChange={setMode} modes={["rm1v1", "rmteam", "ew1v1", "ewteam", "dm1v1", "dmteam"]} />
      <Buscador route={route} navigate={navigate} />
      {estado === "error" && !rows.length ? (
        <Aoe2Loading onRetry={() => setIntento((n) => n + 1)} />
      ) : !rows.length ? (
        <Aoe2Loading />
      ) : (
        <Panel h={`${t.lb.h} · ${t.modes[mode]}`} sub={t.lb.sub(total)}>
          {top && (
            <RouteLink className="a2-champ" to={perfil(top.profileId)} onNavigate={navigate}>
              <img src="/aoe2/ui/winner.webp" alt="" width={44} height={44} decoding="async" />
              <span>
                <b>{top.alias}</b>
                {top.country && <span className="a2-cc">{top.country.toUpperCase()}</span>}
                <small>{t.lb.champ(top.elo, top.streak)}</small>
              </span>
            </RouteLink>
          )}
          <div className="a2-filters">
            <label>
              {t.lb.country}{" "}
              <select value={pais} onChange={(e) => setPais(e.target.value)}>
                <option value="">{t.lb.allCountries}</option>
                {paises.map((c) => (
                  <option key={c} value={c}>
                    {countryName(c, lang) ?? c.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {pais && <span className="a2-note">{t.lb.countryNote}</span>}
          </div>
          <table className="a2-table">
            <thead>
              <tr>
                {th("rank", t.lb.cols.rank)}
                {th("player", t.lb.cols.player)}
                {th("elo", t.lb.cols.elo, { className: "num" })}
                {th("max", t.lb.cols.max, { className: "num a2-hide-s" })}
                {th("wins", t.lb.cols.wl, { className: "num a2-hide-s" })}
                {th("wr", t.lb.cols.wr, { className: "num" })}
                {th("streak", t.lb.cols.streak, { className: "num a2-hide-s" })}
                {th("last", t.lb.cols.last, { className: "num a2-hide-m" })}
              </tr>
            </thead>
            <tbody>
              <LazyRows
                tag="tr"
                eager
                rowHeight={37}
                items={vista}
                render={(r) => (
                  <tr key={r.profileId}>
                    <td className="a2-pos">{r.rank}</td>
                    <td>
                      <RouteLink to={perfil(r.profileId)} onNavigate={navigate}>
                        {r.alias}
                      </RouteLink>
                      {r.country && <span className="a2-cc" title={countryName(r.country, lang) ?? undefined}>{r.country.toUpperCase()}</span>}
                    </td>
                    <td className="num">
                      <b>{r.elo}</b>
                    </td>
                    <td className="num a2-hide-s">{r.maxElo}</td>
                    <td className="num a2-hide-s">
                      {r.wins.toLocaleString(lang)} – {r.losses.toLocaleString(lang)}
                    </td>
                    <td className="num">{Math.round((r.wins / Math.max(1, r.wins + r.losses)) * 100)}%</td>
                    <td className={`num a2-hide-s ${r.streak > 0 ? "a2-up" : r.streak < 0 ? "a2-down" : ""}`}>
                      {r.streak > 0 ? `+${r.streak}` : r.streak}
                    </td>
                    <td className="num a2-hide-m">{t.lb.ago(ahora - r.lastMatch)}</td>
                  </tr>
                )}
              />
            </tbody>
          </table>
          {rows.length < total && (
            <button type="button" className="a2-btn a2-more" disabled={estado === "cargando"} onClick={() => void cargar(rows.length + 1, false)}>
              {estado === "cargando" ? t.t.loading : t.lb.more}
            </button>
          )}
        </Panel>
      )}
      {foto && <Foto foto={foto} route={route} navigate={navigate} />}
    </>
  );
}

/** "Subieron hoy" y la distribución de ELO, de la foto diaria del colector. */
function Foto({ foto, route, navigate }: { foto: LadderSnap; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const alias = new Map(foto.top.map(([p, , a]) => [p, a ?? String(p)]));
  const suben = foto.prev ? climbers(Object.fromEntries(foto.top.map(([p, e]) => [p, e])), Object.fromEntries(foto.prev.top.map(([p, e]) => [p, e])), 10) : [];
  const max = Math.max(1, ...foto.hist.map((b) => b.count));
  return (
    <div className="a2-cols">
      {suben.length > 0 && (
        <Panel h={t.lb.climbersH} sub={t.lb.climbersSub(new Date(foto.date).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" }))}>
          <ul className="a2-vs">
            {suben.map((c) => (
              <li key={c.profileId}>
                <RouteLink to={{ ...route, view: "aoe2", a2Section: "players", detail: String(c.profileId) }} onNavigate={navigate}>
                  {alias.get(c.profileId)}
                </RouteLink>
                <span>
                  {c.elo} <small className="a2-up">+{c.delta}</small>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel h={t.lb.histH} sub={t.lb.histSub(foto.total)}>
        <div className="a2-hist-bars" role="img" aria-label={t.lb.histH}>
          {foto.hist.map((b) => (
            <span key={b.from} title={t.lb.histTip(b.from, b.count, percentileOf(b.from, foto.hist))} style={{ height: `${(b.count / max) * 100}%` }} />
          ))}
        </div>
        <div className="a2-hist-axis">
          <span>{foto.hist[0]?.from}</span>
          <span>{(foto.hist.at(-1)?.from ?? 0) + 100}</span>
        </div>
      </Panel>
    </div>
  );
}

/** El buscador: nombre exacto o SteamID64 → lista de perfiles. */
export function Buscador({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    setBusy(true);
    fetch(`/api/aoe2/search?q=${encodeURIComponent(v)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d: { results: SearchResult[] }) => setRes(d.results))
      .catch(() => setRes([]))
      .finally(() => setBusy(false));
  };
  return (
    <Panel className="a2-search">
      <form onSubmit={enviar} role="search">
        <label htmlFor="a2-q">{t.lb.search}</label>
        <div className="a2-search-row">
          <input id="a2-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.lb.searchHint} autoComplete="off" spellCheck={false} />
          <button type="submit" className="a2-btn" disabled={busy}>
            {t.lb.searchGo}
          </button>
        </div>
      </form>
      {res && (
        <ul className="a2-results">
          {res.length ? (
            res.map((p) => (
              <li key={p.id}>
                <RouteLink to={{ ...route, view: "aoe2", a2Section: "players", detail: String(p.id) }} onNavigate={navigate}>
                  {p.alias}
                </RouteLink>
                {p.country && <span className="a2-cc">{p.country.toUpperCase()}</span>}
                {p.best && <span className="a2-note">{` · ${p.best.elo} · ${t.lb.worldRank(p.best.rank)}`}</span>}
              </li>
            ))
          ) : (
            <li className="a2-note">{t.lb.noResults}</li>
          )}
        </ul>
      )}
    </Panel>
  );
}
