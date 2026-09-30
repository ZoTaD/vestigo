/**
 * Parches (2026-09-29): los parches de Diablo II: Resurrected con un resumen
 * propio de lo que cambió (no las notas de Blizzard copiadas: esas se enlazan),
 * en los dos idiomas, y una página por parche (`/d2r/patches/3-3`).
 *
 * Los archivos viven en `games/d2r/data/patches/` y se leen con
 * `import.meta.glob`: si todavía no hay ninguno, la pestaña sale vacía en vez de
 * romper el build.
 */
import { useLang } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import type { Loc } from "./stats";
import { tr } from "./wiki";
import { BackLink, D2Head } from "./ui";

export interface PatchMeta {
  slug: string;
  version: string;
  date: string;
  season: number | null;
  title: Loc;
  url: string;
  /** `false` cuando Blizzard no publicó notas y el enlace va a su anuncio (el lanzamiento de RotW). */
  notes?: boolean;
}
interface Patch extends PatchMeta {
  summary: Loc;
  sections: { title: Loc; items: Loc[] }[];
}

const FILES = import.meta.glob("../../../games/d2r/data/patches/*.json", { eager: true, import: "default" }) as Record<string, unknown>;
const PATCHES: Patch[] = Object.entries(FILES)
  .filter(([path]) => !path.endsWith("/index.json"))
  .map(([, data]) => data as Patch)
  .sort((a, b) => b.date.localeCompare(a.date));

type Nav = (r: Route) => void;

export default function D2rPatches({ route, navigate }: { route: Route; navigate: Nav }) {
  const p = route.detail ? PATCHES.find((x) => x.slug === route.detail) : undefined;
  if (route.detail && p) return <PatchDetail p={p} route={route} navigate={navigate} />;
  return <PatchList route={route} navigate={navigate} missing={!!route.detail} />;
}

const fmtDate = (d: string, lang: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "long", year: "numeric" });

function PatchList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  return (
    <>
      <D2Head as="h1" title={t.tabs.patches} lede={t.patches.lede} />
      {missing && <p className="d2-empty">{t.wiki.notFound}</p>}
      {PATCHES.length === 0 && <p className="d2-empty">{t.patches.empty}</p>}
      <ul className="d2-patches">
        {PATCHES.map((p) => (
          <li key={p.slug}>
            <RouteLink className="d2-patch" to={{ ...route, detail: p.slug }} onNavigate={navigate}>
              <span className="d2-patch-v">{t.patches.version(p.version)}</span>
              <span className="d2-patch-txt">
                <b>{tr(p.title, lang)}</b>
                <small>
                  {fmtDate(p.date, lang)}
                  {p.season ? ` · ${t.season(p.season)}` : ""}
                </small>
                <span className="d2-patch-sum">{tr(p.summary, lang)}</span>
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>
    </>
  );
}

function PatchDetail({ p, route, navigate }: { p: Patch; route: Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  return (
    <article className="d2-detail d2-patch-page">
      <BackLink to={{ ...route, detail: undefined }} navigate={navigate} label={t.tabs.patches} />
      <h1 className="d2-detail-h">
        {t.patches.version(p.version)} · {tr(p.title, lang)}
      </h1>
      <p className="d2-detail-sub">
        {fmtDate(p.date, lang)}
        {p.season ? ` · ${t.season(p.season)}` : ""}
      </p>
      <p className="d2-patch-lead">{tr(p.summary, lang)}</p>
      {p.sections.map((s, i) => (
        <section key={i} className="d2-patch-sec">
          <h2 className="d2-h3">{tr(s.title, lang)}</h2>
          <ul>
            {s.items.map((it, j) => (
              <li key={j}>{tr(it, lang)}</li>
            ))}
          </ul>
        </section>
      ))}
      <a className="d2-patch-official" href={p.url} target="_blank" rel="noopener noreferrer">
        {p.notes === false ? t.patches.officialPost : t.patches.official} ↗
      </a>
    </article>
  );
}

/** Para el sitemap y los títulos: los parches que hay, sin cargar la pestaña. */
export const PATCH_LIST: PatchMeta[] = PATCHES.map(({ slug, version, date, season, title, url }) => ({ slug, version, date, season, title, url }));
