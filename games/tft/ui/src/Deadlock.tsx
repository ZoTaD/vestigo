import { useEffect, useRef, type CSSProperties } from "react";
import { useCopy, useLocale, useLang } from "./i18n";
import { text } from "./catalog";
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
  open,
  onToggle,
}: {
  hero: Hero;
  open: boolean;
  onToggle: () => void;
}) {
  const copy = useCopy();

  return (
    <li
      className="dl-tile"
      data-open={open}
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
      <button
        className="dl-tile-btn"
        onClick={onToggle}
        aria-expanded={open}
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
      </button>
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
function PatchHistory() {
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
        {file.patches.map((p, i) => (
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

/**
 * El héroe abierto: su ficha completa y su build.
 *
 * **Es donde vive todo lo que no entra en un tile de 66px** — el puesto, las
 * etiquetas con su texto entero, el pickrate rotulado. Adentro va lo que ya
 * existía en la fila desplegable, sin tocarlo.
 *
 * El `scrollIntoView` es para el teléfono: ahí la banda D se parte en seis
 * renglones y el panel puede abrirse lejos del tile que se apretó. `block:
 * "nearest"` no mueve nada si ya se ve, así que en escritorio no hace nada.
 */
function HeroPanel({ hero, rank }: { hero: Hero; rank: number }) {
  const copy = useCopy();
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    caja.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div className="dl-band-panel" ref={caja}>
      <header className="dl-panel-id">
        <span className="dl-rank">{String(rank).padStart(2, "0")}</span>

        {hero.img && <img className="dl-panel-face" src={hero.img} alt="" width={64} height={64} />}

        <span className="dl-identity">
          <span className="dl-name">{hero.name}</span>
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
        </span>

        <span className="stats dl-stats">
          <span className="stat stat-primary">
            <span className="stat-value">{pct(hero.winRate)}</span>
            <span className="stat-label">{copy.deadlock.stats.winRate}</span>
          </span>
          <span className="stat">
            <span className="stat-value">{pct(hero.pickRate)}</span>
            <span className="stat-label">{copy.deadlock.stats.pickRate}</span>
          </span>
        </span>
      </header>

      <DeadlockBuildCard heroId={hero.heroId} heroWinRate={hero.winRate} />
      <DeadlockMastery heroId={hero.heroId} />
    </div>
  );
}

/**
 * Una banda de tier: la letra en un riel a la izquierda y los héroes fluyendo a
 * la derecha.
 *
 * **Ya no se pliega.** Plegar existía porque la página medía cinco pantallas de
 * scroll; con las cinco bandas en ~662px (medido a 1920px, sin ningún panel
 * abierto) no hay nada que esconder, y de paso el motivo por el que el
 * contenido se montaba plegado —que Ctrl+F y Google lo encontraran— se cumple
 * solo.
 *
 * **Medido: a 1400px cada banda entra en un solo renglón de tiles** (la más
 * grande es D, con 16 de los 38 héroes). Eso es lo que deja que el panel se
 * abra "debajo de la banda" y quede pegado al tile que se apretó, sin que
 * ningún JavaScript mida dónde cayó.
 */
function TierBand({
  tier,
  heroes,
  allHeroes,
  crest,
  abiertoSlug,
  onHero,
}: {
  tier: string;
  heroes: Hero[];
  allHeroes: Hero[];
  crest: ReturnType<typeof bandCrest>;
  abiertoSlug?: string;
  onHero: (slug?: string) => void;
}) {
  const { lang } = useLang();
  /**
   * `heroSlugs` sale de la banda PUBLICADA, no de la que se está mirando: un
   * héroe que trae el archivo de banda actual y falta en el publicado no tiene
   * slug, así que `toSlug.get(...)` da `undefined`. Sin el `!!slug` de acá,
   * `undefined === undefined` matchea contra `abiertoSlug` sin abrir (el valor
   * por defecto, nada abierto) y ese héroe abre su panel solo. `HeroTile` ya
   * tiene esta misma guarda en su prop `open`; esta búsqueda le faltaba.
   */
  const abierto = heroes.find((h) => {
    const slug = heroSlugs.toSlug.get(String(h.heroId));
    return !!slug && slug === abiertoSlug;
  });

  // `data-open` no es decorativo: la banda mide lo que miden sus tiles, y el
  // panel de build cuelga de ella a `grid-column: 1 / -1`. Sin esta bandera,
  // abrir un héroe de la C —que tiene dos— metería la build en 260px.
  return (
    <section className="tier-group dl-band" data-tier={tier} data-open={!!abierto}>
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
        {heroes.map((h) => {
          const slug = heroSlugs.toSlug.get(String(h.heroId));
          return (
            <HeroTile
              key={h.heroId}
              hero={h}
              open={!!slug && slug === abiertoSlug}
              onToggle={() => onHero(slug === abiertoSlug ? undefined : slug)}
            />
          );
        })}
      </ol>

      {/* La `key` NO es decorativa ni la pide React: **fuerza el remontaje al
          cambiar de héroe dentro de la misma banda**. Sin ella React reusa la
          instancia, y eso rompía dos cosas medidas en teléfono — el
          `scrollIntoView` del panel no volvía a correr (se abría a 2.408px con
          la pantalla en 0) y la tarjeta de build conservaba la pestaña elegida
          para el héroe anterior. */}
      {abierto && (
        <HeroPanel key={abierto.heroId} hero={abierto} rank={allHeroes.indexOf(abierto) + 1} />
      )}
    </section>
  );
}

export default function Deadlock({
  section,
  band,
  picker,
  open,
  onOpen,
}: {
  section: DeadlockSection;
  band: BandId;
  /** El selector, dibujado por App para que la banda sobreviva al cambio de pestaña. */
  picker: React.ReactNode;
  /**
   * El slug del héroe con la fila abierta, si la URL trae uno. Vive en la
   * URL y no en estado local, para que un héroe se pueda compartir por
   * link — mismo criterio que `UnitsView` de TFT.
   */
  open?: string;
  onOpen: (slug?: string) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const { lang } = useLang();
  const meta = useHeroes(band);

  const insignia = bandBadge(band);
  const insigniaPublicada = bandBadge(PUBLISHED_BAND);
  const crest = bandCrest(band);
  const movers = patchMovers(meta?.heroes ?? []);
  const enParches = section === "patches";

  /**
   * La sección de cambios se mudó del meta a su propia pestaña.
   *
   * Abajo de la tier list competía con ella por la misma pantalla y obligaba a
   * scrollear treinta y ocho filas para llegar. Como pestaña contesta su propia
   * pregunta —"¿qué cambió?"— sin pelear con la de "¿quién es mejor?".
   */
  const parches = meta && (
    <section className="dl-patch dl-patch-page">
      {/* Hasta que haya dos ventanas rankeadas que comparar, esta pestaña vivía
          de una sola frase. El historial es lo que sí tenemos y es lo que el
          jugador viene a buscar cuando entra acá. */}
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
      {/* Lo que explica la página a la izquierda, lo que la controla a la
          derecha. Antes iba todo apilado y la primera fila de héroe arrancaba a
          dos pantallas de scroll: el encabezado editorial es de página de
          aterrizaje, no de una pestaña que se usa. */}
      <div className="tool-head">
        <header className="masthead">
          <p className="eyebrow">{copy.deadlock.eyebrow}</p>
          <h1 className="title">
            {enParches ? copy.deadlock.patchPage.title : copy.deadlock.title}
            <span className="title-break">
              {enParches ? copy.deadlock.patchPage.titleBreak : copy.deadlock.titleBreak}
            </span>
          </h1>
          <p className="standfirst">
            {enParches ? copy.deadlock.patchPage.lead : copy.deadlock.lead}
          </p>
        </header>

        <div className="tool-controls">
          {/**
           * El selector de banda **no va en la pestaña de parches**.
           *
           * Lo que esa pestaña muestra hoy es el historial de los últimos doce
           * parches, que es el mismo para todas las bandas: un control que no
           * cambia nada de lo que se ve es peor que ningún control, porque
           * invita a probarlo y a desconfiar de la página cuando no pasa nada.
           *
           * Las columnas de ganadores y perdedores SÍ dependen de la banda, y
           * están vacías hasta que haya un segundo parche ranked que comparar
           * (ver `patchMovers`). El día que se llenen, el picker vuelve acá.
           */}
          {!enParches && picker}
          {meta && ON_FALLBACK_BAND && !enParches && (
            /* Mientras lo publicado no sea Fantasma+. Se apaga solo.
               Tampoco va en parches: explica de qué banda salen los números
               cuando hay banda que elegir, y ahí no la hay. */
            <p className="detail-note dl-fallback">
              {insigniaPublicada.img && (
                // `.dl-fallback img` fuerza 1.6rem (30,4px con la raíz de 19px):
                // el atributo tiene que decir lo que el CSS de verdad dibuja para
                // reservar el espacio correcto y no mentir.
                <img src={insigniaPublicada.img} alt="" width={30} height={30} />
              )}
              <span>{copy.deadlock.fallback(copy.deadlock.bands[PUBLISHED_BAND])}</span>
            </p>
          )}
        </div>

        {/**
         * De qué está hecha la medición: partidas, ventana, banda y parche.
         *
         * **Cruza las dos columnas y va al pie del encabezado**, con una regla
         * arriba y otra abajo. Antes vivía apretada en la columna derecha,
         * debajo del selector de banda, donde parecía una nota al pie de ese
         * control en vez de lo que es: la ficha técnica de todo lo que la página
         * afirma. Separada por reglas se lee como el pie de imprenta de un
         * informe, que es exactamente su papel.
         *
         * Es una sola línea y no tres notas apiladas: las cuatro que había antes
         * medían 167px de los 345 del encabezado, y ninguna contesta la pregunta
         * con la que alguien entra.
         */}
        {meta && (
          <p className="detail-note dl-meta-line">
            {insignia.img && <img src={insignia.img} alt="" width={18} height={18} />}
            {meta.file.matches === 0
              ? copy.deadlock.emptyBand
              : `${copy.deadlock.sample(
                  meta.file.matches.toLocaleString(locale),
                  meta.file.from,
                  meta.file.to
                )} · ${copy.deadlock.patch.since(meta.file.patch.title)}`}
          </p>
        )}
      </div>

      {!meta ? (
        <p className="detail-note dl-loading">{copy.deadlock.loading}</p>
      ) : (
        <div className="tiers dl-bands">
          {enParches && parches}

          {!enParches &&
            TIER_ORDER.map((tier) => {
              const heroes = meta.heroes.filter((h) => h.tier === tier);
              if (heroes.length === 0) return null;
              return (
                <TierBand
                  key={tier}
                  tier={tier}
                  heroes={heroes}
                  allHeroes={meta.heroes}
                  crest={crest}
                  abiertoSlug={open}
                  onHero={onOpen}
                />
              );
            })}

          <p className="detail-note dl-footnote" lang={lang}>
            {copy.deadlock.footnote}
          </p>
        </div>
      )}
    </main>
  );
}
