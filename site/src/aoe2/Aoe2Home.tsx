/**
 * La portada de la sección Age of Empires II (2026-11-20): el top del ranking 1v1, los que más subieron, los que seguís,
 * la civ más fuerte en cada banda de ELO, los mapas más jugados, accesos a cada pestaña y todas las civs. Lo del ranking y
 * las estadísticas sale de `games/aoe2/stats/home.json` (lo escribe el colector diario; chico, va con la página).
 */
import { useEffect, useState } from "react";
import RouteLink from "../RouteLink";
import type { Aoe2Tab, Route } from "../route";
import { useAoe2Copy } from "../aoe2Copy";
import { useLang } from "../i18n";
import { CivShield, Panel, civBySlug, type Civ, type Nav } from "./ui";
import { useAoe2Me } from "./players/me";
import { mapIcon, mapLabel } from "./stats/parts";
import civs from "@aoe2/civs.json";
import home from "@aoe2stats/home.json";

type Home = {
  date: string | null;
  top: [number, number, string][];
  climbers: [number, number, string, number][];
  best: Record<string, [string, number, number]>;
  maps: [string, number][];
  patch: { name: string; since: string } | null;
};
const H = home as unknown as Home;
const ACCESOS: [Aoe2Tab, string][] = [
  ["leaderboards", "mode-rm"],
  ["civilizations", "mode-team"],
  ["matchups", "mode-ew"],
  ["maps", "mode-dm"],
  ["players", "strip-3"],
];

export default function Aoe2Home({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const ir = (a2Section: Aoe2Tab, detail?: string): Route => ({ ...route, view: "aoe2", a2Section, detail });
  const lista = (civs as Civ[]).filter((c) => c.era === "base");
  const fecha = (d: string) => new Date(d).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <>
      <Panel h={t.home.h1}>
        <p className="a2-lead">{t.home.lead}</p>
        {H.patch && <p className="a2-note">{t.hm.patch(H.patch.name, fecha(H.patch.since))}</p>}
      </Panel>
      <div className="a2-cols">
        {H.top.length > 0 && (
          <Panel h={t.hm.topH}>
            <ol className="a2-vs a2-top">
              {H.top.map(([id, elo, alias], i) => (
                <li key={id}>
                  <span className="a2-civ">
                    {i === 0 ? <img src="/aoe2/ui/winner.webp" alt="" width={22} height={22} /> : <span className="a2-pos">{i + 1}</span>}
                    <RouteLink to={ir("players", String(id))} onNavigate={navigate}>
                      {alias}
                    </RouteLink>
                  </span>
                  <b>{elo}</b>
                </li>
              ))}
            </ol>
          </Panel>
        )}
        {H.climbers.length > 0 ? (
          <Panel h={t.hm.climbH}>
            <ul className="a2-vs">
              {H.climbers.map(([id, elo, alias, d]) => (
                <li key={id}>
                  <RouteLink to={ir("players", String(id))} onNavigate={navigate}>
                    {alias}
                  </RouteLink>
                  <span>
                    {elo} <small className="a2-up">+{d}</small>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Seguidos route={route} navigate={navigate} />
        )}
      </div>
      {H.climbers.length > 0 && <Seguidos route={route} navigate={navigate} />}
      {Object.keys(H.best).length > 0 && (
        <Panel h={t.hm.bestH} sub={t.hm.bestSub}>
          <ul className="a2-cards">
            {Object.entries(H.best).map(([b, [civ, wr, g]]) => (
              <li key={b}>
                <small>{t.st.bands[b]}</small>
                <RouteLink to={ir("civilizations", civ)} onNavigate={navigate} className="a2-civ">
                  <CivShield civ={civBySlug(civ)} size={30} />
                  {civBySlug(civ)?.name[lang] ?? civ}
                </RouteLink>
                <span className="a2-up">
                  {(wr * 100).toFixed(1)}% · {t.op.games(g)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {H.maps.length > 0 && (
        <Panel h={t.hm.mapsH} sub={t.hm.mapsSub}>
          <ul className="a2-maps">
            {H.maps.map(([m, g]) => (
              <li key={m}>
                <RouteLink to={ir("maps", m)} onNavigate={navigate}>
                  <img src={mapIcon(m)} alt="" width={56} height={56} loading="lazy" decoding="async" />
                  <span className="a2-maps-what">
                    <b>{mapLabel(m, lang)}</b>
                    <small>{t.st.mapGames(g)}</small>
                  </span>
                  <span />
                </RouteLink>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel h={t.hm.goH}>
        <ul className="a2-go">
          {ACCESOS.map(([tab, img]) => (
            <li key={tab}>
              <RouteLink to={ir(tab)} onNavigate={navigate}>
                <img src={`/aoe2/ui/${img}.webp`} alt="" width={712} height={332} loading="lazy" decoding="async" />
                <span>
                  <b>{t.tabs[tab]}</b>
                  <small>{t.hm.go[tab]}</small>
                </span>
              </RouteLink>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel h={t.hm.civsH} sub={`${lista.length}`}>
        <ul className="a2-civgrid">
          {lista.map((c) => (
            <li key={c.id}>
              <RouteLink to={ir("civilizations", c.slug)} onNavigate={navigate} className="a2-civ">
                <CivShield civ={c} size={36} />
                <span>{c.name[lang]}</span>
              </RouteLink>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

/** Los jugadores que seguís (y el tuyo arriba), con alias y ELO de 1v1 de `/api/aoe2/players`. */
function Seguidos({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const yo = useAoe2Me();
  const ids = [...new Set([...(yo.me ? [yo.me] : []), ...yo.follows])].slice(0, 50);
  const [js, setJs] = useState<{ id: number; alias: string; elo: number | null }[] | null>(null);
  const clave = ids.join(",");
  useEffect(() => {
    if (!clave) {
      setJs([]);
      return;
    }
    let vivo = true;
    fetch(`/api/aoe2/players?ids=${clave}`)
      .then((r) => (r.ok ? r.json() : { players: [] }))
      .then((d: { players: { id: number; alias: string; elo: number | null }[] }) => vivo && setJs(d.players))
      .catch(() => vivo && setJs([]));
    return () => {
      vivo = false;
    };
  }, [clave]);
  return (
    <Panel h={t.hm.followH}>
      {!js?.length ? (
        <p className="a2-note">{js ? t.hm.followEmpty : t.t.loading}</p>
      ) : (
        <ul className="a2-vs">
          {js.map((j) => (
            <li key={j.id}>
              <RouteLink to={{ ...route, view: "aoe2", a2Section: "players", detail: String(j.id) }} onNavigate={navigate}>
                {j.id === yo.me ? `★ ${j.alias}` : j.alias}
              </RouteLink>
              <span>{j.elo ?? "–"}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
