/**
 * La pestaña Jugadores de AoE2 (2026-11-20). Sin número es el buscador; con número (`/aoe2/players/<id>`) es el perfil:
 * encabezado, puestos por ranking, curva de ELO, forma, sus civs y mapas, rivales, compañeros y cuándo juega. Todo
 * sale de `/api/aoe2/player` (≈ 64 partidas) y de los cálculos de `profileStats.ts`. El perfil no se prerenderiza,
 * lleva `noindex` y está fuera del sitemap. El historial, la ficha de partida y el cara a cara llegan en la Task 6.
 */
import { useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { flagUrl } from "../../flags";
import { useAoe2Copy } from "../../aoe2Copy";
import { countryName, useApi, useDocTitle, useNoindex } from "../../coh3/live/ui";
import { sortRows, useSort } from "../../coh3/ui";
import { Aoe2Loading, CivShield, Panel, civById, type Nav } from "../ui";
import { Buscador } from "../leaderboards/Aoe2Leaderboards";
import { LEADERBOARD_OF, type Aoe2Match, type Aoe2Mode, type Aoe2Profile, type Aoe2Standing } from "../api/wel";
import { activity, avgDuration, byCiv, byMap, eloSeries, form, mates, rivals } from "./profileStats";
import EloChart from "./EloChart";
import MatchHistory from "./MatchHistory";
import HeadToHead from "./HeadToHead";
import { mapName } from "./mapName";
import ShareCard from "./ShareCard";
import { useAoe2Me } from "./me";
import { civById as civ } from "../ui";

export type PlayerData = { profile: Aoe2Profile; standings: Aoe2Standing[]; matches: Aoe2Match[] };

const pct = (w: number, g: number) => `${Math.round((w / Math.max(1, g)) * 100)}%`;

export default function Aoe2Players({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const id = route.detail && /^\d{1,12}$/.test(route.detail) ? route.detail : null;
  const steam = /^steam-(\d{17})$/.exec(route.detail ?? "")?.[1];
  if (steam) return <PorSteam steamId={steam} route={route} navigate={navigate} />;
  if (!id) {
    return (
      <>
        <Panel h={t.pl.searchH}>
          <p className="a2-lead">{t.pl.searchLead}</p>
        </Panel>
        <Buscador route={route} navigate={navigate} />
      </>
    );
  }
  return <Perfil key={id} id={Number(id)} route={route} navigate={navigate} />;
}

function Perfil({ id, route, navigate }: { id: number; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  useNoindex();
  const yo = useAoe2Me();
  const { data, error, retry } = useApi<PlayerData>(`/api/aoe2/player?id=${id}`);
  useDocTitle(data ? `${data.profile.alias} · Age of Empires II · Vestigo` : null);
  const modos = useMemo(
    () => (data ? (Object.keys(LEADERBOARD_OF) as Aoe2Mode[]).filter((m) => data.standings.some((s) => s.leaderboard === LEADERBOARD_OF[m])) : []),
    [data],
  );
  const [modo, setModo] = useState<Aoe2Mode | null>(null);
  const curva = modo ?? modos[0] ?? "rm1v1";

  if (error === 404) return <Panel h={t.pl.notFound}><Buscador route={route} navigate={navigate} /></Panel>;
  if (error != null) return <Aoe2Loading onRetry={retry} />;
  if (!data) return <Aoe2Loading />;

  const { profile: p, standings, matches } = data;
  const civs = byCiv(matches, id);
  const mapas = byMap(matches, id);
  const ultimas = form(matches, id, 10);
  const rv = rivals(matches, id, 8);
  const cp = mates(matches, id, 8);
  const tz = -new Date().getTimezoneOffset();
  const act = activity(matches, id, tz);
  const dur = avgDuration(matches, id);
  const serie = eloSeries(matches, id, curva);
  const perfil = (pid: number): Route => ({ ...route, view: "aoe2", a2Section: "players", detail: String(pid) });
  const durTxt = dur != null ? `${Math.round(dur / 60)} min` : "–";
  const cartaElo = standings.find((s) => s.leaderboard === 3) ?? [...standings].sort((a, b) => b.elo - a.elo)[0];

  return (
    <>
      <Panel className="a2-who">
        <div className="a2-who-row">
          {p.country && <img src={flagUrl(p.country)} srcSet={`${flagUrl(p.country, "64x48")} 2x`} alt={countryName(p.country, lang) ?? p.country} width={32} height={24} />}
          <h1 className="a2-alias">{p.alias}</h1>
        </div>
        <div className="a2-who-actions">
          <button type="button" className={`a2-btn${yo.me === id ? " is-on" : ""}`} onClick={() => yo.setMe(yo.me === id ? null : id)} aria-pressed={yo.me === id}>
            {yo.me === id ? `✓ ${t.me.itsYou}` : t.me.isMe}
          </button>
          {yo.me !== id && (
            <button type="button" className={`a2-btn${yo.follows.includes(id) ? " is-on" : ""}`} onClick={() => yo.toggleFollow(id)} aria-pressed={yo.follows.includes(id)}>
              {yo.follows.includes(id) ? `★ ${t.me.following}` : `☆ ${t.me.follow}`}
            </button>
          )}
          <ShareCard
            data={{
              alias: p.alias,
              country: p.country,
              elo: cartaElo?.elo ?? null,
              eloLabel: cartaElo ? (t.pl.leaderboards[cartaElo.leaderboard] ?? "") : "",
              civ: civs[0] && civ(civs[0].civ) ? { slug: civ(civs[0].civ)!.slug, name: civ(civs[0].civ)!.name[lang] } : null,
              form: ultimas,
            }}
          />
        </div>
        <p className="a2-note">
          {[p.country ? countryName(p.country, lang) : null, p.clan ? t.pl.clan(p.clan) : null, p.level ? t.pl.level(p.level) : null].filter(Boolean).join(" · ")}
          {p.steamId && (
            <>
              {" · "}
              <a href={`https://steamcommunity.com/profiles/${p.steamId}`} target="_blank" rel="noopener noreferrer">
                {t.pl.steam}
              </a>
            </>
          )}
        </p>
      </Panel>

      {!standings.length && !matches.length ? (
        <Panel>
          <p>{t.pl.noGames}</p>
        </Panel>
      ) : (
        <>
          {standings.length > 0 && (
            <Panel h={t.pl.standingsH}>
              <ul className="a2-cards">
                {[...standings].sort((a, b) => a.leaderboard - b.leaderboard).map((s) => (
                  <li key={s.leaderboard}>
                    <small>{t.pl.leaderboards[s.leaderboard] ?? t.pl.otherBoard(s.leaderboard)}</small>
                    <b>{s.elo}</b>
                    <span>
                      {t.pl.rank(s.rank)} · {t.pl.best(s.maxElo)}
                    </span>
                    <span>{t.pl.wl(s.wins, s.losses)} · {pct(s.wins, s.wins + s.losses)}</span>
                    <span className={s.streak > 0 ? "a2-up" : s.streak < 0 ? "a2-down" : undefined}>{t.pl.streak(s.streak)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="a2-cols">
            <Panel h={t.pl.eloH} sub={t.pl.eloSub}>
              {modos.length > 1 && (
                <div className="a2-chips" role="radiogroup">
                  {modos.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={m === curva} className={m === curva ? "is-on" : undefined} onClick={() => setModo(m)}>
                      {t.modes[m]}
                    </button>
                  ))}
                </div>
              )}
              {serie.length > 1 ? <EloChart points={serie} /> : <p className="a2-note">{t.pl.noGames}</p>}
            </Panel>
            <Panel h={t.pl.formH} sub={t.pl.recent(matches.length)}>
              <ol className="a2-form">
                {ultimas.map((r, i) => (
                  <li key={i} className={`is-${r}`}>
                    {r === "win" ? t.pl.formWin : r === "loss" ? t.pl.formLoss : t.pl.formOther}
                  </li>
                ))}
              </ol>
              <h3 className="a2-h3">{t.pl.rivalsH}</h3>
              <Cruces lista={rv} perfil={perfil} navigate={navigate} />
              {cp.length > 0 && (
                <>
                  <h3 className="a2-h3">{t.pl.matesH}</h3>
                  <Cruces lista={cp} perfil={perfil} navigate={navigate} />
                </>
              )}
            </Panel>
          </div>

          <div className="a2-cols">
            <Panel h={t.pl.civsH} sub={t.pl.recent(matches.length)}>
              <TablaCivs filas={civs} />
            </Panel>
            <Panel h={t.pl.mapsH} sub={t.pl.recent(matches.length)}>
              <TablaMapas filas={mapas} />
            </Panel>
          </div>

          <Panel h={t.pl.activityH} sub={t.pl.activitySub(durTxt)}>
            <Actividad grilla={act} />
          </Panel>

          <MatchHistory matches={matches} id={id} route={route} navigate={navigate} />
          <HeadToHead matches={matches} id={id} route={route} navigate={navigate} />
        </>
      )}
    </>
  );
}

function Cruces({ lista, perfil, navigate }: { lista: { profileId: number; alias: string; wins: number; losses: number }[]; perfil: (id: number) => Route; navigate: Nav }) {
  const t = useAoe2Copy();
  if (!lista.length) return <p className="a2-note">–</p>;
  return (
    <ul className="a2-vs">
      {lista.map((r) => (
        <li key={r.profileId}>
          <RouteLink to={perfil(r.profileId)} onNavigate={navigate}>
            {r.alias}
          </RouteLink>
          <span className={r.wins >= r.losses ? "a2-up" : "a2-down"}>{t.pl.vs(r.wins, r.losses)}</span>
        </li>
      ))}
    </ul>
  );
}

type CivKey = "civ" | "games" | "wr" | "avgElo";
function TablaCivs({ filas }: { filas: ReturnType<typeof byCiv> }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const { sort, th } = useSort<CivKey>({ key: "games", dir: -1 }, ["civ"]);
  const cols: Record<CivKey, (r: (typeof filas)[number]) => string | number | null> = {
    civ: (r) => civById(r.civ)?.name[lang] ?? String(r.civ),
    games: (r) => r.games,
    wr: (r) => r.wins / r.games,
    avgElo: (r) => r.avgElo,
  };
  return (
    <table className="a2-table">
      <thead>
        <tr>
          {th("civ", t.pl.cols.civ)}
          {th("games", t.pl.cols.games, { className: "num" })}
          {th("wr", t.pl.cols.wr, { className: "num" })}
          {th("avgElo", t.pl.cols.avgElo, { className: "num a2-hide-s" })}
        </tr>
      </thead>
      <tbody>
        {sortRows(filas, cols, sort).map((r) => {
          const c = civById(r.civ);
          return (
            <tr key={r.civ}>
              <td>
                <span className="a2-civ">
                  <CivShield civ={c} size={28} />
                  {c?.name[lang] ?? `#${r.civ}`}
                </span>
              </td>
              <td className="num">{r.games}</td>
              <td className={`num ${r.wins / r.games >= 0.5 ? "a2-up" : "a2-down"}`}>{pct(r.wins, r.games)}</td>
              <td className="num a2-hide-s">{r.avgElo ?? "–"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type MapKey = "map" | "games" | "wr";
function TablaMapas({ filas }: { filas: ReturnType<typeof byMap> }) {
  const t = useAoe2Copy();
  const { sort, th } = useSort<MapKey>({ key: "games", dir: -1 }, ["map"]);
  const cols: Record<MapKey, (r: (typeof filas)[number]) => string | number> = { map: (r) => r.map, games: (r) => r.games, wr: (r) => r.wins / r.games };
  return (
    <table className="a2-table">
      <thead>
        <tr>
          {th("map", t.pl.cols.map)}
          {th("games", t.pl.cols.games, { className: "num" })}
          {th("wr", t.pl.cols.wr, { className: "num" })}
        </tr>
      </thead>
      <tbody>
        {sortRows(filas, cols, sort).map((r) => (
          <tr key={r.map}>
            <td>{mapName(r.map)}</td>
            <td className="num">{r.games}</td>
            <td className={`num ${r.wins / r.games >= 0.5 ? "a2-up" : "a2-down"}`}>{pct(r.wins, r.games)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Actividad({ grilla }: { grilla: number[][] }) {
  const t = useAoe2Copy();
  const max = Math.max(1, ...grilla.flat());
  return (
    <div className="a2-heat" role="table">
      {grilla.map((fila, d) => (
        <div key={d} className="a2-heat-row" role="row">
          <span className="a2-heat-day" role="rowheader">
            {t.pl.days[d]}
          </span>
          {fila.map((n, h) => (
            <span key={h} role="cell" className="a2-heat-c" title={`${t.pl.days[d]} ${h}:00 · ${n}`} style={{ opacity: n ? 0.25 + (0.75 * n) / max : 1, background: n ? "var(--a2-gold)" : undefined }} />
          ))}
        </div>
      ))}
      <div className="a2-heat-row a2-heat-hours" aria-hidden="true">
        <span className="a2-heat-day" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="a2-heat-h">
            {h % 6 === 0 ? h : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** `/aoe2/players/steam-<SteamID64>` (el link del menú de la cuenta): busca el perfil de ese Steam y lo abre. */
function PorSteam({ steamId, route, navigate }: { steamId: string; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const yo = useAoe2Me();
  const { data, error } = useApi<{ results: { id: number }[] }>(`/api/aoe2/search?q=${steamId}`);
  const encontrado = data?.results[0]?.id;
  useEffect(() => {
    if (!encontrado) return;
    if (yo.me == null) yo.setMe(encontrado);
    navigate({ ...route, view: "aoe2", a2Section: "players", detail: String(encontrado) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encontrado]);
  if (error != null || (data && !encontrado)) return <Panel><p>{t.me.noSteam}</p></Panel>;
  return <Panel><p aria-busy="true">{t.me.resolving}</p></Panel>;
}
