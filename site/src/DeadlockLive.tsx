import { useEffect, useMemo, useState } from "react";
import GameImg from "./GameImg";
import RouteLink from "./RouteLink";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { heroImg, heroName } from "./deadlockReportData";
import type { Route } from "./route";
import "./styles/deadlock-pros.css";

/**
 * "En vivo" (2026-11-10): las partidas que se están jugando ahora.
 *
 * Sale de `/v1/matches/active` de deadlock-api, que devuelve las ~150 salas de
 * nivel más alto en juego (las mismas que el juego muestra para espectar), con
 * los héroes, el equipo de cada uno y las almas de cada lado. Se pide al abrir
 * la pestaña y cada `REFRESH_MS`; los nombres van en un solo pedido por tanda
 * de tarjetas visibles. El ID de cada partida se copia para verla desde el
 * juego (Espectar → ingresar ID).
 */

const API = "https://api.deadlock-api.com/v1";
const REFRESH_MS = 120_000;
const FIRST = 12;

interface ActivePlayer {
  account_id: number;
  team: number;
  hero_id: number;
  abandoned?: boolean | null;
}
interface ActiveMatch {
  match_id: number;
  start_time: number;
  match_mode_parsed: string;
  game_mode_parsed: string;
  region_mode_parsed: string;
  match_score: number;
  spectators: number;
  net_worth_team_0: number;
  net_worth_team_1: number;
  players: ActivePlayer[];
}

/**
 * Los nombres de las tarjetas a la vista, de a 100 por pedido: con "Ver más"
 * pueden ser 1.800 cuentas, que en un solo pedido no entran en la dirección.
 * Los ya pedidos no se vuelven a pedir.
 */
function useNames(ids: number[]): Map<number, string> {
  const [nombres, setNombres] = useState<Map<number, string>>(new Map());
  const clave = ids.join(",");
  useEffect(() => {
    const faltan = clave ? clave.split(",").map(Number).filter((id) => !nombres.has(id)) : [];
    if (!faltan.length) return;
    let vivo = true;
    const tandas: number[][] = [];
    for (let i = 0; i < faltan.length; i += 100) tandas.push(faltan.slice(i, i + 100));
    Promise.all(
      tandas.map((t) =>
        fetch(`${API}/players/steam?account_ids=${t.join(",")}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    ).then((res: { account_id: number; personaname?: string }[][]) => {
      if (!vivo) return;
      setNombres((prev) => {
        const out = new Map(prev);
        for (const r of res.flat()) if (r.personaname) out.set(r.account_id, r.personaname);
        return out;
      });
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return nombres;
}

type Mode = "all" | "ranked" | "unranked" | "brawl";
const MODES: Mode[] = ["all", "ranked", "unranked", "brawl"];

function modeOf(m: ActiveMatch): Exclude<Mode, "all"> {
  if (m.game_mode_parsed.includes("StreetBrawl")) return "brawl";
  return m.match_mode_parsed === "Ranked" ? "ranked" : "unranked";
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export default function DeadlockLive({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const copy = useCopy();
  const t = copy.deadlock.live;
  const locale = useLocale();
  const { lang } = useLang();
  const [matches, setMatches] = useState<ActiveMatch[] | null | undefined>(undefined);
  const [at, setAt] = useState(0);
  const [mode, setMode] = useState<Mode>("ranked");
  const [region, setRegion] = useState("all");
  const [todas, setTodas] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    let vivo = true;
    const traer = () =>
      fetch(`${API}/matches/active`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d: ActiveMatch[]) => {
          if (!vivo) return;
          clearTimeout(reintento);
          setMatches(d);
          setAt(Date.now());
        })
        .catch(() => {
          if (!vivo) return;
          setMatches((m) => m ?? null);
          // Un corte suelto (un 429 de la API llega sin CORS y el navegador lo ve como error de red): se reintenta solo.
          reintento = setTimeout(traer, 20_000);
        });
    let reintento: ReturnType<typeof setTimeout> | undefined;
    traer();
    const id = setInterval(traer, REFRESH_MS);
    // El reloj de cada partida avanza solo entre una actualización y la otra.
    const reloj = setInterval(() => tick((n) => n + 1), 15_000);
    return () => {
      vivo = false;
      clearInterval(id);
      clearInterval(reloj);
      clearTimeout(reintento);
    };
  }, []);

  const regiones = useMemo(() => [...new Set((matches ?? []).map((m) => m.region_mode_parsed))].sort(), [matches]);
  const filtradas = useMemo(
    () =>
      (matches ?? [])
        .filter((m) => (mode === "all" || modeOf(m) === mode) && (region === "all" || m.region_mode_parsed === region))
        .sort((a, b) => b.match_score - a.match_score),
    [matches, mode, region]
  );
  const visibles = todas ? filtradas : filtradas.slice(0, FIRST);
  const nombres = useNames(visibles.flatMap((m) => m.players.map((p) => p.account_id)));
  const porModo = useMemo(() => {
    const c: Record<Mode, number> = { all: 0, ranked: 0, unranked: 0, brawl: 0 };
    for (const m of matches ?? []) {
      c.all++;
      c[modeOf(m)]++;
    }
    return c;
  }, [matches]);

  const copiar = (id: number) => {
    navigator.clipboard?.writeText(String(id)).then(() => {
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000);
    });
  };

  const ahora = Date.now() / 1000;

  return (
    <div className="dl-live">
      <header className="dl-live-head">
        <h1 className="dl-live-title">
          <span className="dl-live-dot" aria-hidden="true" />
          {t.title}
        </h1>
        <p className="dl-live-lead">{t.lead}</p>
      </header>

      {matches === undefined ? (
        <p className="dl-loading-note">{t.loading}</p>
      ) : matches === null ? (
        <p className="detail-note">{t.error}</p>
      ) : (
        <>
          <div className="dl-live-filters">
            <div className="dl-pm-filters" role="group" aria-label={t.modeLabel}>
              {MODES.map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {t.modes[m]} <span className="dl-live-n">{porModo[m]}</span>
                </button>
              ))}
            </div>
            <label className="dl-live-region">
              {t.region}{" "}
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="all">{t.allRegions}</option>
                {regiones.map((r) => (
                  <option key={r} value={r}>
                    {t.regions[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            <span className="dl-pm-count">{t.updated(Math.max(0, Math.round((Date.now() - at) / 60_000)))}</span>
          </div>

          {filtradas.length === 0 ? (
            <p className="detail-note">{t.none}</p>
          ) : (
            <ol className="dl-live-grid">
              {visibles.map((m) => {
                const almas = [m.net_worth_team_0, m.net_worth_team_1];
                const total = almas[0] + almas[1] || 1;
                const ventaja = almas[0] - almas[1];
                return (
                  <li key={m.match_id} className="box dl-live-card">
                    <div className="dl-live-card-head">
                      <span className="dl-live-mode">{t.modes[modeOf(m)]}</span>
                      <span className="dl-live-meta">{t.regions[m.region_mode_parsed] ?? m.region_mode_parsed}</span>
                      <span className="dl-live-clock">{clock(Math.floor(ahora - m.start_time))}</span>
                      {m.spectators > 0 && <span className="dl-live-meta">{t.watching(m.spectators)}</span>}
                    </div>

                    <div className="dl-live-souls" aria-label={t.soulsAria(almas[0].toLocaleString(locale), almas[1].toLocaleString(locale))}>
                      <span className="dl-live-souls-n">{(almas[0] / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}k</span>
                      <span className="dl-live-bar">
                        <span style={{ width: `${(almas[0] / total) * 100}%` }} />
                      </span>
                      <span className="dl-live-souls-n">{(almas[1] / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}k</span>
                    </div>
                    <p className="dl-live-lead-text">
                      {Math.abs(ventaja) < 1000 ? t.even : t.ahead(ventaja > 0 ? t.teams[0] : t.teams[1], (Math.abs(ventaja) / 1000).toLocaleString(locale, { maximumFractionDigits: 1 }))}
                    </p>

                    <div className="dl-live-teams">
                      {[0, 1].map((team) => (
                        <ul key={team} className="dl-live-team" data-team={team}>
                          <li className="dl-live-team-name">{t.teams[team]}</li>
                          {m.players
                            .filter((p) => p.team === team)
                            .map((p) => {
                              const img = heroImg(p.hero_id);
                              const nombre = heroName(p.hero_id)?.[lang] ?? heroName(p.hero_id)?.en ?? "";
                              return (
                                <li key={p.account_id}>
                                  {img && <GameImg src={img} alt={nombre} title={nombre} width={26} height={26} loading="lazy" decoding="async" />}
                                  <RouteLink
                                    className="dl-live-player"
                                    to={{ ...route, view: "deadlock", dlSection: "player", detail: String(p.account_id) }}
                                    onNavigate={navigate}
                                  >
                                    {nombres.get(p.account_id) ?? "…"}
                                  </RouteLink>
                                </li>
                              );
                            })}
                        </ul>
                      ))}
                    </div>

                    <button type="button" className="dl-live-copy" onClick={() => copiar(m.match_id)} title={t.copyTip}>
                      {copiado === m.match_id ? t.copied : t.copy(m.match_id)}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {!todas && filtradas.length > FIRST && (
            <button type="button" className="dl-pm-more" onClick={() => setTodas(true)}>
              {t.more(filtradas.length - FIRST)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
