/**
 * La ficha de partida de AoE2 (2026-11-20): `/aoe2/matches/<id>?p=<perfil>` (la API sólo encuentra la partida en el
 * historial de alguien). Equipos con jugador, civ, ELO y cambio; el ganador con la corona del juego; mapa, modo,
 * duración, fecha y espectadores. De la grabación (2026-11-26): apertura y APM de cada uno, clics de edad y unidades
 * entrenadas. Sin prerender, con `noindex` y fuera del sitemap.
 */
import { useEffect, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, useLocale } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { useApi, useDocTitle, useNoindex } from "../../coh3/live/ui";
import { Aoe2Loading, CivShield, Panel, civById, type Nav } from "../ui";
import type { Aoe2Match } from "../api/wel";
import { mapName } from "../players/mapName";
import { useModeName } from "../players/MatchHistory";
import { tieneApertura, useAnalysis } from "../players/useOpening";
import type { Analisis } from "../api/analysis";
import { unidades, type Unidad } from "../encyclopedia/data";
import { Icono } from "../encyclopedia/parts";

/** El número de partida y el jugador de origen: del detalle (`123?p=9` al navegar) o de la dirección (`?p=9` al recargar). */
function ids(detail: string | undefined): { id: string | null; p: string | null } {
  const [id, q] = (detail ?? "").split("?");
  const p = new URLSearchParams(q ?? (typeof window !== "undefined" ? window.location.search : "")).get("p");
  return { id: /^\d{1,12}$/.test(id) ? id : null, p: p && /^\d{1,12}$/.test(p) ? p : null };
}

export default function Aoe2Matches({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  useNoindex();
  const { id, p } = ids(route.detail);
  const { data, error, retry } = useApi<Aoe2Match>(id && p ? `/api/aoe2/match?id=${id}&p=${p}` : null);
  useDocTitle(data ? `${mapName(data.map, lang)} · ${t.match.h} · Age of Empires II · Vestigo` : null);
  if (!id || !p) return <Panel h={t.match.h}><p>{t.match.noP}</p></Panel>;
  if (error === 404) return <Panel h={t.match.h}><p>{t.match.gone}</p></Panel>;
  if (error != null) return <Aoe2Loading onRetry={retry} />;
  if (!data) return <Aoe2Loading />;
  return <Ficha m={data} route={route} navigate={navigate} p={Number(p)} />;
}

function Ficha({ m, route, navigate, p }: { m: Aoe2Match; route: Route; navigate: Nav; p: number }) {
  const pide = tieneApertura(m);
  const an = useAnalysis(m.id, p, pide);
  const t = useAoe2Copy();
  const { lang } = useLang();
  const locale = useLocale();
  const modo = useModeName();
  const equipos = [...new Set(m.players.map((p) => p.team))].sort((a, b) => a - b);
  const hechos: [string, string][] = [
    [t.match.facts.map, mapName(m.map, lang)],
    [t.match.facts.mode, modo(m.mode)],
    [t.match.facts.length, t.hist.min(m.end - m.start)],
    [t.match.facts.date, new Date(m.start * 1000).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })],
    ...(m.observers ? ([[t.match.facts.observers, String(m.observers)]] as [string, string][]) : []),
  ];
  const con = an ? m.players.filter((x) => an[x.profileId]) : [];
  return (
    <>
      <Panel h={`${mapName(m.map, lang)} · ${modo(m.mode)}`}>
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
                    <th className="num" title={t.match.apmHint}>{t.match.cols.apm}</th>
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
                          <OpCelda pide={pide} a={an === undefined ? undefined : (an?.[p.profileId] ?? null)} />
                        </td>
                        <td className="num">{an?.[p.profileId]?.apm ?? "–"}</td>
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
      {pide && an === null && (
        <Panel>
          <p className="a2-note">{t.match.noRec}</p>
        </Panel>
      )}
      {con.length > 0 && an && (
        <>
          <Panel h={t.match.agesH} sub={t.match.agesSub}>
            <table className="a2-table">
              <thead>
                <tr>
                  <th>{t.match.cols.player}</th>
                  {t.match.ages.map((e) => (
                    <th key={e} className="num">
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {con.map((x) => (
                  <tr key={x.profileId}>
                    <td>
                      <span className="a2-civ">
                        <CivShield civ={civById(x.civ)} size={22} />
                        {x.alias}
                      </span>
                    </td>
                    {an[x.profileId].ages.map((s, i) => (
                      <td key={i} className="num">
                        {s == null ? "–" : t.match.clock(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel h={t.match.unitsH} sub={t.match.unitsSub}>
            <Unidades jugadores={con.map((x) => ({ alias: x.alias, civ: x.civ, a: an[x.profileId] }))} />
          </Panel>
        </>
      )}
    </>
  );
}

function OpCelda({ pide, a }: { pide: boolean; a: Analisis | null | undefined }) {
  const t = useAoe2Copy();
  const op = a?.opening;
  return <span className={`a2-op${op ? ` is-${op}` : ""}`}>{!pide ? "–" : a === undefined ? t.op.loading : op ? t.op.names[op] : "–"}</span>;
}

/** El juego encola los aldeanos como "aldeano (hombre)": se muestran como aldeanos a secas. */
const NOMBRE: Record<number, Record<"es" | "en", string>> = { 83: { es: "Aldeano", en: "Villager" } };

function Unidades({ jugadores }: { jugadores: { alias: string; civ: number; a: Analisis }[] }) {
  const { lang } = useLang();
  const [u, setU] = useState<Map<number, Unidad> | null>(() => {
    const x = unidades.peek();
    return x ? new Map(x.units.map((y) => [y.id, y])) : null;
  });
  useEffect(() => {
    if (!u) void unidades.load().then((x) => setU(new Map(x.units.map((y) => [y.id, y]))));
  }, [u]);
  return (
    <ul className="a2-trained">
      {jugadores.map((j) => (
        <li key={j.alias}>
          <span className="a2-civ">
            <CivShield civ={civById(j.civ)} size={22} />
            <b>{j.alias}</b>
          </span>
          <ul>
            {j.a.units.map(([id, n]) => {
              const x = u?.get(id);
              if (u && !x) return null;
              return (
                <li key={id} title={NOMBRE[id]?.[lang] ?? x?.name[lang]}>
                  {x ? <Icono k="u" pic={x.pic} size={36} /> : <span className="a2-ico" style={{ width: 36, height: 36 }} />}
                  <span>{n}</span>
                  <small>{NOMBRE[id]?.[lang] ?? x?.name[lang] ?? ""}</small>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
