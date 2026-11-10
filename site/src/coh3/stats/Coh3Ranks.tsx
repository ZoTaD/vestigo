/**
 * Rangos de CoH3 (2026-11-05): las ligas de Latón a Rival con el ELO que piden y cuántos jugadores hay en cada una,
 * por modo y facción; el ELO en tramos, las facciones y los países. Sale de la foto diaria del ranking
 * (`games/coh3/stats/ladder.json`, la arma `games/coh3/tools/ladder.py`).
 */
import { useEffect, useState } from "react";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import type { CohGame } from "../../route";
import { Coh3Loading, FactionTag, LeagueTag, Panel, sortRows, useCohGame, useNum, useSort, CohTitle, type Nav } from "../ui";
import { LEAGUES, type League } from "../leagues";
import { GAMES } from "../games";

/** La clave de una facción de cualquiera de los tres juegos. */
type Faction = string;
import { MODES, type Mode } from "./data";
import "./stats.css";

interface FacLadder { n: number; active7: number; active28: number; games: number; lv: number[]; elo: number[]; countries: [string, number][] }
interface ModeLadder { factions: Record<Faction, FacLadder>; unique: number; countries: [string, number][] }
export interface Ladder { day: string; eloStart: number; eloStep: number; modes: Record<Mode, ModeLadder> }

type Mod<T> = { default: T };
const cache: Partial<Record<CohGame, Ladder>> = {};
const FILES: Record<CohGame, () => Promise<Mod<unknown>>> = {
  coh3: () => import("@coh3stats/ladder.json") as Promise<Mod<unknown>>,
  coh2: () => import("@coh2stats/ladder.json") as Promise<Mod<unknown>>,
  coh1: () => import("@coh1stats/ladder.json") as Promise<Mod<unknown>>,
};
/** La foto del ranking de un juego (CoH1 y CoH2 la arma `games/coh/tools/relic_daily.py`, con el mismo formato). */
export const loadLadder = (game: CohGame = "coh3"): Promise<Ladder> => {
  const hit = cache[game];
  return hit ? Promise.resolve(hit) : FILES[game]().then((m) => (cache[game] = m.default as Ladder));
};
export const peekLadder = (game: CohGame = "coh3"): Ladder | null => cache[game] ?? null;

const EN = {
  k: "Ranks",
  h1: (g: string) => `${g} ranks: leagues and players`,
  lede: "Every ranked league, the Elo it takes and how many players are in each one. Only players who finished their placement matches and played in the last weeks are on the ladder.",
  snapshot: (day: string) => `Ladder snapshot of ${day}. Ladder data: coh3stats.com open data.`,
  all: "All factions",
  leagues: "Leagues",
  leaguesLede: "Brass III to Gold I go by Elo; Challenger goes by position among Gold I players.",
  league: "League",
  elo: "Elo",
  top: (n: number) => (n === 1 ? "1st place" : `Top ${n}`),
  players: "Players",
  share: "% of ladder",
  above: "Better than",
  eloDist: "Elo distribution",
  eloLede: "How many players are in each 50-point Elo band.",
  factions: "Factions",
  factionsLede: "Ranked players of each faction in this mode. One player can be ranked with several factions.",
  ranked: "Ranked",
  active7: "This week",
  games: "Games",
  countries: "Countries",
  countriesLede: (n: string) => `Where the ${n} ranked players of this mode are from (each player counted once).`,
  country: "Country",
  unknown: "Unknown",
  totals: (u: string) => `${u} different players`,
  none: "No players in this league.",
  // CoH1 y CoH2: niveles sin nombre ni ELO fijo, y datos propios (sin crédito a coh3stats).
  levelH1: (g: string) => `${g} ranks: levels and players`,
  levelLede: "Every ranking level and how many players are in each one. Only players who played in the last weeks are on the ladder.",
  levelSnapshot: (day: string) => `Ladder of ${day}.`,
  levels: "Levels",
  levelsLede: "Level 20 is the top of each faction's ladder.",
  level: "Level",
  eloKnown: "Only players with a recent game, whose Elo we know.",
};
const ES: typeof EN = {
  k: "Rangos",
  h1: (g: string) => `Rangos de ${g}: ligas y jugadores`,
  lede: "Cada liga del ranking, el ELO que pide y cuántos jugadores hay en cada una. En el ranking están los que terminaron las partidas de ubicación y jugaron en las últimas semanas.",
  snapshot: (day: string) => `Foto del ranking del ${day}. Datos del ranking: datos abiertos de coh3stats.com.`,
  all: "Todas las facciones",
  leagues: "Ligas",
  leaguesLede: "De Latón III a Oro I van por ELO; Rival va por puesto entre los que están en Oro I.",
  league: "Liga",
  elo: "ELO",
  top: (n: number) => (n === 1 ? "1.º puesto" : `Primeros ${n}`),
  players: "Jugadores",
  share: "% del ranking",
  above: "Por encima del",
  eloDist: "Distribución de ELO",
  eloLede: "Cuántos jugadores hay en cada tramo de 50 puntos de ELO.",
  factions: "Facciones",
  factionsLede: "Jugadores con rango de cada facción en este modo. Un jugador puede tener rango con varias facciones.",
  ranked: "Con rango",
  active7: "Esta semana",
  games: "Partidas",
  countries: "Países",
  countriesLede: (n: string) => `De dónde son los ${n} jugadores con rango de este modo (cada jugador cuenta una vez).`,
  country: "País",
  unknown: "Sin dato",
  totals: (u: string) => `${u} jugadores distintos`,
  none: "Nadie en esta liga.",
  levelH1: (g: string) => `Rangos de ${g}: niveles y jugadores`,
  levelLede: "Cada nivel del ranking y cuántos jugadores hay en cada uno. En el ranking están los que jugaron en las últimas semanas.",
  levelSnapshot: (day: string) => `Ranking del ${day}.`,
  levels: "Niveles",
  levelsLede: "El nivel 20 es lo más alto del ranking de cada facción.",
  level: "Nivel",
  eloKnown: "Sólo los jugadores con una partida reciente, de los que se conoce el ELO.",
};
const COPY: Record<Lang, typeof EN> = { en: EN, es: ES };

type Scope = Faction | "all";
const sumArr = (xs: number[][]): number[] => xs[0].map((_, i) => xs.reduce((a, x) => a + (x[i] ?? 0), 0));

function useQuery(FACTIONS: readonly Faction[]) {
  const [mode, setMode] = useState<Mode>("1v1");
  const [scope, setScope] = useState<Scope>("all");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const m = p.get("m") as Mode | null, f = p.get("f") as Scope | null;
    if (m && MODES.includes(m)) setMode(m);
    if (f && (f === "all" || FACTIONS.includes(f as Faction))) setScope(f);
  }, []);
  const write = (m: Mode, f: Scope) => {
    const p = new URLSearchParams(window.location.search);
    p.set("m", m);
    if (f === "all") p.delete("f");
    else p.set("f", f);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${p.toString()}`);
  };
  return { mode, scope, setMode: (m: Mode) => (setMode(m), write(m, scope)), setScope: (f: Scope) => (setScope(f), write(mode, f)) };
}

export default function Coh3Ranks(_: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const t = COPY[lang];
  const num = useNum();
  const game = useCohGame();
  const FACTIONS = GAMES[game].factions;
  const niveles = GAMES[game].league === "level";
  const [d, setD] = useState<Ladder | null>(() => peekLadder(game));
  const q = useQuery(FACTIONS);
  useEffect(() => {
    if (d) return;
    let vivo = true;
    loadLadder(game).then((x) => vivo && setD(x), () => undefined);
    return () => {
      vivo = false;
    };
  }, [d, game]);
  if (!d) return <Coh3Loading />;
  const md = d.modes[q.mode];
  const facs = (q.scope === "all" ? FACTIONS.map((f) => md.factions[f]) : [md.factions[q.scope]]).filter(Boolean);
  const lv = sumArr(facs.map((f) => f.lv));
  const elo = sumArr(facs.map((f) => f.elo));
  const day = new Date(`${d.day}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "long", year: "numeric" });
  return (
    <main className="c3-main c3-ranks">
      <header className="c3-head">
        <div className="c3-k">{t.k}</div>
        <h1 className="c3-h1"><CohTitle text={niveles ? t.levelH1 : t.h1} /></h1>
        <p className="c3-lede">{niveles ? t.levelLede : t.lede}</p>
        <p className="c3-note">{niveles ? t.levelSnapshot(day) : t.snapshot(day)}</p>
        <div className="c3-filters c3-mb">
          <div className="c3-seg" role="group" aria-label="Mode">
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={m === q.mode} onClick={() => q.setMode(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="c3-seg" role="group">
            <button type="button" aria-pressed={q.scope === "all"} onClick={() => q.setScope("all")}>
              {t.all}
            </button>
            {FACTIONS.map((f) => (
              <button key={f} type="button" aria-pressed={q.scope === f} onClick={() => q.setScope(f)}>
                <FactionTag f={f} size={18} />
              </button>
            ))}
          </div>
        </div>
      </header>
      {niveles ? <Levels lv={lv} t={t} num={num} factions={q.scope === "all" ? FACTIONS : [q.scope]} /> : <Leagues lv={lv} t={t} lang={lang} num={num} />}
      <Factions md={md} t={t} num={num} factions={FACTIONS} />
      <EloDist elo={elo} start={d.eloStart} step={d.eloStep} t={t} num={num} note={niveles ? t.eloKnown : undefined} />
      <Countries md={md} t={t} lang={lang} num={num} />
    </main>
  );
}

type Num = (v: number | null | undefined, d?: number) => string;
type T = typeof EN;
type LKey = "league" | "elo" | "players" | "share" | "above";

function Leagues({ lv, t, lang, num }: { lv: number[]; t: T; lang: Lang; num: Num }) {
  const { sort, th } = useSort<LKey>({ key: "league", dir: -1 }, []);
  const ranked = lv.slice(1).reduce((a, b) => a + b, 0) || 1;
  // Por encima de: los que están en ligas más bajas, sobre el total con rango.
  const below = (level: number) => lv.slice(1, level).reduce((a, b) => a + b, 0);
  const rows = LEAGUES.filter((l) => l.level > 0);
  const cols: Record<LKey, (l: League) => number> = { league: (l) => l.level, elo: (l) => l.level, players: (l) => lv[l.level] ?? 0, share: (l) => (lv[l.level] ?? 0) / ranked, above: (l) => l.level };
  const eloOf = (l: League) => (l.top ? t.top(l.top) : l.max == null ? `${num(l.min ?? 0)}+` : `${num(l.min ?? 0)}–${num(l.max)}`);
  return (
    <Panel k={t.leagues} lede={t.leaguesLede} className="c3-tablepanel">
      <table className="c3-table is-stack c3-leagues">
        <thead>
          <tr>
            {th("league", t.league)}
            {th("elo", t.elo, { className: "is-l" })}
            {th("players", t.players)}
            {th("share", t.share)}
            {th("above", t.above)}
          </tr>
        </thead>
        <tbody>
          {sortRows(rows, cols, sort).map((l) => {
            const n = lv[l.level] ?? 0;
            return (
              <tr key={l.level}>
                <td>
                  <span className={`c3-league is-${l.metal}`}>{l.name[lang]}</span>
                </td>
                <td className="is-l" data-l={t.elo}>
                  {eloOf(l)}
                </td>
                <td data-l={t.players}>{num(n)}</td>
                <td data-l={t.share}>
                  <span className="c3-share">
                    <span className="c3-share-bar" style={{ width: `${Math.min(100, (n / Math.max(1, ...lv.slice(1))) * 100)}%` }} />
                    {num((n / ranked) * 100, 1)} %
                  </span>
                </td>
                <td data-l={t.above}>{num((below(l.level) / ranked) * 100, 1)} %</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

/** Los niveles 1–20 de CoH1 y CoH2: sin nombre ni ELO fijo, el 20 arriba. */
function Levels({ lv, t, num, factions }: { lv: number[]; t: T; num: Num; factions: string[] }) {
  const { sort, th } = useSort<"level" | "players" | "share" | "above">({ key: "level", dir: -1 }, []);
  const ranked = lv.slice(1).reduce((a, b) => a + b, 0) || 1;
  const below = (level: number) => lv.slice(1, level).reduce((a, b) => a + b, 0);
  const rows = Array.from({ length: 20 }, (_, i) => i + 1);
  const cols = { level: (l: number) => l, players: (l: number) => lv[l] ?? 0, share: (l: number) => lv[l] ?? 0, above: (l: number) => l };
  const max = Math.max(1, ...lv.slice(1));
  return (
    <Panel k={t.levels} lede={t.levelsLede} className="c3-tablepanel">
      <table className="c3-table is-stack c3-leagues">
        <thead>
          <tr>
            {th("level", t.level)}
            {th("players", t.players)}
            {th("share", t.share)}
            {th("above", t.above)}
          </tr>
        </thead>
        <tbody>
          {sortRows(rows, cols, sort).map((l) => {
            const n = lv[l] ?? 0;
            return (
              <tr key={l}>
                <td>
                  <LeagueTag level={l} faction={factions} />
                </td>
                <td data-l={t.players}>{num(n)}</td>
                <td data-l={t.share}>
                  <span className="c3-share">
                    <span className="c3-share-bar" style={{ width: `${Math.min(100, (n / max) * 100)}%` }} />
                    {num((n / ranked) * 100, 1)} %
                  </span>
                </td>
                <td data-l={t.above}>{num((below(l) / ranked) * 100, 1)} %</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function EloDist({ elo, start, step, t, num, note }: { elo: number[]; start: number; step: number; t: T; num: Num; note?: string }) {
  // Se recortan los tramos vacíos de las puntas.
  let a = elo.findIndex((n) => n > 0);
  let b = elo.length - 1 - [...elo].reverse().findIndex((n) => n > 0);
  if (a < 0) (a = 0), (b = elo.length - 1);
  const xs = elo.slice(a, b + 1);
  const max = Math.max(1, ...xs);
  const total = xs.reduce((s, n) => s + n, 0) || 1;
  return (
    <Panel k={t.eloDist} lede={note ? `${t.eloLede} ${note}` : t.eloLede}>
      <ol className="c3-hist c3-elohist">
        {xs.map((n, i) => {
          const lo = start + (a + i) * step;
          const lab = a + i === 0 ? `<${start + step}` : a + i === elo.length - 1 ? `${lo}+` : `${lo}`;
          return (
            <li key={i} title={`${lab}: ${num(n)} (${num((n / total) * 100, 1)} %)`}>
              <span className="c3-hist-bar" style={{ height: `${(n / max) * 100}%` }} />
              <small>{lo % 200 === 0 ? lo : ""}</small>
            </li>
          );
        })}
      </ol>
      <p className="c3-note">{t.elo}</p>
    </Panel>
  );
}

type FKey = "faction" | "n" | "active7" | "games";
function Factions({ md, t, num, factions: FACTIONS }: { md: ModeLadder; t: T; num: Num; factions: readonly Faction[] }) {
  const { sort, th } = useSort<FKey>({ key: "n", dir: -1 }, ["faction"]);
  const cols: Record<FKey, (f: Faction) => string | number> = {
    faction: (f) => f,
    n: (f) => md.factions[f].n,
    active7: (f) => md.factions[f].active7,
    games: (f) => md.factions[f].games,
  };
  return (
    <Panel k={t.factions} h={t.totals(num(md.unique))} lede={t.factionsLede} className="c3-tablepanel">
      <table className="c3-table is-stack">
        <thead>
          <tr>
            {th("faction", t.factions)}
            {th("n", t.ranked)}
            {th("active7", t.active7)}
            {th("games", t.games)}
          </tr>
        </thead>
        <tbody>
          {sortRows(FACTIONS.filter((f) => md.factions[f]), cols, sort).map((f) => (
            <tr key={f}>
              <td>
                <FactionTag f={f} size={22} />
              </td>
              <td data-l={t.ranked}>{num(md.factions[f].n)}</td>
              <td data-l={t.active7}>{num(md.factions[f].active7)}</td>
              <td data-l={t.games}>{num(md.factions[f].games)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

type CKey = "country" | "players" | "share";
function Countries({ md, t, lang, num }: { md: ModeLadder; t: T; lang: Lang; num: Num }) {
  const { sort, th } = useSort<CKey>({ key: "players", dir: -1 }, ["country"]);
  const names = (() => {
    try {
      return new Intl.DisplayNames([lang === "es" ? "es" : "en"], { type: "region" });
    } catch {
      return null;
    }
  })();
  const name = (cc: string) => {
    if (cc === "?" || !/^[a-z]{2}$/.test(cc)) return t.unknown;
    try {
      return names?.of(cc.toUpperCase()) ?? cc.toUpperCase();
    } catch {
      return cc.toUpperCase();
    }
  };
  const total = md.unique || 1;
  const cols: Record<CKey, (c: [string, number]) => string | number> = { country: (c) => name(c[0]), players: (c) => c[1], share: (c) => c[1] / total };
  return (
    <Panel k={t.countries} lede={t.countriesLede(num(md.unique))} className="c3-tablepanel">
      <table className="c3-table is-stack">
        <thead>
          <tr>
            {th("country", t.country)}
            {th("players", t.players)}
            {th("share", t.share)}
          </tr>
        </thead>
        <tbody>
          {sortRows(md.countries, cols, sort).map((c) => (
            <tr key={c[0]}>
              <td>{name(c[0])}</td>
              <td data-l={t.players}>{num(c[1])}</td>
              <td data-l={t.share}>{num((c[1] / total) * 100, 1)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
