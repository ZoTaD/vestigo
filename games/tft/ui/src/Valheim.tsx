/**
 * La sección Valheim (2026-09-24): sub-navegación con las pestañas del juego,
 * portada, pestañas y fichas.
 *
 * Diseño: docs/design/2026-09-24-valheim-enciclopedia.md. La barra de Vestigo
 * de arriba es la del sitio; lo del juego empieza en la sub-navegación.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "./i18n";
import RouteLink from "./RouteLink";
import { PENDING_SEARCH_EVENT, takePendingSearch } from "./pendingSearch";
import { VALHEIM_TABS, type Route, type ValheimSection, type ValheimTab } from "./route";
import { useValheimCopy } from "./valheimCopy";
import { artUrl, iconUrl, loadIndex, peekIndex, searchIndex, tx, type AnyRow, type BiomeRow, type BossRow, type CreatureRow, type IndexEntry, type ItemRow, type PieceRow } from "./valheimData";
import type { ListTab } from "./valheimTabs";
import { useTab, type Nav, type To } from "./ValheimParts";
import ValheimList from "./ValheimList";
import ValheimDetail from "./ValheimDetail";
import { BiomeList, BiomePage, BossList, BossPage, CreaturePage } from "./ValheimGuide";
import ValheimPatches from "./ValheimPatches";
import { loadEditions, peekEditions, type EditionMeta } from "./valheimPatchesData";

/** Un ícono representativo por pestaña, para la portada. */
const TAB_ICON: Record<ValheimTab, string> = {
  foods: "fishwraps", meads: "potion_health_minor", weapons: "swordiron", armor: "helmetbronze", tools: "pickaxe_iron",
  // El trofeo del troll se llama así adentro del juego.
  building: "workbench", materials: "copperore", creatures: "trophyfrosttroll", biomes: "fermenter", bosses: "trophyeikthyr",
};

function useIndex(): IndexEntry[] | null {
  const [idx, setIdx] = useState<IndexEntry[] | null>(peekIndex);
  useEffect(() => {
    let vivo = true;
    if (!idx) loadIndex().then((i) => vivo && setIdx(i)).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  return idx;
}

/** El buscador de toda la sección: nombre en los dos idiomas, sin tildes. */
function GlobalSearch({ index, to, navigate }: { index: IndexEntry[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Lo que se escribió en el buscador de la barra de arriba estando en Valheim.
  // En un efecto y no al crear el estado: React en desarrollo crea el estado dos
  // veces y la segunda encontraba el texto ya consumido. El evento cubre buscar
  // de nuevo estando ya en la portada.
  useEffect(() => {
    const take = () => {
      const p = takePendingSearch();
      if (p) { setQ(p); setOpen(true); }
    };
    take();
    window.addEventListener(PENDING_SEARCH_EVENT, take);
    return () => window.removeEventListener(PENDING_SEARCH_EVENT, take);
  }, []);
  const hits = useMemo(() => searchIndex(index, q, lang), [q, index, lang]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="vh-search" ref={box}>
      <input
        className="vh-input"
        type="search"
        value={q}
        placeholder={t.search}
        aria-label={t.search}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) { navigate(to(hits[0].tab, hits[0].slug)); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="vh-hits vh-box" role="listbox">
          {hits.length === 0 && <div className="vh-hit"><span /><span className="vh-dim">{t.noResults}</span></div>}
          {hits.map((h) => (
            <RouteLink key={`${h.tab}/${h.slug}`} className="vh-hit" to={to(h.tab, h.slug)} onNavigate={(r) => { navigate(r); setOpen(false); }}>
              <span className="vh-slot is-sm">
                {h.icon ? <img src={iconUrl(h.icon)} alt="" loading="lazy" width={30} height={30} />
                  : h.art ? <img src={artUrl(h.art)} alt="" loading="lazy" width={30} height={30} style={{ objectFit: "cover", width: "100%", height: "100%" }} /> : null}
              </span>
              <span>{lang === "es" ? h.es : h.en}<br /><small>{lang === "es" ? h.en : h.es}</small></span>
              <small>{t.tabs[h.tab]}</small>
            </RouteLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Home({ to, navigate }: { to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const index = useIndex();
  const biomes = useTab("biomes");
  const bosses = useTab("bosses");
  const [editions, setEditions] = useState<EditionMeta[] | null>(peekEditions);
  useEffect(() => {
    let vivo = true;
    if (!editions) loadEditions().then((e) => vivo && setEditions(e)).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  const latest = editions?.[0] ?? null;
  const counts = useMemo(() => {
    const c: Partial<Record<ValheimTab, number>> = {};
    for (const e of index ?? []) c[e.tab] = (c[e.tab] ?? 0) + 1;
    return c;
  }, [index]);
  return (
    <>
      <header className="vh-head">
        <h1>{t.title}</h1>
        <p>{t.lede}</p>
        {index && <GlobalSearch index={index} to={to} navigate={navigate} />}
      </header>
      {biomes && (
        <div className="vh-biomes">
          {biomes.map((b, i) => {
            const boss = bosses?.find((x) => x.biome === b.id);
            return (
              <RouteLink key={b.id} className={`vh-bcard${b.id === "deepnorth" ? " is-logo" : ""}`} to={to("biomes", b.slug)} onNavigate={navigate}>
                <img src={artUrl(b.art)} alt="" loading={i < 3 ? "eager" : "lazy"} width={852} height={480} />
                <em>{i + 1}{boss ? ` · ${tx(boss.name, lang)}` : ""}</em>
                <span>{tx(b.name, lang)}</span>
              </RouteLink>
            );
          })}
        </div>
      )}
      <div className="vh-hub">
        {VALHEIM_TABS.filter((x) => x !== "biomes").map((tab) => (
          <RouteLink key={tab} className="vh-box vh-hubcard" to={to(tab)} onNavigate={navigate}>
            <span className="vh-slot"><img src={iconUrl(TAB_ICON[tab])} alt="" loading="lazy" width={42} height={42} /></span>
            <span>{t.tabs[tab]}<small>{counts[tab] ?? ""}</small></span>
          </RouteLink>
        ))}
        <RouteLink className="vh-box vh-hubcard" to={to("patches")} onNavigate={navigate}>
          <span className="vh-slot"><img src={iconUrl("sign")} alt="" loading="lazy" width={42} height={42} /></span>
          <span>{t.pat.tab}<small>{latest ? `${t.pat.latest}: ${latest.version}` : ""}</small></span>
        </RouteLink>
      </div>
    </>
  );
}

function TabView({ tab, detail, to, navigate }: { tab: ValheimTab; detail?: string; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const rows = useTab(tab) as AnyRow[] | null;
  const bosses = useTab(tab === "biomes" || tab === "bosses" ? "bosses" : null);
  if (!rows || ((tab === "biomes" || tab === "bosses") && !bosses)) return <p className="vh-loading">{t.loading}</p>;

  if (tab === "biomes") {
    const list = rows as BiomeRow[];
    const row = detail ? list.find((r) => r.slug === detail) : null;
    if (detail && !row) return <p className="vh-loading">{t.notFound}</p>;
    return row ? <BiomePage row={row} bosses={bosses as BossRow[]} to={to} navigate={navigate} /> : <BiomeList biomes={list} bosses={bosses as BossRow[]} to={to} navigate={navigate} />;
  }
  if (tab === "bosses") {
    const list = (rows as BossRow[]).slice().sort((a, b) => a.order - b.order);
    const row = detail ? list.find((r) => r.slug === detail) : null;
    if (detail && !row) return <p className="vh-loading">{t.notFound}</p>;
    return row ? <BossPage row={row} to={to} navigate={navigate} /> : <BossList bosses={list} to={to} navigate={navigate} />;
  }
  const list = tab as ListTab;
  if (!detail) return <ValheimList key={list} tab={list} rows={rows} to={to} navigate={navigate} />;
  const row = rows.find((r) => r.slug === detail);
  if (!row) return <p className="vh-loading">{t.notFound}</p>;
  if (list === "creatures") return <CreaturePage row={row as CreatureRow} to={to} navigate={navigate} />;
  const sorted = (rows as (ItemRow | PieceRow)[]).slice().sort((a, b) => a.name.en.localeCompare(b.name.en));
  return <ValheimDetail tab={list} row={row as ItemRow | PieceRow} rows={sorted} to={to} navigate={navigate} />;
}

export default function Valheim({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useValheimCopy();
  const sec: ValheimSection = route.vhSection ?? "home";
  const to: To = (vhSection, detail) => ({ ...route, view: "valheim", vhSection, detail });
  // Cambiar de ficha arranca arriba, como cambiar de página.
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [sec, route.detail]);
  return (
    <>
      <div className="vh-sub">
        <nav className="vh-sub-in" aria-label={t.title}>
          <RouteLink className="vh-tab is-home" to={to("home")} active={sec === "home"} onNavigate={navigate}>{t.title}</RouteLink>
          {VALHEIM_TABS.map((tab) => (
            <RouteLink key={tab} className="vh-tab" to={to(tab)} active={sec === tab} onNavigate={navigate}>{t.tabs[tab]}</RouteLink>
          ))}
          <RouteLink className="vh-tab is-home is-news" to={to("patches")} active={sec === "patches"} onNavigate={navigate}>{t.pat.tab}</RouteLink>
        </nav>
      </div>
      <main className="vh vh-page">
        {sec === "home" ? <Home to={to} navigate={navigate} />
          : sec === "patches" ? <ValheimPatches detail={route.detail} to={to} navigate={navigate} />
          : <TabView tab={sec} detail={route.detail} to={to} navigate={navigate} />}
        <p className="vh-note">{t.fromGame}</p>
      </main>
    </>
  );
}

