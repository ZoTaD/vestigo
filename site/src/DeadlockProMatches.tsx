import { useEffect, useMemo, useState } from "react";
import GameImg from "./GameImg";
import RouteLink from "./RouteLink";
import RankBadge from "./DeadlockRankBadge";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { useItems } from "./deadlockItemsData";
import { useSteamNames } from "./deadlockTopPlayers";
import type { BandId } from "./deadlockData";
import type { KitAbility } from "./deadlockHeroKitData";
import type { Route } from "./route";
import "./styles/deadlock-pros.css";

/**
 * "Partidas de pros" (2026-11-10), en la ficha del héroe: las últimas partidas
 * de los 50 mejores de ese héroe en la escalera, con lo que terminaron
 * comprando, el orden en que maximizaron las habilidades y el resultado. Al
 * costado, el resumen: cuánto ganan, quiénes lo juegan más y qué compran casi
 * todos. Sale de `games/deadlock/pipeline/src/proMatches.ts`, un archivo por
 * héroe que baja sólo cuando la sección se dibuja.
 */

/** Ver `ProMatch` en el pipeline. */
type ProMatch = [number, number, number, number, 0 | 1, number, number, number, number, number, number, number[], number[]];
interface ProMatchesFile {
  generatedAt: string;
  heroId: number;
  days: number;
  from: number;
  matches: ProMatch[];
}

const FILES = import.meta.glob<{ default: ProMatchesFile }>("../../games/deadlock/data/pro-matches/*.json");

function useProMatches(heroId: number): ProMatchesFile | null | undefined {
  const [file, setFile] = useState<ProMatchesFile | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    setFile(undefined);
    const load = FILES[`../../games/deadlock/data/pro-matches/${heroId}.json`];
    if (!load) {
      setFile(null);
      return;
    }
    load()
      .then((m) => vivo && setFile(m.default))
      .catch(() => vivo && setFile(null));
    return () => {
      vivo = false;
    };
  }, [heroId]);
  return file;
}

/** Cuántas filas se ven antes de "Ver más". */
const FIRST = 8;
/** Cuántos objetos del resumen. */
const CORE = 8;

/**
 * El orden en que llegó al máximo cada habilidad (desbloquear + 3 mejoras = 4
 * puntos). Las que no llegó a maximizar van al final, por cuántos puntos tienen.
 */
export function maxOrder(path: number[], abilities: number[]): number[] {
  const puntos = new Map<number, number>();
  const llego: number[] = [];
  for (const id of path) {
    const n = (puntos.get(id) ?? 0) + 1;
    puntos.set(id, n);
    if (n === 4) llego.push(id);
  }
  const resto = abilities.filter((a) => !llego.includes(a) && puntos.has(a)).sort((a, b) => (puntos.get(b) ?? 0) - (puntos.get(a) ?? 0));
  return [...llego, ...resto];
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function ago(unix: number, locale: string): string {
  const f = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const min = Math.round((unix * 1000 - Date.now()) / 60_000);
  if (min > -60) return f.format(min, "minute");
  if (min > -60 * 24) return f.format(Math.round(min / 60), "hour");
  return f.format(Math.round(min / 1440), "day");
}

export default function DeadlockProMatches({
  heroId,
  heroName,
  band,
  abilities,
  route,
  navigate,
}: {
  heroId: number;
  heroName: string;
  band: BandId;
  abilities: KitAbility[];
  route: Route;
  navigate: (r: Route) => void;
}) {
  const copy = useCopy();
  const t = copy.deadlock.hero.proMatches;
  const locale = useLocale();
  const file = useProMatches(heroId);
  const items = useItems(band);
  const [soloGanadas, setSoloGanadas] = useState(false);
  const [jugador, setJugador] = useState<number | null>(null);
  const [todas, setTodas] = useState(false);

  const matches = file?.matches ?? [];
  const nombres = useSteamNames([...new Set(matches.map((m) => m[1]))]);
  const porItem = useMemo(() => new Map((items?.items ?? []).map((i) => [i.itemId, i])), [items]);
  const porHabilidad = useMemo(() => new Map(abilities.map((a) => [a.id, a])), [abilities]);
  const ids = abilities.map((a) => a.id);

  const resumen = useMemo(() => {
    const n = matches.length;
    const ganadas = matches.filter((m) => m[4]).length;
    const pros = new Map<number, { n: number; w: number }>();
    const objetos = new Map<number, number>();
    const ordenes = new Map<string, number>();
    for (const m of matches) {
      const p = pros.get(m[1]) ?? { n: 0, w: 0 };
      p.n++;
      p.w += m[4];
      pros.set(m[1], p);
      for (const id of m[11]) objetos.set(id, (objetos.get(id) ?? 0) + 1);
      if (m[12].length >= 8) {
        const clave = maxOrder(m[12], ids).slice(0, 2).join(",");
        ordenes.set(clave, (ordenes.get(clave) ?? 0) + 1);
      }
    }
    return {
      n,
      ganadas,
      pros: [...pros.entries()].sort((a, b) => b[1].n - a[1].n || b[1].w - a[1].w).slice(0, 5),
      core: [...objetos.entries()].sort((a, b) => b[1] - a[1]).slice(0, CORE),
      orden: [...ordenes.entries()].sort((a, b) => b[1] - a[1])[0],
      conOrden: [...ordenes.values()].reduce((a, b) => a + b, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, abilities]);

  if (!file || matches.length === 0) return null;

  const filtradas = matches.filter((m) => (!soloGanadas || m[4]) && (jugador === null || m[1] === jugador));
  const visibles = todas ? filtradas : filtradas.slice(0, FIRST);
  const nombre = (id: number) => nombres.get(id) ?? `#${id}`;

  return (
    <section className="box dl-pm">
      <div className="box-head">
        <h3 className="box-title">{t.title(heroName)}</h3>
        <p className="box-lead">{t.lead(file.from, file.days)}</p>
      </div>

      <div className="dl-pm-layout">
        <div className="dl-pm-main">
          <div className="dl-pm-filters" role="group" aria-label={t.filters}>
            <button type="button" aria-pressed={!soloGanadas} onClick={() => setSoloGanadas(false)}>
              {t.all}
            </button>
            <button type="button" aria-pressed={soloGanadas} onClick={() => setSoloGanadas(true)}>
              {t.winsOnly}
            </button>
            {jugador !== null && (
              <button type="button" className="dl-pm-clear" onClick={() => setJugador(null)}>
                {t.onlyPlayer(nombre(jugador))} ✕
              </button>
            )}
            <span className="dl-pm-count">{t.showing(visibles.length, filtradas.length)}</span>
          </div>

          <ol className="dl-pm-list">
            {visibles.map((m) => {
              const [matchId, cuenta, inicio, dur, gano, k, d, a, almas, rango, , finales, path] = m;
              const orden = path.length ? maxOrder(path, ids) : [];
              return (
                <li key={`${matchId}:${cuenta}`} className="dl-pm-row" data-won={gano ? "yes" : "no"}>
                  <div className="dl-pm-who">
                    <RouteLink
                      className="dl-pm-name"
                      to={{ ...route, view: "deadlock", dlSection: "player", detail: String(cuenta) }}
                      onNavigate={navigate}
                    >
                      {nombre(cuenta)}
                    </RouteLink>
                    <span className="dl-pm-meta">
                      {rango > 0 && <RankBadge badge={rango} height={26} />}
                      <span>{ago(inicio, locale)}</span>
                    </span>
                  </div>
                  <div className="dl-pm-score">
                    <span className="dl-pm-result">{gano ? t.win : t.loss}</span>
                    <span className="dl-pm-kda">
                      {k}/{d}/{a}
                    </span>
                    <span className="dl-pm-sub">
                      {t.souls(Math.round(almas / 1000).toLocaleString(locale))} · {clock(dur)}
                    </span>
                  </div>
                  <div className="dl-pm-items" aria-label={t.finalItems}>
                    {finales.slice(0, 12).map((id) => {
                      const it = porItem.get(id);
                      return it ? (
                        <span key={id} className="dl-pm-item" data-slot={it.slot}>
                          <GameImg src={it.img} alt={it.name} title={it.name} width={28} height={28} loading="lazy" decoding="async" />
                        </span>
                      ) : null;
                    })}
                  </div>
                  <div className="dl-pm-path" aria-label={t.maxOrder}>
                    {orden.map((id, i) => {
                      const ab = porHabilidad.get(id);
                      return ab ? (
                        <span key={id} className="dl-pm-abi">
                          <GameImg src={ab.img} alt={ab.name} title={ab.name} width={24} height={24} loading="lazy" decoding="async" />
                          <span className="dl-pm-abi-n">{i + 1}</span>
                        </span>
                      ) : null;
                    })}
                  </div>
                  <RouteLink
                    className="dl-pm-open"
                    to={{ ...route, view: "deadlock", dlSection: "match", detail: String(matchId) }}
                    onNavigate={navigate}
                  >
                    {t.open}
                  </RouteLink>
                </li>
              );
            })}
          </ol>
          {!todas && filtradas.length > FIRST && (
            <button type="button" className="dl-pm-more" onClick={() => setTodas(true)}>
              {t.more(filtradas.length - FIRST)}
            </button>
          )}
        </div>

        <aside className="dl-pm-side" aria-label={t.summary}>
          <div className="dl-pm-big">
            <span className="dl-pm-big-n">{Math.round((resumen.ganadas / resumen.n) * 100)} %</span>
            <span className="dl-pm-big-l">{t.wr(resumen.n)}</span>
          </div>

          <h4 className="dl-pm-h">{t.topPros}</h4>
          <ul className="dl-pm-pros">
            {resumen.pros.map(([id, p]) => (
              <li key={id}>
                <button type="button" onClick={() => setJugador(jugador === id ? null : id)} aria-pressed={jugador === id} title={t.filterBy}>
                  <span className="dl-pm-pro-name">{nombre(id)}</span>
                  <span className="dl-pm-pro-n">{t.proStats(p.n, Math.round((p.w / p.n) * 100))}</span>
                </button>
              </li>
            ))}
          </ul>

          <h4 className="dl-pm-h">{t.core}</h4>
          <ul className="dl-pm-core">
            {resumen.core.map(([id, n]) => {
              const it = porItem.get(id);
              return it ? (
                <li key={id} title={it.name}>
                  <span className="dl-pm-item is-big" data-slot={it.slot}>
                    <GameImg src={it.img} alt={it.name} width={32} height={32} loading="lazy" decoding="async" />
                  </span>
                  <span>{Math.round((n / resumen.n) * 100)} %</span>
                </li>
              ) : null;
            })}
          </ul>

          {resumen.orden && (
            <>
              <h4 className="dl-pm-h">{t.maxFirst}</h4>
              <p className="dl-pm-order">
                {resumen.orden[0].split(",").map((id, i) => {
                  const ab = porHabilidad.get(Number(id));
                  return ab ? (
                    <span key={id} className="dl-pm-abi is-big">
                      <GameImg src={ab.img} alt={ab.name} title={ab.name} width={30} height={30} loading="lazy" decoding="async" />
                      <span className="dl-pm-abi-n">{i + 1}</span>
                    </span>
                  ) : null;
                })}
                <span className="dl-pm-order-n">{t.orderShare(Math.round((resumen.orden[1] / resumen.conOrden) * 100))}</span>
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
