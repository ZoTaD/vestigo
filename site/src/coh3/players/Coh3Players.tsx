/**
 * Jugador de CoH3 (2026-11-04). Sin ficha (`/coh3/players`): el buscador por alias exacto (o link de coh3stats, de
 * Steam, número de perfil o SteamID64). Con ficha (`/coh3/players/<profile_id>`): cabecera, totales, posiciones por modo
 * y facción, resumen de las últimas partidas, némesis, gráfico de ELO y la lista de partidas con filtros.
 *
 * Todo se pide en el navegador a `/api/coh3/player` y `/api/coh3/search`: la ficha no se prerenderiza (son infinitas),
 * lleva `noindex` y está fuera del sitemap (el buscador sí se indexa). El título del documento lleva el alias.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import RouteLink from "../../RouteLink";
import { useLang } from "../../i18n";
import type { Route } from "../../route";
import { useCoh3Copy, type Faction, cohGameSeo } from "../../coh3Copy";
import type { Mode } from "../api/leaderboards";
import type { MatchSummary, Profile, SearchResult, Standing } from "../api/relic";
import { Coh3Loading, FactionTag, LeagueTag, Panel, nextSort, sortRows, useCohGame, useNum, useSort, type Nav } from "../ui";
import { GAMES, factionLabel, type CohGame } from "../games";
import {
  FACTIONS,
  MODES,
  clock,
  eloSeries,
  eloSeriesKeys,
  eloTicks,
  nemesis,
  normalizeQuery,
  recentSummary,
  standingsTotals,
  winRate,
  type EloPoint,
  type PlayerQuery,
  type SeriesKey,
} from "../live/logic";
import { Flag, MatchLink, PlayerLink, countryName, currentSearch, rememberPlayer, useAgo, useApi, useDate, useDocTitle, useMapName, useNoindex } from "../live/ui";
import { usePlCopy } from "./copy";

type PlayerResp = { profile: Profile; standings: Standing[]; matches: MatchSummary[] };
type SearchResp = { q: string; results: SearchResult[] };

export default function Coh3Players({ route, navigate }: { route: Route; navigate: Nav }) {
  const id = route.detail && /^\d{1,10}$/.test(route.detail) ? Number(route.detail) : null;
  return id ? <Profile key={id} id={id} route={route} navigate={navigate} /> : <Search route={route} navigate={navigate} />;
}

// ——— Vistos hace poco (sólo en este navegador) ———

type Seen = { id: number; alias: string; country: string | null };
/** Una lista por juego: un perfil de CoH2 no existe en CoH3. */
const seenKey = (game: CohGame) => (game === "coh3" ? "c3:seenPlayers" : `c3:seenPlayers:${game}`);
function readSeen(game: CohGame): Seen[] {
  try {
    const v = JSON.parse(localStorage.getItem(seenKey(game)) ?? "[]") as Seen[];
    return Array.isArray(v) ? v.filter((x) => typeof x?.id === "number" && typeof x.alias === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
function addSeen(game: CohGame, s: Seen) {
  try {
    localStorage.setItem(seenKey(game), JSON.stringify([s, ...readSeen(game).filter((x) => x.id !== s.id)].slice(0, 8)));
  } catch {
    /* sin almacenamiento */
  }
}

// ——— Buscador ———

function Search({ route, navigate }: { route: Route; navigate: Nav }) {
  const c = useCoh3Copy();
  const t = usePlCopy();
  const num = useNum();
  const { lang } = useLang();
  const game = useCohGame();
  useDocTitle(game === "coh3" ? c.seo.players.title : cohGameSeo(game, lang, "players").title);
  const initial = new URLSearchParams(currentSearch()).get("q") ?? "";
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState<PlayerQuery>(() => normalizeQuery(initial));
  const [seen, setSeen] = useState<Seen[]>([]);
  useEffect(() => setSeen(readSeen(game)), [game]);

  const toProfile = (pid: number) => navigate({ ...route, view: "coh3", c3Section: "players", detail: String(pid) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = normalizeQuery(text);
    // Un link de perfil va derecho a la ficha.
    if (q.kind === "profile" && q.alias == null) return toProfile(q.id);
    setQuery(q);
    setJump(q.kind === "steam");
    const s = q.kind === "empty" ? "" : `?q=${encodeURIComponent(text.trim())}`;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${s}`);
  };

  const term = query.kind === "alias" ? query.alias : query.kind === "steam" ? query.steamId : query.kind === "profile" ? query.alias : null;
  const { data, error, loading, retry } = useApi<SearchResp>(term ? `/api/coh3/search?q=${encodeURIComponent(term)}` : null);
  const results = data?.results ?? (error === 404 ? [] : null);

  // Un SteamID recién buscado con un solo perfil: a la ficha, sin pasar por la lista. Sólo al buscar (no al volver con
  // Atrás a `?q=7656…`, que si no rebotaría otra vez a la ficha).
  const [jump, setJump] = useState(false);
  useEffect(() => {
    if (jump && query.kind === "steam" && results?.length === 1) {
      setJump(false);
      toProfile(results[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, query, jump]);

  return (
    <main className="c3-main">
      <Panel>
        <div className="c3-head">
          <div className="c3-k">{t.k}</div>
          <h1 className="c3-h1">{t.h1}</h1>
          <p className="c3-lede">{t.lede}</p>
        </div>
        <form className="c3-search" role="search" onSubmit={submit}>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder} maxLength={200} autoComplete="off" spellCheck={false} />
          <button type="submit" className="c3-btn">
            {t.go}
          </button>
        </form>
        {term && (
          <div aria-live="polite">
            {loading ? (
              <p className="c3-note" style={{ marginTop: 12 }}>
                {t.searching}
              </p>
            ) : error != null && error !== 404 ? (
              <p role="alert" style={{ marginTop: 12 }}>
                {t.error}{" "}
                <button type="button" className="c3-btn is-ghost" onClick={retry}>
                  {t.retry}
                </button>
              </p>
            ) : (
              <ul className="c3-results">
                {query.kind === "profile" && (
                  <li>
                    <RouteLink className="c3-result" to={{ ...route, view: "coh3", c3Section: "players", detail: String(query.id) }} onNavigate={navigate}>
                      <strong>{t.profileN(query.id)}</strong>
                      <small>{t.openProfile}</small>
                    </RouteLink>
                  </li>
                )}
                {results?.map((r) => (
                  <li key={r.id}>
                    <RouteLink className="c3-result" to={{ ...route, view: "coh3", c3Section: "players", detail: String(r.id) }} onNavigate={navigate}>
                      <span className="c3-pl">
                        <Flag code={r.country} />
                        <span>{r.alias}</span>
                      </span>
                      <small>
                        {t.games(num(r.games))}
                        {r.best && ` · ${t.bestAt(num(r.best.elo), c.modes[r.best.mode], factionLabel(game, lang, r.best.faction, true))}`}
                        {r.country && ` · ${countryName(r.country, lang)}`}
                      </small>
                    </RouteLink>
                  </li>
                ))}
                {results && !results.length && query.kind !== "profile" && <li className="c3-note">{t.none(term)}</li>}
              </ul>
            )}
          </div>
        )}
      </Panel>
      {seen.length > 0 && (
        <Panel k={t.recent}>
          <div className="c3-facts" style={{ marginTop: 10 }}>
            {seen.map((s) => (
              <PlayerLink key={s.id} route={route} navigate={navigate} id={s.id} alias={s.alias} country={s.country} className="c3-chip" />
            ))}
          </div>
        </Panel>
      )}
    </main>
  );
}

// ——— Ficha ———

type MF = "all" | Mode | "custom" | "ai" | "other";

function Profile({ id, route, navigate }: { id: number; route: Route; navigate: Nav }) {
  // Sólo la ficha: el buscador (`/coh3/players`) sí se indexa y está en el sitemap.
  useNoindex();
  const game = useCohGame();
  const c = useCoh3Copy();
  const t = usePlCopy();
  const num = useNum();
  const ago = useAgo();
  const { lang } = useLang();
  const { data, error, retry } = useApi<PlayerResp>(`/api/coh3/player?id=${id}`);
  const alias = data?.profile.alias ?? null;
  useDocTitle(alias ? (game === "coh3" ? c.detailSeo("players", alias).title : cohGameSeo(game, lang, "players", alias).title) : null);
  useEffect(() => {
    rememberPlayer(id);
    if (data) addSeen(game, { id, alias: data.profile.alias, country: data.profile.country });
  }, [id, data]);

  if (error === 404 || error === 400)
    return (
      <main className="c3-main">
        <Panel>
          <p role="alert">{t.notFound}</p>
          <p style={{ marginTop: 12 }}>
            <RouteLink className="c3-btn is-ghost" to={{ ...route, view: "coh3", c3Section: "players", detail: undefined }} onNavigate={navigate}>
              ← {t.backToSearch}
            </RouteLink>
          </p>
        </Panel>
      </main>
    );
  if (error != null) return <Coh3Loading onRetry={retry} />;
  if (!data) return <Coh3Loading />;

  const { profile, standings, matches } = data;
  const tot = standingsTotals(standings, game !== "coh3");
  const country = countryName(profile.country, lang);
  return (
    <main className="c3-main">
      <Panel>
        <p className="c3-crumb">
          <RouteLink to={{ ...route, view: "coh3", c3Section: "leaderboards", detail: undefined }} onNavigate={navigate}>
            {c.tabs.leaderboards}
          </RouteLink>{" "}
          ·{" "}
          <RouteLink to={{ ...route, view: "coh3", c3Section: "players", detail: undefined }} onNavigate={navigate}>
            {t.backToSearch}
          </RouteLink>
        </p>
        <div className="c3-k" style={{ marginTop: 10 }}>
          {t.kPlayer}
        </div>
        <div className="c3-ph">
          {profile.country && <img className="c3-flag c3-ph-flag" src={`/flags/64x48/${profile.country.toLowerCase()}.png`} alt={country ?? ""} width={40} height={30} />}
          <h1 className="c3-h1">{profile.alias || `#${id}`}</h1>
        </div>
        <div className="c3-ph-meta">
          {country && <span>{country}</span>}
          <span>{t.profileId(String(id))}</span>
          {profile.level > 0 && (
            <span>
              {num(profile.level)} {t.xp}
            </span>
          )}
          {profile.steamId && (
            <a href={`https://steamcommunity.com/profiles/${profile.steamId}`} target="_blank" rel="noopener noreferrer">
              {t.steam} ↗
            </a>
          )}
        </div>
        <div className="c3-facts" style={{ marginTop: 16 }} aria-label={t.totals}>
          <div className="c3-fact">
            <small>{t.fGames}</small>
            <b>{num(tot.games)}</b>
          </div>
          <div className="c3-fact">
            <small>{t.fWr}</small>
            <b>{tot.winRate == null ? c.t.none : `${num(tot.winRate, 1)} %`}</b>
          </div>
          <div className="c3-fact">
            <small>{t.fBest}</small>
            <b className="c3-plain">{tot.best ? t.bestRank(num(tot.best.rank), c.modes[tot.best.mode]) : c.t.none}</b>
            {tot.best && <FactionTag f={tot.best.faction} size={18} />}
          </div>
          <div className="c3-fact">
            <small>{t.fTop}</small>
            {tot.topFaction ? <FactionTag f={tot.topFaction.faction} size={26} /> : <b>{c.t.none}</b>}
          </div>
        </div>
      </Panel>

      <Standings standings={standings} />

      <Recent matches={matches} id={id} route={route} navigate={navigate} />

      <EloChart matches={matches} id={id} />

      <Games matches={matches} id={id} route={route} navigate={navigate} ago={ago} />
    </main>
  );
}

type SKey = "mode" | "rank" | "elo" | "best" | "wins" | "losses" | "wr" | "streak" | "last";
const S_COLS: Record<SKey, (s: Standing) => string | number | null> = {
  // El orden de las facciones de CoH3; las de CoH1/CoH2 (que no están) quedan por nombre.
  mode: (s) => `${MODES.indexOf(s.mode)}${FACTIONS.indexOf(s.faction) < 0 ? s.faction : FACTIONS.indexOf(s.faction)}`,
  rank: (s) => (s.rank > 0 ? s.rank : null),
  elo: (s) => s.elo,
  best: (s) => s.best,
  wins: (s) => s.wins,
  losses: (s) => s.losses,
  wr: (s) => winRate(s.wins, s.losses),
  streak: (s) => s.streak,
  last: (s) => s.lastMatch,
};

function Standings({ standings }: { standings: Standing[] }) {
  const c = useCoh3Copy();
  const t = usePlCopy();
  const num = useNum();
  const ago = useAgo();
  const auto = standings.filter((s) => !s.ranked || s.wins + s.losses > 0);
  const { sort, th, setSort } = useSort<SKey>({ key: "mode", dir: 1 }, ["mode", "rank"]);
  const rows = useMemo(() => sortRows(auto, S_COLS, sort), [auto, sort]);
  const L = t.col;
  const keys: SKey[] = ["mode", "rank", "elo", "best", "wins", "losses", "wr", "streak", "last"];
  const label = (k: SKey) => (k === "mode" ? `${L.mode} · ${L.faction}` : L[k]);
  return (
    <Panel k={t.standingsH} lede={t.standingsLede}>
      {!rows.length ? (
        <p className="c3-note">{t.noStandings}</p>
      ) : (
        <>
          <div className="c3-sortbar c3-cq-bar" role="group" aria-label={c.t.sortHint}>
            {keys.map((k) => (
              <button type="button" key={k} className={`c3-sort${sort.key === k ? " is-on" : ""}`} onClick={() => setSort((s) => nextSort(s, k, k === "mode" || k === "rank"))}>
                {label(k)}
                <span className="c3-sort-i" aria-hidden="true">
                  {sort.key === k ? (sort.dir > 0 ? "↑" : "↓") : "↕"}
                </span>
              </button>
            ))}
          </div>
          <table className="c3-table c3-cq is-stack">
            <thead>
              <tr>{keys.map((k) => th(k, label(k), k === "mode" ? { className: "is-l" } : undefined))}</tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const wr = winRate(s.wins, s.losses);
                return (
                  <tr key={s.leaderboardId}>
                    <td className="is-l">
                      <strong>{c.modes[s.mode]}</strong> <FactionTag f={s.faction} size={22} short={false} />
                    </td>
                    <td data-l={L.rank} className="c3-w2">
                      {s.rank > 0 ? (
                        <span>
                          <b>#{num(s.rank)}</b> <small className="c3-dim">{t.ofTotal(num(s.total), num(Math.max(0.1, (s.rank / Math.max(1, s.total)) * 100), 1))}</small>
                        </span>
                      ) : (
                        <span className="c3-dim">{t.unranked}</span>
                      )}
                    </td>
                    <td data-l={L.elo} className="c3-lb-elo">
                      {num(s.elo)}
                      <LeagueTag level={s.tier} small faction={s.faction} />
                    </td>
                    <td data-l={L.best}>{num(s.best)}</td>
                    <td data-l={L.wins}>{num(s.wins)}</td>
                    <td data-l={L.losses}>{num(s.losses)}</td>
                    <td data-l={L.wr}>{wr == null ? c.t.none : `${num(wr, 1)} %`}</td>
                    <td data-l={L.streak} className={s.streak > 0 ? "c3-win" : s.streak < 0 ? "c3-loss" : undefined}>
                      {s.streak > 0 ? `+${s.streak}` : s.streak}
                    </td>
                    <td data-l={t.lastShort}>{ago(s.lastMatch)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
}

function Recent({ matches, id, route, navigate }: { matches: MatchSummary[]; id: number; route: Route; navigate: Nav }) {
  const c = useCoh3Copy();
  const t = usePlCopy();
  const num = useNum();
  const r = useMemo(() => recentSummary(matches, id), [matches, id]);
  const nem = useMemo(() => nemesis(matches, id), [matches, id]);
  if (!r.games) return null;
  return (
    <div className="c3-grid2">
      <Panel k={t.recentH} lede={t.recentLede(r.games)}>
        <div className="c3-facts">
          <div className="c3-fact">
            <small>{t.rGames}</small>
            <b>
              {num(r.wins)}–{num(r.losses)}
            </b>
          </div>
          <div className="c3-fact">
            <small>{t.rWr}</small>
            <b>{r.winRate == null ? c.t.none : `${num(r.winRate, 0)} %`}</b>
          </div>
          <div className="c3-fact">
            <small>{t.rDur}</small>
            <b>{r.avgDuration == null ? c.t.none : clock(r.avgDuration)}</b>
          </div>
          <div className="c3-fact">
            <small>{t.rElo}</small>
            <b className={r.eloDelta > 0 ? "c3-up" : r.eloDelta < 0 ? "c3-down" : undefined}>{r.eloDelta > 0 ? `+${num(r.eloDelta)}` : num(r.eloDelta)}</b>
          </div>
          {r.topFaction && (
            <div className="c3-fact">
              <small>{t.fTop}</small>
              <FactionTag f={r.topFaction.faction} size={26} />
            </div>
          )}
        </div>
      </Panel>
      <Panel k={t.nemesisH}>
        {nem && nem.beats >= 2 ? (
          <p style={{ marginTop: 10, fontSize: 16 }}>
            <PlayerLink route={route} navigate={navigate} id={nem.profileId} alias={nem.alias} country={nem.country} /> <span className="c3-dim">{t.nemesis(nem.beats, nem.games)}</span>
          </p>
        ) : (
          <p className="c3-note" style={{ marginTop: 10 }}>
            {t.noNemesis}
          </p>
        )}
      </Panel>
    </div>
  );
}

function EloChart({ matches, id }: { matches: MatchSummary[]; id: number }) {
  const game = useCohGame();
  const { lang } = useLang();
  const c = useCoh3Copy();
  const t = usePlCopy();
  const keys = useMemo(() => eloSeriesKeys(matches, id).filter((k) => k.n >= 2), [matches, id]);
  const [pick, setPick] = useState<SeriesKey | null>(null);
  const cur = keys.find((k) => k.key === pick) ?? keys[0];
  const pts = useMemo(() => (cur ? eloSeries(matches, id, cur.mode, cur.faction) : []), [matches, id, cur]);
  return (
    <Panel k={t.chartH} lede={t.chartLede}>
      {!cur ? (
        <p className="c3-note">{t.chartNone}</p>
      ) : (
        <>
          <div className="c3-seg c3-seg-plain" role="group" aria-label={t.chartH}>
            {keys.map((k) => (
              <button type="button" key={k.key} aria-pressed={k.key === cur.key} onClick={() => setPick(k.key)}>
                {c.modes[k.mode]} <FactionTag f={k.faction} size={18} />
              </button>
            ))}
          </div>
          <Chart pts={pts} label={t.chartAria(c.modes[cur.mode], factionLabel(game, lang, cur.faction, false), String(pts[0]?.elo ?? ""), String(pts.at(-1)?.elo ?? ""))} />
        </>
      )}
    </Panel>
  );
}

/** El gráfico de ELO, SVG propio: línea con el área abajo y un punto por partida (verde ganada, rojo perdida). */
function Chart({ pts, label }: { pts: EloPoint[]; label: string }) {
  const num = useNum();
  const date = useDate();
  // El ancho real del panel, así la letra del eje mide lo mismo en el teléfono que en la compu.
  const ref = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 500 ? 190 : 240, L = 46, R = 12, T = 14, B = 30;
  const lo = Math.min(...pts.map((p) => p.elo)), hi = Math.max(...pts.map((p) => p.elo));
  const pad = Math.max(10, (hi - lo) * 0.12);
  const min = lo - pad, max = hi + pad;
  const x = (i: number) => L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
  const y = (v: number) => T + ((max - v) * (H - T - B)) / (max - min);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.elo).toFixed(1)}`).join("");
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${H - B}L${x(0).toFixed(1)},${H - B}Z`;
  const first = pts[0], last = pts[pts.length - 1];
  const short = (s: number) => date(s).replace(/,?\s*\d{1,2}:\d{2}.*$/, "");
  return (
    <svg ref={ref} className="c3-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {eloTicks(min, max).map((v) => (
        <g key={v}>
          <line className="ax" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
          <text className="tk" x={L - 8} y={y(v) + 4} textAnchor="end">
            {num(v)}
          </text>
        </g>
      ))}
      <path className="ar" d={area} />
      <path className="ln" d={line} />
      {pts.map((p, i) => (
        <circle key={p.matchId} className={p.result === "win" ? "pt-w" : p.result === "loss" ? "pt-l" : "pt-o"} cx={x(i)} cy={y(p.elo)} r={4}>
          <title>{`${short(p.t)} · ${num(p.elo)} (${p.delta > 0 ? "+" : ""}${p.delta})`}</title>
        </circle>
      ))}
      <text className="tk" x={L} y={H - 8}>
        {short(first.t)}
      </text>
      <text className="tk" x={W - R} y={H - 8} textAnchor="end">
        {short(last.t)}
      </text>
    </svg>
  );
}

function Games({ matches, id, route, navigate, ago }: { matches: MatchSummary[]; id: number; route: Route; navigate: Nav; ago: (s: number) => string }) {
  const c = useCoh3Copy();
  const game = useCohGame();
  const t = usePlCopy();
  const num = useNum();
  const date = useDate();
  const mapName = useMapName();
  const [mf, setMf] = useState<MF>("all");
  const [ff, setFf] = useState<"all" | Faction>("all");
  const mine = matches.map((m) => ({ m, me: m.players.find((p) => p.profileId === id) })).filter((x): x is { m: MatchSummary; me: NonNullable<typeof x.me> } => !!x.me);
  const modeKey = (m: MatchSummary): MF => m.mode;
  const modes = (["all", ...MODES, "custom", "ai", "other"] as MF[]).filter((k) => k === "all" || mine.some((x) => modeKey(x.m) === k));
  const facs = (["all", ...GAMES[game].factions] as ("all" | Faction)[]).filter((f) => f === "all" || mine.some((x) => x.me.faction === f));
  const shown = mine.filter((x) => (mf === "all" || modeKey(x.m) === mf) && (ff === "all" || x.me.faction === ff));
  const modeLabel = (k: MF) => (k === "all" ? t.all : k === "custom" ? t.custom : k === "ai" ? t.ai : k === "other" ? t.other : c.modes[k]);

  if (!mine.length)
    return (
      <Panel k={t.historyH}>
        <p className="c3-note" style={{ marginTop: 10 }}>
          {t.noMatches}
        </p>
      </Panel>
    );
  return (
    <Panel k={t.historyH} h={`${num(shown.length)} / ${num(mine.length)}`}>
      <div className="c3-lb-bar" style={{ marginTop: 12 }}>
        <div className="c3-seg c3-seg-plain" role="group" aria-label={t.filters}>
          {modes.map((k) => (
            <button type="button" key={k} aria-pressed={mf === k} onClick={() => setMf(k)}>
              {modeLabel(k)}
            </button>
          ))}
        </div>
        {facs.length > 2 && (
          <div className="c3-seg" role="group" aria-label={t.filters}>
            {facs.map((f) => (
              <button type="button" key={f} aria-pressed={ff === f} onClick={() => setFf(f)}>
                {f === "all" ? t.all : <FactionTag f={f} size={18} />}
              </button>
            ))}
          </div>
        )}
      </div>
      {!shown.length ? (
        <p className="c3-note">{t.noGames}</p>
      ) : (
        <ul className="c3-games">
          {shown.map(({ m, me }) => {
            const delta = me.eloBefore != null && me.eloAfter != null ? me.eloAfter - me.eloBefore : null;
            const team = m.players.filter((p) => p.team === me.team);
            const foes = m.players.filter((p) => p.team !== me.team);
            const person = (p: (typeof m.players)[number]) => (
              <div className={`c3-team-p${p.profileId === id ? " is-me" : ""}`} key={p.profileId}>
                {p.faction && <FactionTag f={p.faction} name={false} size={16} />}
                {p.profileId === id ? (
                  <span className="c3-pl">
                    <Flag code={p.country} />
                    <span>{p.alias}</span>
                  </span>
                ) : (
                  <PlayerLink route={route} navigate={navigate} id={p.profileId} alias={p.alias} country={p.country} />
                )}
              </div>
            );
            return (
              <li className="c3-game" key={m.id}>
                <div className="c3-game-res">
                  <b className={me.result === "win" ? "c3-win" : me.result === "loss" ? "c3-loss" : "c3-dim"}>{me.result === "win" ? t.win : me.result === "loss" ? t.loss : t.otherRes}</b>
                  <small title={date(m.start)}>{ago(m.start)}</small>
                </div>
                <div className="c3-game-mid">
                  <div className="c3-game-h">
                    <strong>{mapName(m.map)}</strong>
                    <span>
                      {modeLabel(modeKey(m))} · {t.duration} {clock(m.duration)}
                    </span>
                  </div>
                  <div className="c3-teams">
                    <div className="c3-team">
                      <span className="c3-team-k">{t.allies}</span>
                      {team.map(person)}
                    </div>
                    <div className="c3-team">
                      <span className="c3-team-k">{t.rivals}</span>
                      {foes.map(person)}
                    </div>
                  </div>
                </div>
                <div className="c3-game-r">
                  {me.faction && <FactionTag f={me.faction} size={22} />}
                  {delta != null && (
                    <span className={`c3-delta ${delta > 0 ? "c3-up" : delta < 0 ? "c3-down" : "c3-dim"}`}>
                      {delta > 0 ? `+${delta}` : delta} <small className="c3-dim">→ {num(me.eloAfter ?? 0)} ELO</small>
                    </span>
                  )}
                  <MatchLink route={route} navigate={navigate} id={m.id} player={id} className="c3-btn is-ghost">
                    {t.details} →
                  </MatchLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
