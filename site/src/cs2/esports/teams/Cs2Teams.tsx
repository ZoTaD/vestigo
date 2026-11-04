/**
 * La pestaña Equipos de CS2 (2026-11-03, etapa 6b): la lista (los equipos del ranking de Valve) y la ficha de cada
 * equipo, la maqueta A "Ficha" con los mosaicos de mapas de la B "Tablero" que eligió ZoTaD: cabecera con el puesto,
 * plantel, progresión en el ranking y últimos resultados, mapas (porcentaje ganado y rondas defendiendo y atacando) y
 * últimos partidos mapa por mapa. Sin estadísticas por jugador: esperan a GRID.
 */
import { useLang } from "../../../i18n";
import RouteLink from "../../../RouteLink";
import type { Route } from "../../../route";
import { useCs2Copy } from "../../../cs2Copy";
import { useLoad } from "../../../useLoad";
import { fmtDate } from "../../patches/names";
import { Cs2Loading, useNum, type Nav } from "../../ui";
import { loadIndex, loadTeam, lpSlug, peekIndex, peekTeam, type EsIndex, type Team } from "./data";
import { Flag, MapTiles, RankChart } from "./parts";

export default function Cs2Teams({ route, navigate }: { route: Route; navigate: Nav }) {
  const idx = useLoad("index", peekIndex, loadIndex);
  const slug = route.detail ?? null;
  const team = useLoad(slug, () => (slug ? peekTeam(slug) : undefined), () => loadTeam(slug!));
  if (idx.failed || team.failed) return <Cs2Loading onRetry={idx.failed ? idx.retry : team.retry} />;
  if (!idx.value || (slug && team.value === undefined)) return <Cs2Loading />;
  return slug && team.value ? <TeamPage team={team.value} idx={idx.value} route={route} navigate={navigate} /> : <TeamList idx={idx.value} route={route} navigate={navigate} />;
}

function TeamList({ idx, route, navigate }: { idx: EsIndex; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const num = useNum();
  const groups: [string, EsIndex["teams"]][] = [
    [t.tm.world, idx.teams.filter((x) => x.rank != null)],
    ...(["europe", "americas", "asia"] as const).map((r) => [t.tm.regions[r], idx.teams.filter((x) => x.rank == null && x.region === r)] as [string, EsIndex["teams"]]),
  ];
  return (
    <main className="c2-main">
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabs.teams}</h1>
        <p className="c2-lede">{t.tm.lede}</p>
      </header>
      {groups.map(([name, rows]) =>
        rows.length ? (
          <section className="c2-panel" key={name}>
            <h2 className="c2-h2">{name}</h2>
            <ul className="c2-tm-list">
              {rows.map((x, i) => (
                <li key={x.slug}>
                  <RouteLink className="c2-tm-li" to={{ ...route, view: "cs2", c2Section: "teams", detail: x.slug }} onNavigate={navigate}>
                    <span className="c2-tm-li-r">{x.rank ?? x.region_rank ?? i + 1}</span>
                    {x.logo ? <img className="c2-logo" src={`/cs2/t/${x.logo}.webp`} alt="" width={36} height={36} loading="lazy" decoding="async" /> : <span className="c2-logo is-text" style={{ width: 36, height: 36 }} aria-hidden="true">{x.name.slice(0, 2).toUpperCase()}</span>}
                    <b>{x.name}</b>
                    <span className="c2-num">{num(x.pts, 0)}</span>
                  </RouteLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      <p className="c2-note">{t.tm.credit}</p>
    </main>
  );
}

export function TeamPage({ team, idx, route, navigate }: { team: Team; idx: EsIndex; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const num = useNum();
  const players = team.roster.filter((p) => p.role === "player");
  const coaches = team.roster.filter((p) => p.role === "coach").map((p) => p.id);
  const known = new Set(idx.players.map((p) => p.slug));
  const teams = new Set(idx.teams.map((x) => x.slug));
  const v = team.vrs;
  const move = v.prev != null && v.rank != null ? v.prev - v.rank : null;
  const rankText = v.rank != null ? t.tm.rank(v.rank) : v.region ? t.tm.regional(t.tm.regions[v.region as "europe"] ?? v.region) : "";
  const to = (c2Section: "teams" | "players" | "esports", detail: string): Route => ({ ...route, view: "cs2", c2Section, detail });
  return (
    <main className="c2-main c2-tm">
      <header className="c2-tm-hero">
        {team.logo ? <img src={`/cs2/t/${team.logo}.webp`} alt="" width={96} height={96} /> : <span className="c2-logo is-text" style={{ width: 96, height: 96, fontSize: 36 }}>{team.name.slice(0, 2).toUpperCase()}</span>}
        <div className="c2-tm-hero-t">
          <h1 className="c2-tm-name">{team.name}</h1>
          <p className="c2-tm-sub">
            {team.igl && (
              <span>
                {t.tm.leader}: <b>{team.igl}</b>
              </span>
            )}
            {(coaches.length > 0 || (team.coaches?.length ?? 0) > 0) && (
              <span>
                {t.tm.coach}: <b>{(coaches.length ? coaches : team.coaches!).join(", ")}</b>
              </span>
            )}
            {team.winnings != null && (
              <span>
                {t.tm.winnings}: <b>US$ {num(team.winnings, 0)}</b>
              </span>
            )}
            {team.created && <span>{t.tm.since(team.created)}</span>}
          </p>
        </div>
        <div className="c2-tm-rank">
          <small>{t.es.vrs}</small>
          <b>{v.rank != null ? `#${v.rank}` : v.region_rank != null ? `#${v.region_rank}` : num(v.pts, 0)}</b>
          <small>
            {rankText}
            {move != null && <span className={move > 0 ? " is-up" : move < 0 ? " is-down" : ""}> · {t.tm.move(move)}</span>}
          </small>
        </div>
      </header>

      {players.length > 0 && (
        <ul className="c2-tm-roster">
          {players.map((p) => {
            const slug = p.lp ? lpSlug(p.lp) : null;
            const body = (
              <>
                {p.captain && <span className="c2-tm-cap">{t.tm.captain}</span>}
                <Flag code={p.flag} size={21} />
                <b>{p.id}</b>
                <span>{p.name}</span>
                {p.since && <small>{t.tm.inTeamSince(p.since.slice(0, 4))}</small>}
              </>
            );
            return (
              <li key={p.lp ?? p.id}>
                {slug && known.has(slug) ? (
                  <RouteLink className="c2-tm-pl" to={to("players", slug)} onNavigate={navigate}>
                    {body}
                  </RouteLink>
                ) : (
                  <div className="c2-tm-pl">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="c2-tm-two">
        {v.history.length > 1 && (
          <div className="c2-panel">
            <h2 className="c2-h2">{t.tm.progress}</h2>
            <p className="c2-dim">{t.tm.progressLede(`#${v.rank ?? v.history[v.history.length - 1].rank}`)}</p>
            <RankChart history={v.history} label={t.tm.progress} />
          </div>
        )}
        {team.results.length > 0 && (
          <div className="c2-panel">
            <h2 className="c2-h2">{t.tm.achievements}</h2>
            <ul className="c2-tm-ach">
              {team.results.slice(0, 8).map((r) => (
                <li key={r.date + r.tour}>
                  <span className={`c2-tm-pos${r.place.startsWith("1st") ? " is-gold" : ""}`}>{t.tm.place(r.place)}</span>
                  <span>
                    <b>{r.tour}</b>
                    <small>
                      {fmtDate(r.date, lang, { day: "numeric", month: "short", year: "numeric" })} · {r.tier}-Tier
                    </small>
                  </span>
                  <span className="c2-num">{r.prize != null ? `US$ ${num(r.prize, 0)}` : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="c2-tm-maps">
        <h2 className="c2-h2">{t.tm.maps}</h2>
        {team.maps.length ? (
          <>
            <p className="c2-dim">{t.tm.mapsLede}</p>
            <MapTiles maps={team.maps} />
          </>
        ) : (
          <p className="c2-dim">{t.tm.noData}</p>
        )}
      </section>

      {team.matches.length > 0 && (
        <section className="c2-panel">
          <h2 className="c2-h2">{t.tm.matches}</h2>
          <ul className="c2-tm-ms">
            {team.matches.map((m, i) => {
              const w = m.maps.filter((x) => (x.us == null ? x.ff : x.us > x.them!)).length;
              const oppSlug = m.opp_lp ? lpSlug(m.opp_lp) : null;
              return (
                <li key={i} className="c2-tm-m">
                  <span className={`c2-tm-res is-${m.won == null ? "eq" : m.won ? "won" : "lost"}`}>
                    {w}–{m.maps.length - w} <small>{m.won == null ? t.tm.draw : m.won ? t.tm.won : t.tm.lost}</small>
                  </span>
                  <span>
                    <b>{oppSlug && teams.has(oppSlug) ? <RouteLink to={to("teams", oppSlug)} onNavigate={navigate}>{t.tm.vs(m.opp)}</RouteLink> : t.tm.vs(m.opp)}</b>
                    {m.tour && (
                      <small>
                        {" · "}
                        {m.tour_lp ? <RouteLink to={to("esports", lpSlug(m.tour_lp))} onNavigate={navigate}>{m.tour}</RouteLink> : m.tour} · {fmtDate(new Date(m.t * 1000).toISOString().slice(0, 10), lang, { day: "numeric", month: "short" })}
                      </small>
                    )}
                  </span>
                  <span className="c2-tm-maps-row">
                    {m.maps.map((x, k) => (
                      <span key={k} className={(x.us == null ? x.ff : x.us > x.them!) ? "is-won" : "is-lost"}>
                        {x.map} {x.us == null ? (x.ff ? "W–FF" : "FF–W") : `${x.us}–${x.them}`}
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="c2-note">{t.tm.statsSoon}</p>
      <p className="c2-note">{t.tm.credit}</p>
    </main>
  );
}

