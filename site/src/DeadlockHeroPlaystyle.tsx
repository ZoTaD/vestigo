import { useEffect, useState } from "react";
import { useLang, useLocale, type Lang } from "./i18n";
import type { BandId } from "./deadlockData";

/**
 * "Cómo juega" en la ficha de Héroes: cómo mata, cuándo mata, de dónde saca las
 * almas y cuánto aguanta o ayuda, cada cosa contra los otros 43 héroes; y la
 * tendencia de las últimas 8 semanas en la banda elegida.
 *
 * Sale de `hero-playstyle.json` (pipeline `heroPlaystyle.ts`, diario), que se
 * pide al llegar a la ficha (~37 KB).
 */

interface Souls {
  heroes: number;
  lane: number;
  jungle: number;
  objectives: number;
  other: number;
}

interface PlaystyleHero {
  n: number;
  gun: number;
  ability: number;
  melee: number;
  headshot: number;
  early: number;
  late: number;
  mitigated: number;
  allyHeal: number;
  healPrevented: number;
  souls: Souls;
}

type TrendPoint = [number, number, number] | null;

interface PlaystyleFile {
  from: string;
  to: string;
  matches: number;
  heroes: Record<string, PlaystyleHero>;
  weeks: number[];
  trend: Partial<Record<BandId, Record<string, TrendPoint[]>>>;
}

let pedido: Promise<PlaystyleFile | null> | null = null;

function usePlaystyle(): PlaystyleFile | null | undefined {
  const [file, set] = useState<PlaystyleFile | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    pedido ??= import("@deadlock/hero-playstyle.json").then(
      (m) => m.default as unknown as PlaystyleFile,
      () => null
    );
    pedido.then((f) => vivo && set(f));
    return () => {
      vivo = false;
    };
  }, []);
  return file;
}

const COPY = {
  en: {
    kicker: "Playstyle",
    title: "How they play",
    lead: (n: string, from: string, to: string) =>
      `${n} ranked matches of every rank, ${from} to ${to}, compared with the other heroes. Matches under 15 minutes are left out.`,
    rank: (r: number, of: number) => `#${r} of ${of}`,
    kills: {
      title: "How they get kills",
      gun: "Gun",
      ability: "Abilities",
      melee: "Melee",
      avg: "Average",
      more: (what: string, beat: number, of: number) => `Gets more of its kills with ${what} than ${beat} of ${of} heroes.`,
      headshot: (p: string) => `${p} of its kills are headshots`,
      noHeadshot: "None of its kills are headshots.",
      what: { gun: "the gun", ability: "abilities", melee: "melee" } as Record<"gun" | "ability" | "melee", string>,
    },
    timing: {
      title: "When they get kills",
      early: "Before minute 15",
      late: "After minute 15",
      perGame: "kills per match",
      earlier: (beat: number, of: number) => `Kills earlier than ${beat} of ${of} heroes.`,
      later: (beat: number, of: number) => `Kills later than ${beat} of ${of} heroes: a hero that grows into the match.`,
    },
    souls: {
      title: "Where the souls come from",
      parts: { heroes: "Heroes", lane: "Lane troopers", jungle: "Jungle", objectives: "Objectives", other: "Other" } as Record<keyof Souls, string>,
      avg: "Average",
      most: (what: string, p: string, avg: string) => `Takes ${p} of its souls from ${what}, against ${avg} for the average hero.`,
      lower: { heroes: "heroes", lane: "lane troopers", jungle: "the jungle", objectives: "objectives", other: "other sources" } as Record<keyof Souls, string>,
    },
    support: {
      title: "Toughness and support",
      mitigated: "Damage mitigated per minute",
      allyHeal: "Healing and barriers on allies per minute",
      healPrevented: "Enemy healing prevented per match",
    },
    trend: {
      title: "The last 8 weeks",
      lead: (band: string) => `Win rate and pick rate per week in ${band} lobbies. The last week is still going.`,
      wr: "Win rate",
      pick: "Picked in",
      week: (d: string) => `Week of ${d}`,
      none: "Not enough matches in this band.",
    },
  },
  es: {
    kicker: "Estilo",
    title: "Cómo juega",
    lead: (n: string, from: string, to: string) =>
      `${n} clasificatorias de todos los rangos, del ${from} al ${to}, comparado con los demás héroes. Las partidas de menos de 15 minutos quedan afuera.`,
    rank: (r: number, of: number) => `#${r} de ${of}`,
    kills: {
      title: "Cómo consigue las kills",
      gun: "Arma",
      ability: "Habilidades",
      melee: "Cuerpo a cuerpo",
      avg: "Promedio",
      more: (what: string, beat: number, of: number) => `Consigue más kills con ${what} que ${beat} de ${of} héroes.`,
      headshot: (p: string) => `${p} de sus kills son tiros a la cabeza`,
      noHeadshot: "Ninguna de sus kills es un tiro a la cabeza.",
      what: { gun: "el arma", ability: "habilidades", melee: "cuerpo a cuerpo" },
    },
    timing: {
      title: "Cuándo consigue las kills",
      early: "Antes del minuto 15",
      late: "Después del minuto 15",
      perGame: "kills por partida",
      earlier: (beat: number, of: number) => `Mata más temprano que ${beat} de ${of} héroes.`,
      later: (beat: number, of: number) => `Mata más tarde que ${beat} de ${of} héroes: crece con la partida.`,
    },
    souls: {
      title: "De dónde saca las almas",
      parts: { heroes: "Héroes", lane: "Tropas de la línea", jungle: "Jungla", objectives: "Objetivos", other: "Otras" },
      avg: "Promedio",
      most: (what: string, p: string, avg: string) => `Saca ${p} de sus almas de ${what}, contra ${avg} del héroe promedio.`,
      lower: { heroes: "los héroes", lane: "las tropas de la línea", jungle: "la jungla", objectives: "los objetivos", other: "otras fuentes" },
    },
    support: {
      title: "Aguante y apoyo",
      mitigated: "Daño mitigado por minuto",
      allyHeal: "Curación y barreras a aliados por minuto",
      healPrevented: "Curación rival evitada por partida",
    },
    trend: {
      title: "Las últimas 8 semanas",
      lead: (band: string) => `Winrate y % de elección por semana en salas ${band}. La última semana sigue en curso.`,
      wr: "Winrate",
      pick: "Elegido en",
      week: (d: string) => `Semana del ${d}`,
      none: "No hay suficientes partidas en esta banda.",
    },
  },
} satisfies Record<Lang, unknown>;

const SOUL_KEYS: (keyof Souls)[] = ["lane", "heroes", "jungle", "objectives", "other"];

/** El puesto (1 = el que más) de un héroe en una métrica, y cuántos hay. */
function rankOf(all: Record<string, PlaystyleHero>, heroId: number, value: (h: PlaystyleHero) => number) {
  const vs = Object.values(all).map(value);
  const mine = all[String(heroId)] ? value(all[String(heroId)]) : 0;
  const rank = 1 + vs.filter((v) => v > mine).length;
  return { rank, of: vs.length, beat: vs.filter((v) => v < mine).length };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function Stack({ parts, label }: { parts: { key: string; value: number; name: string }[]; label: string }) {
  const locale = useLocale();
  return (
    <div className="dl-ps-stack-row">
      <span className="dl-ps-stack-label">{label}</span>
      <span className="dl-ps-stack" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${Math.round(p.value * 100)}%`).join(", ")}`}>
        {parts.map((p) => (
          <span key={p.key} className="dl-ps-seg" data-part={p.key} style={{ flexGrow: Math.max(p.value, 0.001) }}>
            {p.value >= 0.09 && `${(p.value * 100).toLocaleString(locale, { maximumFractionDigits: 0 })}%`}
          </span>
        ))}
      </span>
    </div>
  );
}

function Legend({ parts }: { parts: { key: string; name: string }[] }) {
  return (
    <ul className="dl-ps-legend">
      {parts.map((p) => (
        <li key={p.key}>
          <i className="dl-ps-swatch" data-part={p.key} />
          {p.name}
        </li>
      ))}
    </ul>
  );
}

export default function DeadlockHeroPlaystyle({ heroId, heroName, band, bandName }: { heroId: number; heroName: string; band: BandId; bandName: string }) {
  const { lang } = useLang();
  const locale = useLocale();
  const t = COPY[lang];
  const file = usePlaystyle();
  if (!file) return null;
  const me = file.heroes[String(heroId)];
  const todos = Object.values(file.heroes);
  const pct = (x: number) => `${(x * 100).toLocaleString(locale, { maximumFractionDigits: 0 })}%`;
  const dia = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short" });

  const tendencia = file.trend[band]?.[String(heroId)];

  return (
    <section className="dl-hp-block" aria-labelledby="dl-hp-playstyle">
      <div className="dl-hp-head">
        <div>
          <span className="dl-hp-kicker">{t.kicker}</span>
          <h2 className="dl-hp-h2" id="dl-hp-playstyle">
            {t.title}
          </h2>
        </div>
        <p className="dl-hp-lead">{t.lead(file.matches.toLocaleString(locale), dia(file.from), dia(file.to))}</p>
      </div>

      {me && (
        <div className="dl-ps-grid">
          <KillsBox name={heroName} me={me} all={file.heroes} heroId={heroId} todos={todos} pct={pct} t={t} />
          <TimingBox me={me} all={file.heroes} heroId={heroId} todos={todos} t={t} />
          <SoulsBox name={heroName} me={me} todos={todos} pct={pct} t={t} />
          <SupportBox all={file.heroes} heroId={heroId} me={me} t={t} />
        </div>
      )}

      <section className="box dl-ps-trend">
        <div className="box-head">
          <h3 className="box-title">{t.trend.title}</h3>
        </div>
        <p className="detail-note">{t.trend.lead(bandName)}</p>
        {tendencia && tendencia.some(Boolean) ? (
          <TrendChart points={tendencia} weeks={file.weeks} t={t} />
        ) : (
          <p className="detail-note">{t.trend.none}</p>
        )}
      </section>
    </section>
  );
}

type T = (typeof COPY)["en"];

function KillsBox({
  name,
  me,
  all,
  heroId,
  todos,
  pct,
  t,
}: {
  name: string;
  me: PlaystyleHero;
  all: Record<string, PlaystyleHero>;
  heroId: number;
  todos: PlaystyleHero[];
  pct: (x: number) => string;
  t: T;
}) {
  const tipos = ["gun", "ability", "melee"] as const;
  const partes = (h: { gun: number; ability: number; melee: number }) => tipos.map((k) => ({ key: k, value: h[k], name: t.kills[k] }));
  const prom = { gun: mean(todos.map((h) => h.gun)), ability: mean(todos.map((h) => h.ability)), melee: mean(todos.map((h) => h.melee)) };
  // Lo que más lo distingue: el tipo en que más se aleja del promedio, hacia arriba.
  const tipo = [...tipos].sort((a, b) => me[b] - prom[b] - (me[a] - prom[a]))[0];
  const r = rankOf(all, heroId, (h) => h[tipo]);
  const hs = rankOf(all, heroId, (h) => h.headshot);
  return (
    <section className="box dl-ps-box">
      <h3 className="box-title">{t.kills.title}</h3>
      <p className="dl-ps-say">{t.kills.more(t.kills.what[tipo], r.beat, r.of)}</p>
      <Stack parts={partes(me)} label={name} />
      <Stack parts={partes(prom)} label={t.kills.avg} />
      <Legend parts={partes(me)} />
      <p className="dl-ps-line">
        {me.headshot > 0 ? (
          <>
            <span>{t.kills.headshot(pct(me.headshot))}</span>
            <b>{t.rank(hs.rank, hs.of)}</b>
          </>
        ) : (
          <span>{t.kills.noHeadshot}</span>
        )}
      </p>
    </section>
  );
}

function TimingBox({
  me,
  all,
  heroId,
  todos,
  t,
}: {
  me: PlaystyleHero;
  all: Record<string, PlaystyleHero>;
  heroId: number;
  todos: PlaystyleHero[];
  t: T;
}) {
  const locale = useLocale();
  const share = (h: PlaystyleHero) => (h.early + h.late > 0 ? h.early / (h.early + h.late) : 0);
  const r = rankOf(all, heroId, share);
  const temprano = r.beat >= r.of / 2;
  const max = Math.max(...todos.map((h) => Math.max(h.early, h.late)), 1);
  const fila = (label: string, v: number, avg: number, rank: { rank: number; of: number }) => (
    <div className="dl-ps-bar-row">
      <span className="dl-ps-bar-label">{label}</span>
      <span className="dl-ps-bar">
        <span className="dl-ps-bar-fill" style={{ width: `${(v / max) * 100}%` }} />
        <span className="dl-ps-bar-avg" style={{ left: `${(avg / max) * 100}%` }} />
      </span>
      <span className="dl-ps-bar-num">{v.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</span>
      <span className="dl-ps-bar-rank">{t.rank(rank.rank, rank.of)}</span>
    </div>
  );
  return (
    <section className="box dl-ps-box">
      <h3 className="box-title">{t.timing.title}</h3>
      <p className="dl-ps-say">{temprano ? t.timing.earlier(r.beat, r.of) : t.timing.later(r.of - 1 - r.beat, r.of)}</p>
      {fila(t.timing.early, me.early, mean(todos.map((h) => h.early)), rankOf(all, heroId, (h) => h.early))}
      {fila(t.timing.late, me.late, mean(todos.map((h) => h.late)), rankOf(all, heroId, (h) => h.late))}
      <p className="dl-ps-note">{t.timing.perGame}</p>
    </section>
  );
}

function SoulsBox({ name, me, todos, pct, t }: { name: string; me: PlaystyleHero; todos: PlaystyleHero[]; pct: (x: number) => string; t: T }) {
  const prom = Object.fromEntries(SOUL_KEYS.map((k) => [k, mean(todos.map((h) => h.souls[k]))])) as unknown as Souls;
  const partes = (s: Souls) => SOUL_KEYS.map((k) => ({ key: k, value: s[k], name: t.souls.parts[k] }));
  const k = [...SOUL_KEYS].filter((x) => x !== "other").sort((a, b) => me.souls[b] / prom[b] - me.souls[a] / prom[a])[0];
  return (
    <section className="box dl-ps-box">
      <h3 className="box-title">{t.souls.title}</h3>
      <p className="dl-ps-say">{t.souls.most(t.souls.lower[k], pct(me.souls[k]), pct(prom[k]))}</p>
      <Stack parts={partes(me.souls)} label={name} />
      <Stack parts={partes(prom)} label={t.souls.avg} />
      <Legend parts={partes(me.souls)} />
    </section>
  );
}

function SupportBox({ all, heroId, me, t }: { all: Record<string, PlaystyleHero>; heroId: number; me: PlaystyleHero; t: T }) {
  const locale = useLocale();
  const filas: { key: "mitigated" | "allyHeal" | "healPrevented"; label: string }[] = [
    { key: "mitigated", label: t.support.mitigated },
    { key: "allyHeal", label: t.support.allyHeal },
    { key: "healPrevented", label: t.support.healPrevented },
  ];
  return (
    <section className="box dl-ps-box">
      <h3 className="box-title">{t.support.title}</h3>
      <ul className="dl-ps-rows">
        {filas.map((f) => {
          const r = rankOf(all, heroId, (h) => h[f.key]);
          return (
            <li key={f.key}>
              <span className="dl-ps-row-label">{f.label}</span>
              <b className="dl-ps-row-num">{me[f.key] > 0 ? me[f.key].toLocaleString(locale) : "—"}</b>
              {/* Con 0 no hay puesto: la mitad de los héroes no cura a nadie y
                  "#18 de 44" haría parecer que sí. */}
              <span className="dl-ps-row-rank" data-top={r.rank <= 8 && me[f.key] > 0 ? "" : undefined}>
                {me[f.key] > 0 ? t.rank(r.rank, r.of) : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TrendChart({ points, weeks, t }: { points: TrendPoint[]; weeks: number[]; t: T }) {
  const locale = useLocale();
  const vals = points.filter((p): p is [number, number, number] => p !== null);
  const wrs = vals.map((p) => p[0]);
  const lo = Math.min(0.45, ...wrs) - 0.01;
  const hi = Math.max(0.55, ...wrs) + 0.01;
  const maxPick = Math.max(...vals.map((p) => p[1]), 0.01);
  const W = 640;
  const H = 150;
  const PAD = 26;
  const x = (i: number) => PAD + (i / Math.max(1, weeks.length - 1)) * (W - PAD * 2);
  const y = (wr: number) => 10 + (1 - (wr - lo) / (hi - lo)) * (H - 30);
  const linea = points
    .map((p, i) => (p ? `${x(i).toFixed(1)},${y(p[0]).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" ");
  const fecha = (s: number) => new Date(s * 1000).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const pc = (v: number) => `${(v * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  return (
    <div className="dl-ps-trend-wrap">
      <svg className="dl-ps-trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.trend.title}>
        <line className="dl-ps-trend-50" x1={PAD} x2={W - PAD} y1={y(0.5)} y2={y(0.5)} />
        {points.map((p, i) =>
          p ? (
            <rect
              key={`b${i}`}
              className="dl-ps-trend-pick"
              x={x(i) - 9}
              width={18}
              y={H - 20 - (p[1] / maxPick) * 40}
              height={(p[1] / maxPick) * 40}
            />
          ) : null
        )}
        <polyline className="dl-ps-trend-line" points={linea} />
        {points.map((p, i) =>
          p ? (
            <g key={i}>
              <circle className="dl-ps-trend-dot" cx={x(i)} cy={y(p[0])} r={4} data-up={p[0] >= 0.5 ? "" : undefined}>
                <title>{`${t.trend.week(fecha(weeks[i]))} · ${t.trend.wr} ${pc(p[0])} · ${t.trend.pick} ${pc(p[1])}`}</title>
              </circle>
            </g>
          ) : null
        )}
      </svg>
      {/* Las fechas van en HTML y no dentro del SVG: el gráfico se achica con
          el ancho y en el teléfono el texto del SVG quedaba en 5 px. */}
      <p className="dl-ps-trend-dates" aria-hidden="true">
        <span>{fecha(weeks[0])}</span>
        <span>{fecha(weeks[Math.floor((weeks.length - 1) / 2)])}</span>
        <span>{fecha(weeks[weeks.length - 1])}</span>
      </p>
      <ul className="dl-ps-legend">
        <li>
          <i className="dl-ps-swatch is-line" />
          {t.trend.wr}
          {vals.length > 0 && <b> {pc(vals[vals.length - 1][0])}</b>}
        </li>
        <li>
          <i className="dl-ps-swatch is-half" />
          50%
        </li>
        <li>
          <i className="dl-ps-swatch is-pick" />
          {t.trend.pick}
          {vals.length > 0 && <b> {pc(vals[vals.length - 1][1])}</b>}
        </li>
      </ul>
    </div>
  );
}
