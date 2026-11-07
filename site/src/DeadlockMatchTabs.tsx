import { useMemo, useState } from "react";
import type { Lang } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { text } from "./localized";
import type { MatchPlayer, ParsedMatch, SteamAccount } from "./deadlockMatch";
import { heroImg, heroName } from "./deadlockReportData";
import { bandRangeOf } from "./deadlockVsBand";
import GameImg from "./GameImg";
import { MATCH_TABS_COPY, type MatchTab } from "./deadlockMatchTabsCopy";
import {
  chanceCurve,
  chanceOn,
  keyMoments,
  sampleNear,
  type ComebackTable,
  type Moment,
} from "./deadlockWinChance";
import comebacksJson from "@deadlock/comebacks.json";

/**
 * Las pestañas de una partida que no son el informe: chance de ganar, líneas y
 * todas las cifras. Van en su propio pedazo de JS (las carga `DeadlockReport`
 * con `lazy`): quien abre una partida para ver su nota no baja la tabla de
 * remontadas.
 */

const comebacks = comebacksJson as unknown as ComebackTable & { bands: Record<string, { matches: number }> };

const TEAM = ["Hidden King", "Archmother"] as const;

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const corto = (x: number, lang: Lang): string => {
  if (Math.abs(x) >= 1000) return `${(x / 1000).toLocaleString(lang, { maximumFractionDigits: 1 })}k`;
  return Math.round(x).toLocaleString(lang);
};

function usePlayerName(names: Map<number, SteamAccount>, lang: Lang) {
  return (p: MatchPlayer) => {
    const n = heroName(p.heroId);
    return names.get(p.accountId)?.name ?? (n ? text(n, lang, "") : String(p.heroId));
  };
}

function useHeroName(lang: Lang) {
  return (heroId: number) => {
    const n = heroName(heroId);
    return n ? text(n, lang, "") : String(heroId);
  };
}

/* ── Chance de ganar ──────────────────────────────────────────────────────── */

function WinChance({ match, lang }: { match: ParsedMatch; lang: Lang }) {
  const copy = useCopy();
  const c = MATCH_TABS_COPY[lang].chance;
  const rango = bandRangeOf(match.badge);
  const bandId = rango && comebacks.bands[rango.band] ? rango.band : "all";
  const band = comebacks.bands[bandId] as ComebackTable["bands"][string];
  const curve = useMemo(() => chanceCurve(match, band, comebacks), [match, band]);
  const momentos = useMemo(() => keyMoments(match, curve), [match, curve]);
  // Sólo las peleas que se cuentan abajo: todas las de 3+ muertes eran una
  // decena de franjas y el gráfico parecía un código de barras.
  const peleas = momentos.flatMap((m) => (m.kind === "fight" ? [m.fight] : []));
  const [señalado, setSeñalado] = useState<number | null>(null);

  const W = 700;
  const H = 200;
  const maxT = curve[curve.length - 1]?.t || match.durationS;
  const x = (t: number) => (t / maxT) * W;
  const y = (p: number) => H - p * H;
  const linea = curve.map((pt) => `${x(pt.t).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" L");
  const area = `M0,${H / 2} L${linea} L${x(maxT).toFixed(1)},${H / 2} Z`;

  const t = señalado ?? maxT;
  const p = chanceOn(curve, t);
  const favorito = p >= 0.5 ? 0 : 1;

  const señalar = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    setSeñalado(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * maxT);
  };

  // Lo que se dice abajo del gráfico: el pico del ganador o la remontada.
  const ganador = match.winningTeam === 0 ? 0 : 1;
  const chanceDe = (team: number, q: number) => (team === 0 ? q : 1 - q);
  const peor = curve.reduce((m, pt) => Math.min(m, chanceDe(ganador, pt.p)), 1);
  const resumen =
    peor < 0.4 ? c.upset(TEAM[ganador], peor) : (() => {
      const pico = curve.reduce((m, pt) => (chanceDe(ganador, pt.p) > chanceDe(ganador, m.p) ? pt : m), curve[0]);
      return c.peak(TEAM[ganador], chanceDe(ganador, pico.p), pico.t);
    })();

  const bandName = bandId === "all" ? "" : copy.deadlock.bands[bandId as keyof typeof copy.deadlock.bands];

  return (
    <section className="box dl-rep-block">
      <div className="box-head">
        <h2 className="box-title">{c.title}</h2>
      </div>
      <p className="detail-note dl-chance-lead">{c.lead}</p>
      <div className="dl-lead dl-chance">
        <p className="dl-lead-read" data-side={favorito === 0 ? "amber" : "sapphire"}>
          <b>{c.read(t, TEAM[favorito], favorito === 0 ? p : 1 - p)}</b>
        </p>
        <div className="dl-chance-frame">
          <span className="dl-chance-team is-amber">Hidden King</span>
          <svg
            className="dl-lead-chart dl-chance-chart"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={resumen}
            onPointerMove={señalar}
            onPointerDown={señalar}
            onPointerLeave={() => setSeñalado(null)}
          >
            <defs>
              <clipPath id="dl-chance-up">
                <rect x={0} y={0} width={W} height={H / 2} />
              </clipPath>
              <clipPath id="dl-chance-down">
                <rect x={0} y={H / 2} width={W} height={H / 2} />
              </clipPath>
            </defs>
            {peleas.map((f) => (
              <rect
                key={f.start}
                className="dl-chance-fight"
                x={x(f.start) - 2}
                width={Math.max(4, x(f.end) - x(f.start) + 4)}
                y={0}
                height={H}
              />
            ))}
            <path d={area} className="dl-lead-area is-amber" clipPath="url(#dl-chance-up)" />
            <path d={area} className="dl-lead-area is-sapphire" clipPath="url(#dl-chance-down)" />
            <polyline points={linea.replace(/ L/g, " ")} className="dl-chance-line" />
            <line className="dl-lead-zero" x1={0} x2={W} y1={H / 2} y2={H / 2} />
            {señalado !== null && <line className="dl-lead-guide" x1={x(t)} x2={x(t)} y1={0} y2={H} />}
          </svg>
          <span className="dl-chance-team is-sapphire">Archmother</span>
        </div>
        <p className="dl-lead-axis" aria-hidden="true">
          <span>0:00</span>
          <span className="dl-chance-legend">
            <i className="dl-chance-swatch" /> {c.fightMark}
          </span>
          <span>{mmss(maxT)}</span>
        </p>
        <p className="dl-chance-summary">{resumen}</p>
      </div>

      <h3 className="dl-rep-sub">{c.momentsTitle}</h3>
      {momentos.length === 0 ? (
        <p className="detail-note">{c.noMoments}</p>
      ) : (
        <ol className="dl-moments">
          {momentos.map((m) => (
            <MomentRow key={`${m.kind}-${m.t}`} m={m} lang={lang} />
          ))}
        </ol>
      )}
      <p className="dl-tier-note">{c.how(band.matches.toLocaleString(lang), bandName)}</p>
    </section>
  );
}

function MomentRow({ m, lang }: { m: Moment; lang: Lang }) {
  const c = MATCH_TABS_COPY[lang].chance;
  let side: "amber" | "sapphire" | "even" = "even";
  let line = "";
  let extra: string | null = null;
  if (m.kind === "fight") {
    const [a, b] = m.fight.deaths;
    if (m.winner === null) line = c.fightEven(a);
    else {
      side = m.winner === 0 ? "amber" : "sapphire";
      // El ganador perdió menos: "3 a 1" es mató 3, perdió 1.
      line = c.fight(TEAM[m.winner], m.winner === 0 ? a : b, m.winner === 0 ? b : a);
    }
    const pts = Math.round(m.swing * 100);
    if (Math.abs(pts) >= 3) extra = c.swing(pts >= 0 ? TEAM[0] : TEAM[1], Math.abs(pts));
  } else if (m.kind === "flip") {
    side = m.leader === 0 ? "amber" : "sapphire";
    line = c.flip(TEAM[m.leader]);
  } else {
    if (m.team === 0 || m.team === 1) {
      side = m.team === 0 ? "amber" : "sapphire";
      line = c.midboss(TEAM[m.team]);
    } else line = c.midbossNone;
  }
  return (
    <li className="dl-moment" data-side={side}>
      <span className="dl-moment-time">{mmss(m.t)}</span>
      <span className="dl-moment-text">{line}</span>
      {extra && <span className="dl-moment-swing">{extra}</span>}
    </li>
  );
}

/* ── Líneas ───────────────────────────────────────────────────────────────── */

/** El minuto en que se mide la línea: el de la muestra de ~9 minutos. */
const LANE_T = 540;

function Lanes({ match, names, lang }: { match: ParsedMatch; names: Map<number, SteamAccount>; lang: Lang }) {
  const c = MATCH_TABS_COPY[lang].lanes;
  const nombre = usePlayerName(names, lang);
  const heroe = useHeroName(lang);
  const lanes = [1, 4, 6].filter((l) => match.players.some((p) => p.lane === l));

  if (lanes.length === 0)
    return (
      <section className="box dl-rep-block">
        <p className="detail-note">{c.noLanes}</p>
      </section>
    );

  const at = (p: MatchPlayer) => sampleNear(p.samples, LANE_T, LANE_T + 60);
  const minuto = Math.round((at(match.players[0])?.time_stamp_s ?? LANE_T) / 60);

  const lecturas = lanes.map((lane) => {
    const lados = [0, 1].map((team) => {
      const ps = match.players.filter((p) => p.team === team && p.lane === lane);
      const souls = ps.reduce((s, p) => s + Number(at(p)?.net_worth ?? 0), 0);
      return { team, ps, souls };
    });
    const [a, b] = lados;
    const mean = (a.souls + b.souls) / 2;
    const rel = mean > 0 ? Math.abs(a.souls - b.souls) / mean : 0;
    const winner = rel < 0.05 ? null : a.souls > b.souls ? 0 : 1;
    return { lane, lados, winner, rel, diff: Math.abs(a.souls - b.souls) };
  });

  const porEquipo = [0, 1].map((t) => lecturas.filter((l) => l.winner === t).length);

  return (
    <section className="box dl-rep-block">
      <div className="box-head">
        <h2 className="box-title">{c.title}</h2>
      </div>
      <p className="detail-note">{c.lead(minuto)}</p>
      <p className="dl-lanes-summary">
        {porEquipo[0] !== porEquipo[1]
          ? c.summary(TEAM[porEquipo[0] > porEquipo[1] ? 0 : 1], Math.max(...porEquipo))
          : null}{" "}
        {c.later(TEAM[match.winningTeam === 0 ? 0 : 1])}
      </p>
      <div className="dl-lanes">
        {lecturas.map((l) => (
          <article className="dl-lane" key={l.lane} data-lane={l.lane}>
            <h3 className="dl-lane-name">{c.names[l.lane] ?? l.lane}</h3>
            <p className="dl-lane-verdict" data-side={l.winner === null ? "even" : l.winner === 0 ? "amber" : "sapphire"}>
              {l.winner === null ? c.even : c.won(TEAM[l.winner], corto(l.diff, lang), l.rel)}
            </p>
            <p className="dl-lane-legend" aria-hidden="true">
              <span>{c.souls}</span>
              <span>{c.kda}</span>
              <span>{c.lh}</span>
            </p>
            <div className="dl-lane-sides">
              {l.lados.map((lado) => (
                <div className={`dl-lane-side ${lado.team === 0 ? "is-amber" : "is-sapphire"}`} key={lado.team}>
                  <p className="dl-lane-team">
                    <span>{TEAM[lado.team]}</span>
                    <b>{corto(lado.souls, lang)}</b>
                  </p>
                  <ul>
                    {lado.ps.map((p) => {
                      const s = at(p);
                      return (
                        <li key={p.slot} className="dl-lane-player">
                          <GameImg src={heroImg(p.heroId) ?? ""} alt={heroe(p.heroId)} width={32} height={32} loading="lazy" decoding="async" />
                          <span className="dl-lane-who">
                            <span className="dl-lane-pname">{nombre(p)}</span>
                            <span className="dl-lane-hero">{heroe(p.heroId)}</span>
                          </span>
                          <span className="dl-lane-stats">
                            <span title={c.souls}>{corto(Number(s?.net_worth ?? 0), lang)}</span>
                            <span title={c.kda}>
                              {Number(s?.kills ?? 0)}/{Number(s?.deaths ?? 0)}/{Number(s?.assists ?? 0)}
                            </span>
                            <span title={c.lh}>{Number(s?.creep_kills ?? 0)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── Todas las cifras ─────────────────────────────────────────────────────── */

type ColKey = keyof (typeof MATCH_TABS_COPY)["en"]["numbers"]["cols"];

interface Col {
  key: ColKey;
  value: (p: MatchPlayer, last: Record<string, number>) => number;
  /** Menos es mejor (muertes, almas perdidas). */
  low?: boolean;
  /** Ni más ni menos es mejor (daño recibido): no se marca. */
  neutral?: boolean;
  share?: boolean;
}

const GROUPS: { id: keyof (typeof MATCH_TABS_COPY)["en"]["numbers"]["groups"]; cols: Col[] }[] = [
  {
    id: "fight",
    cols: [
      { key: "kills", value: (p) => p.kills },
      { key: "deaths", value: (p) => p.deaths, low: true },
      { key: "assists", value: (p) => p.assists },
      { key: "damage", value: (_p, s) => s.player_damage ?? 0 },
      { key: "taken", value: (_p, s) => s.player_damage_taken ?? 0, neutral: true },
    ],
  },
  {
    id: "kills",
    cols: [
      { key: "gun", value: (_p, s) => s.bullet_kills ?? 0 },
      { key: "ability", value: (_p, s) => s.ability_kills ?? 0 },
      { key: "melee", value: (_p, s) => s.melee_kills ?? 0 },
      { key: "headshot", value: (_p, s) => s.headshot_kills ?? 0 },
      {
        key: "accuracy",
        share: true,
        value: (_p, s) => {
          const tiros = (s.shots_hit ?? 0) + (s.shots_missed ?? 0);
          return tiros > 0 ? (s.shots_hit ?? 0) / tiros : 0;
        },
      },
    ],
  },
  {
    id: "souls",
    cols: [
      { key: "souls", value: (p) => p.netWorth },
      { key: "lastHits", value: (p) => p.lastHits },
      { key: "denies", value: (p) => p.denies },
      { key: "jungle", value: (_p, s) => s.neutral_kills ?? 0 },
      { key: "lost", value: (_p, s) => s.gold_death_loss ?? 0, low: true },
    ],
  },
  {
    id: "support",
    cols: [
      { key: "objective", value: (_p, s) => s.boss_damage ?? 0 },
      { key: "allyHeal", value: (_p, s) => s.teammate_healing ?? 0 },
      { key: "barrier", value: (_p, s) => s.teammate_barriering ?? 0 },
      { key: "prevented", value: (_p, s) => s.heal_prevented ?? 0 },
    ],
  },
];

function Numbers({ match, names, lang }: { match: ParsedMatch; names: Map<number, SteamAccount>; lang: Lang }) {
  const copy = useCopy();
  const c = MATCH_TABS_COPY[lang].numbers;
  const nombre = usePlayerName(names, lang);
  const heroe = useHeroName(lang);
  // El ganador arriba, como en el tablero.
  const orden = [match.winningTeam === 1 ? 1 : 0, match.winningTeam === 1 ? 0 : 1];
  const filas = orden.flatMap((t) => match.players.filter((p) => p.team === t));
  const ultima = (p: MatchPlayer) => p.samples[p.samples.length - 1] ?? {};

  const fmt = (v: number, col: Col) =>
    col.share
      ? `${(v * 100).toLocaleString(lang, { maximumFractionDigits: 0 })}%`
      : Math.abs(v) >= 10_000
        ? corto(v, lang)
        : Math.round(v).toLocaleString(lang);

  return (
    <section className="dl-numbers">
      <p className="detail-note">{c.lead}</p>
      {GROUPS.map((g) => {
        const valores = filas.map((p) => g.cols.map((col) => col.value(p, ultima(p))));
        const mejor = g.cols.map((col, i) => {
          const vs = valores.map((v) => v[i]);
          return col.low ? Math.min(...vs) : Math.max(...vs);
        });
        return (
          <div className="box dl-numbers-box" key={g.id}>
            <h2 className="box-title">{c.groups[g.id]}</h2>
            <table className="dl-numbers-table">
              <thead>
                <tr>
                  <th scope="col">{c.player}</th>
                  {g.cols.map((col) => (
                    <th scope="col" key={col.key}>
                      {c.cols[col.key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((p, r) => [
                  r % 6 === 0 && (
                    <tr key={`team-${p.team}`} className={`dl-numbers-teamrow ${p.team === 0 ? "is-amber" : "is-sapphire"}`}>
                      <th scope="colgroup" colSpan={g.cols.length + 1}>
                        {p.team === match.winningTeam ? copy.deadlock.report.win : copy.deadlock.report.loss} · {TEAM[p.team === 0 ? 0 : 1]}
                      </th>
                    </tr>
                  ),
                  <tr key={p.slot} className={p.team === 0 ? "is-amber" : "is-sapphire"}>
                    <th scope="row">
                      <span className="dl-numbers-who">
                        <GameImg src={heroImg(p.heroId) ?? ""} alt={heroe(p.heroId)} width={24} height={24} loading="lazy" decoding="async" />
                        <span className="dl-numbers-name">{nombre(p)}</span>
                      </span>
                    </th>
                    {g.cols.map((col, i) => {
                      const v = valores[r][i];
                      const top = !g.cols[i].neutral && v === mejor[i] && v !== 0;
                      return (
                        <td key={col.key} className={top ? "is-top" : undefined}>
                          {fmt(v, col)}
                        </td>
                      );
                    })}
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}

export default function DeadlockMatchTabs({
  tab,
  match,
  names,
  lang,
}: {
  tab: Exclude<MatchTab, "report">;
  match: ParsedMatch;
  names: Map<number, SteamAccount>;
  lang: Lang;
}) {
  if (tab === "win-chance") return <WinChance match={match} lang={lang} />;
  if (tab === "lanes") return <Lanes match={match} names={names} lang={lang} />;
  return <Numbers match={match} names={names} lang={lang} />;
}
