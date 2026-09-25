import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import { useLocale, useLang, type Lang } from "./i18n";
import { useCopy } from "./deadlockCopy";
import DeadlockBuildCard from "./DeadlockBuildCard";
import { DailyChart, MasteryBars } from "./DeadlockHeroCharts";
import { BANDS, bandBadge, useHeroes, type BandId, type Hero } from "./deadlockData";
import { heroes as heroSlugs } from "./deadlockSlugs";
import { useHeroBuilds } from "./deadlockBuildsData";
import { useMastery } from "./deadlockMasteryData";
import {
  localNumber,
  metricReads,
  pairRate,
  splitValue,
  standouts,
  useHeroDetail,
  gunArt,
  useHeroKit,
  useInsights,
  type KitAbility,
  type KitStat,
  type Metric,
  type MetricRead,
  type PairPoint,
  type TextSpan,
} from "./deadlockHeroKitData";
import { ItemIcon } from "./DeadlockItemTip";
import GameImg from "./GameImg";

/**
 * La página de un héroe, dirección "C · Cartel" (elegida por ZoTaD el
 * 2026-09-22, ver docs/design/2026-09-22-pestana-heroes-y-pagina-de-heroe.md).
 *
 * Una portada con el arte del juego y las cifras de la tier list; después el kit
 * habilidad por habilidad con su clip; los números del héroe contra los otros
 * 37; los enfrentamientos; la build; y la historia con los atributos base.
 *
 * **Nada acá es texto nuestro sobre el héroe.** Rol, estilo, historia, etiquetas,
 * nombres, descripciones y mejoras son los del juego en cada idioma; las cifras
 * son del juego o de nuestras mediciones publicadas. Lo único que escribimos son
 * los rótulos y las frases que leen un número ("Más que el 97 % de los héroes").
 */

const TOTAL_PASOS = 15;

/** El texto del juego, con su resaltado y los íconos de atributo que trae. */
function Spans({ spans, icons }: { spans: TextSpan[]; icons: Record<string, string> }) {
  return (
    <>
      {spans.map((sp, i) => (
        <span
          key={i}
          className={sp.hi ? "dl-hi" : sp.dim ? "dl-dim" : sp.attr ? "dl-attr" : undefined}
          data-attr={sp.attr}
        >
          {sp.icon && icons[sp.icon] ? (
            <span className="dl-icon-word">
              <GameImg className="dl-inline-icon" src={icons[sp.icon]} alt="" width={16} height={16} />
              {sp.t}
            </span>
          ) : (
            sp.t
          )}
        </span>
      ))}
    </>
  );
}

/** Una cifra de la tarjeta: el número grande, la unidad chica, la etiqueta abajo. */
function Stat({ stat, lang }: { stat: KitStat; lang: Lang }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.kit;
  const { n, u } = splitValue(stat.value, stat.unit);
  const escala = stat.spirit !== undefined ? localNumber(String(stat.spirit), lang) : null;
  return (
    <div className="dl-hp-stat" title={escala ? t.spiritTip(escala) : undefined}>
      <span className="dl-hp-stat-value">
        {stat.icon && <GameImg src={stat.icon} alt="" width={16} height={16} loading="lazy" />}
        {localNumber(n, lang)}
        {u && <small>{u}</small>}
      </span>
      <span className="dl-hp-stat-label">{stat.label.replace(/:$/, "")}</span>
      {escala && <span className="dl-hp-stat-spirit">{t.spirit(escala)}</span>}
    </div>
  );
}

/**
 * El clip de la habilidad, que **sólo se baja y corre cuando está en pantalla**.
 *
 * Son cuatro videos de 3 a 8 MB por héroe. Con `preload="none"` y el `src`
 * puesto recién al entrar en vista, una visita que no baja hasta el kit no los
 * paga; y al salir de vista se pausan. Con movimiento reducido no arrancan
 * solos: quedan con controles.
 */
function AbilityVideo({ ability, label }: { ability: KitAbility; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const src = ability.video?.mp4 ?? ability.video?.webm;
  useEffect(() => {
    const v = ref.current;
    if (!v || !src || typeof IntersectionObserver === "undefined") return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (!v.src) v.src = src;
          if (!quieto) v.play().catch(() => undefined);
        } else v.pause();
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [src]);

  if (!src) {
    return (
      <div className="dl-hp-video is-empty">
        <img className="abi" src={ability.img} alt="" width={96} height={96} />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <video
      ref={ref}
      className="dl-hp-video"
      muted
      loop
      playsInline
      preload="none"
      aria-label={ability.name}
      controls={typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches}
    />
  );
}

function AbilityRow({ ability, icons, lang, flip }: { ability: KitAbility; icons: Record<string, string>; lang: Lang; flip: boolean }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.kit;
  const pasiva = ability.sections.some((s) => s.groups.some((g) => g.passive));
  return (
    <article className="dl-hp-ability" data-flip={flip || undefined} data-ult={ability.ultimate || undefined}>
      <div className="dl-hp-ability-media">
        <AbilityVideo ability={ability} label={t.noVideo} />
        <span className="dl-hp-ability-key" aria-hidden="true">{ability.slot}</span>
      </div>

      <div className="dl-hp-ability-body">
        <div className="dl-hp-ability-kicker">
          <GameImg className="dl-hp-ability-icon" src={ability.img} alt="" width={40} height={40} loading="lazy" />
          <span>{ability.ultimate ? t.ultimate : t.ability(ability.slot)}</span>
          {pasiva && <span className="dl-hp-tag">{t.passive}</span>}
          {ability.cooldown && (
            <span className="dl-hp-cd" title={t.cooldown}>
              {ability.cooldown.icon && <GameImg src={ability.cooldown.icon} alt="" width={14} height={14} />}
              {localNumber(splitValue(ability.cooldown.value, ability.cooldown.unit).n, lang)}
              {splitValue(ability.cooldown.value, ability.cooldown.unit).u}
            </span>
          )}
          {ability.charges && (
            <span className="dl-hp-cd">
              {ability.charges.value} {t.charges.toLowerCase()}
            </span>
          )}
        </div>
        <h3 className="dl-hp-ability-name">{ability.name}</h3>
        {ability.quip.length > 0 && (
          <p className="dl-hp-quip">
            <Spans spans={ability.quip} icons={icons} />
          </p>
        )}

        {ability.sections.map((s, i) => (
          <div key={i} className="dl-hp-section">
            {s.text.length > 0 && (
              <p className="dl-hp-desc">
                <Spans spans={s.text} icons={icons} />
              </p>
            )}
            {s.groups.map((g, j) => (
              <div key={j} className="dl-hp-group">
                {g.label && <span className="dl-hp-group-label">{g.label.replace(/:$/, "")}</span>}
                <div className="dl-hp-stats">
                  {g.stats.map((st, k) => (
                    <Stat key={k} stat={st} lang={lang} />
                  ))}
                </div>
              </div>
            ))}
            {s.basics.length > 0 && (
              <div className="dl-hp-stats is-basic">
                {s.basics.map((st, k) => (
                  <Stat key={k} stat={st} lang={lang} />
                ))}
              </div>
            )}
          </div>
        ))}

        {ability.upgrades.some((u) => u.length > 0) && (
          <ol className="dl-hp-upgrades" aria-label={t.upgrades}>
            {ability.upgrades.map((u, i) => (
              <li key={i}>
                <span className="dl-hp-tier">T{i + 1}</span>
                <span>
                  <Spans spans={u} icons={icons} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

/** Qué subir en cada punto, de la build más jugada del héroe. */
function PathGrid({ heroId, abilities }: { heroId: number; abilities: KitAbility[] }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.kit;
  const locale = useLocale();
  const builds = useHeroBuilds(heroId);
  const build = builds?.builds.length ? [...builds.builds].sort((a, b) => b.matches - a.matches)[0] : null;
  if (!build || build.path.length === 0) return null;
  const pasos = build.path.slice(0, TOTAL_PASOS);

  return (
    <section className="box dl-hp-path">
      <div className="box-head dl-hp-path-head">
        <h3 className="box-title">{t.order}</h3>
        <span className="dl-hp-kicker">{t.orderSteps}</span>
      </div>
      <div className="dl-hp-path-scroll">
        <table className="dl-hp-path-grid">
          <tbody>
            {abilities.map((a) => {
              let vez = 0;
              return (
                <tr key={a.id}>
                  <th scope="row">
                    <GameImg className="abi" src={a.img} alt="" width={28} height={28} loading="lazy" />
                    <span>{a.name}</span>
                  </th>
                  {pasos.map((id, i) => {
                    if (id !== a.id) return <td key={i} />;
                    vez++;
                    return (
                      <td key={i} data-step={vez === 1 ? "unlock" : "upgrade"}>
                        {i + 1}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dl-hp-note">
        <span className="dl-hp-legend" data-step="unlock" /> {t.unlock}
        <span className="dl-hp-legend" data-step="upgrade" /> {t.upgrade}
        <span className="dl-hp-note-sep">·</span>
        {t.orderLead(build.matches.toLocaleString(locale))}
      </p>
    </section>
  );
}

function formatMetric(metric: Metric, v: number, locale: string): string {
  if (metric === "accuracy") return `${(v * 100).toLocaleString(locale, { maximumFractionDigits: 0 })}%`;
  if (v >= 1000) return Math.round(v).toLocaleString(locale);
  return v.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function StandoutCard({ read, first }: { read: MetricRead; first: boolean }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.numbers;
  const locale = useLocale();
  const arriba = read.below >= 0.5;
  const p = Math.round((arriba ? read.below : 1 - read.below) * 100);
  return (
    <div className="dl-hp-standout" data-first={first || undefined}>
      <span className="dl-hp-standout-value">{formatMetric(read.metric, read.value, locale)}</span>
      <span className="dl-hp-standout-label">
        {t.metrics[read.metric]} {read.metric !== "accuracy" && t.perMatch}
      </span>
      <span className="dl-hp-standout-read">{arriba ? t.above(p) : t.below(p)}</span>
    </div>
  );
}

function ProfileRows({ reads }: { reads: MetricRead[] }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.numbers;
  const locale = useLocale();
  return (
    <div className="dl-hp-profile">
      <div className="dl-hp-profile-axis" aria-hidden="true">
        <span />
        <span>
          <span>{t.profileAxis.less}</span>
          <span>{t.profileAxis.avg}</span>
          <span>{t.profileAxis.more}</span>
        </span>
        <span />
      </div>
      {[...reads]
        .sort((a, b) => b.below - a.below)
        .map((r) => (
          <div key={r.metric} className="dl-hp-profile-row">
            <span className="dl-hp-profile-label">{t.names[r.metric]}</span>
            <span className="dl-hp-profile-track" style={{ "--p": `${r.below * 100}%` } as CSSProperties}>
              <span className="dl-hp-profile-fill" data-side={r.below >= 0.5 ? "up" : "down"} />
              <span className="dl-hp-profile-mark" />
            </span>
            <span className="dl-hp-profile-value">
              {formatMetric(r.metric, r.value, locale)}
              <small>
                {t.avg} {formatMetric(r.metric, r.avg, locale)}
              </small>
            </span>
          </div>
        ))}
    </div>
  );
}

/** Victorias del héroe en cada banda, con su puesto en esa tier list. */
function BandRows({ heroId, current }: { heroId: number; current: BandId }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.numbers;
  const locale = useLocale();
  // Las cuatro, en el orden fijo de BANDS: el orden de los hooks no cambia nunca.
  const metas = BANDS.map((b) => ({ band: b.id, meta: useHeroes(b.id) }));
  const filas = metas
    .map(({ band, meta }) => {
      const i = meta?.heroes.findIndex((h) => h.heroId === heroId) ?? -1;
      return meta && i >= 0 ? { band, hero: meta.heroes[i], rank: i + 1, total: meta.heroes.length } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // De abajo hacia arriba en la escalera: se lee cómo cambia al subir.
    .reverse();
  if (filas.length === 0) return null;
  const lo = 0.44;
  const hi = 0.58;
  const pos = (v: number) => `${Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100}%`;
  return (
    <div className="dl-hp-bands">
      {filas.map((f) => (
        <div key={f.band} className="dl-hp-band" data-current={f.band === current || undefined}>
          <span className="dl-hp-band-name">
            {bandBadge(f.band).img && <GameImg src={bandBadge(f.band).img} alt="" width={20} height={20} loading="lazy" />}
            <span>
              {copy.deadlock.bands[f.band]}
              <small>{t.rankOf(f.rank, f.total)}</small>
            </span>
          </span>
          <span className="dl-hp-band-track" style={{ "--w": pos(f.hero.winRate), "--mid": pos(0.5) } as CSSProperties}>
            <span />
          </span>
          <span className="dl-hp-band-value">
            {(f.hero.winRate * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%
          </span>
        </div>
      ))}
    </div>
  );
}

function PairList({
  title,
  rows,
  kind,
  heroes,
  route,
  navigate,
}: {
  title: string;
  rows: PairPoint[];
  kind: "hard" | "easy" | "with";
  heroes: Map<number, Hero>;
  route: Route;
  navigate: (r: Route) => void;
}) {
  const copy = useCopy();
  const t = copy.deadlock.hero.matchups;
  const locale = useLocale();
  return (
    <section className="box dl-hp-pairs" data-kind={kind}>
      <h3 className="dl-hp-pairs-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="box-empty">{t.none}</p>
      ) : (
        <ol>
          {rows.map((p) => {
            const h = heroes.get(p[0]);
            if (!h) return null;
            return (
              <li key={p[0]}>
                <RouteLink className="dl-hp-pair" to={toHero(route, h.heroId)} onNavigate={navigate}>
                  {h.img && <GameImg src={h.img} alt="" width={40} height={40} loading="lazy" />}
                  <span className="dl-hp-pair-name">{h.name}</span>
                  <span className="dl-hp-pair-n">{t.matches(p[1].toLocaleString(locale))}</span>
                  <span className="dl-hp-pair-wr">
                    {(pairRate(p) * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%
                  </span>
                </RouteLink>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Los objetos de la build recomendada sobre una regla de minutos. */
function BuildTimeline({ heroId }: { heroId: number }) {
  const copy = useCopy();
  const t = copy.deadlock.hero.build;
  const locale = useLocale();
  const builds = useHeroBuilds(heroId);
  const reco = builds?.recommended;
  if (!builds || !reco || reco.items.length === 0) return null;
  const origen = builds.builds.find((b) => b.id === reco.from);
  const items = [...reco.items].sort((a, b) => a.minute - b.minute);
  const fin = Math.max(35, Math.ceil(items[items.length - 1].minute / 5) * 5);
  const marcas = Array.from({ length: fin / 5 + 1 }, (_, i) => i * 5);

  // Carriles: un objeto baja de carril si pisa al anterior del mismo carril.
  const ultimo: number[] = [];
  const puestos = items.map((it) => {
    const x = it.minute / fin;
    let carril = ultimo.findIndex((u) => x - u >= 0.075);
    if (carril === -1) carril = ultimo.length;
    ultimo[carril] = x;
    return { it, x, carril };
  });
  const carriles = Math.max(1, ultimo.length);

  return (
    <div className="dl-hp-build">
      <div className="dl-hp-build-head">
        <div>
          {origen && (
            <span className="dl-hp-kicker">
              {t.kicker(
                `${(origen.winRate * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`,
                origen.matches.toLocaleString(locale)
              )}
            </span>
          )}
          <h2 className="dl-hp-h2">{t.title}</h2>
        </div>
        <p className="dl-hp-lead">{t.lead}</p>
      </div>
      <div className="box dl-hp-tl" style={{ "--lanes": carriles } as CSSProperties}>
        <div className="dl-hp-tl-track">
          {puestos.map(({ it, x, carril }) => (
            <div
              key={it.itemId}
              className="dl-hp-tl-item"
              style={{ "--x": x, "--lane": carril } as CSSProperties}
            >
              <ItemIcon itemId={it.itemId} img={it.img} size={48} />
              <span>{it.name}</span>
            </div>
          ))}
          <div className="dl-hp-tl-axis" aria-hidden="true">
            {marcas.map((m) => (
              <span key={m} style={{ "--x": m / fin } as CSSProperties}>
                {t.minute(m)}
              </span>
            ))}
          </div>
        </div>
        <ol className="dl-hp-tl-list">
          {items.map((it) => (
            <li key={it.itemId}>
              <span className="dl-hp-tl-min">{t.minute(it.minute)}</span>
              <ItemIcon itemId={it.itemId} img={it.img} size={32} />
              <span>{it.name}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** La ficha entera de otro héroe: se queda en la pestaña Héroes. */
const toHero = (route: Route, heroId: number): Route => ({
  ...route,
  view: "deadlock",
  dlSection: "heroes",
  detail: heroSlugs.toSlug.get(String(heroId)),
});

function Head({ kicker, title, lead, id }: { kicker: string; title: string; lead?: ReactNode; id: string }) {
  return (
    <div className="dl-hp-head">
      <div>
        <span className="dl-hp-kicker">{kicker}</span>
        <h2 className="dl-hp-h2" id={id}>
          {title}
        </h2>
      </div>
      {lead && <p className="dl-hp-lead">{lead}</p>}
    </div>
  );
}

export default function DeadlockHeroPage({
  hero,
  heroes,
  route,
  navigate,
  picker,
  band,
}: {
  hero: Hero;
  /** La tier list de la banda, para el puesto, el anterior y el siguiente. */
  heroes: Hero[];
  route: Route;
  navigate: (route: Route) => void;
  picker: ReactNode;
  band: BandId;
}) {
  const copy = useCopy();
  const t = copy.deadlock.hero;
  const { lang } = useLang();
  const locale = useLocale();
  const detail = useHeroDetail(hero.heroId);
  const kit = useHeroKit();
  const insights = useInsights(band);
  const mastery = useMastery(hero.heroId);

  const row = kit?.heroes[String(hero.heroId)];
  const stats = row?.stats;
  const text = detail?.text[lang] ?? detail?.text.en;
  const abilities = detail ? detail.abilities[lang] ?? detail.abilities.en : [];
  const icons = detail?.icons ?? {};
  const gun = gunArt(detail?.art.card ?? hero.card);
  const idx = heroes.indexOf(hero);
  const prev = idx > 0 ? heroes[idx - 1] : null;
  const next = idx >= 0 && idx < heroes.length - 1 ? heroes[idx + 1] : null;
  const back: Route = { ...route, view: "deadlock", dlSection: "heroes", detail: undefined };
  const bandName = copy.deadlock.bands[band];
  const porId = new Map(heroes.map((h) => [h.heroId, h]));

  const ins = insights?.heroes[String(hero.heroId)];
  const reads = insights ? metricReads(insights, hero.heroId) : [];
  const dia = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long" });
  const pct = (v: number) => `${(v * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
  const num = (v: number, max = 2) => v.toLocaleString(locale, { maximumFractionDigits: max });

  const style = hero.color ? ({ "--dl-hero": hero.color } as CSSProperties) : undefined;

  return (
    <main className="deadlock deadlock-hero dl-hp" style={style}>
      {/* ── Portada ─────────────────────────────────────────────── */}
      <header className="dl-hp-banner">
        {detail?.art.background && <img className="dl-hp-bg" src={detail.art.background} alt="" />}
        <div className="dl-hp-scrim" aria-hidden="true" />
        {(detail?.art.card ?? hero.card) && (
          <img className="dl-hp-card" src={detail?.art.card ?? hero.card} alt={hero.name} width={280} height={380} />
        )}
        <div className="dl-hp-id">
          <RouteLink className="dl-hp-back" to={back} onNavigate={navigate}>
            ← {t.back} · {t.kicker(idx + 1, heroes.length, bandName)}
          </RouteLink>
          <h1 className="dl-hp-name">{hero.name}</h1>
          {text?.role && <p className="dl-hp-role">{text.role}</p>}
          {text?.playstyle && <p className="dl-hp-playstyle">{text.playstyle}</p>}
          <div className="dl-hp-tags">
            {text?.tags.map((tag) => (
              <span key={tag} className="dl-hp-chip">
                {tag}
              </span>
            ))}
            {row?.complexity && (
              <span className="dl-hp-complexity" title={t.complexityTip(row.complexity)}>
                {t.complexity}
                <span aria-hidden="true">
                  {Array.from({ length: row.complexity }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                <span className="visually-hidden">{row.complexity}</span>
              </span>
            )}
          </div>
          <div className="dl-hp-cta">
            <a className="dl-hp-btn is-primary" href="#dl-hp-kit">
              {t.cta.kit}
            </a>
            <a className="dl-hp-btn" href="#dl-hp-build">
              {t.cta.build}
            </a>
          </div>
        </div>

        <dl className="dl-hp-kpis">
          <div className="dl-hp-tierblock" data-tier={hero.tier}>
            <dt className="visually-hidden">Tier</dt>
            <dd>{hero.tier}</dd>
            <span aria-hidden="true">Tier</span>
          </div>
          <div>
            <dt>{t.kpis.winRate}</dt>
            <dd className="is-accent">{pct(hero.winRate)}</dd>
          </div>
          <div>
            <dt>{t.kpis.pickRate}</dt>
            <dd>{pct(hero.pickRate)}</dd>
          </div>
          {mastery?.boost !== undefined && (
            <div title={t.kpis.masteryTip}>
              <dt>{t.kpis.mastery}</dt>
              <dd>{signed(mastery.boost)}</dd>
            </div>
          )}
          {hero.trend !== undefined && (
            <div>
              <dt>{t.kpis.trend}</dt>
              <dd data-sign={hero.trend > 0 ? "up" : hero.trend < 0 ? "down" : undefined}>{signed(hero.trend)}</dd>
            </div>
          )}
        </dl>
      </header>

      <nav className="dl-hp-anchors" aria-label={hero.name}>
        <div className="dl-hp-anchor-links">
          <a href="#dl-hp-kit">{t.anchors.kit}</a>
          <a href="#dl-hp-numbers">{t.anchors.numbers}</a>
          <a href="#dl-hp-matchups">{t.anchors.matchups}</a>
          <a href="#dl-hp-build">{t.anchors.build}</a>
          <a href="#dl-hp-lore">{t.anchors.lore}</a>
        </div>
        {picker}
      </nav>

      {/* ── El kit ──────────────────────────────────────────────── */}
      <section className="dl-hp-block" aria-labelledby="dl-hp-kit">
        <Head kicker={t.kit.kicker} title={t.kit.title} lead={t.kit.lead} id="dl-hp-kit" />
        {detail === undefined ? (
          <p className="detail-note">{t.kit.loading}</p>
        ) : abilities.length === 0 ? (
          <p className="detail-note">{t.kit.missing}</p>
        ) : (
          <>
            <div className="dl-hp-abilities">
              {abilities.map((a, i) => (
                <AbilityRow key={a.id} ability={a} icons={icons} lang={lang} flip={i % 2 === 1} />
              ))}
            </div>
            <PathGrid heroId={hero.heroId} abilities={abilities} />
          </>
        )}
      </section>

      {/* ── En números ──────────────────────────────────────────── */}
      <section className="dl-hp-block" aria-labelledby="dl-hp-numbers">
        <Head
          kicker={t.numbers.kicker}
          title={t.numbers.title}
          lead={insights ? t.numbers.lead(bandName, dia(insights.from), dia(insights.to)) : undefined}
          id="dl-hp-numbers"
        />
        {reads.length > 0 ? (
          <>
            <div className="dl-hp-standouts">
              {standouts(reads).map((r, i) => (
                <StandoutCard key={r.metric} read={r} first={i === 0} />
              ))}
            </div>
            <div className="dl-hp-numbers-grid">
              <section className="box">
                <div className="box-head">
                  <h3 className="box-title">{t.numbers.profile}</h3>
                </div>
                <ProfileRows reads={reads} />
              </section>
              <section className="box">
                <div className="box-head">
                  <h3 className="box-title">{t.numbers.byBand}</h3>
                  <span className="dl-hp-kicker">{t.numbers.byBandNote}</span>
                </div>
                <BandRows heroId={hero.heroId} current={band} />
                {mastery && mastery.buckets.length > 1 && (
                  <>
                    <div className="box-head dl-hp-subhead">
                      <h3 className="box-title">{t.numbers.mastery}</h3>
                      {mastery.boost !== undefined && <span className="dl-hp-kicker is-accent">{signed(mastery.boost)}</span>}
                    </div>
                    <MasteryBars buckets={mastery.buckets} name={hero.name} />
                    {/* La advertencia de siempre: la banda fija el nivel de la
                        sala, no el del jugador. Ver `copy.deadlock.mastery`. */}
                    <p className="dl-hp-note">{copy.deadlock.mastery.caveat}</p>
                  </>
                )}
              </section>
            </div>
          </>
        ) : (
          insights !== undefined && <p className="detail-note">{t.numbers.empty}</p>
        )}
        {ins && ins.daily.length > 1 && (
          <section className="box dl-hp-timeline">
            <div className="box-head">
              <h3 className="box-title">{t.numbers.timeline}</h3>
              <span className="dl-hp-kicker">{t.numbers.timelineLead(bandName)}</span>
            </div>
            <DailyChart daily={ins.daily} patch={insights?.patch} name={hero.name} />
          </section>
        )}
      </section>

      {/* ── Enfrentamientos ─────────────────────────────────────── */}
      <section className="dl-hp-block" aria-labelledby="dl-hp-matchups">
        <Head
          kicker={t.matchups.kicker}
          title={t.matchups.title}
          lead={insights ? t.matchups.lead(insights.minPair, dia(insights.from), dia(insights.to)) : undefined}
          id="dl-hp-matchups"
        />
        {ins ? (
          <div className="dl-hp-pairs-grid">
            <PairList title={t.matchups.hard} rows={ins.vs.slice(0, 5)} kind="hard" heroes={porId} route={route} navigate={navigate} />
            <PairList
              title={t.matchups.easy}
              rows={[...ins.vs].reverse().slice(0, 5)}
              kind="easy"
              heroes={porId}
              route={route}
              navigate={navigate}
            />
            <PairList title={t.matchups.with} rows={ins.with.slice(0, 5)} kind="with" heroes={porId} route={route} navigate={navigate} />
          </div>
        ) : (
          insights !== undefined && <p className="detail-note">{t.matchups.none}</p>
        )}
      </section>

      {/* ── Build ───────────────────────────────────────────────── */}
      <section className="dl-hp-block" aria-labelledby="dl-hp-build" id="dl-hp-build">
        <BuildTimeline heroId={hero.heroId} />
        <div className="dl-band-panel dl-hero-body">
          <DeadlockBuildCard heroId={hero.heroId} heroWinRate={hero.winRate} />
        </div>
      </section>

      {/* ── Historia y atributos ────────────────────────────────── */}
      <section className="dl-hp-block dl-hp-lore" aria-labelledby="dl-hp-lore">
        <div>
          <span className="dl-hp-kicker" id="dl-hp-lore">
            {t.lore.kicker}
          </span>
          {text?.lore && <p className="dl-hp-lore-text">{text.lore}</p>}
        </div>
        {stats && (
          <div className="dl-hp-attrs">
            <div>
              <h3 className="dl-hp-h3">{t.lore.base}</h3>
              <dl className="dl-hp-attr-grid">
                <Attr label={t.lore.attrs.health} value={num(stats.health)} sub={t.lore.perBoon(num(stats.perBoon.health))} />
                <Attr label={t.lore.attrs.healthRegen} value={`${num(stats.healthRegen)}/s`} />
                <Attr label={t.lore.attrs.moveSpeed} value={`${num(stats.moveSpeed)} m/s`} />
                <Attr label={t.lore.attrs.sprintSpeed} value={`+${num(stats.sprintSpeed)} m/s`} />
                <Attr label={t.lore.attrs.stamina} value={num(stats.stamina)} />
                <Attr
                  label={t.lore.attrs.melee}
                  value={`${num(stats.lightMelee)} / ${num(stats.heavyMelee)}`}
                  sub={t.lore.lightHeavy}
                />
                <Attr
                  label={t.lore.attrs.spiritPerBoon}
                  value={`+${num(stats.perBoon.spiritPower)}`}
                  sub={t.lore.perBoonShort}
                />
              </dl>
            </div>
            {stats.weapon && (
              <div>
                <h3 className="dl-hp-h3">{t.lore.weapon}</h3>
                {gun && (
                  <img
                    className="dl-hp-gun"
                    src={gun}
                    alt=""
                    width={600}
                    height={300}
                    loading="lazy"
                    onError={(e) => e.currentTarget.remove()}
                  />
                )}
                <dl className="dl-hp-attr-grid">
                  <Attr
                    label={t.lore.attrs.bulletDamage}
                    value={stats.weapon.pellets > 1 ? `${num(stats.weapon.bulletDamage)} ×${stats.weapon.pellets}` : num(stats.weapon.bulletDamage)}
                    sub={t.lore.perBoon(num(stats.perBoon.bulletDamage, 3))}
                  />
                  <Attr label={t.lore.attrs.fireRate} value={`${num(stats.weapon.fireRate)}/s`} />
                  <Attr label={t.lore.attrs.dps} value={num(stats.weapon.dps, 1)} sub={t.lore.withReload(num(stats.weapon.sustainedDps, 1))} />
                  <Attr label={t.lore.attrs.clip} value={num(stats.weapon.clip)} />
                  <Attr label={t.lore.attrs.reload} value={`${num(stats.weapon.reload)} s`} />
                  <Attr label={t.lore.attrs.magazine} value={num(stats.weapon.magazineDamage, 1)} />
                </dl>
              </div>
            )}
          </div>
        )}
      </section>

      <nav className="next-steps dl-hp-next" aria-label={copy.deadlock.next.label}>
        {prev && (
          <RouteLink className="next-step" to={toHero(route, prev.heroId)} onNavigate={navigate}>
            <span className="next-step-label">
              ← {copy.deadlock.heroPage.prev} · {prev.tier}
            </span>
            <span className="next-step-title">{prev.name}</span>
          </RouteLink>
        )}
        <RouteLink className="next-step" to={back} onNavigate={navigate}>
          <span className="next-step-label">{copy.deadlock.next.label}</span>
          <span className="next-step-title">{copy.deadlock.heroes.title}</span>
        </RouteLink>
        {next && (
          <RouteLink className="next-step" to={toHero(route, next.heroId)} onNavigate={navigate}>
            <span className="next-step-label">
              {copy.deadlock.heroPage.next} · {next.tier} →
            </span>
            <span className="next-step-title">{next.name}</span>
          </RouteLink>
        )}
      </nav>
    </main>
  );
}

function Attr({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value}
        {sub && <small>{sub}</small>}
      </dd>
    </div>
  );
}
