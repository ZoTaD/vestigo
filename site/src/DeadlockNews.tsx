import type { CSSProperties } from "react";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import { useLang, useLocale } from "./i18n";
import { catalog } from "./deadlockData";
import gameArt from "@deadlock/game-art.json";
import { heroes as heroSlugs } from "./deadlockSlugs";
import { text } from "./localized";
import {
  editions,
  lineText,
  resolveSlug,
  useEdition,
  type Dir,
  type NewsLine,
  type Translation,
  type Verdict,
} from "./deadlockNewsData";
import { NEWS_COPY, headlineBank, pickFrom, stableVariant } from "./newsCopy";
import { ItemIcon } from "./DeadlockItemTip";
import GameImg from "./GameImg";

/**
 * Vestigo News: la edición de un parche, como periódico.
 *
 * Diseño "modelo A" que eligió ZoTaD el 2026-09-17 (ver
 * `docs/design/2026-09-17-vestigo-news-design.md`): la estética del juego, sus
 * fuentes, y **todos** los cambios. La edición es larga a propósito; lo que se
 * lee de un vistazo es la portada: el titular, el balance y las caras.
 *
 * Todo el CSS vive bajo `.vn` en `styles/news.css`.
 */

/** Fondo de arte de cada héroe, sacado del juego (games/deadlock/tools/game_assets.py). */
const BACKGROUNDS: Record<string, string> = gameArt.backgrounds;

const ARROW: Record<Dir, string> = { up: "▲", down: "▼", mid: "◆", fix: "✚" };
const VERDICT_DIR: Record<Verdict, Dir> = { nerf: "down", buff: "up", mixed: "mid", fix: "fix" };
const FALLBACK_COLOR = "#7f7866";

/** "cooldown: 34s → 38s": el "de → a" va resaltado, que es lo que se busca con la vista. */
function LineText({ value }: { value: string }) {
  const cap = value.charAt(0).toUpperCase() + value.slice(1);
  const m = cap.match(/^(.*?:\s*)?([^:]*→.*)$/);
  if (!m) return <>{cap}</>;
  return (
    <>
      {m[1]}
      <span className="vn-num">{m[2]}</span>
    </>
  );
}

function Lines({ lines, lang, es }: { lines: NewsLine[]; lang: "en" | "es"; es?: Translation }) {
  return (
    <ul className="vn-lines">
      {lines.map((l) => (
        <li key={l.src} className="vn-line">
          <span className="vn-arrow" data-dir={l.dir} aria-hidden="true">
            {ARROW[l.dir]}
          </span>
          <span>
            <LineText value={lineText(l, lang, es)} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Tag({ verdict, label }: { verdict: Verdict; label: string }) {
  return (
    <span className="vn-tag" data-v={verdict}>
      {ARROW[VERDICT_DIR[verdict]]} {label}
    </span>
  );
}

const jump = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function DeadlockNews({
  route,
  navigate,
  archive,
}: {
  route: Route;
  navigate: (route: Route) => void;
  /** El historial de parches del foro, para los que no tienen edición. */
  archive?: React.ReactNode;
}) {
  const { lang } = useLang();
  const locale = useLocale();
  const copy = NEWS_COPY[lang];
  const { slug, missing } = resolveSlug(route.detail);
  const loaded = useEdition(slug);

  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long" });
  const longDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const toEdition = (s: string): Route => ({ ...route, view: "deadlock", dlSection: "patches", detail: s });

  if (!slug) return <main className="deadlock vn-empty">{archive}</main>;
  if (!loaded) {
    return (
      <main className="deadlock">
        <p className="detail-note dl-loading">{copy.loading}</p>
      </main>
    );
  }

  const { edition: e, es } = loaded;
  const pending = lang === "es" && !es;
  const issue = editions.length - editions.findIndex((x) => x.slug === e.slug);
  const headline =
    (lang === "es" ? es?.headline : undefined) ??
    e.headline ??
    pickFrom(copy.headlines[headlineBank(e.score)], stableVariant(e.slug, 97));
  // Las dos líneas del titular: la primera palabra en dorado.
  const [first, ...rest] = headline.split(" ");
  const hit = e.heroes.filter((h) => h.verdict === "nerf").slice(0, 4);
  const heroOf = (id: number) => catalog.heroes[String(id)];
  const heroName = (id: number) => text(heroOf(id)?.name, lang, "?");

  return (
    <main className="deadlock vn-page">
      <article className="vn" lang={lang}>
        <div className="vn-meta vn-lbl">
          <span>{copy.issue(issue)}</span>
          <span>{longDate(e.date)}</span>
          <span>{copy.price}</span>
        </div>
        <header className="vn-masthead">
          <h1 className="vn-gold">{copy.masthead}</h1>
          <div className="vn-deco vn-lbl">
            <span>{copy.tagline}</span>
          </div>
        </header>
        <div className="vn-patchbar vn-lbl">
          <b>{e.title}</b>
          <span>Deadlock</span>
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            {copy.readNotes} ↗
          </a>
        </div>

        {missing && <p className="vn-notice">{copy.missing}</p>}
        {pending && <p className="vn-notice">{copy.pending}</p>}

        <section className="vn-front">
          <div>
            <div className="vn-kicker vn-lbl">{copy.kicker(e.title)}</div>
            <h2 className="vn-headline">
              <span className="vn-gold">{first}</span>
              {rest.length > 0 && (
                <>
                  <br />
                  {rest.join(" ")}
                </>
              )}
            </h2>
            <p className="vn-deck">{copy.deck(e.score, e.itemScore)}</p>
            <div className="vn-glance" aria-label={copy.glanceHint}>
              {(["nerf", "buff", "mixed", "fix"] as const).map((v) => {
                const hs = e.heroes.filter((h) => h.verdict === v);
                if (!hs.length) return null;
                return (
                  <div key={v} className="vn-glance-row" data-v={v}>
                    <div className="vn-lbl">
                      <b>{hs.length}</b>
                      {copy.score[v]}
                    </div>
                    <div className="vn-faces">
                      {hs.map((h) => (
                        <a
                          key={h.heroId}
                          href={`#vn-h${h.heroId}`}
                          onClick={jump(`vn-h${h.heroId}`)}
                          title={heroName(h.heroId)}
                          style={{ "--hc": heroOf(h.heroId)?.color || FALLBACK_COLOR } as CSSProperties}
                        >
                          <GameImg src={heroOf(h.heroId)?.img} alt={heroName(h.heroId)} width={42} height={42} />
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="vn-cover">
            <div className="vn-strip">
              {hit.map((h) => (
                <div key={h.heroId} style={{ backgroundImage: `url(${heroOf(h.heroId)?.card})` }} />
              ))}
            </div>
            <div className="vn-caption">
              {hit.length > 0 && (
                <>
                  <span className="vn-lbl vn-hit">▼ {copy.hit}</span>
                  <p>{hit.map((h) => heroName(h.heroId)).join(" · ")}</p>
                </>
              )}
              <div className="vn-totals vn-lbl">
                {[e.totals.heroLines, e.totals.itemLines, e.totals.general].map((n, i) => (
                  <div key={copy.totals[i]}>
                    <b>{n}</b>
                    {copy.totals[i]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {e.general.length > 0 && (
          <>
            <div className="vn-sec">
              <h2>{copy.system}</h2>
              <small className="vn-lbl">{copy.systemSub}</small>
            </div>
            <ol className="vn-general">
              {e.general.map((l) => (
                <li key={l.src}>
                  <span className="vn-arrow" data-dir={l.dir} aria-hidden="true">
                    {ARROW[l.dir]}
                  </span>
                  <span>{lineText(l, lang, es)}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="vn-sec">
          <h2>{copy.heroes}</h2>
          <small className="vn-lbl">{copy.heroesSub(e.totals.heroes, e.totals.heroLines)}</small>
        </div>
        <div className="vn-heroes">
          {e.heroes.map((h) => {
            const hero = heroOf(h.heroId);
            const slug = heroSlugs.toSlug.get(String(h.heroId));
            const name = heroName(h.heroId);
            return (
              <div
                key={h.heroId}
                id={`vn-h${h.heroId}`}
                className="vn-hero"
                style={
                  {
                    "--hc": hero?.color || FALLBACK_COLOR,
                    // El arte de fondo del héroe (el de su pantalla en el juego), detrás de su nombre.
                    ...(BACKGROUNDS[String(h.heroId)] ? { "--hbg": `url(${BACKGROUNDS[String(h.heroId)]})` } : {}),
                  } as CSSProperties
                }
              >
                <div className="vn-hero-top">
                  <GameImg className="vn-portrait" src={hero?.card || hero?.img} alt="" width={64} height={64} />
                  <div>
                    <h3>
                      {slug ? (
                        <RouteLink
                          to={{ ...route, view: "deadlock", dlSection: "meta", detail: slug }}
                          onNavigate={navigate}
                        >
                          {name}
                        </RouteLink>
                      ) : (
                        name
                      )}
                    </h3>
                    <Tag verdict={h.verdict} label={copy.verdict[h.verdict]} />
                  </div>
                  <div className="vn-tally">
                    {h.up > 0 && <div data-dir="up">▲ {h.up}</div>}
                    {h.down > 0 && <div data-dir="down">▼ {h.down}</div>}
                  </div>
                </div>
                {h.groups.map((g) => {
                  const ab = g.abilityId !== undefined ? e.abilities[String(g.abilityId)] : undefined;
                  return (
                    <div key={g.abilityId ?? "base"} className="vn-group">
                      <div className="vn-ghead">
                        {ab ? (
                          <GameImg className="vn-ab" src={ab.img} alt="" width={34} height={34} loading="lazy" />
                        ) : (
                          <span className="vn-base" aria-hidden="true">
                            ◆
                          </span>
                        )}
                        <div>
                          <b>{ab ? ab.name[lang] : copy.base}</b>
                          {ab ? (
                            lang === "es" && ab.name.es !== ab.name.en && <small>{ab.name.en}</small>
                          ) : (
                            <small>{copy.baseSub}</small>
                          )}
                        </div>
                      </div>
                      <Lines lines={g.lines} lang={lang} es={es} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {e.items.length > 0 && (
          <>
            <div className="vn-sec">
              <h2>{copy.items}</h2>
              <small className="vn-lbl">{copy.itemsSub(e.totals.items, e.totals.itemLines)}</small>
            </div>
            <div className="vn-items">
              {e.items.map((i) => {
                const info = e.itemInfo[String(i.itemId)];
                return (
                  <div key={i.itemId} className="vn-item" data-slot={info?.slot}>
                    <div className="vn-ihead">
                      <div className="vn-icon">
                        {info?.img && (
                          <ItemIcon itemId={i.itemId} img={info.img} size={32} />
                        )}
                      </div>
                      <div>
                        <h3>{info ? info.name[lang] : i.itemId}</h3>
                        <Tag verdict={i.verdict} label={copy.verdict[i.verdict]} />
                      </div>
                    </div>
                    <Lines lines={i.lines} lang={lang} es={es} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {e.unparsed.length > 0 && (
          <>
            <div className="vn-sec">
              <h2>{copy.unparsed}</h2>
            </div>
            <Lines lines={e.unparsed} lang={lang} es={es} />
          </>
        )}

        <footer className="vn-foot vn-lbl">
          <span>{copy.source}</span>
          <span>vestigo.gg</span>
        </footer>
      </article>

      <section className="box vn-archive">
        <div className="box-head">
          <h2 className="box-title">{copy.archive}</h2>
          <p className="box-lead">{copy.archiveLead}</p>
        </div>
        <ol className="vn-archive-list">
          {editions.map((x, i) => (
            <li key={x.slug} data-current={x.slug === e.slug ? "" : undefined}>
              <span className="vn-archive-date">{shortDate(x.date)}</span>
              <RouteLink to={toEdition(x.slug)} onNavigate={navigate} className="vn-archive-link">
                {(x.slug === e.slug ? headline : x.headline) ??
                  pickFrom(copy.headlines[headlineBank(x.score)], stableVariant(x.slug, 97))}
              </RouteLink>
              <span className="vn-archive-title">
                {x.title}
                {i === 0 && <span className="dl-history-tag">{copy.latest}</span>}
              </span>
              <span className="vn-archive-score">
                <span data-dir="down">▼ {x.score.nerf}</span> <span data-dir="up">▲ {x.score.buff}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {archive}
    </main>
  );
}
