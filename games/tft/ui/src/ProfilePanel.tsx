import type { PlayerProfile, PlayerTag, Tally } from "./analyzer";
import { HABIT_IDS, MIN_PLAYER_GAMES, type CoachFinding } from "@analysis/index";
import { useCopy, useLocale } from "./i18n";

/** A lobby of eight averages this, so it is the line between good and bad. */
const LOBBY_AVERAGE = 4.5;
const PLACES = 8;

/**
 * The player's own record across the matches on screen.
 *
 * Colour carries only one distinction — a good average against a bad one — and
 * every bar states its own numbers beside it, so nothing is locked behind colour
 * or hover. The pair was checked with the palette validator against this theme's
 * surface rather than picked by eye.
 */

const pct = (n: number) => `${Math.round(n * 100)}%`;

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-value">{value}</span>
      <span className="stat-tile-label">{label}</span>
    </div>
  );
}

/** Horizontal bars: games played, with the average placement stated outright. */
function TallyBars({ rows, heading, note }: { rows: Tally[]; heading: string; note: string }) {
  const copy = useCopy();
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.games));

  return (
    <div className="profile-block">
      <h4 className="detail-heading">{heading}</h4>
      <p className="detail-note">{note}</p>
      <ul className="tally-list">
        {rows.map((r) => (
          <li className="tally" key={r.key}>
            <span className="tally-label">
              {r.img && <img src={r.img} alt="" loading="lazy" />}
              <span className="tally-name">{r.label}</span>
            </span>
            <span className="tally-track">
              <span
                className="tally-fill"
                data-good={r.avgPlacement <= 4.5}
                style={{ width: `${(r.games / max) * 100}%` }}
              />
            </span>
            <span className="tally-figures">
              <b>{r.games}</b>
              <em>
                {r.thin ? "—" : r.avgPlacement.toFixed(1)}
                <span className="tally-unit">
                  {r.thin ? copy.profile.oneGame : copy.profile.placeUnit}
                </span>
              </em>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Where the player finishes, as a shape rather than a single average.
 *
 * Two averages of 4.5 can be a player who always takes fourth or fifth and one
 * who alternates firsts and eighths — the same number, opposite problems. The
 * distribution is the only thing that tells them apart.
 *
 * Colour encodes polarity, not identity: top four against the rest. The pair was
 * run through the palette validator against this theme's surface — gold and the
 * lighter oxblood separate by ΔE 19 under deuteranopia and both clear 3:1 on the
 * background, which the theme's darker oxblood did not.
 */
function PlacementChart({ counts, matches }: { counts: number[]; matches: number }) {
  const copy = useCopy();
  const max = Math.max(...counts, 1);

  return (
    <div className="profile-block">
      <h4 className="detail-heading">{copy.profile.places.heading}</h4>
      <p className="detail-note">{copy.profile.places.note}</p>
      <ol className="places" aria-label={copy.profile.places.heading}>
        {counts.map((count, i) => (
          <li className="place" key={i}>
            <span className="place-count">{count > 0 ? count : ""}</span>
            <span
              className="place-track"
              title={copy.profile.places.tooltip(
                copy.profile.places.ordinals[i],
                count,
                matches
              )}
            >
              {/* No mark at all for zero: a minimum-height sliver would draw
                  data where there is none. */}
              {count > 0 && (
                <span
                  className="place-fill"
                  data-top4={i < PLACES / 2}
                  style={{ height: `${(count / max) * 100}%` }}
                />
              )}
            </span>
            <span className="place-label">{copy.profile.places.ordinals[i]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * What the players one rung up do differently.
 *
 * Three rates on one row — yours, your rank's, theirs — and under them what the
 * habit costs at your own rank with the boards behind it. Every claim carries
 * its own number: a coaching line the reader cannot check is a horoscope.
 *
 * An empty list is a real answer rather than a blank box, so it says so and
 * lists what was measured. A verdict with no inventory reads like a failure.
 */
function CoachRows({
  coach,
  coachBand,
  matches,
}: {
  coach: CoachFinding[];
  coachBand: PlayerProfile["coachBand"];
  matches: number;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const say = copy.profile.coach;
  const bandName = (band: string) => copy.meta.bands.names[band] ?? band;

  const body = !coachBand.own ? (
    // No band means unranked, or Riot did not answer. We cannot say whose
    // habits to compare against, and guessing is worse than saying so.
    <p className="coach-empty">{say.unranked}</p>
  ) : !coachBand.above ? (
    <p className="coach-empty">{say.top}</p>
  ) : matches < MIN_PLAYER_GAMES ? (
    <p className="coach-empty">{say.thin(MIN_PLAYER_GAMES)}</p>
  ) : coach.length === 0 ? (
    <p className="coach-empty">
      {say.empty}{" "}
      <span className="coach-inventory">
        {say.emptyList(HABIT_IDS.map((id) => say.habits[id]).join(" · "))}
      </span>
    </p>
  ) : (
    <ul className="coach">
      {coach.map((f) => (
        <li className="coach-row" key={f.id}>
          <p className="coach-habit">{say.habits[f.id]}</p>
          <p className="coach-rates">
            <span className="coach-rate" data-mine>
              <span className="coach-who">{say.you}</span>
              <b>{pct(f.yourRate)}</b>
              <em>{say.games(f.yourGames)}</em>
            </span>
            <span className="coach-rate">
              <span className="coach-who">{bandName(coachBand.own!)}</span>
              <b>{pct(f.bandRate)}</b>
            </span>
            <span className="coach-rate">
              <span className="coach-who">{bandName(coachBand.above!)}</span>
              <b>{pct(f.aboveRate)}</b>
            </span>
          </p>
          <p className="coach-cost">
            {say.cost(
              Math.abs(f.costInBand).toFixed(1),
              f.bandBoards.toLocaleString(locale)
            )}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="profile-block">
      <h4 className="detail-heading">{say.heading}</h4>
      <p className="detail-note">{say.note}</p>
      {body}
    </div>
  );
}

/**
 * The run itself, oldest game to newest.
 *
 * The distribution says where a player finishes; this says in what order, which
 * is the only thing that shows a streak or a climb. Bars are inverted — a first
 * is tall, an eighth is short — so up reads as good, and coloured with the same
 * validated top-4 polarity as the rest of the profile.
 */
function PlacementTimeline({ timeline }: { timeline: PlayerProfile["timeline"] }) {
  const copy = useCopy();
  const locale = useLocale();
  // One game is a dot, not a trend.
  if (timeline.length < 2) return null;

  return (
    <div className="profile-block">
      <h4 className="detail-heading">{copy.profile.timeline.heading}</h4>
      <p className="detail-note">{copy.profile.timeline.note}</p>
      <ol className="timeline" aria-label={copy.profile.timeline.heading}>
        {timeline.map((g, i) => {
          const place = copy.profile.places.ordinals[g.placement - 1] ?? String(g.placement);
          const date = g.playedAt
            ? new Date(g.playedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })
            : "";
          return (
            <li className="tl-slot" key={i} title={copy.profile.timeline.tooltip(place, date)}>
              <span
                className="tl-bar"
                data-top4={g.placement <= 4}
                style={{ height: `${((9 - g.placement) / 8) * 100}%` }}
              >
                <span className="tl-place">{g.placement}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The LP this account has gained or given back over the set.
 *
 * One series, so no legend: the heading names it. Labels are on the first and
 * last point only — a number on every point turns a trend into a table.
 *
 * The empty state is the honest half of this feature. Riot publishes no LP
 * history, so a first-time visitor genuinely has one point, and drawing a line
 * through a single dot would invent a trend out of nothing. It says what it
 * has instead.
 *
 * Colour: the line is one hue because a trajectory is one entity, and only the
 * net figure takes the good/bad pair, which was re-run through the palette
 * validator against this theme's real surface — ΔE 19.2 under deuteranopia and
 * both above 3:1 on #080d1a.
 */
function LpTimeline({ points }: { points: PlayerProfile["lp"] }) {
  const copy = useCopy();
  const locale = useLocale();
  const say = copy.profile.lp;

  if (points.length < 2) {
    return (
      <div className="profile-block">
        <h4 className="detail-heading">{say.heading}</h4>
        <p className="detail-note">{say.note}</p>
        <p className="coach-empty">{points.length === 0 ? say.none : say.justStarted}</p>
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const net = last.absolute - first.absolute;

  // A flat run would divide by zero and, worse, draw a line pinned to the
  // bottom of the box. One point of headroom keeps it in the middle instead.
  const lo = Math.min(...points.map((p) => p.absolute));
  const hi = Math.max(...points.map((p) => p.absolute));
  const span = hi - lo || 1;
  const t0 = first.takenAt;
  const tSpan = last.takenAt - t0 || 1;

  const W = 100;
  const H = 34;
  const PAD = 3;
  const at = (p: (typeof points)[number]) => ({
    x: PAD + ((p.takenAt - t0) / tSpan) * (W - PAD * 2),
    y: H - PAD - ((p.absolute - lo) / span) * (H - PAD * 2),
  });
  const path = points.map((p) => { const c = at(p); return `${c.x.toFixed(2)},${c.y.toFixed(2)}`; }).join(" ");
  const day = (at: number) =>
    new Date(at).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const standing = (p: (typeof points)[number]) =>
    copy.player.standing(
      copy.player.tiers[p.tier.toUpperCase()] ?? p.tier,
      p.division,
      p.leaguePoints
    );

  return (
    <div className="profile-block">
      <h4 className="detail-heading">{say.heading}</h4>
      <p className="detail-note">{say.note}</p>

      <p className="lp-net" data-gained={net >= 0}>
        <b>{say.net(net)}</b>
        <span className="lp-net-since">{say.since(points.length, day(first.takenAt))}</span>
      </p>

      <svg
        className="lp-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={say.alt(standing(first), standing(last))}
      >
        <polyline className="lp-line" points={path} />
        {points.map((p, i) => {
          const c = at(p);
          return (
            <circle
              className="lp-dot"
              key={p.takenAt}
              cx={c.x}
              cy={c.y}
              r={i === 0 || i === points.length - 1 ? 1.6 : 1}
            >
              <title>{`${standing(p)} — ${day(p.takenAt)}`}</title>
            </circle>
          );
        })}
      </svg>

      {/* Direct labels, on the ends only. */}
      <p className="lp-ends">
        <span>{standing(first)}</span>
        <span>{standing(last)}</span>
      </p>
    </div>
  );
}

/**
 * The lighter half of the history: not what to fix, but what you are like.
 *
 * Every tag prints the measurement that produced it. Without that it is a
 * horoscope — anyone can be told they "ride streaks" and nod along. With the
 * number, the player can disagree, and being able to disagree is what makes
 * the rest of the page worth believing.
 */
function PlayerTags({ tags }: { tags: PlayerTag[] }) {
  const copy = useCopy();
  if (tags.length === 0) return null;

  const say = copy.playerTags;
  const asPct = (n: number) => `${Math.round(n * 100)}%`;

  const render = (tag: PlayerTag): { label: string; why: string } => {
    switch (tag.id) {
      case "chainWins":
        return { label: say.chainWins.label, why: say.chainWins.why(asPct(tag.value), Number(tag.detail)) };
      case "chainLosses":
        return { label: say.chainLosses.label, why: say.chainLosses.why(asPct(tag.value), Number(tag.detail)) };
      case "forcer":
        return { label: say.forcer.label, why: say.forcer.why(asPct(tag.value)) };
      case "flexible":
        return { label: say.flexible.label, why: say.flexible.why(asPct(tag.value)) };
      case "unitGod": {
        const unit = String(tag.detail);
        return { label: say.unitGod.label(unit), why: say.unitGod.why(unit, tag.value.toFixed(1)) };
      }
      case "highRoller":
        return { label: say.highRoller.label, why: say.highRoller.why(asPct(tag.value), Number(tag.detail)) };
    }
  };

  return (
    <div className="profile-block">
      <h4 className="detail-heading">{say.heading}</h4>
      <p className="detail-note">{say.note}</p>
      <ul className="ptags">
        {tags.map((tag) => {
          const { label, why } = render(tag);
          return (
            <li className="ptag" data-tag={tag.id} key={tag.id}>
              <span className="ptag-label">{label}</span>
              <span className="ptag-why">{why}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ProfilePanel({ profile }: { profile: PlayerProfile }) {
  const copy = useCopy();
  if (profile.matches === 0) return null;

  return (
    <section className="profile">
      {/* First, because it is the only thing here that no single match could
          have told the player. */}
      {profile.insights.length > 0 && (
        <div className="profile-block">
          <h4 className="detail-heading">{copy.profile.historyHeading}</h4>
          <p className="detail-note">{copy.profile.historyNote(profile.matches)}</p>
          <ul className="findings">
            {profile.insights.map((i) => (
              <li className="finding" data-severity={i.severity} key={i.id}>
                <span className="finding-tag">{copy.profile.severity[i.severity]}</span>
                <h5 className="finding-title">{i.title}</h5>
                <p className="finding-detail">{i.detail}</p>
                {i.evidence && <p className="finding-evidence">{i.evidence}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PlayerTags tags={profile.tags} />

      <div className="profile-stats">
        <StatTile value={String(profile.matches)} label={copy.profile.matches} />
        <StatTile value={profile.avgPlacement.toFixed(2)} label={copy.profile.avgPlacement} />
        <StatTile value={pct(profile.top4Rate)} label={copy.profile.top4} />
        <StatTile value={pct(profile.winRate)} label={copy.profile.firsts} />
      </div>

      {profile.excluded > 0 && (
        <p className="profile-excluded">{copy.profile.excluded(profile.excluded)}</p>
      )}

      <PlacementTimeline timeline={profile.timeline} />

      <div className="profile-grid">
        <LpTimeline points={profile.lp} />
        <PlacementChart counts={profile.placements} matches={profile.matches} />
      </div>

      <div className="profile-grid">
        <CoachRows
          coach={profile.coach}
          coachBand={profile.coachBand}
          matches={profile.matches}
        />
      </div>

      <div className="profile-grid">
        <TallyBars
          rows={profile.comps}
          heading={copy.profile.compsHeading}
          note={copy.profile.compsNote}
        />
        <TallyBars
          rows={profile.champions}
          heading={copy.profile.championsHeading}
          note={copy.profile.championsNote}
        />
      </div>
    </section>
  );
}
