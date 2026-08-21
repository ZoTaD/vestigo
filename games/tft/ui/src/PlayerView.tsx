import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, fetchMatch, parseRiotId, searchPlayer, type PlayerRef } from "./api";
import { lastSession, rememberSearch, rememberSession, storedSearch } from "./lastSearch";
import { analyzeMatch, buildProfile, type MatchView, type ViewUnit } from "./analyzer";
import { useBandFile } from "./data";
import { bandForTier, DEFAULT_BAND } from "./bands";
import { attribute, type LpSnapshot } from "./lp";
import ProfilePanel from "./ProfilePanel";
import { useCopy, useLang, useLocale } from "./i18n";
import type { Finding } from "@analysis/index";

/** Regions the pipeline already knows how to route. Names come from the copy. */
const REGIONS = ["na1", "euw1", "eun1", "br1", "la1", "la2", "kr", "jp1", "oc1"];

/** How many matches to pull at once. Riot's dev key punishes anything greedier. */
const CONCURRENCY = 3;

function UnitPortrait({ unit }: { unit: ViewUnit }) {
  return (
    <span className="unit" data-cost={unit.cost} data-target={unit.isCarry}>
      <span className="unit-stars" data-has={unit.stars >= 3}>
        {unit.stars >= 3 ? "★★★" : ""}
      </span>
      {unit.img ? (
        <img className="unit-portrait" src={unit.img} alt={unit.name} loading="lazy" />
      ) : (
        <span className="unit-portrait unit-fallback">{unit.name.slice(0, 2)}</span>
      )}
      <span className="unit-name">{unit.name}</span>
      <span className="unit-items">
        {unit.items.map((it, i) => (
          <span className="item-chip" key={`${it.id}-${i}`} title={it.name}>
            {it.img && <img className="item-chip-icon" src={it.img} alt={it.name} loading="lazy" />}
          </span>
        ))}
      </span>
    </span>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const copy = useCopy();
  return (
    <li className="finding" data-severity={finding.severity}>
      <span className="finding-tag">{copy.profile.severity[finding.severity]}</span>
      <h5 className="finding-title">{finding.title}</h5>
      <p className="finding-detail">{finding.detail}</p>
      {finding.evidence && <p className="finding-evidence">{finding.evidence}</p>}
    </li>
  );
}

function MatchRow({
  view,
  rank,
  lpDelta,
}: {
  view: MatchView;
  rank: number;
  /**
   * What this match did to the account's LP, or undefined when that cannot be
   * stated. Most rows are undefined and that is the design: a number here is a
   * measured fact, so the rows that cannot produce one stay quiet rather than
   * showing a guess.
   */
  lpDelta?: number;
}) {
  const [open, setOpen] = useState(false);
  const copy = useCopy();
  const locale = useLocale();
  const played = view.playedAt
    ? new Date(view.playedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })
    : "";
  const place = copy.player.ordinals[view.placement] ?? copy.player.noPlace;

  return (
    <li
      className="comp match-row"
      data-open={open}
      data-place={view.placement}
      style={{ "--i": rank } as React.CSSProperties}
    >
      <button
        className="comp-summary match-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // Without this the row reads as an unnamed button to a screen reader,
        // since everything inside it is decorative spans.
        aria-label={copy.player.matchLabel(
          view.matchId,
          place,
          view.compLabel,
          view.findings.length
        )}
      >
        <span className="place-mark" data-top4={view.placement <= 4}>
          {view.placement || "?"}
        </span>

        <span className="comp-identity">
          <span className="comp-name">
            <span className="comp-trait">{view.compLabel}</span>
          </span>
          <span className="comp-badges">
            <span className="badge-level">
              {copy.player.level} {view.level}
            </span>
            <span className="badge-level">
              {copy.player.round} {view.lastRound}
            </span>
            {played && <span className="badge-level">{played}</span>}
            {lpDelta !== undefined && (
              <span className="badge-lp" data-gained={lpDelta >= 0}>
                {copy.profile.lp.net(lpDelta)}
              </span>
            )}
          </span>
          <span className="synergies">
            {view.traits.slice(0, 4).map((t) => (
              <span className="synergy" key={t.id} title={t.name}>
                {t.img && <img src={t.img} alt="" loading="lazy" />}
                <b>{t.units}</b>
                <span className="synergy-name">{t.name}</span>
              </span>
            ))}
          </span>
        </span>

        <span className="roster">
          {view.units.map((u) => (
            <UnitPortrait unit={u} key={u.id} />
          ))}
        </span>

        <span className="stats">
          <span className="stat stat-primary">
            <span className="stat-value">{copy.player.ordinals[view.placement] ?? "—"}</span>
            <span className="stat-label">{copy.player.place}</span>
          </span>
          <span className="stat">
            <span className="stat-value">{view.findings.length}</span>
            <span className="stat-label">{copy.player.notes}</span>
          </span>
        </span>

        <span className="comp-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="comp-detail match-detail">
          <div className="detail-col">
            <h4 className="detail-heading">{copy.player.betterHeading}</h4>
            {view.findings.length === 0 ? (
              <p className="detail-note">{copy.player.nothingToFlag}</p>
            ) : (
              <ul className="findings">
                {view.findings.map((f) => (
                  <FindingCard finding={f} key={f.id} />
                ))}
              </ul>
            )}
          </div>

          <div className="detail-col">
            <h4 className="detail-heading">{copy.player.lobbyHeading}</h4>
            <p className="detail-note">{copy.player.lobbyNote}</p>
            <ol className="lobby-list">
              {view.lobby.map((p) => (
                <li key={`${p.placement}-${p.name}`} data-me={p.isMe}>
                  <span className="lobby-place">{p.placement}</span>
                  <span className="lobby-name">{p.name}</span>
                  <span className="lobby-comp">{p.compLabel}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  );
}

type Status = "idle" | "searching" | "loading" | "ready" | "error";

export default function PlayerView() {
  const copy = useCopy();
  const { lang } = useLang();
  /**
   * Restored from the in-memory session, so coming back to this tab redraws the
   * profile you were looking at without spending a search on it. Falls back to
   * the Riot ID kept in localStorage, which only pre-fills the form — a fresh
   * page load still asks you to press the button.
   */
  const restored = lastSession();
  const remembered = restored ?? storedSearch();
  const [query, setQuery] = useState(remembered?.query ?? "");
  const [region, setRegion] = useState(remembered?.region ?? "na1");
  const [status, setStatus] = useState<Status>(restored ? "ready" : "idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [player, setPlayer] = useState<PlayerRef | null>(restored?.player ?? null);
  /**
   * Raw matches, not analysed ones. The findings are written in the current
   * language, so holding the analysis in state would freeze it in whichever
   * language the search happened to run in; deriving it means switching to
   * Spanish re-reads every match rather than leaving stale English on screen.
   */
  const [matches, setMatches] = useState<unknown[]>(restored?.matches ?? []);
  const [expected, setExpected] = useState(restored?.expected ?? 0);
  const [offline, setOffline] = useState(restored?.offline ?? false);
  /** Every rank we have on record for this account, newest first. */
  const [lpHistory, setLpHistory] = useState<LpSnapshot[]>(restored?.lpHistory ?? []);
  /** Guards against a slow search landing after a newer one. */
  const runId = useRef(0);

  /**
   * Keep the session current as matches trickle in, so leaving mid-load and
   * coming back shows what had arrived rather than an empty page.
   *
   * Only a found player is remembered. A failed search must not overwrite the
   * profile you were happily looking at a moment ago, and a half-typed Riot ID
   * is not worth writing to anyone's device.
   */
  useEffect(() => {
    if (!player) return;
    rememberSession({ query, region, player, matches, expected, offline, lpHistory });
    rememberSearch(query, region);
  }, [player, matches, expected, offline, lpHistory, query, region]);

  /**
   * The band the report is measured against.
   *
   * Null from bandForTier means unranked, or that Riot did not answer — either
   * way we do not know, and the page has to say so rather than quietly hand out
   * Challenger advice.
   */
  const ownBand = bandForTier(player?.rank?.tier ?? "");
  // The band's file has to be here before a single match is read: analysing
  // against whatever happens to be loaded is the bug this feature exists to fix.
  const ownFile = useBandFile(ownBand ?? DEFAULT_BAND);
  /**
   * A band with too little of the current patch publishes an empty file. Reading
   * a player against it would compare them to nothing at all, so the report
   * falls back to the default cut — and says so, exactly as it does for someone
   * with no rank.
   */
  const ownBandUsable = ownFile !== null && ownFile.insufficient !== true;
  const band = ownBand && ownBandUsable ? ownBand : DEFAULT_BAND;
  const defaultFile = useBandFile(DEFAULT_BAND);
  const bandReady = band === DEFAULT_BAND ? defaultFile !== null : ownFile !== null;

  const views: MatchView[] = useMemo(() => {
    if (!player || !bandReady) return [];
    return matches
      .map((m) => analyzeMatch(m, player.puuid, copy.player.noComp, lang, band))
      .filter((v): v is MatchView => v !== null)
      .sort((a, b) => b.playedAt - a.playedAt);
  }, [matches, player, copy, lang, band, bandReady]);

  const run = useCallback(
    async (raw: string, platform: string) => {
      const parsed = parseRiotId(raw);
      if (!parsed) {
        setStatus("error");
        setError(new ApiError("BAD_REQUEST", copy.player.badRiotId));
        return;
      }

      const id = ++runId.current;
      setStatus("searching");
      setError(null);
      setMatches([]);
      setPlayer(null);
      setExpected(0);
      setOffline(false);
      setLpHistory([]);

      try {
        const found = await searchPlayer(parsed.gameName, parsed.tagLine, platform);
        if (id !== runId.current) return;

        setPlayer(found.player);
        setOffline(Boolean(found.offline));
        setLpHistory(found.lpHistory ?? []);
        setExpected(found.matchIds.length);
        setStatus(found.matchIds.length ? "loading" : "ready");

        // Stored matches first: they resolve instantly and fill the page while
        // the rest trickle in from Riot.
        const cached = new Set(found.cached);
        const ordered = [
          ...found.matchIds.filter((m) => cached.has(m)),
          ...found.matchIds.filter((m) => !cached.has(m)),
        ];

        let cursor = 0;
        const worker = async () => {
          while (cursor < ordered.length) {
            const matchId = ordered[cursor++];
            try {
              const { match } = await fetchMatch(matchId, platform);
              if (id !== runId.current) return;
              setMatches((prev) => [...prev, match]);
            } catch {
              // One unreachable match should never blank the whole history.
              if (id !== runId.current) return;
              setExpected((n) => Math.max(0, n - 1));
            }
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        if (id === runId.current) setStatus("ready");
      } catch (e) {
        if (id !== runId.current) return;
        setError(e instanceof ApiError ? e : new ApiError("UPSTREAM_ERROR", String(e)));
        setStatus("error");
      }
    },
    [copy, lang]
  );

  const notice = error ? copy.errors[error.code] : null;
  const pending = Math.max(0, expected - views.length);
  // Worked out once for the whole list rather than per row: it is a pass over
  // the snapshots, and twenty rows would otherwise repeat it twenty times.
  const lpDeltas = useMemo(() => attribute(lpHistory, views), [lpHistory, views]);

  return (
    <section className="player">
      <form
        className="seeker"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query, region);
        }}
      >
        <label className="seeker-field">
          <span className="seeker-label">{copy.player.riotId}</span>
          <input
            className="seeker-input"
            placeholder={copy.player.riotIdPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <label className="seeker-field seeker-field-region">
          <span className="seeker-label">{copy.player.region}</span>
          <select
            className="seeker-input seeker-select"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            {REGIONS.map((id) => (
              <option value={id} key={id}>
                {copy.player.regions[id]}
              </option>
            ))}
          </select>
        </label>

        <button className="seeker-go" type="submit" disabled={status === "searching"}>
          {status === "searching" ? copy.player.searching : copy.player.search}
        </button>
      </form>

      {notice && (
        <div className="notice" role="alert">
          <h3>{notice.title}</h3>
          <p>{notice.hint}</p>
          {error && <p className="notice-raw">{error.message}</p>}
        </div>
      )}

      {player && (
        <div className="player-head">
          <h2 className="player-name">
            {player.summoner && (
              // Decoration, and it is allowed to fail alone: a broken icon must
              // not take the name down with it, and the level reads fine on its
              // own if CommunityDragon is having a bad day.
              <img
                className="player-icon"
                src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${player.summoner.iconId}.jpg`}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            {player.gameName}
            <span className="player-tag">#{player.tagLine}</span>
          </h2>
          <p className="player-standing">
            {/* The rank itself, which this page never said out loud. It decided
                which meta the report was measured against and then stayed
                hidden, so a player could not check the premise of their own
                report. Absent when Riot did not answer or the account is
                unranked — no rank is a real answer, an invented one is not. */}
            {player.rank && (
              <span className="player-rank">
                {copy.player.standing(
                  copy.player.tiers[player.rank.tier.toUpperCase()] ?? player.rank.tier,
                  player.rank.division,
                  player.rank.leaguePoints
                )}
              </span>
            )}
            {player.summoner && (
              <span className="player-level">{copy.player.accountLevel(player.summoner.level)}</span>
            )}
          </p>
          <p className="player-meta">
            {offline ? copy.player.offline : copy.player.found(expected)}
            {pending > 0 && copy.player.loading(pending)}
          </p>
          {/* Guessed whenever the report is not measured against the player's
              own rank, whether because they have none or because that rank has
              too little of this patch behind it. */}
          <p className="player-band" data-guessed={band !== ownBand}>
            {!bandReady
              ? copy.player.rank.waiting
              : ownBand && band === ownBand
                ? copy.player.rank.own(copy.meta.bands.names[ownBand])
                : ownBand
                  ? copy.player.rank.thinBand(
                      copy.meta.bands.names[ownBand],
                      copy.meta.bands.names[DEFAULT_BAND]
                    )
                  : copy.player.rank.fallback(copy.meta.bands.names[DEFAULT_BAND])}
          </p>
        </div>
      )}

      {views.length > 0 && (
        <ProfilePanel profile={buildProfile(views, lang, band, ownBand, lpHistory)} />
      )}

      {views.length > 0 && (
        <ol className="comp-list match-list">
          {views.map((v, i) => (
            <MatchRow view={v} rank={i + 1} lpDelta={lpDeltas.get(v.matchId)} key={v.matchId} />
          ))}
        </ol>
      )}

      {status === "idle" && <p className="seeker-hint">{copy.player.idleHint}</p>}

      {(status === "searching" || pending > 0) && (
        <ul className="skeletons" aria-hidden="true">
          {Array.from({ length: Math.min(3, Math.max(1, pending)) }, (_, i) => (
            <li className="skeleton" key={i} />
          ))}
        </ul>
      )}
    </section>
  );
}
