/**
 * La ficha de un torneo de CS2 (2026-11-03, etapa 6b): sus datos (nivel, fechas, premio, sede, organizador), la
 * transmisión si se está jugando, los equipos que participan y los partidos por día, cada uno con sus mapas y las
 * rondas de cada mitad (defendiendo o atacando). Viene de la llave de la página principal del torneo en Liquipedia.
 */
import { Fragment, useState } from "react";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCs2Copy } from "../../cs2Copy";
import { useLoad } from "../../useLoad";
import { fmtDate } from "../patches/names";
import { Cs2Loading, useNum, type Nav } from "../ui";
import { localTime, Twitch, useMounted } from "./parts";
import { loadIndex, loadTour, lpSlug, peekIndex, peekTour, type BracketMatch, type EsIndex, type Tour } from "./teams/data";

export default function TourView({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail!;
  const idx = useLoad("index", peekIndex, loadIndex);
  const tour = useLoad(slug, () => peekTour(slug), () => loadTour(slug));
  if (idx.failed || tour.failed) return <Cs2Loading onRetry={idx.failed ? idx.retry : tour.retry} />;
  if (!idx.value || tour.value === undefined) return <Cs2Loading />;
  if (!tour.value) return <TourMissing route={route} navigate={navigate} />;
  return <TourPage tour={tour.value} idx={idx.value} route={route} navigate={navigate} />;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Un torneo que todavía no tiene ficha (no se leyó): lo dice y lleva a la portada de Torneos. */
function TourMissing({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  return (
    <main className="c2-main">
      <p className="c2-panel">
        {t.es.tourMissing}{" "}
        <RouteLink to={{ ...route, view: "cs2", c2Section: "esports", detail: undefined }} onNavigate={navigate}>
          {t.tabs.esports}
        </RouteLink>
      </p>
    </main>
  );
}

/** Las rondas de cada mitad en texto: "8 defendiendo · 4 atacando · 3 + 1 en el alargue". */
function halves(h: [string, number][], words: { ct: string; t: string }): string {
  return h.map(([side, n]) => `${n} ${side === "ct" ? words.ct : words.t}`).join(" · ");
}

/** La hora en UTC, con la sigla: lo que sale en el HTML antes de saber la zona de quien mira. */
const utcTime = (t: number) => `${new Date(t * 1000).toISOString().slice(11, 16)} UTC`;
/** El día de un partido: el local si ya se sabe la zona de quien mira, si no el de UTC. */
const dayOf = (t: number, local: boolean) => {
  const d = new Date(t * 1000);
  return local ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : d.toISOString().slice(0, 10);
};

function MatchCard({ m, idx, route, navigate, local }: { m: BracketMatch; idx: EsIndex; route: Route; navigate: Nav; local: boolean }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const teams = new Map(idx.teams.map((x) => [x.slug, x]));
  const wa = m.maps.filter((x) => (x.a == null ? x.ff === "a" : x.a > x.b!)).length;
  const wb = m.maps.length - wa;
  const side = (name: string, lp: string | null, won: boolean) => {
    const slug = lp ? lpSlug(lp) : null;
    const known = slug ? teams.get(slug) : undefined;
    const label = (
      <>
        {known?.logo && <img className="c2-logo" src={`/cs2/t/${known.logo}.webp`} alt="" width={24} height={24} loading="lazy" decoding="async" />} {name}
      </>
    );
    return (
      <span className={`c2-tr-side${won ? "" : " is-lost"}`}>
        {known ? <RouteLink to={{ ...route, view: "cs2", c2Section: "teams", detail: slug! }} onNavigate={navigate}>{label}</RouteLink> : label}
      </span>
    );
  };
  return (
    <li className="c2-tr-m">
      <span className="c2-tr-time">{local ? localTime(m.t, lang) : utcTime(m.t)}</span>
      {side(m.a, m.a_lp, wa > wb)}
      <span className="c2-tr-score">
        {wa}–{wb}
      </span>
      {side(m.b, m.b_lp, wb > wa)}
      <button type="button" className="c2-tr-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "−" : "+"} {t.tm.maps}
      </button>
      {open && (
        <ul className="c2-tr-maps">
          {m.maps.map((x, i) => (
            <li key={i}>
              <b>{x.map}</b>
              <span className="c2-num">{x.a == null ? (x.ff === "a" ? "W–FF" : "FF–W") : `${x.a}–${x.b}`}</span>
              {x.ha.length > 0 && (
                <small>
                  {m.a}: {halves(x.ha, { ct: t.tm.defending, t: t.tm.attacking })} — {m.b}: {halves(x.hb, { ct: t.tm.defending, t: t.tm.attacking })}
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function TourPage({ tour, idx, route, navigate }: { tour: Tour; idx: EsIndex; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const { lang } = useLang();
  const num = useNum();
  const day = (s: string | null) => (s ? fmtDate(s, lang, { day: "numeric", month: "long" }) : "");
  const local = useMounted();
  const byDay = new Map<string, BracketMatch[]>();
  for (const m of [...tour.matches].sort((a, b) => b.t - a.t)) {
    const k = dayOf(m.t, local);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(m);
  }
  const teams = new Map(idx.teams.map((x) => [x.slug, x]));
  return (
    <main className="c2-main c2-tm">
      <header className="c2-tm-hero c2-tr-hero">
        <div className="c2-tm-hero-t">
          <p className="c2-tm-sub">
            <RouteLink to={{ ...route, view: "cs2", c2Section: "esports", detail: undefined }} onNavigate={navigate}>
              {t.tabs.esports}
            </RouteLink>
            {tour.state === "ongoing" && <span className="c2-es-live-tag">{t.es.live}</span>}
          </p>
          <h1 className="c2-tm-name">{tour.name}</h1>
          <p className="c2-tm-sub">
            {tour.tier && <b>{tour.tier}-Tier</b>}
            {tour.start && tour.end && <span>{t.es.dates(day(tour.start), day(tour.end))}</span>}
            {tour.prize != null && (
              <span>
                <b>US$ {num(tour.prize, 0)}</b> {t.es.prize}
              </span>
            )}
            {(tour.location || tour.venue) && <span>{[tour.location, tour.venue].filter(Boolean).join(", ")}</span>}
            {tour.organizer && (
              <span>
                {t.es.organizer} <b>{tour.organizer}</b>
              </span>
            )}
          </p>
        </div>
      </header>
      {tour.state === "ongoing" && tour.streams[0] && <Twitch channel={tour.streams[0]} title={tour.name} />}
      {tour.teams.length > 0 && (
        <section className="c2-panel">
          <h2 className="c2-h2">{t.tm.participants}</h2>
          <ul className="c2-tr-teams">
            {tour.teams.map((lp) => {
              const x = teams.get(lpSlug(lp));
              return (
                <li key={lp}>
                  {x ? (
                    <RouteLink to={{ ...route, view: "cs2", c2Section: "teams", detail: x.slug }} onNavigate={navigate}>
                      {x.logo && <img className="c2-logo" src={`/cs2/t/${x.logo}.webp`} alt="" width={28} height={28} loading="lazy" decoding="async" />}
                      {x.name}
                    </RouteLink>
                  ) : (
                    <span>{lp.replace(/_/g, " ")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="c2-panel">
        <h2 className="c2-h2">{t.tm.stage}</h2>
        {byDay.size === 0 ? (
          <p className="c2-dim">{t.es.noMatches}</p>
        ) : (
          [...byDay].map(([k, ms]) => (
            <Fragment key={k}>
              <h3 className="c2-es-day">{cap(fmtDate(k, lang, { weekday: "long", day: "numeric", month: "long" }))}</h3>
              <ul className="c2-tr-ms">
                {ms.map((m, i) => (
                  <MatchCard key={i} m={m} idx={idx} route={route} navigate={navigate} local={local} />
                ))}
              </ul>
            </Fragment>
          ))
        )}
      </section>
      <p className="c2-note">{t.tm.credit}</p>
    </main>
  );
}
