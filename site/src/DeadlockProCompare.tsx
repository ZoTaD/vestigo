import { useState } from "react";
import type { Lang } from "./i18n";
import { text } from "./localized";
import { fetchMatch, type ParsedMatch } from "./deadlockMatch";
import { impactOf, type MatchImpactResult } from "./deadlockMatchImpact";
import { heroName } from "./deadlockReportData";
import { MATCH_TABS_COPY } from "./deadlockMatchTabsCopy";

/**
 * Compararte con un jugador top del mismo héroe (2026-11-20).
 *
 * Sale de las partidas de los mejores de cada héroe que ya publica el pipeline
 * (`pro-matches/<héroe>.json`): se elige una ganada de duración parecida a la
 * tuya, se baja (~1 MB) y se le calcula el mismo impacto y el mismo coaching.
 * Sólo cuando lo pedís.
 */

const FILES = import.meta.glob<{ default: { matches: [number, number, number, number, 0 | 1, ...unknown[]][] } }>(
  "../../games/deadlock/data/pro-matches/*.json",
);

export interface CompareStats {
  impact: number;
  kda: [number, number, number];
  /** Muertes sin ayuda / muertes. */
  alone: number | null;
  /** Peleas en que estuvo / peleas que tuvo vivo. */
  fights: number | null;
  late: number;
  /** Estructuras propias perdidas estando lejos / con él vivo. */
  away: number | null;
  /** Partes del tiempo. */
  fighting: number;
  farming: number;
  dead: number;
  /** Puntos del farmeo contra los rivales. */
  farm: number;
}

/** Los números para comparar de un jugador en una partida. */
export function compareStatsOf(match: ParsedMatch, imp: MatchImpactResult, slot: number): CompareStats | null {
  const p = match.players.find((x) => x.slot === slot);
  const c = imp.coaching.get(slot);
  if (!p || !c) return null;
  const total = c.time.fighting + c.time.farming + c.time.moving + c.time.dead || 1;
  return {
    impact: imp.totals.get(slot) ?? 0,
    kda: [p.kills, p.deaths, p.assists],
    alone: c.deaths ? c.deathsAlone / c.deaths : null,
    fights: c.fightsAlive ? c.fightsPresent / c.fightsAlive : null,
    late: c.fightsLate,
    away: c.structuresAlive ? c.structuresAway.length / c.structuresAlive : null,
    fighting: c.time.fighting / total,
    farming: c.time.farming / total,
    dead: c.time.dead / total,
    farm: imp.ledger.filter((e) => e.slot === slot && e.kind === "farm").reduce((s, e) => s + e.value, 0),
  };
}

type Row = { label: string; mine: string; pro: string; better: "mine" | "pro" | null };

export default function DeadlockProCompare({
  heroId,
  duration,
  matchId,
  mine,
  lang,
}: {
  heroId: number;
  duration: number;
  matchId: number;
  mine: CompareStats;
  lang: Lang;
}) {
  const c = MATCH_TABS_COPY[lang].compare;
  const [state, setState] = useState<"idle" | "loading" | "none" | { pro: CompareStats; matchId: number; slot: number }>("idle");
  const hn = heroName(heroId);
  const hero = hn ? text(hn, lang, "") : "";

  const buscar = async () => {
    setState("loading");
    const load = FILES[`../../games/deadlock/data/pro-matches/${heroId}.json`];
    if (!load) return setState("none");
    const file = (await load()).default;
    // Ganadas, de duración parecida; nunca esta misma partida.
    const candidatas = file.matches
      .filter((m) => m[4] === 1 && m[0] !== matchId)
      .sort((a, b) => Math.abs(a[3] - duration) - Math.abs(b[3] - duration))
      .slice(0, 3);
    for (const m of candidatas) {
      try {
        const match = await fetchMatch(m[0]);
        const imp = impactOf(match);
        const p = match.players.find((x) => x.accountId === m[1] && x.heroId === heroId);
        const pro = imp && p ? compareStatsOf(match, imp, p.slot) : null;
        if (pro && p) return setState({ pro, matchId: m[0], slot: p.slot });
      } catch {
        // Probar con la siguiente.
      }
    }
    setState("none");
  };

  if (state === "idle" || state === "loading")
    return (
      <p className="dl-cmp-go">
        <button type="button" onClick={buscar} disabled={state === "loading"}>
          {state === "loading" ? c.loading : c.button(hero)}
        </button>
      </p>
    );
  if (state === "none") return <p className="dl-cmp-none">{c.none(hero)}</p>;

  const { pro } = state;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)} %`);
  const pts = (v: number) =>
    `${v >= 0 ? "+" : "−"}${(Math.round(Math.abs(v) * 10) / 10).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  const cmp = (a: number | null, b: number | null, highIsGood: boolean): Row["better"] => {
    if (a === null || b === null || Math.abs(a - b) < 0.03 * Math.max(1, Math.abs(b))) return null;
    return (a > b) === highIsGood ? "mine" : "pro";
  };
  const rows: Row[] = [
    { label: c.rows.impact, mine: pts(mine.impact), pro: pts(pro.impact), better: cmp(mine.impact, pro.impact, true) },
    { label: c.rows.kda, mine: mine.kda.join("/"), pro: pro.kda.join("/"), better: null },
    { label: c.rows.alone, mine: pct(mine.alone), pro: pct(pro.alone), better: cmp(mine.alone, pro.alone, false) },
    { label: c.rows.fights, mine: pct(mine.fights), pro: pct(pro.fights), better: cmp(mine.fights, pro.fights, true) },
    { label: c.rows.away, mine: pct(mine.away), pro: pct(pro.away), better: cmp(mine.away, pro.away, false) },
    { label: c.rows.fighting, mine: pct(mine.fighting), pro: pct(pro.fighting), better: null },
    { label: c.rows.farming, mine: pct(mine.farming), pro: pct(pro.farming), better: null },
    { label: c.rows.dead, mine: pct(mine.dead), pro: pct(pro.dead), better: cmp(mine.dead, pro.dead, false) },
    { label: c.rows.farm, mine: pts(mine.farm), pro: pts(pro.farm), better: cmp(mine.farm, pro.farm, true) },
  ];
  const href = window.location.pathname.replace(/\/match\/\d+(\/[^/?]*)?$/, `/match/${state.matchId}/replay`) + `?p=${state.slot}`;

  return (
    <div className="dl-cmp">
      <h4 className="dl-coach-title">{c.title(hero)}</h4>
      <table>
        <thead>
          <tr>
            <th />
            <th scope="col">{c.this}</th>
            <th scope="col">{c.top}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className={r.better === "mine" ? "is-good" : r.better === "pro" ? "is-bad" : undefined}>{r.mine}</td>
              <td>{r.pro}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <a className="dl-rep-impact-open" href={href}>
        {c.open}
      </a>
    </div>
  );
}
