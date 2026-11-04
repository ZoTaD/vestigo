import { useEffect, useState } from "react";
import { useCopy } from "./deadlockCopy";
import { useLocale } from "./i18n";
import RouteLink from "./RouteLink";
import SectionHead from "./SectionHead";
import type { Route } from "./route";
import { DleOffline, DleRejected, DleSignedOut, getMe, getPool, getRanking, getToday, postGuess, type Hint, type Me, type PoolEntry, type Ranking, type Revealed, type Row } from "./dle/api";
import DleBoard from "./dle/DleBoard";
import DleRanking, { RankList } from "./dle/DleRanking";
import { loadLocal, saveLocal } from "./dle/local";
import { DLE_MAX, DLE_RANKING_OPEN, DLE_VIEWS, dleDetail, dleMode, hasSession, type DleMode } from "./dle/modes";
import { standingText } from "./dle/standing";
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

/**
 * Mientras el ranking está en construcción, el costado dice dónde quedaste
 * (porcentaje o puesto) en vez de la lista de nombres.
 */
function Standing({ mode, ranking, signedIn }: { mode: DleMode; ranking: Ranking | null; signedIn: boolean }) {
  const c = useCopy().deadlock.dle;
  const me = ranking?.modes[mode].me;
  if (!signedIn) {
    const here = typeof location === "undefined" ? "/" : location.pathname;
    return (
      <div className="box dle-standing">
        <a className="dle-signin" href={`/api/auth/steam?return=${encodeURIComponent(here)}`} rel="nofollow">
          {c.standingSignIn}
        </a>
      </div>
    );
  }
  if (!me || !ranking) return <div className="box dle-standing"><p>{c.standingSolve}</p></div>;
  const s = standingText({ pos: me.pos, players: ranking.modes[mode].players });
  return (
    <div className="box dle-standing">
      <b>{s.kind === "top" ? c.standingTop(s.value) : c.standingPlace(s.value, s.of)}</b>
      {s.kind === "top" && <span>{c.standingSub}</span>}
    </div>
  );
}

interface Game {
  number: number | null;
  date: string | null;
  rows: Row[];
  hints: Hint[];
  solved: boolean;
  lost: boolean;
  answer?: Revealed;
}
const EMPTY: Game = { number: null, date: null, rows: [], hints: [], solved: false, lost: false };

function DleGame({ mode, ready, signedIn, you }: { mode: DleMode; ready: boolean; signedIn: boolean; you: string | null }) {
  const c = useCopy().deadlock.dle;
  const locale = useLocale();
  const [game, setGame] = useState<Game>(EMPTY);
  const [pool, setPool] = useState<PoolEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    getToday(mode).then(
      (t) => {
        if (!alive) return;
        const local = signedIn ? null : loadLocal(mode, t.date);
        setGame(
          local
            ? { number: t.number, ...local, lost: local.lost ?? false }
            : { number: t.number, date: t.date, rows: t.rows, hints: t.hints, solved: t.solved, lost: t.lost, answer: t.answer },
        );
      },
      () => alive && setError(c.offline),
    );
    getPool().then((p) => alive && setPool(p[mode]), () => alive && setError(c.offline));
    getRanking().then((r) => alive && setRanking(r), () => {});
    if (signedIn) getMe().then((m) => alive && setMe(m), () => {});
    return () => {
      alive = false;
    };
  }, [mode, ready, signedIn, c.offline]);

  const onGuess = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await postGuess(mode, name, signedIn ? {} : { date: game.date ?? undefined, n: game.rows.length });
      setGame((g) => {
        const next: Game = {
          ...g,
          date: res.date,
          rows: [res.row, ...g.rows],
          hints: res.hints,
          solved: g.solved || res.solved,
          lost: g.lost || res.lost,
          answer: g.answer ?? res.answer,
        };
        if (!signedIn && next.date) saveLocal(mode, { date: next.date, rows: next.rows, hints: next.hints, solved: next.solved, lost: next.lost, answer: next.answer });
        return next;
      });
      if (res.solved || res.lost) {
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
      <DleBoard mode={mode} number={game.number} rows={game.rows} hints={game.hints} solved={game.solved} lost={game.lost} max={DLE_MAX[mode]} answer={game.answer} error={error} busy={busy} pool={pool} signedIn={signedIn} onGuess={onGuess} />
      <aside className="dle-side">
        <h2>{DLE_RANKING_OPEN ? c.todayRanking : c.standingTitle}</h2>
        <p className="dle-side-sub">
          {c.modes[mode]} · {c.players((ranking?.modes[mode].players ?? 0).toLocaleString(locale), ranking?.modes[mode].players ?? 0)} · {c.resets}
        </p>
        {DLE_RANKING_OPEN ? (
          <div className="box">
            <RankList mode={mode} data={ranking?.modes[mode]} limit={7} you={you} />
          </div>
        ) : (
          <Standing mode={mode} ranking={ranking} signedIn={signedIn} />
        )}
        {signedIn && (
          <div className="dle-you box">
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
  /** Hasta saber si la sesión vale, el tablero no pide nada: si no, jugaría con la cuenta equivocada. */
  const [ready, setReady] = useState(false);
  const [you, setYou] = useState<string | null>(null);
  useEffect(() => {
    if (!hasSession()) {
      setReady(true);
      return;
    }
    try {
      const a = JSON.parse(localStorage.getItem("vg_account") ?? "null") as { name?: string } | null;
      setYou(a?.name ?? null);
    } catch {
      /* sin la cuenta guardada se muestra sin nombre */
    }
    // La cookie puede quedar después de que la sesión venció: se confirma con el Worker.
    getMe().then(
      () => setSignedIn(true),
      (err) => {
        if (err instanceof DleSignedOut) document.cookie = "vg_in=; Path=/; Max-Age=0";
        else setSignedIn(true);
      },
    ).finally(() => setReady(true));
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
          {DLE_VIEWS.map((v) =>
            v === "ranking" && !DLE_RANKING_OPEN ? (
              <span key={v} className="dle-mode is-rank is-off" aria-disabled="true">
                {c.modes[v]}
                <em>{c.underConstruction}</em>
              </span>
            ) : (
            <RouteLink
              key={v}
              className={`dle-mode${v === "ranking" ? " is-rank" : ""}`}
              to={{ ...route, view: "deadlock", dlSection: "dle", detail: dleDetail(v) }}
              active={v === view}
              onNavigate={navigate}
            >
              {c.modes[v]}
            </RouteLink>
            ),
          )}
        </nav>
        {view === "ranking" ? (
          <DleRanking you={signedIn ? you ?? "" : null} />
        ) : (
          <DleGame key={`${view}-${ready}-${signedIn}`} mode={view} ready={ready} signedIn={signedIn} you={signedIn ? you ?? "" : null} />
        )}
      </div>
    </main>
  );
}
