import { useEffect, useMemo, useState } from "react";
import type { Lang } from "./i18n";
import { text } from "./localized";
import { ItemIcon } from "./DeadlockItemTip";
import { useItems } from "./deadlockItemsData";
import { bandRangeOf, percentileOf, type MetricsFile } from "./deadlockVsBand";
import { seasonAt } from "./deadlockSeasons";
import { useCopy } from "./deadlockCopy";
import { heroName } from "./deadlockReportData";
import { keyTimings, matchMetrics, VS_RANK_METRICS } from "./deadlockVsRankData";
import { fetchRank, type MatchPlayer, type ParsedMatch } from "./deadlockMatch";
import "./styles/deadlock-vsrank.css";

/**
 * "¿Cómo jugaste contra tu rango?" (2026-11-25), en el informe de la partida:
 * esta partida contra los jugadores del mismo héroe en salas de la misma
 * banda, esta temporada, y los objetos clave contra el minuto en que suelen
 * comprarse en esa banda. Un pedido por héroe y banda, guardado 12 horas.
 */

const API = "https://api.deadlock-api.com/v1";
const TTL = 12 * 3600 * 1000;
const memo = new Map<string, Promise<MetricsFile>>();

function heroBandMetrics(heroId: number, min: number, max: number, from: number, to: number | null): Promise<MetricsFile> {
  const key = `vestigo:dl:vsrank:${heroId}:${min}-${max}:${from}`;
  const ya = memo.get(key);
  if (ya) return ya;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { at: number; data: MetricsFile } | null;
    if (saved && Date.now() - saved.at < TTL) return Promise.resolve(saved.data);
  } catch {
    /* sin almacenamiento: se pide */
  }
  const q = new URLSearchParams({ match_mode: "Ranked", hero_ids: String(heroId), min_average_badge: String(min), max_average_badge: String(max), min_unix_timestamp: String(from) });
  if (to) q.set("max_unix_timestamp", String(to));
  const p = fetch(`${API}/analytics/player-stats/metrics?${q}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<MetricsFile>;
    })
    .then((data) => {
      try {
        localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
      } catch {
        /* lleno: queda en memoria */
      }
      return data;
    });
  p.catch(() => memo.delete(key));
  memo.set(key, p);
  return p;
}

const COPY = {
  en: {
    title: "Against your rank",
    lead: (hero: string, band: string) => `This match against ${hero} players in ${band} lobbies this season.`,
    better: (p: number) => `better than ${p}%`,
    usual: "usual",
    metrics: {
      net_worth_per_min: "Souls per minute",
      player_damage_per_min: "Hero damage per minute",
      boss_damage_per_min: "Objective damage per minute",
      kda: "KDA",
      deaths: "Deaths",
    } as Record<string, string>,
    items: "Key items, against the usual minute in your rank",
    early: (m: string) => `${m} min early`,
    late: (m: string) => `${m} min late`,
    onTime: "on time",
    at: (m: string) => `at ${m}`,
    loading: "Comparing with your rank…",
    error: "Couldn't load your rank's numbers right now.",
    noRank: "We don't know this player's rank, so there's nothing to compare the match with.",
  },
  es: {
    title: "Contra tu rango",
    lead: (hero: string, band: string) => `Esta partida contra los jugadores de ${hero} en salas ${band} esta temporada.`,
    better: (p: number) => `mejor que el ${p} %`,
    usual: "lo normal",
    metrics: {
      net_worth_per_min: "Almas por minuto",
      player_damage_per_min: "Daño a héroes por minuto",
      boss_damage_per_min: "Daño a objetivos por minuto",
      kda: "KDA",
      deaths: "Muertes",
    } as Record<string, string>,
    items: "Objetos clave, contra el minuto normal en tu rango",
    early: (m: string) => `${m} min antes`,
    late: (m: string) => `${m} min tarde`,
    onTime: "a tiempo",
    at: (m: string) => `a los ${m}`,
    loading: "Comparando con tu rango…",
    error: "Ahora no se pudieron traer los números de tu rango.",
    noRank: "No sabemos el rango de este jugador: no hay contra qué comparar la partida.",
  },
} as const;

const mmss = (min: number) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, "0")}`;

export default function DeadlockVsRankCard({ player, match, lang }: { player: MatchPlayer; match: ParsedMatch; lang: Lang }) {
  const c = COPY[lang];
  const bands = useCopy().deadlock.bands;
  /**
   * La banda: la de la sala si la partida la trae, y si no (desde la Season 2
   * la API manda 0 en muchas) la del rango actual del jugador.
   */
  const [suyo, setSuyo] = useState<number | null>(null);
  useEffect(() => {
    setSuyo(null);
    if (match.badge > 0 || player.accountId <= 0) return;
    let vivo = true;
    fetchRank(player.accountId).then(
      (r) => vivo && setSuyo(r.badge),
      () => vivo && setSuyo(0),
    );
    return () => {
      vivo = false;
    };
  }, [match.badge, player.accountId]);
  const banda = bandRangeOf(match.badge > 0 ? match.badge : (suyo ?? 0));
  const esperandoRango = match.badge <= 0 && player.accountId > 0 && suyo === null;
  const temporada = seasonAt(match.startTime);
  const [dist, setDist] = useState<MetricsFile | null | "error">(null);
  useEffect(() => {
    if (!banda || !temporada) return;
    let vivo = true;
    setDist(null);
    heroBandMetrics(player.heroId, banda.min, banda.max, temporada.start, temporada.end ?? null).then(
      (d) => vivo && setDist(d),
      () => vivo && setDist("error"),
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.heroId, banda?.min, banda?.max, temporada?.start]);

  const itemsMeta = useItems(banda?.band ?? "phantom-above");
  const timings = useMemo(() => {
    if (!itemsMeta) return [];
    const por = new Map(itemsMeta.items.map((i) => [i.itemId, i]));
    return keyTimings(player.purchases, (id) => por.get(id)?.cost, (id) => por.get(id)?.buyMinute);
  }, [itemsMeta, player.purchases]);

  if (esperandoRango) return <p className="box-empty">{c.loading}</p>;
  if (!banda || !temporada) return <p className="box-empty">{c.noRank}</p>;
  const heroe = text(heroName(player.heroId) ?? undefined, lang, "");
  const mios = matchMetrics(player, match.durationS);
  const num = (x: number, d: number) => x.toLocaleString(lang === "es" ? "es-AR" : "en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

  return (
    <div className="dl-vsr">
      <h3 className="dl-rep-sub">{c.title}</h3>
      <p className="dl-vsr-lead">{c.lead(heroe, bands[banda.band])}</p>
      {dist === null && <p className="box-empty">{c.loading}</p>}
      {dist === "error" && <p className="box-empty">{c.error}</p>}
      {dist && dist !== "error" && (
        <ul className="dl-vsr-rows">
          {VS_RANK_METRICS.filter((m) => dist[m.key]).map((m) => {
            const d = dist[m.key];
            const p = percentileOf(mios[m.key], d, m.lowerIsBetter);
            return (
              <li key={m.key} className="dl-vsr-row" data-tone={p >= 60 ? "up" : p <= 40 ? "down" : undefined}>
                <span className="dl-vsr-name">{c.metrics[m.key]}</span>
                <span className="dl-vsr-bar" aria-hidden="true">
                  <i style={{ left: `${p}%` }} />
                </span>
                <span className="dl-vsr-nums">
                  <b>{num(mios[m.key], m.digits)}</b>
                  <small>
                    {c.usual} {num(d.percentile50, m.digits)} · {c.better(p)}
                  </small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {timings.length > 0 && (
        <>
          <p className="dl-vsr-sub">{c.items}</p>
          <ul className="dl-vsr-items">
            {timings.map((t) => {
              const dif = t.mine - t.usual;
              const tono = dif <= -1 ? "up" : dif >= 2 ? "down" : undefined;
              return (
                <li key={t.itemId} data-tone={tono}>
                  <ItemIcon itemId={t.itemId} size={36} />
                  <span>
                    <b>{c.at(mmss(t.mine))}</b>
                    <small>
                      {Math.abs(dif) < 1 ? c.onTime : dif < 0 ? c.early(num(-dif, 0)) : c.late(num(dif, 0))} · {c.usual} {mmss(t.usual)}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
