/**
 * Ranking de CoH3 (2026-11-04; CoH2 y CoH1 desde el 6/11): las posiciones de cada modo y facción, de a 50, pedidas en
 * el navegador a `/api/coh3/leaderboard` (con `g=coh2|coh1` para los otros juegos; no hay prerender de datos en vivo).
 * CoH1 y CoH2 no traen el ELO en el ranking: sale de la memoria diaria (`stats/elo.ts`), y sin dato se ve "—". El prerender dibuja el armazón (título, selectores y la
 * tabla con el aviso de "cargando"), nunca la hoja `Coh3Loading`: el build falla si una página sale con `c3-loading`.
 *
 * El estado viaja en la query (`?m=2v2&f=german&p=2&r=2074389`, sin lo que está en su valor de siempre) para que se pueda
 * compartir; se reescribe con `replaceState`, así cambiar de facción no llena el Atrás.
 */
import { useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCoh3Copy } from "../../coh3Copy";
import { useLang } from "../../i18n";
import { REGIONS } from "../api/leaderboards";
import { GAMES } from "../games";
import { loadElo } from "../stats/elo";
import type { LeaderboardRow } from "../api/relic";
import { LeagueTag, Panel, nextSort, sortRows, useCohGame, useNum, useSort, type Nav } from "../ui";
import { MODES, ladderQuery, pageCount, pageStart, parseLadderQuery, winRate, withKnownElo, PAGE_SIZE, type LadderState } from "../live/logic";
import { PlayerLink, currentSearch, useAgo, useApi } from "../live/ui";
import { useLbCopy } from "./copy";

type Resp = { id: number; start: number; total: number; rows: LeaderboardRow[] };
type Key = "rank" | "player" | "elo" | "wins" | "losses" | "wr" | "streak" | "last";

const REGION_IDS = Object.keys(REGIONS).map(Number);
const REGION_ORDER = ["europe", "north-america", "south-america", "asia", "oceania", "middle-east", "africa", "unknown"];

const COLS: Record<Key, (r: LeaderboardRow) => string | number | null> = {
  rank: (r) => r.regionRank ?? r.rank,
  player: (r) => r.alias.toLocaleLowerCase(),
  elo: (r) => r.elo,
  wins: (r) => r.wins,
  losses: (r) => r.losses,
  wr: (r) => winRate(r.wins, r.losses),
  streak: (r) => r.streak,
  last: (r) => r.lastMatch,
};

/** El ELO de una fila: la cifra, o una raya con la aclaración si CoH1/CoH2 todavía no lo conoce. */
export function EloCell({ elo }: { elo: number | null }) {
  const t = useLbCopy();
  const num = useNum();
  return elo == null ? <span title={t.noRecent}>—</span> : <>{num(elo)}</>;
}

export default function Coh3Leaderboards({ route, navigate }: { route: Route; navigate: Nav }) {
  const c = useCoh3Copy();
  const t = useLbCopy();
  const { lang } = useLang();
  const num = useNum();
  const ago = useAgo();
  const game = useCohGame();
  const conf = GAMES[game];
  const otro = game !== "coh3";
  const [st, setSt] = useState<LadderState>(() => parseLadderQuery(currentSearch(), otro ? [] : REGION_IDS, conf.factions));

  // La dirección acompaña al estado (sin entrada nueva en el historial).
  useEffect(() => {
    const q = ladderQuery(st, conf.factions);
    if (window.location.search !== q) window.history.replaceState(window.history.state, "", `${window.location.pathname}${q}`);
  }, [st, conf]);

  const set = (patch: Partial<LadderState>) => setSt((s) => ({ ...s, page: 1, ...patch }));
  const id = conf.leaderboardOf(st.mode, st.faction);
  const path = `/api/coh3/leaderboard?id=${id}&start=${pageStart(st.page)}&count=${PAGE_SIZE}${st.region != null ? `&region=${st.region}` : ""}`;
  const isClient = typeof window !== "undefined";
  const { data, error, loading, retry } = useApi<Resp>(isClient ? path : null);
  const [elo, setElo] = useState<{ id: number; v: Record<string, [number, number]> } | null>(null);
  useEffect(() => {
    if (!otro) return;
    let vivo = true;
    loadElo(game, id).then((v) => vivo && setElo({ id, v }), () => undefined);
    return () => {
      vivo = false;
    };
  }, [game, id, otro]);

  const { sort, th, setSort } = useSort<Key>({ key: "rank", dir: 1 }, ["rank", "player"]);
  const rows = useMemo(
    () => (data ? sortRows(otro ? withKnownElo(data.rows, elo?.id === id ? elo.v : null) : data.rows, COLS, sort) : []),
    [data, sort, otro, elo, id],
  );
  const pages = data ? pageCount(data.total) : null;
  // Una página que ya no existe (el ranking se achicó, o un link viejo): a la última.
  useEffect(() => {
    if (pages != null && st.page > pages) setSt((s) => ({ ...s, page: pages }));
  }, [pages, st.page]);

  const labels: Record<Key, string> = t.col;
  const sortable: Key[] = ["rank", "player", "elo", "wins", "losses", "wr", "streak", "last"];

  const note = (text: string, retryBtn = false) => (
    <tr>
      <td colSpan={8} className="c3-row-note" role={retryBtn ? "alert" : undefined}>
        {text}{" "}
        {retryBtn && (
          <button type="button" className="c3-btn is-ghost" onClick={retry}>
            {t.retry}
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <main className="c3-main">
      <Panel>
        <div className="c3-head">
          <div className="c3-k">{t.k}</div>
          <h1 className="c3-h1">{t.h1}</h1>
          <p className="c3-lede">{t.lede}</p>
        </div>
        <p>
          <RouteLink className="c3-btn is-ghost" to={{ ...route, view: "coh3", c3Section: "players", detail: undefined }} onNavigate={navigate}>
            {t.find} →
          </RouteLink>{" "}
          <span className="c3-note">{t.findHint}</span>
        </p>
      </Panel>

      <Panel>
        <div className="c3-lb-bar">
          <div className="c3-seg c3-seg-plain" role="group" aria-label={t.mode}>
            {MODES.map((m) => (
              <button type="button" key={m} aria-pressed={st.mode === m} onClick={() => set({ mode: m })}>
                {c.modes[m]}
              </button>
            ))}
          </div>
          <div className="c3-seg" role="group" aria-label={t.faction}>
            {conf.factions.map((f) => (
              <button type="button" key={f} aria-pressed={st.faction === f} onClick={() => set({ faction: f })} title={conf.factionName[lang][f]}>
                <img src={conf.factionIcon[f]} alt="" width={20} height={20} decoding="async" />
                {otro ? conf.factionShort[lang][f] : c.factionShort[f]}
              </button>
            ))}
          </div>
          <div className="c3-filters">
            {/* Relic sólo da regiones en el ranking de CoH3. */}
            {!otro && (
              <label>
                {t.region}
                <select value={st.region ?? ""} onChange={(e) => set({ region: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{t.world}</option>
                  {REGION_ORDER.map((name) => {
                    const rid = REGION_IDS.find((r) => REGIONS[r] === name);
                    return rid ? (
                      <option key={rid} value={rid}>
                        {t.regions[name] ?? name}
                      </option>
                    ) : null;
                  })}
                </select>
              </label>
            )}
            {data && <span className="c3-note">{t.players(num(data.total))}</span>}
          </div>
        </div>

        <p className="c3-note">{c.t.sortHint}</p>
        <div className="c3-sortbar c3-cq-bar" role="group" aria-label={c.t.sortHint}>
          {sortable.map((k) => (
            <button type="button" key={k} className={`c3-sort${sort.key === k ? " is-on" : ""}`} onClick={() => setSort((s) => nextSort(s, k, k === "rank" || k === "player"))}>
              {labels[k]}
              <span className="c3-sort-i" aria-hidden="true">
                {sort.key === k ? (sort.dir > 0 ? "↑" : "↓") : "↕"}
              </span>
            </button>
          ))}
        </div>
        <div className="c3-tablewrap">
          <table className="c3-table c3-cq c3-lb is-stack">
            <caption className="c3-sr">
              {t.h1} {c.modes[st.mode]} · {conf.factionName[lang][st.faction]}
            </caption>
            <thead>
              <tr>
                {th("rank", labels.rank)}
                {th("player", labels.player, { className: "is-l" })}
                {th("elo", labels.elo, otro ? { title: t.eloLast } : undefined)}
                {th("wins", labels.wins)}
                {th("losses", labels.losses)}
                {th("wr", labels.wr)}
                {th("streak", labels.streak)}
                {th("last", labels.last)}
              </tr>
            </thead>
            <tbody>
              {error != null
                ? note(t.error, true)
                : !data || loading
                  ? note(t.loading)
                  : !rows.length
                    ? note(t.empty)
                    : rows.map((r) => {
                        const wr = winRate(r.wins, r.losses);
                        return (
                          <tr key={r.profileId}>
                            <td>
                              <span className="c3-lb-rank">
                                #{num(r.regionRank ?? r.rank)}
                                {r.regionRank != null && r.rank > 0 && <small>{`#${num(r.rank)}`} · {t.world}</small>}
                              </span>
                              <PlayerLink route={route} navigate={navigate} id={r.profileId} alias={r.alias} country={r.country} className="c3-lb-pl-m" />
                            </td>
                            <td className="is-l c3-lb-pl-d" data-l={labels.player}>
                              <PlayerLink route={route} navigate={navigate} id={r.profileId} alias={r.alias} country={r.country} />
                            </td>
                            <td data-l={labels.elo} className="c3-lb-elo">
                              <EloCell elo={r.elo} />
                              <LeagueTag level={r.tier} small faction={st.faction} />
                            </td>
                            <td data-l={labels.wins}>{num(r.wins)}</td>
                            <td data-l={labels.losses}>{num(r.losses)}</td>
                            <td data-l={labels.wr}>{wr == null ? c.t.none : `${num(wr, 1)} %`}</td>
                            <td data-l={labels.streak} className={r.streak > 0 ? "c3-win" : r.streak < 0 ? "c3-loss" : undefined} title={r.streak > 0 ? t.streakW(r.streak) : r.streak < 0 ? t.streakL(-r.streak) : undefined}>
                              {r.streak > 0 ? `+${r.streak}` : r.streak}
                            </td>
                            <td data-l={t.lastShort} title={new Date(r.lastMatch * 1000).toLocaleString()}>
                              {ago(r.lastMatch)}
                            </td>
                          </tr>
                        );
                      })}
            </tbody>
          </table>
        </div>
        <nav className="c3-lb-pager" aria-label={t.page(String(st.page), String(pages ?? "…"))}>
          <button type="button" className="c3-btn is-ghost" disabled={st.page <= 1} onClick={() => setSt((s) => ({ ...s, page: s.page - 1 }))}>
            ← {t.prev}
          </button>
          <span className="c3-note">{t.page(num(st.page), pages != null ? num(pages) : "…")}</span>
          <button type="button" className="c3-btn is-ghost" disabled={pages == null || st.page >= pages} onClick={() => setSt((s) => ({ ...s, page: s.page + 1 }))}>
            {t.next} →
          </button>
        </nav>
      </Panel>
    </main>
  );
}

