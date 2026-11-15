import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLang } from "./i18n";
import { useCopy } from "./deadlockCopy";
import SectionHead from "./SectionHead";
import RouteLink from "./RouteLink";
import GameImg from "./GameImg";
import { ItemIcon } from "./DeadlockItemTip";
import { PUBLISHED_BAND, useHeroes, type Hero } from "./deadlockData";
import { buildItems } from "./deadlockItemsData";
import { bySlot, useHeroBuilds, type AbilityView } from "./deadlockBuildsData";
import { stepLabels } from "./deadlockBuildGuide";
import { categoryName } from "./deadlockTopPlayers";
import { heroes as heroSlugs } from "./deadlockSlugs";
import { routePath, type Route } from "./route";
import { BUILDS_COPY, fmtN, fmtPct } from "./deadlockBuildsCopy";
import { copyText, editorSearch } from "./deadlockBuildLinks";
import {
  BUILD_LANGS,
  MAX_TAGS,
  MIN_MATCHES_FOR_RATE,
  NOTE_MAX,
  VESTIGO_TAGS,
  allItems,
  fetchLiveBuild,
  isOffensive,
  langMatches,
  loginHref,
  publishBuild,
  recommended,
  shared,
  sortBuilds,
  unpublishBuild,
  useAccount,
  useBuildsIndex,
  useHeroCommunityBuilds,
  useMine,
  usePublished,
  winRate,
  type BuildSort,
  type BuildStyle,
  type CommunityBuild,
  type HeroBuildsFile,
  type IndexCard,
  type PublishedRow,
  type PublishError,
} from "./deadlockCommunityBuilds";
import "./styles/deadlock-builds.css";

/**
 * Builds (`/deadlock/builds`), 2026-11-15. Plan:
 * `docs/plans/2026-11-15-builds-comunidad-plan.md`; maquetas:
 * `docs/maquetas/2026-11-14-builds/`.
 *
 * Tres páginas con la misma pestaña:
 * - `/deadlock/builds`: la portada (elegir héroe, las más jugadas).
 * - `/deadlock/builds/<héroe>`: la biblioteca del héroe (Recomendadas,
 *   Comunidad, De los mejores, Mis builds), con la lista a la izquierda y la
 *   build elegida a la derecha.
 * - `/deadlock/builds/<héroe>/<id>`: la ficha de una build.
 *
 * Las builds son del juego (deadlock-api); acá se listan con su % de victoria
 * y se suma lo que la gente sube con Steam (`api/src/builds/`).
 */

type Copy = (typeof BUILDS_COPY)["en"];
type Tab = "recommended" | "community" | "top" | "mine";
const TABS: Tab[] = ["recommended", "community", "top", "mine"];
const STYLES: (BuildStyle | "all")[] = ["all", "weapon", "spirit", "vitality", "hybrid"];
const SORTS: BuildSort[] = ["popular", "winrate", "new"];
/** Desde este ancho la build elegida se ve al costado de la lista; más chico, la tarjeta abre la ficha. */
const SIDE_BY_SIDE = "(min-width: 1000px)";

const daysSince = (ts: number) => Math.max(0, Math.floor((Date.now() / 1000 - ts) / 86400));

export default function DeadlockBuilds({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const { lang } = useLang();
  const c = BUILDS_COPY[lang];
  const heroesMeta = useHeroes(PUBLISHED_BAND);
  const [slug, idText] = (route.detail ?? "").split("/");
  const heroId = slug ? Number(heroSlugs.toId.get(slug)) : NaN;
  const hero = heroesMeta?.heroes.find((h) => h.heroId === heroId) ?? null;

  const to = (detail?: string): Route => ({ ...route, view: "deadlock", dlSection: "builds", detail });
  const toHero = (h: Hero) => to(heroSlugs.toSlug.get(String(h.heroId)));

  if (!slug || !Number.isFinite(heroId)) return <BuildsHub c={c} route={route} navigate={navigate} heroes={heroesMeta?.heroes ?? []} toHero={toHero} to={to} />;
  if (!hero) return <p className="detail-note">{c.loading}</p>;
  if (idText) return <BuildPage c={c} route={route} navigate={navigate} hero={hero} buildId={Number(idText)} to={to} />;
  return <HeroLibrary c={c} route={route} navigate={navigate} hero={hero} heroes={heroesMeta?.heroes ?? []} toHero={toHero} to={to} />;
}

/* ── Piezas chicas ─────────────────────────────────────────────────── */

const displayName = (b: { id: number; name: string }, c: Copy) => b.name || c.buildN(b.id);
const authorOf = (b: { authorName: string }, c: Copy) => b.authorName || c.player;

/** Un aviso que se lee en voz alta y se va solo. */
function useToast(): [string, (msg: string) => void] {
  const [msg, setMsg] = useState("");
  const t = useRef<number>();
  const show = (m: string) => {
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(""), 2600);
  };
  useEffect(() => () => window.clearTimeout(t.current), []);
  return [msg, show];
}

function Toast({ msg }: { msg: string }) {
  return (
    <p className="dl-bl-toast" role="status" aria-live="polite" data-show={msg ? true : undefined}>
      {msg}
    </p>
  );
}

function WinRate({ b, c, lang, big }: { b: { wins: number; matches: number }; c: Copy; lang: "en" | "es"; big?: boolean }) {
  const wr = winRate(b);
  if (wr === null) return <span className="dl-bl-wr is-none">—</span>;
  const pocas = b.matches < MIN_MATCHES_FOR_RATE;
  return (
    <span className={`dl-bl-wr${big ? " is-big" : ""}`} data-good={!pocas && wr >= 0.52 ? true : undefined} data-bad={!pocas && wr < 0.48 ? true : undefined} title={pocas ? c.fewMatches : undefined}>
      {fmtPct(wr, lang)}
      {pocas && <span aria-hidden="true">*</span>}
    </span>
  );
}

function Badges({ b, c, byData, top }: { b: { official?: true; verified?: true }; c: Copy; byData?: boolean; top?: boolean }) {
  return (
    <>
      {b.official && <span className="dl-bl-badge is-official">{c.badges.official}</span>}
      {byData && !b.official && <span className="dl-bl-badge is-data">{c.badges.data}</span>}
      {b.verified && (
        <span className="dl-bl-badge is-verified" title={c.verifiedTip}>
          <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
            <path d="M6.4 11.6 2.8 8l1.4-1.4 2.2 2.2 5.4-5.4L13.2 4.8z" fill="currentColor" />
          </svg>
          {c.badges.verified}
        </span>
      )}
      {top && <span className="dl-bl-badge is-top">{c.badges.top}</span>}
    </>
  );
}

function Avatar({ src, size = 20 }: { src: string; size?: number }) {
  return src ? (
    <img className="dl-bl-avatar" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
  ) : (
    <span className="dl-bl-avatar is-empty" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

const STYLE_ICON: Record<BuildStyle, string> = { weapon: "weapon", spirit: "spirit", vitality: "vitality", hybrid: "hybrid" };

function StylePill({ s, c }: { s: BuildStyle; c: Copy }) {
  return (
    <span className="dl-bl-style" data-style={STYLE_ICON[s]}>
      {c.style[s]}
    </span>
  );
}

/* ── Portada ───────────────────────────────────────────────────────── */

function BuildsHub({
  c,
  route,
  navigate,
  heroes,
  toHero,
  to,
}: {
  c: Copy;
  route: Route;
  navigate: (r: Route) => void;
  heroes: Hero[];
  toHero: (h: Hero) => Route;
  to: (detail?: string) => Route;
}) {
  const { lang } = useLang();
  const dl = useCopy().deadlock;
  const index = useBuildsIndex();
  const [q, setQ] = useState("");
  const [subir, setSubir] = useState(false);
  const subirRef = useRef<HTMLDivElement>(null);
  const lista = useMemo(() => [...heroes].sort((a, b) => a.name.localeCompare(b.name, lang)), [heroes, lang]);
  const filtrados = q ? lista.filter((h) => h.name.toLowerCase().includes(q.trim().toLowerCase())) : lista;
  const total = index ? Object.values(index.heroes).reduce((s, h) => s + h.builds, 0) : 0;
  const top = useMemo(() => {
    if (!index) return [];
    return lista
      .map((h) => ({ h, b: index.heroes[String(h.heroId)]?.top[0] }))
      .filter((x): x is { h: Hero; b: IndexCard } => !!x.b)
      .sort((a, b) => b.b.matches - a.b.matches)
      .slice(0, 12);
  }, [index, lista]);

  useEffect(() => {
    if (subir) subirRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [subir]);

  return (
    <section className="deadlock dl-builds">
      <SectionHead
        eyebrow={c.eyebrow}
        title={c.title}
        accent={c.titleAccent}
        lead={c.how}
        meta={index ? <span>{c.meta(total, index.matches, index.from, index.to, lang)}</span> : undefined}
        controls={
          <div className="dl-bl-ctas">
            <RouteLink className="dl-bl-btn is-primary" to={{ ...route, dlSection: "builder", detail: undefined }} onNavigate={navigate}>
              {c.makeBuild}
            </RouteLink>
            <button type="button" className="dl-bl-btn" onClick={() => setSubir(true)} aria-expanded={subir}>
              {c.uploadBuild}
            </button>
          </div>
        }
      />
      <p className="dl-bl-lead">{c.lead}</p>

      <div className="dl-bl-hub-head">
        <h2 className="dl-bl-h2">{c.pickHero}</h2>
        <label className="dl-bl-search is-small">
          <SearchIcon />
          <span className="visually-hidden">{c.searchHero}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.searchHero} />
        </label>
      </div>
      <ul className="dl-bl-heroes">
        {filtrados.map((h) => {
          const info = index?.heroes[String(h.heroId)];
          return (
            <li key={h.heroId}>
              <RouteLink className="dl-bl-herocard" to={toHero(h)} onNavigate={navigate} style={h.color ? { ["--hero" as string]: h.color } : undefined}>
                <GameImg src={h.card || h.img} alt="" width={96} height={128} loading="lazy" decoding="async" />
                <span className="dl-bl-herocard-name">{h.name}</span>
                {info && <span className="dl-bl-herocard-n">{c.heroBuilds(info.builds)}</span>}
              </RouteLink>
            </li>
          );
        })}
      </ul>

      {top.length > 0 && (
        <section className="dl-bl-section" aria-labelledby="dl-bl-most">
          <h2 className="dl-bl-h2" id="dl-bl-most">
            {c.mostPlayed}
          </h2>
          <p className="dl-bl-sub">{c.mostPlayedLead}</p>
          <ol className="dl-bl-mostlist">
            {top.map(({ h, b }) => (
              <li key={b.id}>
                <RouteLink className="dl-bl-most" to={to(`${heroSlugs.toSlug.get(String(h.heroId))}/${b.id}`)} onNavigate={navigate}>
                  <GameImg src={h.img} alt="" width={44} height={44} className="dl-bl-most-hero" loading="lazy" decoding="async" />
                  <span className="dl-bl-most-text">
                    <span className="dl-bl-most-name">{displayName(b, c)}</span>
                    <span className="dl-bl-most-meta">
                      {h.name} · {authorOf(b, c)}
                    </span>
                  </span>
                  <span className="dl-bl-most-items" aria-hidden="true">
                    {b.key.map((id) => (
                      <ItemIcon key={id} itemId={id} size={32} tip={false} />
                    ))}
                  </span>
                  <span className="dl-bl-most-nums">
                    <WinRate b={b} c={c} lang={lang} />
                    <span className="dl-bl-most-matches">
                      {fmtN(b.matches, lang)} {c.matches.toLowerCase()}
                    </span>
                  </span>
                </RouteLink>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div ref={subirRef}>{subir && <UploadPanel c={c} heroes={heroes} route={route} navigate={navigate} to={to} />}</div>
      {index === null && <p className="detail-note">{dl.loading}</p>}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/* ── Biblioteca de un héroe ────────────────────────────────────────── */

/** Una fila de la lista: lo que da la build del juego más lo que sumó quien la subió. */
interface Row {
  build: CommunityBuild | null;
  /** La subida a Vestigo, si la hay. */
  pub?: PublishedRow;
  id: number;
}

function HeroLibrary({
  c,
  route,
  navigate,
  hero,
  heroes,
  toHero,
  to,
}: {
  c: Copy;
  route: Route;
  navigate: (r: Route) => void;
  hero: Hero;
  heroes: Hero[];
  toHero: (h: Hero) => Route;
  to: (detail?: string) => Route;
}) {
  const { lang } = useLang();
  const file = useHeroCommunityBuilds(hero.heroId);
  const [pubVersion, setPubVersion] = useState(0);
  const published = usePublished(hero.heroId, pubVersion);
  const heroSlug = heroSlugs.toSlug.get(String(hero.heroId))!;

  // La pestaña viaja en `?t=` (sin la de por defecto): un link a "Comunidad" abre Comunidad.
  const [tab, setTabState] = useState<Tab>("recommended");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (t && (TABS as string[]).includes(t)) setTabState(t as Tab);
  }, [hero.heroId]);
  const setTab = (t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === "recommended") url.searchParams.delete("t");
    else url.searchParams.set("t", t);
    window.history.replaceState(window.history.state, "", url);
  };

  const [q, setQ] = useState("");
  const [style, setStyle] = useState<BuildStyle | "all">("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [sort, setSort] = useState<BuildSort>("popular");
  const [sel, setSel] = useState<number | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(SIDE_BY_SIDE);
    const f = () => setWide(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  useEffect(() => setSel(null), [hero.heroId, tab]);

  const itemName = useItemNames(lang);
  const builds = file?.builds ?? [];
  const pubById = useMemo(() => new Map((published ?? []).map((p) => [p.id, p])), [published]);
  const rec = useMemo(() => recommended(builds, 3, lang), [builds, lang]);

  const rows: Row[] = useMemo(() => {
    const conDatos = new Set(builds.map((b) => b.id));
    const base = (xs: CommunityBuild[]): Row[] => xs.map((b) => ({ build: b, pub: pubById.get(b.id), id: b.id }));
    if (tab === "recommended") return base(rec.builds);
    if (tab === "top") return base(builds.filter((b) => topIds(file).has(b.id)));
    if (tab === "community") {
      let xs = builds;
      if (style !== "all") xs = xs.filter((b) => b.style === style);
      if (onlyMine) xs = xs.filter((b) => langMatches(b.lang, lang));
      if (q.trim()) {
        const t = q.trim().toLowerCase();
        xs = xs.filter(
          (b) =>
            b.name.toLowerCase().includes(t) ||
            b.authorName.toLowerCase().includes(t) ||
            String(b.id) === t ||
            allItems(b).some((id) => itemName(id).toLowerCase().includes(t)),
        );
      }
      const out = base(sortBuilds(xs, sort));
      // Las subidas que todavía no están en los datos del día van primero si no hay filtros.
      const nuevas = (published ?? []).filter((p) => !conDatos.has(p.id));
      if (!q.trim() && style === "all" && !onlyMine) return [...nuevas.map((p) => ({ build: null, pub: p, id: p.id })), ...out];
      return out;
    }
    return [];
  }, [builds, tab, style, onlyMine, q, sort, pubById, published, rec, lang, itemName, file]);

  const selected = rows.find((r) => r.id === sel) ?? rows[0] ?? null;
  const hasFilters = q.trim() !== "" || style !== "all" || onlyMine;
  const count = (t: Tab) => (t === "recommended" ? rec.builds.length : t === "community" ? builds.length + (published ?? []).filter((p) => !builds.some((b) => b.id === p.id)).length : t === "top" ? topIds(file).size : null);

  return (
    <section className="deadlock dl-builds">
      <RouteLink className="dl-bl-back" to={to()} onNavigate={navigate}>
        ← {c.back}
      </RouteLink>
      <SectionHead
        eyebrow={c.eyebrow}
        title={c.heroTitle(hero.name)}
        lead={c.how}
        meta={file ? <span>{c.meta(builds.length, builds.reduce((s, b) => s + b.matches, 0), file.from, file.to, lang)}</span> : undefined}
        controls={
          <div className="dl-bl-ctas">
            <RouteLink className="dl-bl-btn is-primary" to={{ ...route, dlSection: "builder", detail: undefined }} onNavigate={navigate} search={`?b=${hero.heroId.toString(36)}`}>
              {c.makeBuild}
            </RouteLink>
            <button type="button" className="dl-bl-btn" onClick={() => setTab("mine")}>
              {c.uploadBuild}
            </button>
          </div>
        }
      />

      <nav className="dl-bl-heropick" aria-label={c.pickHero}>
        {[...heroes].sort((a, b) => a.name.localeCompare(b.name, lang)).map((h) => (
          <RouteLink key={h.heroId} className="dl-bl-heropick-btn" to={toHero(h)} onNavigate={navigate} active={h.heroId === hero.heroId} title={h.name} aria-label={h.name}>
            <GameImg src={h.img} alt="" width={40} height={40} loading="lazy" decoding="async" />
          </RouteLink>
        ))}
      </nav>

      <div className="dl-bl-tabs" role="tablist" aria-label={c.heroTitle(hero.name)}>
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" id={`dl-bl-tab-${t}`} aria-selected={tab === t} aria-controls="dl-bl-panel" className="dl-bl-tab" onClick={() => setTab(t)}>
            {c.tabs[t]}
            {count(t) !== null && <span className="dl-bl-tab-n">{count(t)}</span>}
          </button>
        ))}
      </div>

      <div id="dl-bl-panel" role="tabpanel" aria-labelledby={`dl-bl-tab-${tab}`}>
        {tab === "mine" ? (
          <UploadPanel c={c} heroes={heroes} route={route} navigate={navigate} to={to} heroId={hero.heroId} onChange={() => setPubVersion((v) => v + 1)} />
        ) : file === undefined ? (
          <p className="detail-note">{c.loading}</p>
        ) : builds.length === 0 && rows.length === 0 ? (
          <p className="detail-note">{c.noData}</p>
        ) : (
          <>
            <p className="dl-bl-sub">
              {tab === "recommended" ? (rec.byData ? c.recommendedByData : c.recommendedLead) : tab === "top" ? c.topLead : c.communityLead(builds.length)}
            </p>
            {tab === "community" && (
              <div className="dl-bl-filters">
                <label className="dl-bl-search">
                  <SearchIcon />
                  <span className="visually-hidden">{c.search}</span>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.search} />
                </label>
                <div className="dl-bl-chips" role="group" aria-label={c.styleLabel}>
                  {STYLES.map((s) => (
                    <button key={s} type="button" className="dl-bl-chip" aria-pressed={style === s} onClick={() => setStyle(s)}>
                      {c.style[s]}
                    </button>
                  ))}
                </div>
                <label className="dl-bl-check">
                  <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                  {c.lang.mine}
                </label>
                {hasFilters && (
                  <button
                    type="button"
                    className="dl-bl-btn is-ghost"
                    onClick={() => {
                      setQ("");
                      setStyle("all");
                      setOnlyMine(false);
                    }}
                  >
                    {c.clear}
                  </button>
                )}
                <label className="dl-bl-sort">
                  {c.sort.label}
                  <select value={sort} onChange={(e) => setSort(e.target.value as BuildSort)}>
                    {SORTS.map((s) => (
                      <option key={s} value={s}>
                        {c.sort[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {rows.length === 0 ? (
              <div className="dl-bl-empty">
                <p>{c.none}</p>
                {hasFilters && (
                  <button
                    type="button"
                    className="dl-bl-btn"
                    onClick={() => {
                      setQ("");
                      setStyle("all");
                      setOnlyMine(false);
                    }}
                  >
                    {c.clear}
                  </button>
                )}
              </div>
            ) : (
              <div className="dl-bl-layout">
                <ul className="dl-bl-list">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <BuildRow
                        r={r}
                        c={c}
                        lang={lang}
                        href={routePath(to(`${heroSlug}/${r.id}`))}
                        on={wide && selected?.id === r.id}
                        byData={tab === "recommended" && rec.byData}
                        top={topIds(file).has(r.id)}
                        tags={file?.tags ?? {}}
                        onOpen={(e) => {
                          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                          e.preventDefault();
                          if (wide) setSel(r.id);
                          else navigate(to(`${heroSlug}/${r.id}`));
                        }}
                      />
                    </li>
                  ))}
                </ul>
                {wide && selected && (
                  <aside className="dl-bl-preview" aria-label={displayName(selected.build ?? { id: selected.id, name: selected.pub?.name ?? "" }, c)}>
                    <BuildDetail
                      key={selected.id}
                      c={c}
                      hero={hero}
                      row={selected}
                      file={file}
                      route={route}
                      navigate={navigate}
                      to={to}
                      compact
                      byData={tab === "recommended" && rec.byData}
                    />
                  </aside>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const topCache = new WeakMap<HeroBuildsFile, Set<number>>();
/** Las builds que trajo el top de la escalera: las forzadas que no son elegidas ni subidas. */
function topIds(file: HeroBuildsFile | null | undefined): Set<number> {
  if (!file) return new Set();
  let s = topCache.get(file);
  if (!s) {
    s = new Set(file.builds.filter((b) => (b as CommunityBuild & { top?: true }).top).map((b) => b.id));
    topCache.set(file, s);
  }
  return s;
}

function useItemNames(lang: "en" | "es"): (id: number) => string {
  return useMemo(() => {
    const m = new Map(buildItems(PUBLISHED_BAND, lang).map((i) => [i.itemId, i.name]));
    return (id: number) => m.get(id) ?? "";
  }, [lang]);
}

function BuildRow({
  r,
  c,
  lang,
  href,
  on,
  byData,
  top,
  tags,
  onOpen,
}: {
  r: Row;
  c: Copy;
  lang: "en" | "es";
  href: string;
  on: boolean;
  byData: boolean;
  top: boolean;
  tags: HeroBuildsFile["tags"];
  onOpen: (e: React.MouseEvent) => void;
}) {
  const b = r.build;
  const name = b ? displayName(b, c) : r.pub?.name && !isOffensive(r.pub.name) ? r.pub.name : c.buildN(r.id);
  const author = b ? authorOf(b, c) : r.pub?.authorName || c.player;
  const avatar = b?.authorAvatar ?? r.pub?.authorAvatar ?? "";
  const flags = { official: b?.official, verified: b?.verified ?? (r.pub ? (true as const) : undefined) };
  return (
    <a className="dl-bl-row" href={href} onClick={onOpen} data-on={on || undefined} aria-current={on ? "true" : undefined}>
      <span className="dl-bl-row-top">
        <span className="dl-bl-row-id">
          <span className="dl-bl-row-name">{name}</span>
          <span className="dl-bl-row-by">
            <Avatar src={avatar} size={18} />
            {author}
            <Badges b={flags} c={c} byData={byData} top={top} />
          </span>
        </span>
        {b && (
          <span className="dl-bl-row-items" aria-hidden="true">
            {b.key.map((id) => (
              <ItemIcon key={id} itemId={id} size={36} tip={false} />
            ))}
          </span>
        )}
      </span>
      <span className="dl-bl-row-nums">
        {b && b.matches > 0 ? (
          <>
            <span>
              <WinRate b={b} c={c} lang={lang} /> <span className="dl-bl-row-label">{c.winRate.toLowerCase()}</span>
            </span>
            <span>
              <b>{fmtN(b.matches, lang)}</b> <span className="dl-bl-row-label">{c.matches.toLowerCase()}</span>
            </span>
          </>
        ) : (
          <span className="dl-bl-row-new">{c.noMatches}</span>
        )}
        <span className="dl-bl-row-right">
          {b && b.tags.slice(0, 1).map((t) => tags[t] && <span key={t} className="dl-bl-gtag">{tags[t][lang]}</span>)}
          {b && <StylePill s={b.style} c={c} />}
        </span>
      </span>
    </a>
  );
}

/* ── La build: vista previa y ficha ─────────────────────────────────── */

function BuildPage({ c, route, navigate, hero, buildId, to }: { c: Copy; route: Route; navigate: (r: Route) => void; hero: Hero; buildId: number; to: (detail?: string) => Route }) {
  const { lang } = useLang();
  const file = useHeroCommunityBuilds(hero.heroId);
  const published = usePublished(hero.heroId);
  const enDatos = file?.builds.find((b) => b.id === buildId) ?? null;
  const pub = published?.find((p) => p.id === buildId);
  const heroSlug = heroSlugs.toSlug.get(String(hero.heroId))!;

  // Una build que no está en los datos del día (recién subida o vieja): se pide en vivo.
  const [viva, setViva] = useState<CommunityBuild | null | undefined>(undefined);
  const catalog = useCatalog();
  useEffect(() => {
    if (file === undefined || enDatos || !Number.isFinite(buildId)) return;
    let vivo = true;
    fetchLiveBuild(hero.heroId, buildId, catalog).then((b) => vivo && setViva(b));
    return () => {
      vivo = false;
    };
  }, [file, enDatos, buildId, hero.heroId, catalog]);

  const build = enDatos ?? viva ?? null;
  const otras = (file?.builds ?? []).filter((b) => b.id !== buildId).slice(0, 6);

  return (
    <section className="deadlock dl-builds dl-bl-page">
      <nav className="dl-bl-crumbs" aria-label={c.back}>
        <RouteLink to={to()} onNavigate={navigate}>
          {c.back}
        </RouteLink>
        <span aria-hidden="true">/</span>
        <RouteLink to={to(heroSlug)} onNavigate={navigate}>
          {hero.name}
        </RouteLink>
      </nav>
      {file === undefined || (!enDatos && viva === undefined) ? (
        <p className="detail-note">{c.loading}</p>
      ) : !build ? (
        <div className="dl-bl-empty">
          <h1 className="dl-bl-h2">{c.buildN(buildId)}</h1>
          <p>{c.notFound}</p>
          <RouteLink className="dl-bl-btn is-primary" to={to(heroSlug)} onNavigate={navigate}>
            {c.heroTitle(hero.name)}
          </RouteLink>
        </div>
      ) : (
        <BuildDetail c={c} hero={hero} row={{ build, pub, id: buildId }} file={file} route={route} navigate={navigate} to={to} />
      )}

      {otras.length > 0 && (
        <section className="dl-bl-section" aria-labelledby="dl-bl-more">
          <h2 className="dl-bl-h2" id="dl-bl-more">
            {c.moreBuilds(hero.name)}
          </h2>
          <ul className="dl-bl-more">
            {otras.map((b) => (
              <li key={b.id}>
                <RouteLink className="dl-bl-most" to={to(`${heroSlug}/${b.id}`)} onNavigate={navigate}>
                  <span className="dl-bl-most-text">
                    <span className="dl-bl-most-name">{displayName(b, c)}</span>
                    <span className="dl-bl-most-meta">{authorOf(b, c)}</span>
                  </span>
                  <span className="dl-bl-most-items" aria-hidden="true">
                    {b.key.map((id) => (
                      <ItemIcon key={id} itemId={id} size={32} tip={false} />
                    ))}
                  </span>
                  <span className="dl-bl-most-nums">
                    <WinRate b={b} c={c} lang={lang} />
                    <span className="dl-bl-most-matches">
                      {fmtN(b.matches, lang)} {c.matches.toLowerCase()}
                    </span>
                  </span>
                </RouteLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function useCatalog() {
  return useMemo(() => {
    const out: Record<string, { cost: number; slot: "weapon" | "vitality" | "spirit" }> = {};
    for (const i of buildItems(PUBLISHED_BAND, "en")) out[String(i.itemId)] = { cost: i.cost, slot: i.slot as "weapon" | "vitality" | "spirit" };
    return out;
  }, []);
}

function BuildDetail({
  c,
  hero,
  row,
  file,
  route,
  navigate,
  to,
  compact,
  byData,
}: {
  c: Copy;
  hero: Hero;
  row: Row;
  file: HeroBuildsFile | null | undefined;
  route: Route;
  navigate: (r: Route) => void;
  to: (detail?: string) => Route;
  compact?: boolean;
  byData?: boolean;
}) {
  const { lang } = useLang();
  const [toast, show] = useToast();
  const medidas = useHeroBuilds(hero.heroId);
  const abilities = useMemo(() => bySlot(medidas?.builds[0]?.abilities ?? []), [medidas]);
  const heroSlug = heroSlugs.toSlug.get(String(hero.heroId))!;
  const catalog = useCatalog();

  // Sin datos del día (una subida nueva en la vista previa): se pide en vivo.
  const [viva, setViva] = useState<CommunityBuild | null | undefined>(row.build ? row.build : undefined);
  useEffect(() => {
    if (row.build) return;
    let vivo = true;
    fetchLiveBuild(hero.heroId, row.id, catalog).then((b) => vivo && setViva(b));
    return () => {
      vivo = false;
    };
  }, [row.build, row.id, hero.heroId, catalog]);
  const b = row.build ?? viva ?? null;
  const pub = row.pub;

  const name = b ? displayName(b, c) : pub?.name || c.buildN(row.id);
  const Heading = compact ? "h2" : "h1";
  const medida = medidas?.builds[0];
  const medidaItems = medida ? medida.items.map((i) => i.itemId) : [];
  const items = b ? allItems(b) : [];
  const comparte = shared(items, medidaItems);
  const faltan = medidaItems.filter((id) => !items.includes(id)).slice(0, 4);
  const slotOf = (id: number) => {
    const i = abilities.findIndex((a) => a.id === id);
    return i >= 0 ? i + 1 : undefined;
  };
  const editor: Route = { ...route, dlSection: "builder", detail: undefined };
  const editorQ = b ? editorSearch(hero.heroId, b, (n) => categoryName(n, lang) || c.noName, slotOf, b.name) : "";

  const copiarId = async () => show((await copyText(String(row.id))) ? c.copied : c.copyFail);
  const compartir = async () => {
    const url = `${window.location.origin}${routePath(to(`${heroSlug}/${row.id}`))}`;
    show((await copyText(url)) ? c.shared : c.copyFail);
  };

  return (
    <article className="dl-bl-detail" data-compact={compact || undefined}>
      <header className="dl-bl-dhead">
        <GameImg src={hero.img} alt="" width={compact ? 56 : 88} height={compact ? 56 : 88} className="dl-bl-dhero" />
        <div className="dl-bl-dtitle">
          <span className="dl-bl-kicker">
            {hero.name}
            {b && (
              <>
                {" · "}
                {c.style[b.style]}
              </>
            )}
          </span>
          <Heading className="dl-bl-name">{name}</Heading>
          <span className="dl-bl-by">
            <Avatar src={b?.authorAvatar || pub?.authorAvatar || ""} size={20} />
            {c.by} <b>{b ? authorOf(b, c) : pub?.authorName || c.player}</b>
            <Badges b={{ official: b?.official, verified: b?.verified ?? (pub ? true : undefined) }} c={c} byData={byData} />
            {b && (
              <span className="dl-bl-dim">
                · {c.updated.toLowerCase()} {c.ago(daysSince(b.updated), lang)}
              </span>
            )}
          </span>
        </div>
        <div className="dl-bl-actions">
          <button type="button" className="dl-bl-btn is-primary" onClick={copiarId}>
            <CopyIcon />
            {c.copyId(row.id)}
          </button>
          {compact ? (
            <RouteLink className="dl-bl-btn" to={to(`${heroSlug}/${row.id}`)} onNavigate={navigate}>
              {c.openBuild}
            </RouteLink>
          ) : (
            <button type="button" className="dl-bl-btn" onClick={compartir}>
              {c.share}
            </button>
          )}
          {b && (
            <RouteLink className="dl-bl-btn" to={editor} onNavigate={navigate} search={editorQ}>
              {c.editCopy}
            </RouteLink>
          )}
        </div>
      </header>

      {pub?.note && !isOffensive(pub.note) && <p className="dl-bl-note">“{pub.note}”</p>}
      {pub && pub.tags.length > 0 && (
        <p className="dl-bl-vtags">
          {pub.tags.map((t) => (
            <span key={t} className="dl-bl-vtag">
              {c.vestigoTags[t as keyof typeof c.vestigoTags] ?? t}
            </span>
          ))}
        </p>
      )}

      {b ? (
        <>
          <dl className="dl-bl-kpis">
            <div>
              <dt>{c.winRate}</dt>
              <dd>
                <WinRate b={b} c={c} lang={lang} big />
              </dd>
            </div>
            <div>
              <dt>{c.matches}</dt>
              <dd>{b.matches > 0 ? fmtN(b.matches, lang) : "—"}</dd>
            </div>
            <div>
              <dt>{c.players}</dt>
              <dd>{b.players > 0 ? fmtN(b.players, lang) : "—"}</dd>
            </div>
            <div>
              <dt>{c.items}</dt>
              <dd>{items.length}</dd>
            </div>
          </dl>
          {b.matches > 0 && b.matches < MIN_MATCHES_FOR_RATE && <p className="dl-bl-dim dl-bl-fine">* {c.fewMatches}</p>}
          {b.matches === 0 && <p className="dl-bl-dim dl-bl-fine">{c.noMatches}</p>}

          <section className="dl-bl-block">
            <h3 className="dl-bl-h3">{c.whatToBuy}</h3>
            <div className="dl-bl-cats" data-compact={compact || undefined}>
              {b.cats.map((cat, i) => (
                <section key={i} className="dl-bl-cat">
                  <div className="dl-bl-cat-head">
                    <h4 className="dl-bl-cat-name">{categoryName(cat.name, lang) || c.noName}</h4>
                    <span className="dl-bl-souls">{fmtN(cat.items.reduce((s, id) => s + (catalog[String(id)]?.cost ?? 0), 0), lang)}</span>
                  </div>
                  {!compact && cat.desc && <p className="dl-bl-cat-desc">{cat.desc}</p>}
                  <ul className="dl-bl-cat-items">
                    {cat.items.map((id) => (
                      <li key={id}>
                        <ItemIcon itemId={id} size={compact ? 44 : 72} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>

          <section className="dl-bl-block">
            <h3 className="dl-bl-h3">{c.abilityOrder}</h3>
            <AbilityGrid path={b.path} abilities={abilities} c={c} />
          </section>

          {!compact && b.desc && (
            <section className="dl-bl-block">
              <h3 className="dl-bl-h3">{c.description}</h3>
              <p className="dl-bl-desc">{b.desc}</p>
            </section>
          )}

          {!compact && b.tags.length > 0 && file && (
            <section className="dl-bl-block">
              <h3 className="dl-bl-h3">{c.tags}</h3>
              <p className="dl-bl-gtags">
                {b.tags.map(
                  (t) =>
                    file.tags[t] && (
                      <span key={t} className="dl-bl-gtag">
                        {file.tags[t][lang]}
                      </span>
                    ),
                )}
              </p>
            </section>
          )}

          {!compact && medidaItems.length > 0 && (
            <section className="dl-bl-block">
              <h3 className="dl-bl-h3">{c.similar}</h3>
              <div className="dl-bl-similar">
                <span className="dl-bl-meter" aria-hidden="true">
                  <span style={{ width: `${Math.round((comparte / medidaItems.length) * 100)}%` }} />
                </span>
                <p>{c.similarText(comparte, medidaItems.length)}</p>
              </div>
              {faltan.length > 0 && (
                <>
                  <p className="dl-bl-dim">{c.missing}</p>
                  <ul className="dl-bl-cat-items">
                    {faltan.map((id) => (
                      <li key={id}>
                        <ItemIcon itemId={id} size={44} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {!compact && (
            <p className="dl-bl-dim dl-bl-fine">
              {c.inGameId}: <b>{row.id}</b>
              {b.version > 1 && <> · v{b.version}</>}
              {BUILD_LANGS[b.lang] && (
                <>
                  {" · "}
                  {c.gameLang}: {BUILD_LANGS[b.lang][lang]}
                </>
              )}
              {b.favorites > 0 && (
                <>
                  {" · "}
                  {c.favorites}: {fmtN(b.favorites, lang)}
                </>
              )}
            </p>
          )}
        </>
      ) : viva === undefined ? (
        <p className="detail-note">{c.loading}</p>
      ) : (
        <p className="detail-note">{c.notFound}</p>
      )}
      <Toast msg={toast} />
    </article>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** La grilla del juego: una fila por habilidad, una columna por punto. */
function AbilityGrid({ path, abilities, c }: { path: number[]; abilities: AbilityView[]; c: Copy }) {
  const known = path.filter((id) => abilities.some((a) => a.id === id));
  if (known.length === 0 || abilities.length === 0) return <p className="dl-bl-dim">{c.noAbilityOrder}</p>;
  const labels = stepLabels(known);
  return (
    <>
      <p className="dl-bl-dim dl-bl-fine">{c.abilityLead}</p>
      {/* Con foco para que se pueda correr con el teclado cuando no entra en el ancho. */}
      <div className="dl-bl-agrid-wrap" tabIndex={0} role="region" aria-label={c.abilityOrder}>
        <table className="dl-bl-agrid">
          <tbody>
            {abilities.map((a, row) => (
              <tr key={a.id}>
                <th scope="row">
                  <span className="dl-bl-ability">
                    <GameImg src={a.img} alt="" width={28} height={28} />
                    <span>{a.name}</span>
                  </span>
                </th>
                {known.map((id, i) => (
                  <td key={i} data-on={id === a.id || undefined} data-slot={row + 1}>
                    {id === a.id ? (labels[i] === null ? "●" : labels[i]) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Subir una build ───────────────────────────────────────────────── */

function UploadPanel({
  c,
  heroes,
  route,
  navigate,
  to,
  onChange,
  heroId,
}: {
  c: Copy;
  heroes: Hero[];
  route: Route;
  navigate: (r: Route) => void;
  to: (detail?: string) => Route;
  onChange?: () => void;
  /** En la biblioteca de un héroe, sus builds van primero. */
  heroId?: number;
}) {
  const { lang } = useLang();
  const { account, ready } = useAccount();
  const [version, setVersion] = useState(0);
  const mine = useMine(!!account, version);
  const [pick, setPick] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "removed" } | { kind: "error"; error: PublishError }>({ kind: "idle" });
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.heroId, h])), [heroes]);
  const back = typeof window === "undefined" ? routePath(route) : `${window.location.pathname}${window.location.search}`;

  const game = useMemo(
    () => (mine.status === "ok" ? [...mine.game].sort((a, b) => Number(b.heroId === heroId) - Number(a.heroId === heroId) || b.updated - a.updated) : []),
    [mine, heroId],
  );
  const published = mine.status === "ok" || mine.status === "error" ? mine.published : [];
  const pubById = new Map(published.map((p) => [p.id, p]));
  const chosen = game.find((g) => g.buildId === pick) ?? game[0] ?? null;
  const yaSubida = chosen ? pubById.get(chosen.buildId) : undefined;

  // Al elegir una ya subida, se cargan sus etiquetas y su nota para editarlas.
  useEffect(() => {
    const p = chosen ? pubById.get(chosen.buildId) : undefined;
    setTags(p?.tags ?? []);
    setNote(p?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen?.buildId, mine.status]);

  const publicar = async () => {
    if (!chosen) return;
    setState({ kind: "busy" });
    const r = await publishBuild(chosen.buildId, tags, note);
    if (r.ok) {
      setState({ kind: "ok" });
      setVersion((v) => v + 1);
      onChange?.();
    } else setState({ kind: "error", error: r.error });
  };
  const sacar = async (id: number) => {
    setState({ kind: "busy" });
    if (await unpublishBuild(id)) {
      setState({ kind: "removed" });
      setVersion((v) => v + 1);
      onChange?.();
    } else setState({ kind: "error", error: "network" });
  };
  const toggleTag = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : xs.length >= MAX_TAGS ? xs : [...xs, t]));

  let body: ReactNode;
  if (!ready) body = <p className="detail-note">{c.loading}</p>;
  else if (!account || mine.status === "signed-out")
    body = (
      <div className="dl-bl-signin">
        <p>{c.upload.signInLead}</p>
        <a className="dl-bl-btn is-steam" href={loginHref(back)}>
          <SteamIcon />
          {c.upload.signIn}
        </a>
      </div>
    );
  else if (mine.status === "loading") body = <p className="detail-note">{c.loading}</p>;
  else
    body = (
      <>
        {mine.status === "error" && <p className="dl-bl-error">{c.upload.gameDown}</p>}
        {mine.status === "ok" && game.length === 0 && <p className="dl-bl-dim">{c.upload.noneYet}</p>}
        {game.length > 0 && (
          <div className="dl-bl-step">
            <div className="dl-bl-step-head">
              <h3 className="dl-bl-h3">{c.upload.pick}</h3>
              <span className="dl-bl-dim">{c.upload.yours(game.length)}</span>
            </div>
            <ul className="dl-bl-mine" role="radiogroup" aria-label={c.upload.pick}>
              {game.map((g) => {
                const h = heroById.get(g.heroId);
                const on = chosen?.buildId === g.buildId;
                return (
                  <li key={g.buildId}>
                    <button type="button" role="radio" aria-checked={on} className="dl-bl-mine-row" onClick={() => setPick(g.buildId)}>
                      {h && <GameImg src={h.img} alt="" width={40} height={40} />}
                      <span className="dl-bl-mine-text">
                        <b>{g.name || c.buildN(g.buildId)}</b>
                        <span className="dl-bl-dim">
                          {h?.name} · ID {g.buildId} · {c.upload.version(g.version)} · {c.ago(daysSince(g.updated), lang)}
                        </span>
                      </span>
                      {pubById.has(g.buildId) && <span className="dl-bl-badge is-verified">{c.upload.uploaded}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {chosen && (
          <div className="dl-bl-step">
            <h3 className="dl-bl-h3">{c.upload.extras}</h3>
            <fieldset className="dl-bl-fieldset">
              <legend className="dl-bl-dim">{c.upload.tagsLabel(MAX_TAGS)}</legend>
              <div className="dl-bl-chips">
                {VESTIGO_TAGS.map((t) => (
                  <button key={t} type="button" className="dl-bl-chip" aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)} disabled={!tags.includes(t) && tags.length >= MAX_TAGS}>
                    {c.vestigoTags[t]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="dl-bl-field">
              <span className="dl-bl-dim">{c.upload.note}</span>
              <textarea value={note} maxLength={NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)} placeholder={c.upload.notePlaceholder} />
              <span className="dl-bl-count">
                {note.length}/{NOTE_MAX}
              </span>
            </label>
            <div className="dl-bl-actions">
              <button type="button" className="dl-bl-btn is-primary" onClick={publicar} disabled={state.kind === "busy"}>
                {state.kind === "busy" ? c.upload.publishing : yaSubida ? c.upload.update : c.upload.publish}
              </button>
              {yaSubida && (
                <button type="button" className="dl-bl-btn is-ghost" onClick={() => sacar(yaSubida.id)} disabled={state.kind === "busy"}>
                  {c.upload.remove}
                </button>
              )}
              {yaSubida && heroById.get(chosen.heroId) && (
                <RouteLink className="dl-bl-btn is-ghost" to={to(`${heroSlugs.toSlug.get(String(chosen.heroId))}/${chosen.buildId}`)} onNavigate={navigate}>
                  {c.openBuild}
                </RouteLink>
              )}
            </div>
            <p className="dl-bl-status" role="status" aria-live="polite">
              {state.kind === "ok" ? c.upload.published : state.kind === "removed" ? c.upload.removed : state.kind === "error" ? c.upload.errors[state.error] : ""}
            </p>
          </div>
        )}
        {published.filter((p) => !game.some((g) => g.buildId === p.id)).length > 0 && (
          <div className="dl-bl-step">
            <h3 className="dl-bl-h3">{c.mineUploaded}</h3>
            <ul className="dl-bl-mine">
              {published
                .filter((p) => !game.some((g) => g.buildId === p.id))
                .map((p) => (
                  <li key={p.id} className="dl-bl-mine-row is-static">
                    <span className="dl-bl-mine-text">
                      <b>{p.name || c.buildN(p.id)}</b>
                      <span className="dl-bl-dim">
                        {heroById.get(p.hero)?.name} · ID {p.id}
                      </span>
                    </span>
                    <button type="button" className="dl-bl-btn is-ghost" onClick={() => sacar(p.id)}>
                      {c.upload.remove}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </>
    );

  return (
    <section className="dl-bl-upload" aria-labelledby="dl-bl-upload-title">
      <h2 className="dl-bl-h2" id="dl-bl-upload-title">
        {c.upload.title}
      </h2>
      <p className="dl-bl-sub">{c.upload.lead}</p>
      <ol className="dl-bl-how" aria-hidden="true">
        <li>Steam</li>
        <li>{c.upload.pick.replace(/^1 · /, "")}</li>
        <li>{c.upload.publish}</li>
      </ol>
      {body}
    </section>
  );
}

function SteamIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-9.96 9.1l5.35 2.21a2.83 2.83 0 0 1 1.6-.49h.16l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.42v.13a2.83 2.83 0 0 1-5.6.56L2.36 14.6A10 10 0 1 0 12 2Zm-4.72 15.18-1.22-.5a2.12 2.12 0 1 0 1.16-2.9l1.26.52a1.56 1.56 0 1 1-1.2 2.88Zm9.38-6.62a2.51 2.51 0 1 0-2.51-2.51 2.51 2.51 0 0 0 2.51 2.51Z"
      />
    </svg>
  );
}
