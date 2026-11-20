/**
 * La ficha de partida de AoE2 (2026-11-20): `/aoe2/matches/<id>?p=<perfil>` (la API sólo encuentra la partida en el
 * historial de alguien). Equipos con jugador, civ, ELO y cambio; el ganador con la corona del juego; mapa, modo,
 * duración, fecha, tamaño del mapa y espectadores. Sin prerender, con `noindex` y fuera del sitemap.
 */
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, useLocale } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { useApi, useDocTitle, useNoindex } from "../../coh3/live/ui";
import { Aoe2Loading, CivShield, Panel, civById, type Nav } from "../ui";
import type { Aoe2Match } from "../api/wel";
import { mapName } from "../players/mapName";
import { useModeName } from "../players/MatchHistory";
import { useOpening } from "../players/useOpening";

/** El número de partida y el jugador de origen: del detalle (`123?p=9` al navegar) o de la dirección (`?p=9` al recargar). */
function ids(detail: string | undefined): { id: string | null; p: string | null } {
  const [id, q] = (detail ?? "").split("?");
  const p = new URLSearchParams(q ?? (typeof window !== "undefined" ? window.location.search : "")).get("p");
  return { id: /^\d{1,12}$/.test(id) ? id : null, p: p && /^\d{1,12}$/.test(p) ? p : null };
}

export default function Aoe2Matches({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  useNoindex();
  const { id, p } = ids(route.detail);
  const { data, error, retry } = useApi<Aoe2Match>(id && p ? `/api/aoe2/match?id=${id}&p=${p}` : null);
  useDocTitle(data ? `${mapName(data.map)} · ${t.match.h} · Age of Empires II · Vestigo` : null);
  if (!id || !p) return <Panel h={t.match.h}><p>{t.match.noP}</p></Panel>;
  if (error === 404) return <Panel h={t.match.h}><p>{t.match.gone}</p></Panel>;
  if (error != null) return <Aoe2Loading onRetry={retry} />;
  if (!data) return <Aoe2Loading />;
  return <Ficha m={data} route={route} navigate={navigate} p={Number(p)} />;
}

function Ficha({ m, route, navigate, p }: { m: Aoe2Match; route: Route; navigate: Nav; p: number }) {
  const ops = useOpening(m.id, p);
  const t = useAoe2Copy();
  const { lang } = useLang();
  const locale = useLocale();
  const modo = useModeName();
  const equipos = [...new Set(m.players.map((p) => p.team))].sort((a, b) => a - b);
  const hechos: [string, string][] = [
    [t.match.facts.map, mapName(m.map)],
    [t.match.facts.mode, modo(m.mode)],
    [t.match.facts.length, t.hist.min(m.end - m.start)],
    [t.match.facts.date, new Date(m.start * 1000).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })],
    ...(m.mapSize ? ([[t.match.facts.size, t.match.tiles(m.mapSize)]] as [string, string][]) : []),
    [t.match.facts.observers, String(m.observers)],
  ];
  return (
    <>
      <Panel h={`${mapName(m.map)} · ${modo(m.mode)}`}>
        <dl className="a2-facts">
          {hechos.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <div className="a2-cols">
        {equipos.map((eq, i) => {
          const js = m.players.filter((p) => p.team === eq);
          const gano = js.some((p) => p.result === "win");
          return (
            <Panel key={eq} className={gano ? "a2-team is-win" : "a2-team"} h={
              <span className="a2-team-h">
                {gano && <img src="/aoe2/ui/winner.webp" alt={t.match.winner} width={30} height={30} />}
                {t.match.team(i + 1)}
              </span>
            }>
              <table className="a2-table">
                <thead>
                  <tr>
                    <th>{t.match.cols.player}</th>
                    <th>{t.match.cols.civ}</th>
                    <th className="num a2-hide-s">{t.match.cols.elo}</th>
                    <th>{t.op.pick}</th>
                    <th className="num">{t.match.cols.change}</th>
                  </tr>
                </thead>
                <tbody>
                  {js.map((p) => {
                    const c = civById(p.civ);
                    const d = p.oldElo != null && p.newElo != null ? p.newElo - p.oldElo : null;
                    return (
                      <tr key={p.profileId}>
                        <td>
                          {p.profileId > 0 ? (
                            <RouteLink to={{ ...route, view: "aoe2", a2Section: "players", detail: String(p.profileId) }} onNavigate={navigate}>
                              {p.alias}
                            </RouteLink>
                          ) : (
                            p.alias
                          )}
                        </td>
                        <td>
                          <span className="a2-civ">
                            <CivShield civ={c} size={26} />
                            <span className="a2-hide-s">{c?.name[lang] ?? `#${p.civ}`}</span>
                          </span>
                        </td>
                        <td className="num a2-hide-s">{p.newElo ?? "–"}</td>
                        <td>
                          <span className={`a2-op${ops?.[p.profileId] ? ` is-${ops[p.profileId]}` : ""}`}>{ops === undefined ? t.op.loading : ops?.[p.profileId] ? t.op.names[ops[p.profileId]] : "–"}</span>
                        </td>
                        <td className={`num ${d != null && d > 0 ? "a2-up" : d != null && d < 0 ? "a2-down" : ""}`}>{d == null ? "–" : d > 0 ? `+${d}` : d}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
