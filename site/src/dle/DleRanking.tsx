import { useEffect, useState } from "react";
import { useCopy } from "../deadlockCopy";
import { useLocale } from "../i18n";
import { getRanking, type RankEntry, type Ranking } from "./api";
import { DLE_MODES, type DleMode } from "./modes";

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Avatar({ e }: { e: { name: string; avatar: string } }) {
  return e.avatar ? (
    <img className="dle-av" src={e.avatar} alt="" width={30} height={30} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
  ) : (
    <span className="dle-av" aria-hidden="true">
      {e.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Una columna del ranking: el top del modo y, abajo, tu fila. */
export function RankList({ mode, data, limit, you }: { mode: DleMode; data: Ranking["modes"][DleMode] | undefined; limit: number; you: string | null }) {
  const c = useCopy().deadlock.dle;
  const top: RankEntry[] = data?.top.slice(0, limit) ?? [];
  return (
    <>
      <ol className="dle-rank">
        {top.length === 0 && <li className="dle-rank-empty">{c.noOne}</li>}
        {top.map((r) => (
          <li key={r.pos}>
            <span className="dle-pos">{r.pos}</span>
            <Avatar e={r} />
            <span className="dle-rn">{r.name}</span>
            <span className="dle-rg">{r.guesses}</span>
            <span className="dle-rt">{fmtTime(r.ms)}</span>
          </li>
        ))}
      </ol>
      {you !== null && (
        <div className="dle-rank-me">
          <span className="dle-pos">{data?.me?.pos ?? "—"}</span>
          <span className="dle-av" aria-hidden="true">
            {you.slice(0, 1).toUpperCase()}
          </span>
          <span className="dle-rn">
            {you} {c.you}
          </span>
          <span className="dle-rg">{data?.me?.guesses ?? ""}</span>
          <span className="dle-rt">{data?.me ? fmtTime(data.me.ms) : c.notPlayed}</span>
        </div>
      )}
      <span className="visually-hidden">{mode}</span>
    </>
  );
}

/** La pestaña Ranking: los tres modos lado a lado, top 10 de hoy. */
export default function DleRanking({ you }: { you: string | null }) {
  const c = useCopy().deadlock.dle;
  const locale = useLocale();
  const [data, setData] = useState<Ranking | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    getRanking().then(setData, () => setError(true));
  }, []);
  return (
    <div className="dle-ranking">
      {error && <p className="dle-error">{c.offline}</p>}
      {DLE_MODES.map((m) => (
        <section className="box dle-rank-col" key={m}>
          <h2>
            {c.modes[m]}
            <small>{c.players((data?.modes[m].players ?? 0).toLocaleString(locale), data?.modes[m].players ?? 0)}</small>
          </h2>
          <RankList mode={m} data={data?.modes[m]} limit={10} you={you} />
        </section>
      ))}
    </div>
  );
}
