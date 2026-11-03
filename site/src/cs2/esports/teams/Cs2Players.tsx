/**
 * La pestaña Jugadores de CS2 (2026-11-03, etapa 6b): la lista de los jugadores de los 30 equipos del mundial y la
 * ficha básica de cada uno (bandera, nombre, edad, roles, equipo y premios). Las estadísticas por jugador (rating, daño
 * por ronda) esperan a GRID: la ficha lo dice.
 */
import { useLang } from "../../../i18n";
import RouteLink from "../../../RouteLink";
import type { Route } from "../../../route";
import { useCs2Copy } from "../../../cs2Copy";
import { useLoad } from "../../../useLoad";
import { Cs2Loading, useNum, type Nav } from "../../ui";
import { loadIndex, loadPlayer, peekIndex, peekPlayer, type EsIndex, type Player } from "./data";
import { Flag } from "./parts";

/** Los años cumplidos al día de hoy (UTC). */
export function age(born: string, now = new Date()): number {
  const [y, m, d] = born.split("-").map(Number);
  let a = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) a--;
  return a;
}

export default function Cs2Players({ route, navigate }: { route: Route; navigate: Nav }) {
  const idx = useLoad("index", peekIndex, loadIndex);
  const slug = route.detail ?? null;
  const pl = useLoad(slug, () => (slug ? peekPlayer(slug) : undefined), () => loadPlayer(slug!));
  if (idx.failed || pl.failed) return <Cs2Loading onRetry={idx.failed ? idx.retry : pl.retry} />;
  if (!idx.value || (slug && pl.value === undefined)) return <Cs2Loading />;
  return slug && pl.value ? <PlayerPage p={pl.value} idx={idx.value} route={route} navigate={navigate} /> : <PlayerList idx={idx.value} route={route} navigate={navigate} />;
}

function PlayerList({ idx, route, navigate }: { idx: EsIndex; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const name = new Map(idx.teams.map((x) => [x.slug, x.name]));
  return (
    <main className="c2-main">
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabs.players}</h1>
        <p className="c2-lede">{t.home.cards.players("")}</p>
      </header>
      <ul className="c2-tm-plist">
        {idx.players.map((p) => (
          <li key={p.slug}>
            <RouteLink to={{ ...route, view: "cs2", c2Section: "players", detail: p.slug }} onNavigate={navigate}>
              <b>{p.id}</b>
              <small>{p.team_slug ? name.get(p.team_slug) ?? "" : t.tm.noTeam}</small>
            </RouteLink>
          </li>
        ))}
      </ul>
      <p className="c2-note">{t.tm.credit}</p>
    </main>
  );
}

export function PlayerPage({ p, idx, route, navigate }: { p: Player; idx: EsIndex; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  useLang();
  const num = useNum();
  const team = p.team_slug ? idx.teams.find((x) => x.slug === p.team_slug) : undefined;
  return (
    <main className="c2-main c2-tm">
      <header className="c2-tm-hero">
        <Flag code={p.flag} size={48} />
        <div className="c2-tm-hero-t">
          <h1 className="c2-tm-name">{p.id}</h1>
          <p className="c2-tm-sub">
            {p.name && <span>{p.name}</span>}
            {p.born && <span>{t.tm.age(age(p.born))}</span>}
            {p.roles.length > 0 && (
              <span>
                {t.tm.roles}: <b>{p.roles.join(", ")}</b>
              </span>
            )}
            {p.winnings != null && (
              <span>
                {t.tm.winnings}: <b>US$ {num(p.winnings, 0)}</b>
              </span>
            )}
          </p>
        </div>
        <div className="c2-tm-rank">
          <small>{t.tm.team}</small>
          {team ? (
            <RouteLink className="c2-tm-pteam" to={{ ...route, view: "cs2", c2Section: "teams", detail: team.slug }} onNavigate={navigate}>
              {team.logo && <img src={`/cs2/t/${team.logo}.webp`} alt="" width={40} height={40} />}
              <b>{team.name}</b>
            </RouteLink>
          ) : (
            <b className="c2-tm-pteam">{p.team_lp ?? t.tm.noTeam}</b>
          )}
        </div>
      </header>
      <p className="c2-panel c2-tm-soon">{t.tm.statsSoon}</p>
      <p className="c2-note">{t.tm.credit}</p>
    </main>
  );
}
