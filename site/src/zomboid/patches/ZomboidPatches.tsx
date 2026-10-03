/**
 * La pestaña Parches de Project Zomboid (2026-10-02): la lista de versiones (`/project-zomboid/patches`, en español
 * `/parches`) y la página de cada una (`/parches/42-21`, el mismo slug en los dos idiomas). Diseño:
 * docs/design/2026-09-30-zomboid.md, pestaña 11: la Crónica (resúmenes nuestros en/es, con las notas oficiales
 * enlazadas) y, desde la primera versión que guardamos completa, qué cambió de una a la otra, campo por campo.
 *
 * El índice viaja en el chunk (ver `data.ts`), así la lista no pasa nunca por "cargando…"; la página de cada versión
 * baja aparte. Una versión que no existe muestra la lista con una nota.
 */
import entSlugs from "virtual:pz-slugs-es/patch-ents";
import RouteLink from "../../RouteLink";
import { useLang, useLocale, type Lang } from "../../i18n";
import { registerPzSlugs, type Route } from "../../route";
import PzLoading from "../PzLoading";
import { Stamp, useLoad, wordFit } from "../ui";
import { usePatchesCopy, type PzPatchesCopy } from "./copy";
import { FIRST_RECORDED, KINDS, loadPatch, PATCH_INDEX, peekPatch, type PatchMeta, type PatchPage, type PatchSource } from "./data";
import { autoLede, firstCounts, fmtDate } from "./fields";
import PatchDiff from "./PatchDiff";
// Las hojas, los títulos y los enlaces son los de Objetos: la misma libreta. Lo propio de los parches va aparte.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-patches.css";

// Las direcciones en español de las fichas que enlazan los diffs (sólo ésas: ver `pzPatchEntSlugsModule` en
// vite.config.ts). Al cargarse el módulo, como en cada pestaña. Las versiones llevan el mismo slug en los dos idiomas.
registerPzSlugs(entSlugs);

type Nav = (r: Route) => void;

export default function ZomboidPatches({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const page = useLoad(slug, () => peekPatch(slug!), () => loadPatch(slug!));
  if (page.failed) return <PzLoading onRetry={page.retry} />;
  if (page.value) return <PatchView page={page.value} route={route} navigate={navigate} key={page.value.slug} />;
  if (slug !== null && page.value === undefined) return <PzLoading />;
  return <PatchList route={route} navigate={navigate} missing={slug !== null} />;
}

/** El resumen de una versión: el de la Crónica o, sin Crónica, las cuentas del diff. */
function lede(p: PatchMeta, lang: Lang, locale: string): string | null {
  if (p.summary) return p.summary[lang];
  return p.counts ? autoLede(p.counts, lang, locale) || null : null;
}

/** Los chips de texto de una versión en la lista: qué comparamos y cuántos hotfixes tuvo. */
function chips(p: PatchMeta, t: PzPatchesCopy, num: (n: number) => string): string[] {
  const out: string[] = [];
  if (p.counts) {
    for (const k of KINDS) {
      const c = p.counts[k];
      const n = c ? c.added + c.removed + c.changed : 0;
      if (n) out.push(`${t.kinds[k]} · ${num(n)}`);
    }
  } else if (p.first) {
    out.push(t.firstChip);
  } else {
    out.push(p.recorded ? t.sameChip : t.beforeChip);
  }
  if (p.hotfixes) out.push(t.hotfixCount(num(p.hotfixes)));
  return out;
}

function PatchList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = usePatchesCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const patches = PATCH_INDEX.patches;
  const oldest = patches.at(-1)?.version ?? PATCH_INDEX.current;

  return (
    <main className="pz-main pzi pzp">
      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        {missing && (
          <p className="pzi-missing" role="status">
            {t.notFound}
          </p>
        )}
        <h1 className="pzi-h1" style={wordFit(t.title)}>
          {t.title}
        </h1>
        <p>{t.intro(oldest, FIRST_RECORDED?.version ?? null, PATCH_INDEX.current)}</p>
        <p className="pzi-hand">{t.hand}</p>
      </section>

      {patches.map((p) => {
        const text = lede(p, lang, locale);
        return (
          <RouteLink className="pz-page pzp-ver" to={{ ...route, view: "zomboid", pzSection: "patches", detail: p.slug }} onNavigate={navigate} key={p.slug}>
            <span className="pzp-vhead">
              <span className="pzp-vnum">{p.version}</span>
              <span className="pzp-vmeta">
                <time dateTime={p.date}>{fmtDate(p.date, lang)}</time>
                {p.branch && <span>{t.branch[p.branch]}</span>}
                {p.hotfixOf && <span>{t.hotfixOf(p.hotfixOf.replace(/-/g, "."))}</span>}
              </span>
            </span>
            {p.title && <span className="pzp-vtitle">{p.title[lang]}</span>}
            {text && <span className="pzp-vlede">{text}</span>}
            <span className="pzp-chips">
              {chips(p, t, num).map((c) => (
                <span className="pzp-chip" key={c}>
                  {c}
                </span>
              ))}
            </span>
          </RouteLink>
        );
      })}
    </main>
  );
}

/** El texto de un enlace a una fuente: "Anuncio en Steam", "Notas completas de The Indie Stone" o el dominio. */
function sourceLabel(s: PatchSource, t: PzPatchesCopy): string {
  if (Object.hasOwn(t.sourceKind, s.kind)) return t.sourceKind[s.kind];
  try {
    return t.sourceOther(new URL(s.url).hostname.replace(/^www\./, ""));
  } catch {
    return t.sourceOther(s.url);
  }
}

/**
 * Las fuentes de una versión. Dos del mismo tipo (la 42.21 tiene dos anuncios en Steam) llevan su número, "Anuncio en
 * Steam (1)" y "(2)": dos enlaces con el mismo texto a destinos distintos confunden, sobre todo con un lector de
 * pantalla. Las fuentes no traen título ni fecha propios, así que el número es lo que las distingue.
 */
function sourceLabels(sources: PatchSource[], t: PzPatchesCopy): string[] {
  const labels = sources.map((s) => sourceLabel(s, t));
  const total = new Map<string, number>();
  for (const l of labels) total.set(l, (total.get(l) ?? 0) + 1);
  const seen = new Map<string, number>();
  return labels.map((l) => {
    if (total.get(l)! < 2) return l;
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return `${l} (${n})`;
  });
}

function Sources({ sources, t }: { sources: PatchSource[]; t: PzPatchesCopy }) {
  const labels = sourceLabels(sources, t);
  return (
    <ul className="pzp-sources">
      {sources.map((s, i) => (
        <li key={s.url}>
          <a href={s.url} rel="noopener" target="_blank">
            {labels[i]}
          </a>
        </li>
      ))}
    </ul>
  );
}

function PatchView({ page, route, navigate }: { page: PatchPage; route: Route; navigate: Nav }) {
  const t = usePatchesCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const toList: Route = { ...route, view: "zomboid", pzSection: "patches", detail: undefined };
  const toPatch = (slug: string): Route => ({ ...route, view: "zomboid", pzSection: "patches", detail: slug });
  const text = lede(page, lang, locale);
  const parent = page.hotfixOf ? PATCH_INDEX.patches.find((p) => p.slug === page.hotfixOf) : undefined;

  return (
    <main className="pz-main pzi pzi-ficha pzp">
      <nav className="pzi-crumb">
        <RouteLink to={toList} onNavigate={navigate}>
          ← {t.back}
        </RouteLink>
      </nav>

      <section className="pz-page pzi-head pzp-head">
        <span className="pz-clip" />
        <div className="pzi-titles">
          <p className="pzi-kick">{t.kicker}</p>
          <h1 className="pzi-h1" style={wordFit(page.version)}>
            {page.version}
          </h1>
          {page.title && <p className="pzp-title">{page.title[lang]}</p>}
        </div>
        <p className="pzp-meta">
          <time dateTime={page.date}>{fmtDate(page.date, lang)}</time>
          {page.branch && <span>{t.branch[page.branch]}</span>}
          {page.unstableDate && <span>{t.unstableOn(fmtDate(page.unstableDate, lang))}</span>}
          {page.hotfixOf && (
            <RouteLink className="pzp-link" to={toPatch(page.hotfixOf)} onNavigate={navigate}>
              {t.hotfixOf(parent?.version ?? page.hotfixOf.replace(/-/g, "."))}
            </RouteLink>
          )}
        </p>
      </section>

      {(text || page.highlights.length > 0) && (
        <section className="pz-page pzi-rel pzp-summary">
          {text && <p className="pzp-lede">{text}</p>}
          {page.highlights.length > 0 && (
            <>
              <h2 className="pzi-h2">
                <Stamp name="checkmark" />
                {t.highlights}
              </h2>
              <ul className="pzp-highlights">
                {page.highlights.map((h) => (
                  <li key={h.en}>{h[lang]}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {page.hotfixList.length > 0 && (
        <section className="pz-page pzi-rel pzp-hotfixes">
          <h2 className="pzi-h2">
            <Stamp name="wrench" />
            {t.hotfixes}
            <small>{page.hotfixList.length.toLocaleString(locale)}</small>
          </h2>
          <ol className="pzp-hotlist">
            {page.hotfixList.map((h) => (
              <li key={h.version}>
                <p className="pzp-hothead">
                  {h.slug ? (
                    <RouteLink className="pzp-link pzp-hotver" to={toPatch(h.slug)} onNavigate={navigate}>
                      {h.version}
                    </RouteLink>
                  ) : (
                    <b className="pzp-hotver">{h.version}</b>
                  )}
                  <time dateTime={h.date}>{fmtDate(h.date, lang)}</time>
                </p>
                <p className="pzp-hottext">{h.summary[lang]}</p>
                {h.sources.length > 0 && <Sources sources={h.sources} t={t} />}
              </li>
            ))}
          </ol>
        </section>
      )}

      {page.sources.length > 0 && (
        <section className="pz-page pzi-rel pzp-src">
          <h2 className="pzi-h2">
            <Stamp name="eye" />
            {t.sources}
          </h2>
          <Sources sources={page.sources} t={t} />
        </section>
      )}

      <section className="pz-page pzi-rel pzp-what">
        <h2 className="pzi-h2">
          <Stamp name="asterisk" />
          {t.whatChanged}
        </h2>
        {page.diff ? (
          <p className="pzp-note">
            {t.comparedWith}{" "}
            <RouteLink className="pzp-link" to={toPatch(page.diff.fromSlug)} onNavigate={navigate}>
              {page.diff.from}
            </RouteLink>
            .
          </p>
        ) : page.first ? (
          <p className="pzp-note">{t.first(firstCounts(page.first, lang, locale))}</p>
        ) : page.recorded ? (
          <p className="pzp-note">{t.same}</p>
        ) : (
          <p className="pzp-note">{t.before(FIRST_RECORDED?.version ?? PATCH_INDEX.current)}</p>
        )}
      </section>
      {page.diff && <PatchDiff page={page} route={route} navigate={navigate} />}

      <nav className="pzi-crumb pzp-bottom">
        <RouteLink to={toList} onNavigate={navigate}>
          ← {t.backBottom}
        </RouteLink>
      </nav>
    </main>
  );
}
