/**
 * Partida de CoH3 (2026-11-04): `/coh3/matches/<id>?p=<profile_id>`.
 *
 * Relic no tiene un pedido por partida: sólo el historial reciente de un jugador (~50 partidas). Por eso la ficha
 * necesita un jugador que la haya jugado. Decisión: va en la query (`?p=`), que pone `MatchLink` en cada enlace, así el
 * link se puede copiar y compartir tal cual. Si falta (un link escrito a mano), se usa el último jugador abierto en esta
 * pestaña del navegador (`sessionStorage`, `rememberPlayer`); si tampoco hay, se explica y se lleva al buscador.
 *
 * No se prerenderiza (son infinitas), lleva `noindex` y está fuera del sitemap. El título lleva el mapa y el modo.
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCoh3Copy, cohGameSeo } from "../../coh3Copy";
import { useLang } from "../../i18n";
import type { CounterSummary, MatchDetail } from "../api/relic";
import { Coh3Loading, FactionTag, Panel, useCohGame, useNum, type Nav } from "../ui";
import { clock } from "../live/logic";
import { PlayerLink, currentSearch, lastPlayer, useAgo, useApi, useDate, useDocTitle, useMapName, useNoindex } from "../live/ui";
import { useMtCopy } from "./copy";

type Player = MatchDetail["players"][number];
type StatKey = keyof CounterSummary;
/** El orden de las barras: lo que más se mira primero. */
const STATS: StatKey[] = [
  "kills",
  "deaths",
  "damage",
  "unitsProduced",
  "squadsLost",
  "vehiclesKilled",
  "vehiclesLost",
  "pointsCaptured",
  "pointsLost",
  "apm",
  "squadsProduced",
  "vehiclesProduced",
  "pointsRecaptured",
  "abilities",
  "bgAbilities",
];

export default function Coh3Matches({ route, navigate }: { route: Route; navigate: Nav }) {
  useNoindex();
  const t = useMtCopy();
  const c = useCoh3Copy();
  const id = route.detail && /^\d{1,12}$/.test(route.detail) ? Number(route.detail) : null;
  const player = useMemo(() => {
    const p = new URLSearchParams(currentSearch()).get("p");
    return p && /^\d{1,10}$/.test(p) ? Number(p) : lastPlayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.detail]);
  const game = useCohGame();
  const { lang } = useLang();
  useDocTitle(id ? null : game === "coh3" ? c.seo.matches.title : cohGameSeo(game, lang, "matches").title);

  if (!id || !player)
    return (
      <main className="c3-main">
        <Panel k={t.k}>
          <p style={{ marginTop: 10 }}>{t.noPlayer}</p>
          <p style={{ marginTop: 12 }}>
            <RouteLink className="c3-btn" to={{ ...route, view: "coh3", c3Section: "players", detail: undefined }} onNavigate={navigate}>
              {t.findPlayer} →
            </RouteLink>
          </p>
        </Panel>
      </main>
    );
  return <Match key={`${id}:${player}`} id={id} player={player} route={route} navigate={navigate} />;
}

function Match({ id, player, route, navigate }: { id: number; player: number; route: Route; navigate: Nav }) {
  const t = useMtCopy();
  const c = useCoh3Copy();
  const num = useNum();
  const ago = useAgo();
  const date = useDate();
  const mapName = useMapName();
  const { data, error, retry } = useApi<MatchDetail>(`/api/coh3/match?id=${id}&player=${player}`);
  const modeLabel = (m: MatchDetail["mode"]) => (m === "custom" ? t.custom : m === "ai" ? t.ai : m === "other" ? t.other : c.modes[m]);
  useDocTitle(data ? t.title(mapName(data.map), modeLabel(data.mode)) : null);
  const toPlayer = { ...route, view: "coh3" as const, c3Section: "players" as const, detail: String(player) };

  if (error === 404 || error === 400)
    return (
      <main className="c3-main">
        <Panel k={t.k}>
          <p role="alert" style={{ marginTop: 10 }}>
            {t.notFound}
          </p>
          <p style={{ marginTop: 12 }}>
            <RouteLink className="c3-btn is-ghost" to={toPlayer} onNavigate={navigate}>
              ← {t.backToPlayer}
            </RouteLink>
          </p>
        </Panel>
      </main>
    );
  if (error != null) return <Coh3Loading onRetry={retry} />;
  if (!data) return <Coh3Loading />;

  const me = data.players.find((p) => p.profileId === player);
  const teams = [...new Set(data.players.map((p) => p.team))].sort((a, b) => a - b).map((team) => data.players.filter((p) => p.team === team));
  const resLabel = (r: Player["result"]) => (r === "win" ? t.win : r === "loss" ? t.loss : t.otherRes);
  const resCls = (r: Player["result"]) => (r === "win" ? "c3-win" : r === "loss" ? "c3-loss" : "c3-dim");
  const stats = STATS.filter((k) => data.players.some((p) => (p.summary?.[k] ?? 0) > 0));
  const order = [...data.players].sort((a, b) => (a.result === b.result ? a.team - b.team : a.result === "win" ? -1 : b.result === "win" ? 1 : 0));

  return (
    <main className="c3-main">
      <Panel>
        <p className="c3-crumb">
          <RouteLink to={toPlayer} onNavigate={navigate}>
            ← {me?.alias || t.backToPlayer}
          </RouteLink>
        </p>
        <div className="c3-k" style={{ marginTop: 10 }}>
          {t.k} · #{id}
        </div>
        <h1 className="c3-h1">{mapName(data.map)}</h1>
        {me && (
          <p className={`c3-h3 ${resCls(me.result)}`} style={{ marginTop: 8 }}>
            {resLabel(me.result)} · {me.alias}
          </p>
        )}
        <div className="c3-facts" style={{ marginTop: 14 }}>
          <div className="c3-fact">
            <small>{t.mode}</small>
            <b className="c3-plain">{modeLabel(data.mode)}</b>
          </div>
          <div className="c3-fact">
            <small>{t.duration}</small>
            <b>{clock(data.duration)}</b>
          </div>
          <div className="c3-fact">
            <small>{t.date}</small>
            <b title={date(data.start)}>{ago(data.start)}</b>
          </div>
        </div>
        <p className="c3-note" style={{ marginTop: 10 }}>
          {date(data.start)}
          {data.automatch && ` · ${t.automatch}`}
        </p>
      </Panel>

      <div className="c3-mt-teams">
        {teams.map((ps, i) => {
          const res = ps[0]?.result ?? "other";
          return (
            <Panel key={i} className="c3-mt-team">
              <h2 className="c3-h3">
                <span>{t.team(i + 1)}</span>
                <span className={resCls(res)}>{resLabel(res)}</span>
              </h2>
              <p className="c3-note">{ps.some((p) => p.eloAfter != null) ? t.eloChange : t.noElo}</p>
              <ul>
                {ps.map((p) => {
                  const d = p.eloBefore != null && p.eloAfter != null ? p.eloAfter - p.eloBefore : null;
                  return (
                    <li key={p.profileId} className={`c3-mt-p${p.profileId === player ? " is-me" : ""}`}>
                      <PlayerLink route={route} navigate={navigate} id={p.profileId} alias={p.alias} country={p.country} />
                      <span className="c3-mt-elo">
                        {d != null ? (
                          <>
                            <span className="c3-dim">{num(p.eloBefore ?? 0)} → </span>
                            <b>{num(p.eloAfter ?? 0)}</b> <span className={`c3-delta ${d > 0 ? "c3-up" : d < 0 ? "c3-down" : "c3-dim"}`}>({d > 0 ? `+${d}` : d})</span>
                          </>
                        ) : null}
                      </span>
                      <small>{p.faction ? <FactionTag f={p.faction} size={18} short={false} /> : c.t.none}</small>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          );
        })}
      </div>

      <Panel k={t.statsH} lede={t.statsLede}>
        {!stats.length ? (
          <p className="c3-note">{t.noStats}</p>
        ) : (
          <>
            <p className="c3-legend" style={{ marginBottom: 12 }}>
              <span>
                <i style={{ background: "var(--c3-brass)" }} />
                {t.winners}
              </span>
              <span>
                <i style={{ background: "var(--c3-brass2)" }} />
                {t.losers}
              </span>
            </p>
            <div className="c3-stats">
              {stats.map((k) => {
                const max = Math.max(1, ...order.map((p) => p.summary?.[k] ?? 0));
                return (
                  <section className="c3-stat" key={k}>
                    <h3>{t.stats[k]}</h3>
                    <ol>
                      {order.map((p) => {
                        const v = p.summary?.[k] ?? 0;
                        return (
                          <li key={p.profileId} className={`c3-bar${p.result === "win" ? " is-w" : ""}${p.profileId === player ? " is-me" : ""}`}>
                            <span className="c3-bar-n" title={p.alias}>
                              {p.alias || `#${p.profileId}`}
                            </span>
                            <span className="c3-bar-t" aria-hidden="true">
                              <span className="c3-bar-f" style={{ width: `${(v / max) * 100}%`, display: "block" }} />
                            </span>
                            <span className="c3-bar-v">{num(v)}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </Panel>
    </main>
  );
}
