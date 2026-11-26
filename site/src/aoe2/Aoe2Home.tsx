/**
 * La portada de la sección Age of Empires II (2026-11-20): el top del ranking 1v1, los que más subieron, los que seguís,
 * la civ más fuerte en cada banda de ELO, los mapas más jugados, accesos a cada pestaña y todas las civs. Lo del ranking y
 * las estadísticas sale de `games/aoe2/stats/home.json` (lo escribe el colector diario; chico, va con la página). Desde
 * el 26/11, los datos curiosos de las grabaciones (`facts`).
 */
import { pedirSeguidos, type Seguido } from "./players/search";
import { useEffect, useState } from "react";
import RouteLink from "../RouteLink";
import type { Aoe2Tab, Route } from "../route";
import { useAoe2Copy } from "../aoe2Copy";
import { useLang } from "../i18n";
import { CivShield, Panel, civBySlug, type Civ, type Nav } from "./ui";
import { useAoe2Me, useMiPerfil } from "./players/me";
import { mapIcon, mapLabel } from "./stats/parts";
import civs from "@aoe2/civs.json";
import home from "@aoe2stats/home.json";

type UnidadChica = { id: number; pic: number; name: { en: string; es: string } };
type MarcaKey = "feudal" | "imperial" | "apm" | "army" | "villagers";
type Facts = {
  players: number;
  top: Partial<Record<MarcaKey, { value: number; match: number; profile: number; civ: string; alias: string; unit: UnidadChica | null }>>;
  apm: [string, number][];
  feudal: [string, number][];
  mostMassed: { unit: UnidadChica | null; share: number } | null;
};
type Home = {
  facts?: Facts | null;
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
  ["units", "strip-5"],
  ["technologies", "strip-4"],
  ["tech-tree", "strip-2"],
  ["calculator", "strip-1"],
];

export default function Aoe2Home({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const ir = (a2Section: Aoe2Tab, detail?: string): Route => ({ ...route, view: "aoe2", a2Section, detail });
  const lista = (civs as Civ[]).filter((c) => c.era === "base");
  const fecha = (d: string) => new Date(d).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
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
      {H.facts && <DatosCuriosos f={H.facts} route={route} navigate={navigate} />}
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
const MARCAS: MarcaKey[] = ["feudal", "imperial", "apm", "army", "villagers"];

function DatosCuriosos({ f, route, navigate }: { f: Facts; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const valor = (k: MarcaKey, v: number, u: UnidadChica | null) =>
    k === "feudal" || k === "imperial" ? t.match.clock(v) : k === "apm" ? t.hm.factApm(v) : k === "army" ? t.hm.factArmy(v, u?.name[lang] ?? "") : t.hm.factVillagers(v);
  const max = (xs: [string, number][]) => Math.max(1, ...xs.map(([, v]) => v));
  return (
    <Panel h={t.hm.factsH} sub={t.hm.factsSub(f.players)}>
      <ul className="a2-facts-list">
        {MARCAS.filter((k) => f.top[k]).map((k) => {
          const x = f.top[k]!;
          return (
            <li key={k}>
              <small>{t.hm.facts[k]}</small>
              <b className="a2-facts-v">
                {k === "army" && x.unit && <img src={`/aoe2/u/${x.unit.pic}.webp`} alt="" width={28} height={28} loading="lazy" decoding="async" />}
                {valor(k, x.value, x.unit)}
              </b>
              <RouteLink to={{ ...route, view: "aoe2", a2Section: "matches", detail: `${x.match}?p=${x.profile}` }} onNavigate={navigate} className="a2-civ">
                <CivShield civ={civBySlug(x.civ)} size={20} />
                {x.alias || "–"}
              </RouteLink>
            </li>
          );
        })}
      </ul>
      {f.mostMassed?.unit && (
        <>
          <h3 className="a2-h3">{t.hm.massedH}</h3>
          <p className="a2-facts-massed">
            <img src={`/aoe2/u/${f.mostMassed.unit.pic}.webp`} alt="" width={36} height={36} loading="lazy" decoding="async" />
            {t.hm.massed(f.mostMassed.unit.name[lang], `${Math.round(f.mostMassed.share * 100)}%`)}
          </p>
        </>
      )}
      <div className="a2-cols">
        {f.apm.length > 0 && (
          <div>
            <h3 className="a2-h3">{t.hm.apmBandH}</h3>
            <ul className="a2-bars">
              {f.apm.map(([b, v]) => (
                <li key={b}>
                  <span>{t.st.bands[b]}</span>
                  <i style={{ width: `${(v / max(f.apm)) * 100}%` }} />
                  <b>{v}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
        {f.feudal.length > 0 && (
          <div>
            <h3 className="a2-h3">{t.hm.feudalBandH}</h3>
            <ul className="a2-bars">
              {f.feudal.map(([b, v]) => (
                <li key={b}>
                  <span>{t.st.bands[b]}</span>
                  <i style={{ width: `${(v / max(f.feudal)) * 100}%` }} />
                  <b>{t.match.clock(v)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Seguidos({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const yo = useAoe2Me();
  const mio = useMiPerfil();
  const ids = [...new Set([...(mio ? [mio] : []), ...yo.follows])].slice(0, 50);
  const [js, setJs] = useState<Seguido[] | "down" | null>(null);
  const clave = ids.join(",");
  useEffect(() => {
    if (!clave) {
      setJs([]);
      return;
    }
    let vivo = true;
    void pedirSeguidos(clave).then((r) => vivo && setJs(r ?? "down"));
    return () => {
      vivo = false;
    };
  }, [clave]);
  return (
    <Panel h={t.hm.followH}>
      {js === "down" ? (
        <p className="a2-note" role="alert">
          {t.t.apiDown}
        </p>
      ) : !js?.length ? (
        <p className="a2-note">{js ? t.hm.followEmpty : t.t.loading}</p>
      ) : (
        <ul className="a2-vs">
          {js.map((j) => (
            <li key={j.id}>
              <RouteLink to={{ ...route, view: "aoe2", a2Section: "players", detail: String(j.id) }} onNavigate={navigate}>
                {j.id === mio ? `★ ${j.alias}` : j.alias}
              </RouteLink>
              <span>{j.elo ?? "–"}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
