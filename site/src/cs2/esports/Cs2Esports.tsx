/**
 * La pestaña Torneos de CS2 (2026-11-03, etapa 6a): la combinación de las maquetas A "En vivo" y B "Ranking" que
 * eligió ZoTaD. Arriba, el torneo en curso con su transmisión de Twitch y, al costado, los próximos partidos por día en
 * la hora de quien mira; después los resultados y los torneos; abajo, el ranking oficial de Valve con pestañas por
 * región y, al tocar un equipo, por qué tiene esos puntos.
 *
 * Los torneos, el ranking y los logos vienen del archivo diario; los partidos, de `/api/cs2/matches` al abrir (no se
 * prerenderizan: cambian cada hora).
 */
import { Fragment, useState } from "react";
import { useLang } from "../../i18n";
import type { Route } from "../../route";
import { useCs2Copy } from "../../cs2Copy";
import { useLoad } from "../../useLoad";
import { fmtDate } from "../patches/names";
import { Cs2Loading, useNum, type Nav } from "../ui";
import { loadEsports, loadMatches, peekEsports, peekMatches, type Esports, type Region, type TourRow, type VrsRow } from "./data";
import type { Match } from "./matches";
import { byLocalDay, localTime, TeamLogo, Twitch } from "./parts";

/** El torneo de arriba: el S en curso, si no cualquiera en curso, si no el próximo. */
export function featured(ts: TourRow[]): TourRow | undefined {
  return ts.find((t) => t.state === "ongoing" && t.tier === "S") ?? ts.find((t) => t.state === "ongoing") ?? ts.find((t) => t.state === "upcoming");
}

export default function Cs2Esports({ route }: { route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const data = useLoad("esports", peekEsports, loadEsports);
  if (data.failed) return <Cs2Loading onRetry={data.retry} />;
  if (!data.value) return <Cs2Loading />;
  const d = data.value;
  const top = featured(d.tournaments);
  return (
    <main className="c2-main c2-es" data-lang={route.lang}>
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabs.esports}</h1>
        <p className="c2-lede">{t.es.lede}</p>
      </header>
      <section className="c2-es-live">
        {top && <Featured tour={top} />}
        <MatchesPanel d={d} />
      </section>
      <section className="c2-es-row">
        <Results d={d} />
        <Tours tours={d.tournaments} />
      </section>
      <VrsBlock d={d} />
      <p className="c2-note">{t.es.credit}</p>
    </main>
  );
}

function Featured({ tour }: { tour: TourRow }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const num = useNum();
  const live = tour.state === "ongoing";
  const day = (s: string | null) => (s ? fmtDate(s, lang, { day: "numeric", month: "long" }) : "");
  return (
    <div className="c2-es-feat">
      <div className="c2-es-feat-h">
        <h2 className="c2-es-feat-name">{tour.name}</h2>
        <span className={live ? "c2-es-live-tag" : "c2-dim"}>{live ? t.es.live : t.es.startsOn(day(tour.start))}</span>
      </div>
      {live && tour.streams[0] ? (
        <Twitch channel={tour.streams[0]} title={tour.name} />
      ) : (
        <div className="c2-tw is-soon">
          <b>{tour.name}</b>
          <span>{t.es.startsOn(day(tour.start))}</span>
        </div>
      )}
      <p className="c2-es-facts">
        {tour.tier && <b>{tour.tier}-Tier</b>}
        {tour.start && tour.end && <span>{t.es.dates(day(tour.start), day(tour.end))}</span>}
        {tour.prize != null && (
          <span>
            <b>US$ {num(tour.prize, 0)}</b> {t.es.prize}
          </span>
        )}
        {tour.teams != null && <span>{t.es.teams(tour.teams)}</span>}
        {(tour.venue || tour.location) && <span>{[tour.location, tour.venue].filter(Boolean).join(", ")}</span>}
        {tour.organizer && (
          <span>
            {t.es.organizer} <b>{tour.organizer}</b>
          </span>
        )}
      </p>
    </div>
  );
}

/** Lo que todavía no se jugó (con 3 horas de margen para el que está en curso), del más cercano al más lejano. */
export const pending = (ms: Match[], nowS: number) => ms.filter((m) => !m.score && m.t > nowS - 3 * 3600).sort((a, b) => a.t - b.t);

function MatchRow({ m, teams }: { m: Match; teams: Esports["teams"] }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const name = (s: Match["a"]) => s.short || s.name || t.es.tbd;
  const won = m.score ? (m.score[0] > m.score[1] ? "a" : "b") : null;
  return (
    <li className="c2-es-m">
      <span className="c2-es-m-t">{localTime(m.t, lang)}</span>
      <span className={`c2-es-m-a${won === "b" ? " is-lost" : ""}${m.a.slug ? "" : " is-tbd"}`}>
        {name(m.a)} {m.a.slug && <TeamLogo lp={m.a.slug} name={m.a.name} teams={teams} size={24} />}
      </span>
      <span className="c2-es-m-s">{m.score ? `${m.score[0]}–${m.score[1]}` : "vs"}</span>
      <span className={`c2-es-m-b${won === "a" ? " is-lost" : ""}${m.b.slug ? "" : " is-tbd"}`}>
        {m.b.slug && <TeamLogo lp={m.b.slug} name={m.b.name} teams={teams} size={24} />} {name(m.b)}
      </span>
      <small className="c2-es-m-x">
        {m.tour.name}
        {m.bo && !m.score ? ` · ${t.es.bo(m.bo)}` : ""}
      </small>
    </li>
  );
}

function useMatches() {
  return useLoad("matches", peekMatches, loadMatches);
}

function MatchesPanel({ d }: { d: Esports }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const ms = useMatches();
  const list = ms.value ? pending(ms.value.matches, Date.now() / 1000).slice(0, 16) : [];
  return (
    <section className="c2-panel c2-es-rail">
      <h2 className="c2-h2">{t.es.next}</h2>
      {ms.failed ? (
        <p className="c2-dim">{t.es.matchesError}</p>
      ) : !ms.value ? (
        <p className="c2-dim">{t.es.loadingMatches}</p>
      ) : !list.length ? (
        <p className="c2-dim">{t.es.noMatches}</p>
      ) : (
        byLocalDay(list, lang, new Date(), t.es).map((g) => (
          <Fragment key={g.key}>
            <h3 className="c2-es-day">{g.label}</h3>
            <ul className="c2-es-ms">
              {g.items.map((m, i) => (
                <MatchRow key={`${m.t}-${i}`} m={m} teams={d.teams} />
              ))}
            </ul>
          </Fragment>
        ))
      )}
    </section>
  );
}

function Results({ d }: { d: Esports }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const ms = useMatches();
  const list = ms.value ? ms.value.matches.filter((m) => m.score).sort((a, b) => b.t - a.t).slice(0, 10) : [];
  return (
    <section className="c2-panel">
      <h2 className="c2-h2">{t.es.results}</h2>
      {ms.failed ? (
        <p className="c2-dim">{t.es.matchesError}</p>
      ) : !ms.value ? (
        <p className="c2-dim">{t.es.loadingMatches}</p>
      ) : (
        byLocalDay(list, lang, new Date(), t.es).map((g) => (
          <Fragment key={g.key}>
            <h3 className="c2-es-day">{g.label}</h3>
            <ul className="c2-es-ms">
              {g.items.map((m, i) => (
                <MatchRow key={`${m.t}-${i}`} m={m} teams={d.teams} />
              ))}
            </ul>
          </Fragment>
        ))
      )}
    </section>
  );
}

function Tours({ tours }: { tours: TourRow[] }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const num = useNum();
  const day = (s: string | null) => (s ? fmtDate(s, lang, { day: "numeric", month: "short" }) : "?");
  return (
    <section className="c2-panel">
      <h2 className="c2-h2">{t.es.tournaments}</h2>
      {(["ongoing", "upcoming", "concluded"] as const).map((st) => {
        const rows = tours.filter((x) => x.state === st);
        return rows.length ? (
          <Fragment key={st}>
            <h3 className="c2-es-day">{t.es[st]}</h3>
            <ul className="c2-es-tours">
              {rows.map((x) => (
                <li key={x.slug}>
                  <b>{x.name}</b>
                  <span className="c2-dim">
                    {day(x.start)} – {day(x.end)}
                    {x.location ? ` · ${x.location}` : ""}
                  </span>
                  <span className="c2-num">{x.prize != null ? `US$ ${num(x.prize, 0)}` : ""}</span>
                </li>
              ))}
            </ul>
          </Fragment>
        ) : null;
      })}
    </section>
  );
}

/** El movimiento desde el mes anterior: "▲ 3", "▼ 2", "=" o "nuevo". */
export function moveLabel(r: Pick<VrsRow, "rank" | "prev">, isNew: string): { text: string; dir: "up" | "down" | "eq" } {
  if (r.prev == null) return { text: isNew, dir: "up" };
  const d = r.prev - r.rank;
  return d > 0 ? { text: `▲ ${d}`, dir: "up" } : d < 0 ? { text: `▼ ${-d}`, dir: "down" } : { text: "=", dir: "eq" };
}

function VrsBlock({ d }: { d: Esports }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const num = useNum();
  const [region, setRegion] = useState<Region>("global");
  const [open, setOpen] = useState<string | null>(null);
  const rows = d.vrs[region];
  const day = (s: string) => fmtDate(s, lang, { day: "numeric", month: "long" });
  return (
    <section className="c2-panel c2-es-vrs">
      <div className="c2-es-vrs-h">
        <div>
          <h2 className="c2-h2">{t.es.vrsOf(day(d.vrs.date))}</h2>
          <p className="c2-dim">{t.es.vrsLede}</p>
        </div>
        <div className="c2-es-regions" role="tablist">
          {(["global", "europe", "americas", "asia"] as const).map((r) => (
            <button key={r} type="button" role="tab" aria-selected={r === region} className={`c2-btn${r === region ? "" : " is-ghost"}`} onClick={() => (setRegion(r), setOpen(null))}>
              {t.es.regions[r]}
            </button>
          ))}
        </div>
      </div>
      <table className="c2-es-table">
        <thead>
          <tr>
            <th>{t.es.rank}</th>
            <th>{t.es.team}</th>
            {region === "global" && d.vrs.before && <th>{t.es.since(day(d.vrs.before))}</th>}
            <th className="c2-num">{t.es.points}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mv = moveLabel(r, t.es.isNew);
            const isOpen = open === r.team;
            return (
              <Fragment key={r.team}>
                <tr className={`c2-es-vr${isOpen ? " is-open" : ""}`} onClick={() => setOpen(isOpen ? null : r.team)}>
                  <td className="c2-es-rank">{r.rank}</td>
                  <td>
                    <button type="button" className="c2-es-team" aria-expanded={isOpen}>
                      <TeamLogo lp={r.lp} name={r.team} teams={d.teams} size={32} />
                      <span>
                        <b>{r.team}</b>
                        <small>{r.roster.join(", ")}</small>
                      </span>
                    </button>
                  </td>
                  {region === "global" && d.vrs.before && <td className={`c2-es-mv is-${mv.dir}`}>{mv.text}</td>}
                  <td className="c2-num c2-es-pts">{num(r.pts, 0)}</td>
                </tr>
                {isOpen && (
                  <tr className="c2-es-why">
                    <td colSpan={region === "global" && d.vrs.before ? 4 : 3}>
                      <Why r={r} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Why({ r }: { r: VrsRow }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const num = useNum();
  const w = r.why;
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${num(Math.abs(v), 1)}`;
  return (
    <div className="c2-es-whybox">
      <b className="c2-es-why-t">{t.es.whyTitle(r.team, num(r.pts, 0))}</b>
      {w.start != null && <p>{t.es.whyStart(num(w.start, 0))}</p>}
      <ul className="c2-es-factors">
        {(["bounty_offered", "bounty_collected", "network", "lan"] as const).map((k) =>
          w.factors[k] != null ? (
            <li key={k}>
              <span>{t.es.factors[k]}</span>
              <span className="c2-es-bar" aria-hidden="true">
                <i style={{ width: `${Math.round(w.factors[k]! * 100)}%` }} />
              </span>
              <span className="c2-num">{num(w.factors[k]! * 100, 0)}&#8201;%</span>
            </li>
          ) : null,
        )}
      </ul>
      {w.h2h != null && <p>{t.es.whyH2h(signed(w.h2h))}</p>}
      {w.matches.length > 0 && (
        <>
          <p className="c2-dim">{t.es.whyMatches}</p>
          <ul className="c2-es-last">
            {w.matches.map((m, i) => (
              <li key={i} className={m.won ? "is-won" : "is-lost"}>
                {m.won ? t.es.won(m.opp) : t.es.lost(m.opp)} · {fmtDate(m.date, lang, { day: "numeric", month: "short" })}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
