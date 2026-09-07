import type { CSSProperties } from "react";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import SectionHead from "./SectionHead";
import { useCopy, useLocale, useLang } from "./i18n";
import { text } from "./localized";
import { type DeadlockSection } from "./route";
import DeadlockBuildCard from "./DeadlockBuildCard";
import DeadlockMastery from "./DeadlockMastery";
import { usePatches } from "./deadlockPatchesData";
import {
  useHeroes,
  bandBadge,
  PUBLISHED_BAND,
  ON_FALLBACK_BAND,
  bandCrest,
  patchMovers,
  type BandId,
  type Hero,
} from "./deadlockData";
import { heroes as heroSlugs } from "./deadlockSlugs";

/**
 * La tier list de héroes de Deadlock.
 *
 * Comparte el tema del sitio (`codex.css`) y el esqueleto de la página de meta de
 * TFT a propósito: es el mismo producto contestando la misma pregunta sobre otro
 * juego, y dos lenguajes visuales lo harían leer como dos sitios pegados.
 *
 * Lo que NO comparte es el orden de lectura. En TFT la unidad es la comp, que se
 * abre para ver su plan; acá la unidad es el héroe y no hay nada que abrir
 * todavía, así que la fila entera cabe de un vistazo y la lista se lee de
 * corrido.
 */

const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

/**
 * El número con su signo, para el tooltip que respalda cada etiqueta.
 *
 * La etiqueta dice "Difícil" y el tooltip dice por qué y cuánto. Sin el número
 * atrás, la etiqueta sería una opinión — es la misma regla que las etiquetas de
 * comp de TFT, que siempre imprimen el dato que las respalda.
 */
const signed = (n: number | undefined): string =>
  n === undefined ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`;

const TIER_ORDER = ["S", "A", "B", "C", "D"];

/**
 * Un héroe dentro de su banda.
 *
 * **Sólo el retrato, el nombre y los dos números.** Todo lo demás —el puesto,
 * las etiquetas con su texto, la build— vive en el panel que se abre debajo de
 * la banda: en 66px de ancho no entra una palabra como "Subiendo".
 *
 * Las etiquetas se conservan como glifo en la esquina, con el mismo `title` y
 * el mismo número atrás que tenían de fila, que es la regla del proyecto — una
 * etiqueta sin el dato que la respalda es una opinión.
 */
function HeroTile({
  hero,
  to,
  onNavigate,
}: {
  hero: Hero;
  /** La página del héroe: el tile es un enlace de verdad, no un botón. */
  to: Route;
  onNavigate: (route: Route) => void;
}) {
  const copy = useCopy();

  return (
    <li
      className="dl-tile"
      data-thin={hero.thinData === true}
      /**
       * El color propio del héroe, el que usa el juego en su pantalla de
       * selección. Tiñe el filo de arriba y el resplandor al abrirlo.
       *
       * **Va como variable y no como estilo directo** para que el CSS decida
       * cuánto de ese color usa en cada lugar; y sin color declarado cae al oro
       * del tema, que es el comportamiento que teníamos antes de esto.
       */
      style={hero.color ? ({ "--dl-hero": hero.color } as CSSProperties) : undefined}
    >
      <RouteLink
        className="dl-tile-btn"
        to={to}
        onNavigate={onNavigate}
        aria-label={copy.deadlock.buildCard.toggle(hero.name)}
      >
        <span className="dl-tile-face">
          {hero.img ? (
            <img src={hero.img} alt="" loading="lazy" width={57} height={57} />
          ) : (
            <span className="dl-portrait-fallback">{hero.name.slice(0, 2)}</span>
          )}

          {hero.difficulty && (
            <span
              className="dl-tile-mark"
              data-kind={hero.difficulty}
              title={`${copy.deadlock.difficulty[hero.difficulty]} — ${copy.deadlock.why.skillGap(
                signed(hero.skillGap)
              )}`}
            >
              <span aria-hidden="true">{hero.difficulty === "hard" ? "◆" : "◇"}</span>
            </span>
          )}

          {hero.momentum && (
            <span
              className="dl-tile-trend"
              data-kind={hero.momentum}
              title={`${copy.deadlock.momentum[hero.momentum]} — ${copy.deadlock.why.trend(
                signed(hero.trend)
              )}`}
            >
              <span aria-hidden="true">{hero.momentum === "up" ? "▲" : "▼"}</span>
            </span>
          )}
        </span>

        <span className="dl-tile-name" title={hero.name}>{hero.name}</span>
        <span className="dl-tile-wr">{pct(hero.winRate)}</span>
        <span className="dl-tile-pr">{pct(hero.pickRate)}</span>
      </RouteLink>
    </li>
  );
}

/**
 * El historial de parches del juego.
 *
 * **Los ordena y encabeza por la fecha de publicación, no por el título.** Valve
 * nombra cada parche por la fecha de su build: el que llegó a los jugadores el
 * 2026-07-28 se llama "06-30-2026 Update". Poner el título adelante haría que la
 * lista pareciera desordenada, así que la fecha manda y el nombre va al lado —
 * con una nota que lo explica, porque es raro y no es culpa nuestra.
 *
 * El enlace sale del propio feed y va al foro oficial. Es la única salida a otro
 * sitio que tiene la página, y es a la fuente.
 */
function PatchHistory({ limit }: { limit?: number } = {}) {
  const copy = useCopy();
  const locale = useLocale();
  const file = usePatches();
  if (!file || file.patches.length === 0) return null;

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });

  return (
    <section className="dl-history">
      <h2 className="dl-patch-side">{copy.deadlock.patch.history}</h2>
      <p className="detail-note dl-history-note">{copy.deadlock.patch.nameNote}</p>

      <ol className="dl-history-list">
        {file.patches.slice(0, limit ?? file.patches.length).map((p, i) => (
          <li key={p.date} className="dl-history-row" data-current={i === 0 ? "" : undefined}>
            <span className="dl-history-date">{fecha(p.date)}</span>
            <span className="dl-history-name">
              {p.title}
              {i === 0 && <span className="dl-history-tag">{copy.deadlock.patch.current}</span>}
            </span>
            {p.link && (
              <a className="dl-history-link" href={p.link} target="_blank" rel="noopener noreferrer">
                {copy.deadlock.patch.read}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Una fila de "qué cambió el parche": el héroe, cuánto se movió, y de dónde a
 * dónde.
 *
 * El "de → a" está porque el delta solo no alcanza: "−4,7" no distingue a un
 * héroe que cayó de 53% a 48% —era el mejor y ahora es del montón— de uno que
 * cayó de 47% a 43%, que ya era malo y ahora es injugable.
 */
function MoverRow({ hero, rank }: { hero: Hero; rank: number }) {
  const copy = useCopy();
  const sube = (hero.trend ?? 0) > 0;

  return (
    <li className="dl-mover" data-dir={sube ? "up" : "down"}>
      <span className="dl-mover-rank">{rank}</span>
      {hero.img && <img className="dl-mover-face" src={hero.img} alt="" width={44} height={44} loading="lazy" />}
      <span className="dl-mover-id">
        <span className="dl-name">{hero.name}</span>
        <span className="dl-mover-delta">
          {sube ? "▲" : "▼"} {signed(hero.trend)}
        </span>
      </span>
      <span className="dl-mover-rates">
        <span className="dl-mover-rate">
          <span className="stat-label">{copy.deadlock.patch.winRate}</span>
          <span>
            {pct(hero.winRateBefore ?? 0)} <span aria-hidden="true">→</span>{" "}
            <b>{pct(hero.winRateRaw)}</b>
          </span>
        </span>
        <span className="dl-mover-rate">
          <span className="stat-label">{copy.deadlock.patch.pickRate}</span>
          <span>
            {pct(hero.pickRateBefore ?? 0)} <span aria-hidden="true">→</span>{" "}
            <b>{pct(hero.pickRate)}</b>
          </span>
        </span>
      </span>
    </li>
  );
}

/** La ruta de la página de un héroe, desde cualquier pestaña. */
const toHero = (route: Route, h: Hero): Route => ({
  ...route,
  view: "deadlock",
  dlSection: "meta",
  detail: heroSlugs.toSlug.get(String(h.heroId)),
});

/** Las cuatro cifras de un héroe, en una fila (Cowan 2001: cuatro, no más). */
function HeroKpis({ hero }: { hero: Hero }) {
  const copy = useCopy();
  const k = copy.deadlock.heroPage.kpis;
  const trendKind = hero.trend === undefined ? "" : hero.trend > 0 ? "is-good" : "is-bad";
  return (
    <div className="kpis dl-hero-kpis">
      <div className="kpi is-accent">
        <span className="kpi-value">{pct(hero.winRate)}</span>
        <span className="kpi-label">{k.winRate}</span>
      </div>
      <div className="kpi">
        <span className="kpi-value">{pct(hero.pickRate)}</span>
        <span className="kpi-label">{k.pickRate}</span>
      </div>
      <div
        className="kpi"
        title={hero.skillGap === undefined ? undefined : copy.deadlock.why.skillGap(signed(hero.skillGap))}
      >
        <span className="kpi-value">{hero.skillGap === undefined ? "—" : signed(hero.skillGap)}</span>
        <span className="kpi-label">{k.skillGap}</span>
      </div>
      <div
        className={`kpi ${trendKind}`}
        title={hero.trend === undefined ? undefined : copy.deadlock.why.trend(signed(hero.trend))}
      >
        <span className="kpi-value">{hero.trend === undefined ? "—" : signed(hero.trend)}</span>
        <span className="kpi-label">{k.trend}</span>
      </div>
    </div>
  );
}

/**
 * La página de un héroe, propia desde el rediseño del 2026-09-06.
 *
 * Antes el detalle se desplegaba debajo de su fila y `/deadlock/viscous`
 * empezaba con la tier list de los otros 37: quien llegaba desde Google veía
 * la tier list, no a Viscoso. Ahora: cabecera con cuatro cifras, sub-pestañas
 * ancladas a las secciones de la build, y al pie el anterior y el siguiente
 * de la tier list.
 */
function HeroPage({
  hero,
  heroes,
  route,
  navigate,
  picker,
  metaLine,
}: {
  hero: Hero;
  heroes: Hero[];
  route: Route;
  navigate: (route: Route) => void;
  picker: React.ReactNode;
  metaLine: React.ReactNode;
}) {
  const copy = useCopy();
  const hp = copy.deadlock.heroPage;
  const idx = heroes.indexOf(hero);
  const prev = idx > 0 ? heroes[idx - 1] : null;
  const next = idx >= 0 && idx < heroes.length - 1 ? heroes[idx + 1] : null;
  const back: Route = { ...route, view: "deadlock", dlSection: "meta", detail: undefined };

  return (
    <main className="deadlock deadlock-hero">
      <SectionHead
        eyebrow={
          <RouteLink className="sechead-back" to={back} onNavigate={navigate}>
            ← {copy.deadlock.title}
            {copy.deadlock.titleBreak}
          </RouteLink>
        }
        title={hero.name}
        accent={hero.tier}
        controls={picker}
        meta={metaLine}
      />

      <div className="page">
        <header className="box dl-hero-head">
          {hero.img && <img className="dl-hero-face" src={hero.img} alt="" width={96} height={96} />}
          <div className="dl-hero-id">
            <span className="dl-hero-rank">{hp.rank(String(idx + 1), String(heroes.length))}</span>
            <span className="dl-chips">
              {hero.difficulty && (
                <span
                  className="dl-chip"
                  data-kind={hero.difficulty}
                  title={copy.deadlock.why.skillGap(signed(hero.skillGap))}
                >
                  {copy.deadlock.difficulty[hero.difficulty]}
                </span>
              )}
              {hero.momentum && (
                <span
                  className="dl-chip"
                  data-kind={hero.momentum}
                  title={copy.deadlock.why.trend(signed(hero.trend))}
                >
                  <span aria-hidden="true">{hero.momentum === "up" ? "▲" : "▼"}</span>{" "}
                  {copy.deadlock.momentum[hero.momentum]}
                </span>
              )}
              {hero.thinData && (
                <span className="dl-chip" data-kind="thin" title={copy.deadlock.thinWhy}>
                  {copy.deadlock.thin}
                </span>
              )}
            </span>
          </div>
          <HeroKpis hero={hero} />
        </header>

        {/* Cinco anclas, fijas al scrollear. Apuntan a los encabezados que la
            tarjeta de build ya tiene; no reordenan nada. */}
        <nav className="seg dl-hero-tabs" aria-label={hero.name}>
          <a href="#dl-build">{hp.tabs.build}</a>
          <a href="#dl-skills">{hp.tabs.skills}</a>
          <a href="#dl-buy">{hp.tabs.buy}</a>
          <a href="#dl-counters">{hp.tabs.counters}</a>
          <a href="#dl-mastery">{hp.tabs.mastery}</a>
        </nav>

        <div className="dl-band-panel dl-hero-body">
          <DeadlockBuildCard heroId={hero.heroId} heroWinRate={hero.winRate} />
          <DeadlockMastery heroId={hero.heroId} />
        </div>

        <nav className="next-steps" aria-label={copy.deadlock.next.label}>
          {prev && (
            <RouteLink className="next-step" to={toHero(route, prev)} onNavigate={navigate}>
              <span className="next-step-label">
                ← {hp.prev} · {prev.tier}
              </span>
              <span className="next-step-title">{prev.name}</span>
            </RouteLink>
          )}
          <RouteLink className="next-step" to={back} onNavigate={navigate}>
            <span className="next-step-label">{copy.deadlock.next.label}</span>
            <span className="next-step-title">{hp.back}</span>
          </RouteLink>
          {next && (
            <RouteLink className="next-step" to={toHero(route, next)} onNavigate={navigate}>
              <span className="next-step-label">
                {hp.next} · {next.tier} →
              </span>
              <span className="next-step-title">{next.name}</span>
            </RouteLink>
          )}
        </nav>
      </div>
    </main>
  );
}

/**
 * Una banda de tier: la letra en un riel a la izquierda y los héroes fluyendo a
 * la derecha. Ya no se pliega ni despliega nada: cada tile es un enlace a la
 * página del héroe.
 */
function TierBand({
  tier,
  heroes,
  crest,
  route,
  navigate,
}: {
  tier: string;
  heroes: Hero[];
  crest: ReturnType<typeof bandCrest>;
  route: Route;
  navigate: (route: Route) => void;
}) {
  const { lang } = useLang();

  return (
    <section className="tier-group dl-band" data-tier={tier}>
      <div className="dl-rail">
        <span className="tier-mark">{tier}</span>
        <span className="dl-crest">
          {crest.badges.map((b) => (
            <img key={b.img} src={b.img} alt={text(b.name, lang)} width={22} height={22} loading="lazy" />
          ))}
          {crest.suffix && <span className="dl-crest-sign">{crest.suffix}</span>}
        </span>
        <span className="tier-count">{heroes.length}</span>
      </div>

      <ol className="dl-tiles">
        {heroes.map((h) => (
          <HeroTile key={h.heroId} hero={h} to={toHero(route, h)} onNavigate={navigate} />
        ))}
      </ol>
    </section>
  );
}

/** Una fila del rail: retrato, nombre y una cifra. */
function RailRow({
  hero,
  figure,
  route,
  navigate,
}: {
  hero: Hero;
  figure: React.ReactNode;
  route: Route;
  navigate: (route: Route) => void;
}) {
  return (
    <li>
      <RouteLink className="dl-rail-row" to={toHero(route, hero)} onNavigate={navigate}>
        {hero.img && <img src={hero.img} alt="" width={32} height={32} loading="lazy" />}
        <span className="dl-rail-name">{hero.name}</span>
        <span className="dl-rail-figure">{figure}</span>
      </RouteLink>
    </li>
  );
}

export default function Deadlock({
  route,
  navigate,
  section,
  band,
  picker,
  open,
}: {
  route: Route;
  navigate: (route: Route) => void;
  section: DeadlockSection;
  band: BandId;
  picker: React.ReactNode;
  /** El slug del héroe abierto, si la URL trae uno. */
  open?: string;
  onOpen?: (slug?: string) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const { lang } = useLang();
  const meta = useHeroes(band);

  const insignia = bandBadge(band);
  const crest = bandCrest(band);
  const movers = patchMovers(meta?.heroes ?? []);
  const enParches = section === "patches";

  const metaLine = meta && (
    <span className="dl-meta-line">
      {insignia.img && <img src={insignia.img} alt="" width={18} height={18} />}
      {meta.file.matches === 0
        ? copy.deadlock.emptyBand
        : `${copy.deadlock.sample(
            meta.file.matches.toLocaleString(locale),
            meta.file.from,
            meta.file.to
          )} · ${copy.deadlock.patch.since(meta.file.patch.title)}`}
    </span>
  );

  /**
   * `heroSlugs` sale de la banda PUBLICADA: un héroe que falta en ella no tiene
   * slug y `toSlug.get` da `undefined`; el `!!slug` evita que
   * `undefined === undefined` abra un héroe sin que nadie lo pida.
   */
  const abierto =
    meta && open
      ? meta.heroes.find((h) => {
          const slug = heroSlugs.toSlug.get(String(h.heroId));
          return !!slug && slug === open;
        })
      : undefined;

  if (meta && abierto) {
    return (
      <HeroPage
        hero={abierto}
        heroes={meta.heroes}
        route={route}
        navigate={navigate}
        picker={picker}
        metaLine={metaLine}
      />
    );
  }

  const masJugados = meta ? [...meta.heroes].sort((a, b) => b.pickRate - a.pickRate).slice(0, 5) : [];
  const topS = meta?.heroes[0];

  const parches = meta && (
    <section className="dl-patch dl-patch-page">
      {movers.up.length + movers.down.length === 0 ? (
        <p className="detail-note">{copy.deadlock.patch.none}</p>
      ) : (
        <div className="dl-patch-cols">
          <div className="dl-patch-col" data-dir="up">
            <h2 className="dl-patch-side">{copy.deadlock.patch.winners}</h2>
            <ol className="dl-mover-list">
              {movers.up.map((h, i) => (
                <MoverRow key={h.heroId} hero={h} rank={i + 1} />
              ))}
            </ol>
          </div>
          <div className="dl-patch-col" data-dir="down">
            <h2 className="dl-patch-side">{copy.deadlock.patch.losers}</h2>
            <ol className="dl-mover-list">
              {movers.down.map((h, i) => (
                <MoverRow key={h.heroId} hero={h} rank={i + 1} />
              ))}
            </ol>
          </div>
        </div>
      )}

      <PatchHistory />
    </section>
  );

  return (
    <main className="deadlock deadlock-meta">
      {/* Una línea: título a la izquierda, selector de banda a la derecha, la
          ficha técnica de la medición debajo. El selector no va en Parches: el
          historial es el mismo para todas las bandas. */}
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={enParches ? copy.deadlock.patchPage.title : copy.deadlock.title}
        accent={enParches ? copy.deadlock.patchPage.titleBreak : copy.deadlock.titleBreak}
        lead={[
          enParches ? copy.deadlock.patchPage.lead : copy.deadlock.lead,
          !enParches && copy.deadlock.note,
          meta && ON_FALLBACK_BAND && !enParches
            ? copy.deadlock.fallback(copy.deadlock.bands[PUBLISHED_BAND])
            : null,
        ]}
        controls={!enParches && picker}
        meta={metaLine}
      />

      {!meta ? (
        <p className="detail-note dl-loading">{copy.deadlock.loading}</p>
      ) : (
        <div className={enParches ? "page" : "page has-rail"}>
          <div className="page-main">
            {enParches ? (
              parches
            ) : (
              <>
                <div className="dl-bands">
                  {TIER_ORDER.map((tier) => {
                    const heroes = meta.heroes.filter((h) => h.tier === tier);
                    if (heroes.length === 0) return null;
                    return (
                      <TierBand
                        key={tier}
                        tier={tier}
                        heroes={heroes}
                        crest={crest}
                        route={route}
                        navigate={navigate}
                      />
                    );
                  })}
                </div>

                <p className="detail-note dl-legend">{copy.deadlock.rail.legend}</p>
                <p className="detail-note dl-footnote" lang={lang}>
                  {copy.deadlock.footnote}
                </p>

                {/* La página termina con un siguiente paso, no con el pie legal. */}
                <nav className="next-steps" aria-label={copy.deadlock.next.label}>
                  {topS && (
                    <RouteLink className="next-step" to={toHero(route, topS)} onNavigate={navigate}>
                      <span className="next-step-label">{copy.deadlock.next.label}</span>
                      <span className="next-step-title">{copy.deadlock.next.topHero(topS.name)}</span>
                    </RouteLink>
                  )}
                  <RouteLink
                    className="next-step"
                    to={{ ...route, view: "deadlock", dlSection: "items", detail: undefined }}
                    onNavigate={navigate}
                  >
                    <span className="next-step-label">{copy.deadlock.tabs.items}</span>
                    <span className="next-step-title">{copy.deadlock.next.items}</span>
                  </RouteLink>
                  <RouteLink
                    className="next-step"
                    to={{ ...route, view: "deadlock", dlSection: "player", detail: undefined }}
                    onNavigate={navigate}
                  >
                    <span className="next-step-label">{copy.deadlock.tabs.player}</span>
                    <span className="next-step-title">{copy.deadlock.next.profile}</span>
                  </RouteLink>
                </nav>
              </>
            )}
          </div>

          {!enParches && (
            <aside className="page-rail">
              <section className="box">
                <div className="box-head">
                  <h2 className="box-title">{copy.deadlock.rail.movers}</h2>
                  <p className="box-lead">{copy.deadlock.rail.moversLead}</p>
                </div>
                {movers.up.length + movers.down.length === 0 ? (
                  <p className="box-empty">{copy.deadlock.rail.moversNone}</p>
                ) : (
                  <ol className="dl-rail-list">
                    {movers.up.map((h) => (
                      <RailRow
                        key={h.heroId}
                        hero={h}
                        route={route}
                        navigate={navigate}
                        figure={<span className="delta is-up">▲ {signed(h.trend)}</span>}
                      />
                    ))}
                    {movers.down.map((h) => (
                      <RailRow
                        key={h.heroId}
                        hero={h}
                        route={route}
                        navigate={navigate}
                        figure={<span className="delta is-down">▼ {signed(h.trend)}</span>}
                      />
                    ))}
                  </ol>
                )}
              </section>

              <section className="box">
                <div className="box-head">
                  <h2 className="box-title">{copy.deadlock.rail.mostPlayed}</h2>
                </div>
                <ol className="dl-rail-list">
                  {masJugados.map((h) => (
                    <RailRow key={h.heroId} hero={h} route={route} navigate={navigate} figure={pct(h.pickRate)} />
                  ))}
                </ol>
              </section>

              <section className="box dl-rail-log">
                <div className="box-head">
                  <h2 className="box-title">{copy.deadlock.rail.changelog}</h2>
                </div>
                <PatchHistory limit={5} />
                <RouteLink
                  className="dl-rail-more"
                  to={{ ...route, view: "deadlock", dlSection: "patches", detail: undefined }}
                  onNavigate={navigate}
                >
                  {copy.deadlock.rail.allPatches} →
                </RouteLink>
              </section>
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
