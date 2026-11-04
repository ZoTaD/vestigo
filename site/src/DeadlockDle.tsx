import { useEffect, useState } from "react";
import { useCopy } from "./deadlockCopy";
import { useLocale } from "./i18n";
import RouteLink from "./RouteLink";
import SectionHead from "./SectionHead";
import type { Route } from "./route";
import { DleOffline, DleRejected, getMe, getPool, getRanking, getToday, postGuess, type Hint, type Me, type PoolEntry, type Ranking, type Revealed, type Row } from "./dle/api";
import DleBoard from "./dle/DleBoard";
import DleRanking, { RankList } from "./dle/DleRanking";
import { loadLocal, saveLocal } from "./dle/local";
import { DLE_VIEWS, dleDetail, dleMode, hasSession, type DleMode } from "./dle/modes";
import "./styles/deadlock-dle.css";

/**
 * El Deadlockdle (2026-11-04): Heroes, Items y Abilities, cada uno con su
 * respuesta del día y su ranking, más la pestaña Ranking. El Worker elige y
 * compara; acá sólo se dibuja. Diseño: `docs/plans/2026-11-04-deadlockdle.md`.
 */

/** Hasta las próximas 00:00 UTC, "hh:mm:ss". Antes de montar, rayitas. */
function useCountdown(): string {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return "--:--:--";
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  const s = Math.floor((next.getTime() - now) / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

interface Game {
  number: number | null;
  date: string | null;
  rows: Row[];
  hints: Hint[];
  solved: boolean;
  answer?: Revealed;
}
const EMPTY: Game = { number: null, date: null, rows: [], hints: [], solved: false };

function DleGame({ mode, signedIn, you }: { mode: DleMode; signedIn: boolean; you: string | null }) {
  const c = useCopy().deadlock.dle;
  const locale = useLocale();
  const [game, setGame] = useState<Game>(EMPTY);
  const [pool, setPool] = useState<PoolEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    getToday(mode).then(
      (t) => {
        if (!alive) return;
        const local = signedIn ? null : loadLocal(mode, t.date);
        setGame(local ? { number: t.number, ...local } : { number: t.number, date: t.date, rows: t.rows, hints: t.hints, solved: t.solved, answer: t.answer });
      },
      () => alive && setError(c.offline),
    );
    getPool().then((p) => alive && setPool(p[mode]), () => alive && setError(c.offline));
    getRanking().then((r) => alive && setRanking(r), () => {});
    if (signedIn) getMe().then((m) => alive && setMe(m), () => {});
    return () => {
      alive = false;
    };
  }, [mode, signedIn, c.offline]);

  const onGuess = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await postGuess(mode, name, signedIn ? {} : { date: game.date ?? undefined, n: game.rows.length });
      const next: Game = { ...game, date: res.date, rows: [res.row, ...game.rows], hints: res.hints, solved: res.solved, answer: res.answer };
      setGame(next);
      if (!signedIn && next.date) saveLocal(mode, { date: next.date, rows: next.rows, hints: next.hints, solved: next.solved, answer: next.answer });
      if (res.solved) {
        getRanking().then(setRanking, () => {});
        if (signedIn) getMe().then(setMe, () => {});
      }
    } catch (err) {
      setError(err instanceof DleRejected ? c[err.reason] : err instanceof DleOffline ? c.offline : c.offline);
    } finally {
      setBusy(false);
    }
  };

  const mine = me?.[mode];
  const won = mine && mine.played ? Math.round((mine.won / mine.played) * 100) : null;
  return (
    <div className="dle-layout">
      <DleBoard mode={mode} number={game.number} rows={game.rows} hints={game.hints} solved={game.solved} answer={game.answer} error={error} busy={busy} pool={pool} signedIn={signedIn} onGuess={onGuess} />
      <aside className="dle-side">
        <h2>{c.todayRanking}</h2>
        <p className="dle-side-sub">
          {c.modes[mode]} · {c.players((ranking?.modes[mode].players ?? 0).toLocaleString(locale), ranking?.modes[mode].players ?? 0)} · {c.resets}
        </p>
        <div className="box">
          <RankList mode={mode} data={ranking?.modes[mode]} limit={7} you={you} />
        </div>
        {signedIn && (
          <div className="dle-you box">
            <div>
              <b>{ranking?.modes[mode].me ? `#${ranking.modes[mode].me!.pos}` : "—"}</b>
              <span>{c.yourRank}</span>
            </div>
            <div>
              <b>{mine?.streak ?? 0}</b>
              <span>{c.streak}</span>
            </div>
            <div>
              <b>{won === null ? "—" : `${won}%`}</b>
              <span>{c.winRate}</span>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function DeadlockDle({ route, navigate }: { route: Route; navigate: (next: Route) => void }) {
  const copy = useCopy();
  const c = copy.deadlock.dle;
  const view = dleMode(route.detail);
  const countdown = useCountdown();
  const [signedIn, setSignedIn] = useState(false);
  const [you, setYou] = useState<string | null>(null);
  useEffect(() => {
    const s = hasSession();
    setSignedIn(s);
    if (!s) return;
    try {
      const a = JSON.parse(localStorage.getItem("vg_account") ?? "null") as { name?: string } | null;
      setYou(a?.name ?? null);
    } catch {
      /* sin la cuenta guardada se muestra sin nombre */
    }
  }, []);

  return (
    <main className="deadlock deadlock-dle">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title="Deadlock"
        accent="dle"
        lead={c.lead}
        meta={
          <span className="dl-meta-line dle-meta">
            <em className="dle-beta">{c.beta}</em> {c.nextIn} <b>{countdown}</b>
          </span>
        }
      />
      <div className="page">
        <nav className="dle-modes" aria-label={c.title}>
          {DLE_VIEWS.map((v) => (
            <RouteLink
              key={v}
              className={`dle-mode${v === "ranking" ? " is-rank" : ""}`}
              to={{ ...route, view: "deadlock", dlSection: "dle", detail: dleDetail(v) }}
              active={v === view}
              onNavigate={navigate}
            >
              {c.modes[v]}
            </RouteLink>
          ))}
        </nav>
        {view === "ranking" ? <DleRanking you={signedIn ? you ?? "" : null} /> : <DleGame key={view} mode={view} signedIn={signedIn} you={signedIn ? you ?? "" : null} />}
      </div>
    </main>
  );
}
