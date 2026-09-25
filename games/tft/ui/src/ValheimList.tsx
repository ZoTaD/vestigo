/**
 * Una pestaña de Valheim: filtros a la izquierda, tabla ordenable a la derecha
 * (maqueta B que eligió ZoTaD el 2026-09-24).
 *
 * **Se monta con `key={tab}`**: el buscador y los filtros son de la pestaña y
 * arrancan limpios al cambiar a otra. En la maqueta quedaba escrito lo de la
 * pestaña anterior, y ZoTaD lo marcó.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, type Lang } from "./i18n";
import RouteLink from "./RouteLink";
import { useValheimCopy, type ValheimCopy } from "./valheimCopy";
import { applyFilters, collectNames, FILTERS, filterOptions, type FilterState, type ListTab } from "./valheimTabs";
import { stationOf, tx, type AnyRow, type CreatureRow, type ItemRow, type PieceRow } from "./valheimData";
import { BiomeTags, Slot, type Nav, type To } from "./ValheimParts";

type Dir = "asc" | "desc";
interface Col {
  key: string;
  label: string;
  sort?: (r: AnyRow) => number | string | null;
  first?: Dir;
  right?: boolean;
  hideMobile?: boolean;
  /** Se esconde también en pantallas medianas (la columna menos necesaria). */
  hideMd?: boolean;
  cell: (r: AnyRow) => ReactNode;
}

const it = (r: AnyRow) => r as ItemRow;
const pc = (r: AnyRow) => r as PieceRow;
const cr = (r: AnyRow) => r as CreatureRow;

const totalDamage = (d: Record<string, number> | null | undefined) =>
  d ? Object.entries(d).filter(([k]) => k !== "chop" && k !== "pickaxe").reduce((a, [, v]) => a + v, 0) : 0;

function Num({ v, cls, max }: { v: number | null | undefined; cls?: string; max?: number }) {
  if (!v) return <span className="vh-dim">—</span>;
  return (
    <>
      <span className={`vh-num${cls ? ` vh-num-${cls}` : ""}`}>{Math.round(v * 10) / 10}</span>
      {max && cls && <span className="vh-mini"><i className={`is-${cls}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></span>}
    </>
  );
}

function columns(tab: ListTab, t: ValheimCopy, lang: Lang): Col[] {
  const stationCell = (r: AnyRow) => {
    const s = stationOf(r);
    const lvl = it(r).recipe?.level;
    return <span className="vh-dim">{s ? `${tx(s.name, lang)}${lvl && lvl > 1 ? ` · ${t.level(lvl)}` : ""}` : "—"}</span>;
  };
  const station: Col = { key: "station", label: t.cols.station, sort: (r) => tx(stationOf(r)?.name, lang) || "~", first: "asc", hideMobile: true, hideMd: true, cell: stationCell };
  const biome: Col = {
    key: "tier", label: t.cols.biome, hideMobile: true, first: "asc",
    sort: (r) => (it(r).tier ? ["meadows", "blackforest", "swamp", "mountain", "plains", "ocean", "mistlands", "ashlands", "deepnorth"].indexOf(it(r).tier as string) : 99),
    cell: (r) => <BiomeTags ids={it(r).tier ? [it(r).tier as string] : []} />,
  };
  switch (tab) {
    case "foods":
      return [
        { key: "hp", label: t.cols.hp, right: true, first: "desc", sort: (r) => it(r).food?.hp ?? 0, cell: (r) => <Num v={it(r).food?.hp} cls="hp" max={110} /> },
        { key: "st", label: t.cols.st, right: true, first: "desc", sort: (r) => it(r).food?.st ?? 0, cell: (r) => <Num v={it(r).food?.st} cls="st" max={110} /> },
        { key: "eitr", label: t.cols.eitr, right: true, first: "desc", sort: (r) => it(r).food?.eitr ?? 0, cell: (r) => <Num v={it(r).food?.eitr} cls="ei" max={100} /> },
        { key: "min", label: t.cols.min, right: true, first: "desc", sort: (r) => it(r).food?.min ?? 0, hideMobile: true, cell: (r) => <span className="vh-dim vh-nowrap">{t.minutes(it(r).food?.min ?? 0)}</span> },
        station,
        biome,
      ];
    case "meads":
      return [
        { key: "effect", label: t.cols.effect, sort: (r) => it(r).effect ?? "", first: "asc", cell: (r) => <span className="vh-dim">{t.effect[it(r).effect ?? "other"]}</span> },
        {
          key: "base", label: t.cols.base, hideMobile: true, cell: (r) => {
            const b = it(r).chain?.base;
            return b ? <span className="vh-dim" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Slot icon={b.icon} size="sm" />{tx(b.name, lang)}</span> : <span className="vh-dim">—</span>;
          },
        },
        biome,
      ];
    case "weapons":
      return [
        { key: "dmg", label: t.cols.dmg, right: true, first: "desc", sort: (r) => totalDamage(it(r).damage), cell: (r) => <Num v={totalDamage(it(r).damage)} /> },
        {
          key: "types", label: t.filters.dmg, hideMobile: true, cell: (r) => (
            <span className="vh-dim">
              {Object.entries(it(r).damage ?? {}).filter(([k]) => k !== "chop" && k !== "pickaxe").map(([k, v]) => `${t.damage[k] ?? k} ${Math.round(v)}`).join(" · ") || "—"}
            </span>
          ),
        },
        { key: "cls", label: t.cols.cls, sort: (r) => t.weaponCls[it(r).cls ?? "other"], first: "asc", cell: (r) => <span className="vh-dim">{t.weaponCls[it(r).cls ?? "other"]}</span> },
        biome,
        { key: "q", label: t.cols.quality, right: true, first: "desc", hideMobile: true, sort: (r) => it(r).maxQuality ?? 1, cell: (r) => <span className="vh-dim">{it(r).maxQuality}</span> },
      ];
    case "armor":
      return [
        { key: "armor", label: t.cols.armor, right: true, first: "desc", sort: (r) => it(r).armor ?? it(r).blockPower ?? 0, cell: (r) => <Num v={it(r).armor ?? it(r).blockPower} /> },
        { key: "slot", label: t.cols.slot, sort: (r) => t.slot[it(r).slot ?? "other"], first: "asc", cell: (r) => <span className="vh-dim">{t.slot[it(r).slot ?? "other"]}</span> },
        biome,
        station,
        { key: "weight", label: t.cols.weight, right: true, first: "asc", hideMobile: true, sort: (r) => it(r).weight, cell: (r) => <span className="vh-dim">{it(r).weight}</span> },
      ];
    case "tools":
      return [
        { key: "kind", label: t.cols.cls, sort: (r) => it(r).toolKind ?? "", first: "asc", cell: (r) => <span className="vh-dim">{t.toolKind[it(r).toolKind ?? "tool"]}</span> },
        { key: "dmg", label: t.cols.dmg, right: true, first: "desc", sort: (r) => totalDamage(it(r).damage), cell: (r) => <Num v={totalDamage(it(r).damage)} /> },
        biome,
        station,
      ];
    case "building":
      return [
        { key: "tool", label: t.cols.tool, sort: (r) => pc(r).tool ?? "", first: "asc", cell: (r) => <span className="vh-dim">{t.tool[pc(r).tool ?? ""] ?? "—"}</span> },
        { key: "cat", label: t.cols.category, hideMobile: true, sort: (r) => tx(pc(r).categoryName, lang), first: "asc", cell: (r) => <span className="vh-dim">{tx(pc(r).categoryName, lang) || "—"}</span> },
        { key: "comfort", label: t.cols.comfort, right: true, first: "desc", sort: (r) => pc(r).comfort ?? 0, cell: (r) => <Num v={pc(r).comfort} /> },
        {
          key: "req", label: t.detail.recipe, hideMobile: true, cell: (r) => (
            <span className="vh-tags">
              {pc(r).req.slice(0, 4).map((q, i) => <Slot key={i} icon={q.icon} qty={q.amount} size="sm" alt={tx(q.name, lang)} />)}
            </span>
          ),
        },
        station,
      ];
    case "materials":
      return [
        { key: "how", label: t.cols.how, cell: (r) => <span className="vh-dim">{(it(r).hows ?? []).map((h) => t.how[h] ?? h).join(" · ") || "—"}</span> },
        { key: "biomes", label: t.cols.biomes, hideMobile: true, cell: (r) => <BiomeTags ids={it(r).biomes} /> },
        { key: "uses", label: t.cols.usedFor, right: true, first: "desc", sort: (r) => it(r).usedIn.length, cell: (r) => <Num v={it(r).usedIn.length} /> },
      ];
    case "creatures":
      return [
        { key: "health", label: t.cols.health, right: true, first: "desc", sort: (r) => cr(r).health ?? 0, cell: (r) => <Num v={cr(r).health} /> },
        { key: "weak", label: t.cols.weak, hideMobile: true, cell: (r) => <span className="vh-dim">{cr(r).weak.map((w) => t.damage[w] ?? w).join(" · ") || "—"}</span> },
        { key: "biomes", label: t.cols.biomes, cell: (r) => <BiomeTags ids={cr(r).biomes} /> },
      ];
  }
}

const DEFAULT_SORT: Record<ListTab, { key: string; dir: Dir }> = {
  foods: { key: "hp", dir: "desc" },
  meads: { key: "effect", dir: "asc" },
  weapons: { key: "tier", dir: "asc" },
  armor: { key: "tier", dir: "asc" },
  tools: { key: "kind", dir: "asc" },
  building: { key: "tool", dir: "asc" },
  materials: { key: "name", dir: "asc" },
  creatures: { key: "health", dir: "asc" },
};

/** `?q=…&bioma…`: una clave por filtro, con su `key`; el orden como `sort=clave.asc`. */
function readListQuery(defs: { key: string }[]): { q: string; state: FilterState; sort: { key: string; dir: "asc" | "desc" } | null } {
  const p = new URLSearchParams(window.location.search);
  const state: FilterState = {};
  for (const d of defs) {
    const v = p.get(d.key);
    if (v) state[d.key] = v;
  }
  const [key, dir] = (p.get("sort") ?? "").split(".");
  return { q: p.get("q") ?? "", state, sort: key && (dir === "asc" || dir === "desc") ? { key, dir } : null };
}

function writeListQuery(defs: { key: string }[], q: string, state: FilterState, sort: { key: string; dir: string }, def: { key: string; dir: string }): void {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  for (const d of defs) {
    if (state[d.key]) p.set(d.key, state[d.key] as string);
    else p.delete(d.key);
  }
  if (q) p.set("q", q);
  else p.delete("q");
  if (sort.key !== def.key || sort.dir !== def.dir) p.set("sort", `${sort.key}.${sort.dir}`);
  else p.delete("sort");
  const next = url.pathname + (p.toString() ? `?${p}` : "") + url.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(window.history.state, "", next);
  }
}

export default function ValheimList({ tab, rows, to, navigate }: { tab: ListTab; rows: AnyRow[]; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const defs = FILTERS[tab];
  const [q, setQ] = useState("");
  const [state, setState] = useState<FilterState>({});
  const [sort, setSort] = useState(DEFAULT_SORT[tab]);
  // Los filtros, la búsqueda y el orden van en la dirección (pedido de ZoTaD,
  // 2026-09-25): al abrir una ficha y volver atrás el navegador devuelve la
  // dirección con ellos, y la lista vuelve como estaba. Se leen después de
  // montar para que el primer render sea igual al HTML prerenderizado.
  const [fromUrl, setFromUrl] = useState(false);
  useEffect(() => {
    const u = readListQuery(defs);
    if (u.q) setQ(u.q);
    if (Object.keys(u.state).length) setState(u.state);
    if (u.sort) setSort(u.sort);
    setFromUrl(true);
  }, [defs]);
  useEffect(() => {
    if (fromUrl) writeListQuery(defs, q, state, sort, DEFAULT_SORT[tab]);
  }, [fromUrl, defs, q, state, sort, tab]);
  // En el teléfono los filtros arrancan plegados: desplegados ocupaban hasta
  // 800 px antes del primer resultado.
  const [filtersOpen, setFiltersOpen] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches) setFiltersOpen(false);
  }, []);

  const names = useMemo(() => collectNames(rows, defs), [rows, defs]);
  const cols = useMemo(() => columns(tab, t, lang), [tab, t, lang]);
  const shown = useMemo(() => {
    const out = applyFilters(rows, defs, state, q);
    const col = cols.find((c) => c.key === sort.key);
    const key = col?.sort ?? ((r: AnyRow) => tx(r.name, lang));
    const s = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const va = key(a), vb = key(b);
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""), lang);
      return c * s || tx(a.name, lang).localeCompare(tx(b.name, lang), lang);
    });
  }, [rows, defs, state, q, sort, cols, lang]);

  const pick = (key: string, v: string | null) => setState((s) => ({ ...s, [key]: s[key] === v ? null : v }));
  const dirty = q !== "" || Object.values(state).some(Boolean);
  const clickSort = (c: Col | "name") => {
    const key = c === "name" ? "name" : c.key;
    const first = c === "name" ? "asc" : c.first ?? "asc";
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: first }));
  };
  const th = (label: string, c: Col | "name", right = false, hide = false, hideMd = false) => {
    const key = c === "name" ? "name" : c.key;
    const sortable = c === "name" || !!c.sort;
    const on = sort.key === key;
    return (
      <th key={key} className={`${right ? "is-r" : ""}${hide ? " vh-hide-m" : ""}${hideMd ? " vh-hide-md" : ""}`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : sortable ? "none" : undefined}>
        {sortable ? <button type="button" onClick={() => clickSort(c)}>{label}</button> : label}
      </th>
    );
  };

  return (
    <>
      <header className="vh-head">
        <h1>{t.tabs[tab]}</h1>
        <p>{t.tabLede[tab]}</p>
        <span className="vh-count">{t.count(shown.length, rows.length)}</span>
      </header>
      <div className="vh-list">
        <aside className="vh-side">
          <div className="vh-box">
            <input className="vh-input" type="search" value={q} placeholder={t.searchTab} aria-label={t.searchTab} onChange={(e) => setQ(e.target.value)} />
            {dirty && (
              <button type="button" className="vh-clear" style={{ marginTop: 10 }} onClick={() => { setQ(""); setState({}); }}>
                {t.clear}
              </button>
            )}
          </div>
          <details className="vh-filters" open={filtersOpen} onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="vh-box">{t.filtersTitle}{Object.values(state).filter(Boolean).length ? ` · ${Object.values(state).filter(Boolean).length}` : ""}</summary>
          {defs.map((d) => {
            if (d.toggle) {
              const n = filterOptions(rows, d, defs, state, q).find(([v]) => v === "yes")?.[1] ?? 0;
              return (
                <div className="vh-box" key={d.key}>
                  <label className="vh-toggle">
                    <input type="checkbox" checked={state[d.key] === "yes"} onChange={() => pick(d.key, "yes")} />
                    {t.filters[d.title]} <span className="vh-n">({n})</span>
                  </label>
                </div>
              );
            }
            const opts = filterOptions(rows, d, defs, state, q);
            if (opts.length < 2 && !state[d.key]) return null;
            return (
              <div className="vh-box" key={d.key}>
                <h3>{t.filters[d.title]}</h3>
                <div className={`vh-opts${d.column ? " is-col" : ""}`}>
                  {opts.map(([v, n]) => (
                    <button key={v} type="button" className="vh-chip" data-biome={d.key === "biome" ? v : undefined} aria-pressed={state[d.key] === v} onClick={() => pick(d.key, v)}>
                      {d.key === "biome" && <span className="vh-dot" />}
                      {d.text(v, t, lang, names)}
                      <span className="vh-n">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          </details>
        </aside>
        <section className="vh-box">
          {shown.length === 0 ? (
            <p className="vh-empty">{t.noResults}</p>
          ) : (
            <div className="vh-table-wrap">
              <table className="vh-table">
                <thead>
                  <tr>
                    <th aria-hidden="true" />
                    {th(t.cols.name, "name")}
                    {cols.map((c) => th(c.label, c, c.right, c.hideMobile, c.hideMd))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.slug}>
                      <td className="is-ic">
                        <RouteLink to={to(tab, r.slug)} onNavigate={navigate} aria-hidden="true" tabIndex={-1}>
                          <Slot icon={"icon" in r ? r.icon : null} size="sm" />
                        </RouteLink>
                      </td>
                      <td>
                        <RouteLink className="vh-row-name" to={to(tab, r.slug)} onNavigate={navigate}>
                          {tx(r.name, lang)}
                        </RouteLink>
                        <span className="vh-row-alt">{lang === "es" ? r.name.en : r.name.es}</span>
                      </td>
                      {cols.map((c) => (
                        <td key={c.key} className={`${c.right ? "is-r" : ""}${c.hideMobile ? " vh-hide-m" : ""}${c.hideMd ? " vh-hide-md" : ""}`}>{c.cell(r)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

