import { useMemo, type ReactNode } from "react";
import duosJson from "@deadlock/lane-duos.json";
import DeadlockHeroesTabs from "./DeadlockHeroesTabs";
import GameImg from "./GameImg";
import SectionHead from "./SectionHead";
import RouteLink from "./RouteLink";
import { LazyRows } from "./LazyRows";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { ALL, BANDS, bandBadge, useHeroes, type BandId, type Hero } from "./deadlockData";
import { heroes as heroSlugs } from "./deadlockSlugs";
import type { Route } from "./route";
import "./styles/deadlock-duos.css";

/**
 * Dúos de línea (2026-11-25): la tier list de parejas de héroes que van juntas a
 * la misma línea (`/deadlock/heroes/duos`), y la de los compañeros de un héroe
 * (`/deadlock/heroes/duos/<héroe>`). Sub-pestaña de Héroes, al lado de la tabla
 * y de los récords: la tier list principal queda como está.
 *
 * Nació del post de X del 24/11 ("Best lane duos of Season 2"): la gente pidió
 * los peores y criticó que el winrate de un dúo es sobre todo el de sus dos
 * héroes. Por eso la letra sale del winrate del dúo (es lo que se mide bien en
 * cada banda) y "vs. solos" sólo aparece cuando el dúo gana claramente más o
 * menos de lo que darían sus dos héroes por separado. Medido el 25/11: en una
 * banda sola esa diferencia casi nunca supera el error de la muestra; con todos
 * los rangos juntos, la de los extremos sí (±2–3 puntos con error de ~1).
 *
 * Los datos salen de `lane-duos.json` (`build:hero-insights`): cada banda trae
 * todos sus dúos con un piso bajo, y "todos los rangos" es la suma de las
 * cuatro, igual que la tabla de Héroes suma las cuatro tier lists.
 */

type DuoPoint = [number, number, number, number];
interface LaneDuosFile {
  generatedAt: string;
  minDuo: number;
  bands: Partial<Record<BandId, { from: string; to: string; duos: DuoPoint[] }>>;
}
const data = duosJson as unknown as LaneDuosFile;

/** Los cortes de la letra, sobre el winrate del dúo. Más anchos que los de un héroe: un dúo va de ~36 % a ~67 %. */
export const DUO_CUTS: { tier: string; min: number }[] = [
  { tier: "S", min: 0.57 },
  { tier: "A", min: 0.54 },
  { tier: "B", min: 0.5 },
  { tier: "C", min: 0.46 },
  { tier: "D", min: -Infinity },
];
const duoTier = (wr: number) => DUO_CUTS.find((c) => wr >= c.min)!.tier;

export interface Duo {
  a: Hero;
  b: Hero;
  n: number;
  /** Winrate del dúo. */
  wr: number;
  /** Diferencia con lo esperado de sus dos héroes por separado, sólo si supera el error de la muestra. */
  synergy?: number;
  tier: string;
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigma = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Suma los dúos de las bandas pedidas y les pone letra.
 *
 * Lo esperado de un dúo sale de sumar en log-odds el winrate de cada héroe en
 * las mismas bandas y la misma ventana (es la cuenta del Armador de equipo,
 * `deadlockDraft.ts`): dos héroes al 55 % "deberían" ganar ~60 % juntos. La
 * sinergia es la diferencia, y se publica sólo si es más del doble del error
 * estándar del winrate del dúo.
 */
export function buildDuos(file: LaneDuosFile, bands: BandId[], heroes: Hero[]): Duo[] {
  const porId = new Map(heroes.map((h) => [h.heroId, h]));
  const acc = new Map<string, { a: number; b: number; n: number; w: number }>();
  for (const band of bands) {
    for (const [a, b, n, w] of file.bands[band]?.duos ?? []) {
      const k = `${a}:${b}`;
      const x = acc.get(k) ?? { a, b, n: 0, w: 0 };
      x.n += n;
      x.w += w;
      acc.set(k, x);
    }
  }
  const out: Duo[] = [];
  for (const x of acc.values()) {
    if (x.n < file.minDuo) continue;
    const a = porId.get(x.a);
    const b = porId.get(x.b);
    if (!a || !b) continue;
    const wr = x.w / x.n;
    const esperado = sigma(logit(a.winRate) + logit(b.winRate));
    const se = Math.sqrt((wr * (1 - wr)) / x.n);
    const dif = wr - esperado;
    // La letra sale del número que se ve (un decimal): 56,97 % se lee "57,0 %" y va en S.
    // Tres errores estándar y no dos: se comparan cientos de dúos a la vez, y
    // con dos saldrían ~25 "sinergias" por pura suerte en cada banda.
    out.push({ a, b, n: x.n, wr, synergy: Math.abs(dif) > 3 * se ? dif : undefined, tier: duoTier(Math.round(wr * 1000) / 1000) });
  }
  return out.sort((p, q) => q.wr - p.wr || q.n - p.n);
}

/** El héroe de la dirección (`duos/<héroe>`), o null para todos (`duos`). */
export function duosHeroOf(detail: string | undefined): number | null {
  const slug = detail?.startsWith("duos/") ? detail.slice("duos/".length) : null;
  if (!slug) return null;
  const id = heroSlugs.toId.get(slug);
  return id ? Number(id) : null;
}

const TIER_ORDER = DUO_CUTS.map((c) => c.tier);
/** El alto de una tarjeta, medido en el navegador a 1440 px. */
const CARD_H = 88;

export default function DeadlockDuos({
  route,
  navigate,
  band,
  all,
  picker,
}: {
  route: Route;
  navigate: (r: Route) => void;
  band: BandId;
  /** Todos los rangos: la suma de las cuatro bandas. */
  all: boolean;
  picker: ReactNode;
}) {
  const copy = useCopy();
  const t = copy.deadlock.duos;
  const locale = useLocale();
  const meta = useHeroes(all ? ALL : band);
  const heroId = duosHeroOf(route.detail);

  const duos = useMemo(
    () => (meta ? buildDuos(data, all ? BANDS.map((b) => b.id) : [band], meta.heroes) : []),
    [meta, all, band],
  );
  const elegido = heroId != null ? meta?.heroes.find((h) => h.heroId === heroId) : undefined;
  // Con un héroe elegido, él va primero en cada tarjeta y el compañero al lado.
  const lista = useMemo(
    () =>
      heroId == null
        ? duos
        : duos
            .filter((d) => d.a.heroId === heroId || d.b.heroId === heroId)
            .map((d) => (d.a.heroId === heroId ? d : { ...d, a: d.b, b: d.a })),
    [duos, heroId],
  );

  const pct = (x: number) => `${(x * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const pts = (x: number) => Math.abs(x * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const num = (x: number) => x.toLocaleString(locale);
  const rango = (tier: string) => {
    const i = TIER_ORDER.indexOf(tier);
    const min = DUO_CUTS[i].min;
    const max = i > 0 ? DUO_CUTS[i - 1].min : undefined;
    const p = (x: number) => (x * 100).toLocaleString(locale);
    if (!Number.isFinite(min)) return `< ${p(max!)}%`;
    return max === undefined ? `≥ ${p(min)}%` : `${p(min)}–${p(max)}%`;
  };

  const ventana = data.bands[band] ?? Object.values(data.bands)[0];
  const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long" });
  const nombreHeroe = elegido?.name ?? "";
  const insignia = all ? null : bandBadge(band);
  const bandName = all ? copy.deadlock.allRanks : copy.deadlock.bands[band];

  const aDuos = (id: number | null): Route => ({
    ...route,
    view: "deadlock",
    dlSection: "heroes",
    detail: id == null ? "duos" : `duos/${heroSlugs.toSlug.get(String(id))}`,
  });
  const aHeroe = (h: Hero): Route => ({ ...route, view: "deadlock", dlSection: "heroes", detail: heroSlugs.toSlug.get(String(h.heroId)) });

  const chip = (d: Duo) =>
    d.synergy !== undefined && (
      <span className="dl-duo-syn" data-up={d.synergy > 0 || undefined} title={t.synergyTip(pts(d.synergy), d.synergy > 0)}>
        {d.synergy > 0 ? t.synergyUp(pts(d.synergy)) : t.synergyDown(pts(d.synergy))}
      </span>
    );

  const tarjeta = (d: Duo) => (
    <li key={`${d.a.heroId}:${d.b.heroId}`} className="dl-duo">
      <RouteLink className="dl-duo-faces" to={aDuos(heroId == null ? d.a.heroId : d.b.heroId)} onNavigate={navigate} aria-label={t.together(d.a.name, d.b.name)}>
        <GameImg src={d.a.img} alt="" width={44} height={44} loading="lazy" decoding="async" />
        <GameImg src={d.b.img} alt="" width={44} height={44} loading="lazy" decoding="async" />
      </RouteLink>
      <div className="dl-duo-body">
        <p className="dl-duo-names">
          {heroId == null ? (
            <>
              <RouteLink to={aDuos(d.a.heroId)} onNavigate={navigate}>{d.a.name}</RouteLink>
              <span aria-hidden="true"> + </span>
              <RouteLink to={aDuos(d.b.heroId)} onNavigate={navigate}>{d.b.name}</RouteLink>
            </>
          ) : (
            <RouteLink to={aDuos(d.b.heroId)} onNavigate={navigate}>{d.b.name}</RouteLink>
          )}
        </p>
        <p className="dl-duo-figs">
          <strong className="dl-duo-wr" title={t.winTitle}>{pct(d.wr)}</strong>
          <span className="dl-duo-n">{t.games(num(d.n))}</span>
          {chip(d)}
        </p>
      </div>
    </li>
  );

  const fila = (d: Duo) => (
    <li key={`${d.a.heroId}:${d.b.heroId}`}>
      <RouteLink className="dl-rail-row dl-duo-rail" to={aDuos(d.a.heroId)} onNavigate={navigate}>
        <span className="dl-duo-rail-faces">
          <GameImg src={d.a.img} alt="" width={26} height={26} loading="lazy" decoding="async" />
          <GameImg src={d.b.img} alt="" width={26} height={26} loading="lazy" decoding="async" />
        </span>
        <span className="dl-rail-name">{t.together(d.a.name, d.b.name)}</span>
        <span className="dl-rail-figure">{pct(d.wr)}</span>
      </RouteLink>
    </li>
  );

  const juntos = lista.filter((d) => (d.synergy ?? 0) > 0).sort((p, q) => q.synergy! - p.synergy!).slice(0, 5);
  let primera = true;

  return (
    <main className="deadlock deadlock-heroes deadlock-duos">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={elegido ? t.heroTitle(nombreHeroe) : t.title}
        accent={elegido ? t.heroAccent : t.accent}
        lead={[elegido ? t.leadHero(nombreHeroe) : t.lead]}
        controls={picker}
        meta={
          meta && (
            <span className="dl-meta-line">
              {insignia?.img && <GameImg src={insignia.img} alt="" width={18} height={18} />}
              {t.meta(lista.length, bandName)}
            </span>
          )
        }
      />
      <DeadlockHeroesTabs route={route} navigate={navigate} active="duos" />

      <nav className="dl-duo-pick" aria-label={t.pickHero}>
        <RouteLink className="dl-duo-all" to={aDuos(null)} onNavigate={navigate} active={heroId == null}>
          {t.all}
        </RouteLink>
        <div className="dl-lb-heroes">
          {(meta?.heroes ?? [])
            .slice()
            .sort((p, q) => p.name.localeCompare(q.name, locale))
            .map((h) => (
              <RouteLink
                key={h.heroId}
                className="dl-lb-hero dl-duo-hero"
                to={aDuos(h.heroId)}
                onNavigate={navigate}
                active={heroId === h.heroId}
                title={h.name}
                aria-label={h.name}
              >
                <GameImg src={h.img} alt="" width={34} height={34} loading="lazy" decoding="async" />
              </RouteLink>
            ))}
        </div>
      </nav>

      {!meta ? (
        <p className="detail-note dl-loading">{t.loading}</p>
      ) : lista.length === 0 ? (
        <p className="detail-note">{t.none}</p>
      ) : (
        <div className="page has-rail">
          <div className="page-main">
            <div className="dl-bands">
              {TIER_ORDER.map((tier) => {
                const deLetra = lista.filter((d) => d.tier === tier);
                if (deLetra.length === 0) return null;
                const eager = primera;
                primera = false;
                return (
                  <section key={tier} className="dl-tier dl-duo-tier" data-tier={tier} aria-label={`${tier} · ${t.tierCount(deLetra.length)}`}>
                    {/* Una tira tiene hasta ~40 filas: la letra va arriba y acompaña al bajar. */}
                    <div className="dl-tier-mark">
                      <div className="dl-duo-mark">
                        <span className="dl-tier-letter">{tier}</span>
                        <span className="dl-tier-sub">{t.tierCount(deLetra.length)}</span>
                        <span className="dl-tier-sub">{rango(tier)}</span>
                      </div>
                    </div>
                    <ol className="dl-duo-grid">
                      <LazyRows items={deLetra} render={tarjeta} rowHeight={CARD_H} chunk={48} eager={eager} tag="li" />
                    </ol>
                  </section>
                );
              })}
            </div>
            <p className="dl-tier-note">
              {ventana && t.note(num(data.minDuo), fecha(ventana.from), fecha(ventana.to))}
            </p>
            <p className="dl-tier-note">{t.synergyNote}</p>
            {elegido && (
              <nav className="next-steps" aria-label={copy.deadlock.next.label}>
                <RouteLink className="next-step" to={aHeroe(elegido)} onNavigate={navigate}>
                  <span className="next-step-label">{copy.deadlock.tabs.heroes}</span>
                  <span className="next-step-title">{elegido.name}</span>
                </RouteLink>
              </nav>
            )}
          </div>

          <aside className="page-rail">
            <section className="box">
              <div className="box-head">
                <h2 className="box-title">{t.best}</h2>
              </div>
              <ol className="dl-rail-list">{lista.slice(0, 5).map(fila)}</ol>
            </section>
            <section className="box">
              <div className="box-head">
                <h2 className="box-title">{t.worst}</h2>
              </div>
              <ol className="dl-rail-list">{lista.slice(-5).reverse().map(fila)}</ol>
            </section>
            <section className="box">
              <div className="box-head">
                <h2 className="box-title">{t.synergy}</h2>
                <p className="box-lead">{t.synergyLead}</p>
              </div>
              {juntos.length === 0 ? (
                <p className="box-empty">{t.synergyNone}</p>
              ) : (
                <ol className="dl-rail-list">
                  {juntos.map((d) => (
                    <li key={`${d.a.heroId}:${d.b.heroId}`}>
                      <RouteLink className="dl-rail-row dl-duo-rail" to={aDuos(d.a.heroId)} onNavigate={navigate}>
                        <span className="dl-duo-rail-faces">
                          <GameImg src={d.a.img} alt="" width={26} height={26} loading="lazy" decoding="async" />
                          <GameImg src={d.b.img} alt="" width={26} height={26} loading="lazy" decoding="async" />
                        </span>
                        <span className="dl-rail-name">{t.together(d.a.name, d.b.name)}</span>
                        <span className="dl-rail-figure delta is-up">+{pts(d.synergy!)}</span>
                      </RouteLink>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
