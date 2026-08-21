import { useEffect, useState } from "react";
import { fetchLadder, type LadderEntry } from "./api";
import { useCopy, useLocale } from "./i18n";

/** The regions the ladder pull covers. Extend both here and the pull script. */
const LADDER_REGIONS = ["na1", "euw1", "kr", "la2"];

type Status = "loading" | "ready" | "error";

export default function LadderView() {
  const copy = useCopy();
  const locale = useLocale();
  const [region, setRegion] = useState("na1");
  const [entries, setEntries] = useState<LadderEntry[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    fetchLadder(region)
      .then((r) => {
        if (!alive) return;
        setEntries(r.entries);
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [region]);

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <>
      <header className="masthead">
        <h1 className="title">
          {copy.ladder.title}
          <span className="title-break">{copy.ladder.titleBreak}</span>
        </h1>
        <p className="standfirst">{copy.ladder.standfirst}</p>
      </header>

      <main className="tiers">
        <div className="units-controls">
          <div className="cost-filter" role="group" aria-label={copy.ladder.region}>
            {LADDER_REGIONS.map((r) => (
              <button
                className="cost-chip"
                key={r}
                data-active={region === r}
                onClick={() => setRegion(r)}
              >
                {copy.player.regions[r]}
              </button>
            ))}
          </div>
        </div>

        {status === "loading" && <p className="seeker-hint">{copy.ladder.loading}</p>}

        {status === "error" && (
          <div className="notice" role="alert">
            <p>{copy.ladder.error}</p>
          </div>
        )}

        {status === "ready" && entries.length === 0 && (
          <p className="seeker-hint">{copy.ladder.empty}</p>
        )}

        {status === "ready" && entries.length > 0 && (
          <ol className="ladder-list">
            <li className="ladder-row ladder-head" aria-hidden="true">
              <span className="ld-rank">{copy.ladder.cols.rank}</span>
              <span className="ld-player">{copy.ladder.cols.player}</span>
              <span className="ld-lp">{copy.ladder.cols.lp}</span>
              <span className="ld-record">{copy.ladder.cols.record}</span>
              <span className="ld-top4">{copy.ladder.cols.top4}</span>
            </li>
            {entries.map((e) => (
              <li className="ladder-row" key={e.rank}>
                <span className="ld-rank">{e.rank}</span>
                <span className="ld-player">
                  {e.gameName ? (
                    <>
                      <b>{e.gameName}</b>
                      <em className="ld-tag">#{e.tagLine}</em>
                    </>
                  ) : (
                    <em className="ld-unknown">{copy.ladder.unknown}</em>
                  )}
                </span>
                <span className="ld-lp">{e.leaguePoints.toLocaleString(locale)}</span>
                <span className="ld-record">
                  {e.wins} / {e.losses}
                </span>
                <span className="ld-top4" data-good={e.winRate >= 0.5}>
                  {pct(e.winRate)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}
