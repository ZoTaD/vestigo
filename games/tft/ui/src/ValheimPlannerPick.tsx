/** Paso 1 del Planificador: el catálogo con filtros y tu lista (maqueta B). */
import { useEffect, useMemo, useState } from "react";
import { useLang } from "./i18n";
import RouteLink from "./RouteLink";
import type { ValheimSection } from "./route";
import { useValheimCopy } from "./valheimCopy";
import { BIOME_IDS, fold, tx, type AnyRow, type BiomeId } from "./valheimData";
import { PLAN_CATS, SORTS, preview, plan as calc, sanitize, setPick, addPick, sortByStat, biomeOf, inBiomes, type PItem, type PlanCat, type PlannerData, type SortKey } from "./valheimPlanner";
import { collectNames, FILTERS, type FilterDef, type FilterState, type ListTab } from "./valheimTabs";
import { setPlan, usePlan, writeUrl } from "./valheimPlannerStore";
import { Slot, useTab, type Nav, type To } from "./ValheimParts";

const PAGE = 60;

export default function ValheimPlannerPick({ data, to, navigate }: { data: PlannerData; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const raw = usePlan();
  const st = useMemo(() => sanitize(data, raw), [data, raw]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<PlanCat | null>(null);
  // Varios biomas a la vez (ZoTaD, 2026-09-25): "sólo de Tierra de Ceniza y del Pantano".
  const [biomes, setBiomes] = useState<BiomeId[]>([]);
  // Los filtros de la pestaña de la enciclopedia de esa categoría.
  const [tf, setTf] = useState<FilterState>({});
  const [shown, setShown] = useState(PAGE);
  const [sort, setSort] = useState<SortKey | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { writeUrl(); }, []);
  useEffect(() => setShown(PAGE), [q, cat, biomes, sort, tf]);
  // Cada categoría se ordena y se filtra por lo suyo; al cambiarla, eso vuelve a cero.
  useEffect(() => { setSort(null); setTf({}); }, [cat]);
  const sorts = cat ? SORTS[cat] ?? [] : [];
  const listTab = cat && cat !== "bosses" ? (cat as ListTab) : null;
  const tabRows = useTab(listTab) as AnyRow[] | null;
  // El bioma va arriba, con varios a la vez: de la pestaña van los demás filtros.
  const defs: FilterDef[] = useMemo(() => (listTab && tabRows ? FILTERS[listTab].filter((d) => d.key !== "biome") : []), [listTab, tabRows]);
  const rowOf = useMemo(() => {
    const m = new Map<string, AnyRow>();
    for (const r of (tabRows ?? []) as (AnyRow & { id: string })[]) m.set(listTab === "building" ? `piece:${r.id}` : r.id, r);
    return m;
  }, [tabRows, listTab]);
  const names = useMemo(() => collectNames(tabRows ?? [], defs), [tabRows, defs]);
  const biomeById = useMemo(() => new Map(Object.keys(data.items).filter((k) => data.items[k].cat).map((k) => [k, biomeOf(data, k)])), [data]);

  // Por bioma de progresión, después por categoría y por nombre.
  const catalog = useMemo(() => {
    const tierIx = (b: string | null) => (b ? BIOME_IDS.indexOf(b as (typeof BIOME_IDS)[number]) : 99);
    return Object.entries(data.items)
      .filter(([, it]) => it.cat)
      .sort(([, a], [, b]) => tierIx(a.tier) - tierIx(b.tier) || PLAN_CATS.indexOf(a.cat!) - PLAN_CATS.indexOf(b.cat!)
        || tx(a.name, lang).localeCompare(tx(b.name, lang)));
  }, [data, lang]);
  // Buscador, categoría y biomas; los filtros de la pestaña van aparte para poder contar cada opción.
  const base = useMemo(() => {
    const f = fold(q.trim());
    return catalog.filter(([id, it]) => (!cat || it.cat === cat) && inBiomes(biomeById.get(id) ?? null, biomes)
      && (!f || fold(it.name.en).includes(f) || fold(it.name.es).includes(f)));
  }, [catalog, q, cat, biomes, biomeById]);
  const passes = (id: string, except?: string) => defs.every((d) => {
    if (d.key === except || !tf[d.key]) return true;
    const r = rowOf.get(id);
    return !!r && d.values(r).includes(tf[d.key] as string);
  });
  const hits = useMemo(() => {
    const rows = base.filter(([id]) => passes(id));
    return sort ? sortByStat(rows, sort) : rows;
  }, [base, tf, rowOf, defs, sort]);
  /** Las opciones de un filtro con cuántas cosas deja cada una, como en la enciclopedia. */
  const options = (d: FilterDef): [string, number][] => {
    const counts = new Map<string, number>();
    for (const [id] of base) {
      const r = rowOf.get(id);
      if (!r || !passes(id, d.key)) continue;
      for (const v of new Set(d.values(r))) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const out = [...counts];
    const o = d.order;
    return o ? out.sort((a, b) => (o.indexOf(a[0]) + 1 || 999) - (o.indexOf(b[0]) + 1 || 999)) : out.sort((a, b) => b[1] - a[1]);
  };
  const pickTf = (key: string, v: string | null) => setTf((s) => ({ ...s, [key]: v }));
  // Los números de cada fila (ZoTaD, 2026-09-25: "así veo qué comidas quiero llevar").
  const statLine = (it: PItem) => {
    const s = it.stats;
    if (!s) return null;
    if (s.food) {
      const [hp, st, ei, min] = s.food;
      return (
        <>
          <span className="vh-num-hp">{hp} {t.plan.hp}</span> · <span className="vh-num-st">{st} {t.plan.st}</span>
          {ei > 0 && <> · <span className="vh-num-ei">{ei} {t.plan.eitr}</span></>} · {t.minutes(min)}
        </>
      );
    }
    if (s.effect) return <>{t.effect[s.effect] ?? s.effect}</>;
    if (s.dmg != null) return <>{s.dmg} {(t.damage[s.type ?? ""] ?? s.type ?? "").toLowerCase()}</>;
    if (s.armor != null) return <>{s.armor} {t.plan.armor}</>;
    if (s.block != null) return <>{s.block} {t.plan.block}</>;
    return null;
  };
  const qtyOf = new Map(st.picks.map((p) => [p.id, p.qty]));
  const summary = useMemo(() => calc(data, st), [data, st]);
  const where = (id: string) => {
    const r = data.recipes[id];
    const s = r ? data.stations[r.st ?? ""] : data.stations[data.convert[id]?.[0]?.st ?? ""];
    if (!s) return "";
    return r && r.lv > 1 ? `${tx(s.name, lang)} ${r.lv}` : tx(s.name, lang);
  };
  const leftover = new Map(summary.leftovers.map((l) => [l.id, l]));

  return (
    <div className="vp">
      <header className="vh-head">
        <h1>{t.plan.title}</h1>
        <p>{t.plan.lede}</p>
      </header>
      <div className="vp-grid">
        <section className="vh-box vp-cat" aria-label={t.plan.title}>
          <div className="vp-filters">
            <input className="vh-input vp-search" type="search" value={q} placeholder={t.plan.search} aria-label={t.plan.search} onChange={(e) => setQ(e.target.value)} />
            <div className="vp-chips">
              <button type="button" className={`vp-chip${cat ? "" : " is-on"}`} onClick={() => setCat(null)}>{t.plan.all}</button>
              {PLAN_CATS.map((c) => (
                <button key={c} type="button" className={`vp-chip${cat === c ? " is-on" : ""}`} onClick={() => setCat(cat === c ? null : c)}>{t.plan.cats[c]}</button>
              ))}
            </div>
            {sorts.length > 0 && (
              <div className="vp-chips">
                <span className="vp-label">{t.plan.sortBy}</span>
                <button type="button" className={`vp-chip${sort ? "" : " is-on"}`} onClick={() => setSort(null)}>{t.plan.sort.tier}</button>
                {sorts.map((k) => (
                  <button key={k} type="button" className={`vp-chip${sort === k ? " is-on" : ""}`} onClick={() => setSort(k)}>{t.plan.sort[k]}</button>
                ))}
              </div>
            )}
            {defs.map((d) => {
              const opts = options(d);
              if (d.toggle) {
                const n = opts.find((o) => o[0] === "yes")?.[1] ?? 0;
                if (!n && !tf[d.key]) return null;
                return (
                  <div key={d.key} className="vp-chips">
                    <button type="button" className={`vp-chip${tf[d.key] ? " is-on" : ""}`} onClick={() => pickTf(d.key, tf[d.key] ? null : "yes")}>
                      {t.filters[d.title]} · {n}
                    </button>
                  </div>
                );
              }
              if (opts.length < 2 && !tf[d.key]) return null;
              // Las listas largas (estación, clase, set) van en un desplegable.
              return d.column ? (
                <label key={d.key} className="vp-chips">
                  <span className="vp-label">{t.filters[d.title]}</span>
                  <select className="vp-sel vp-selwide" value={tf[d.key] ?? ""} onChange={(e) => pickTf(d.key, e.target.value || null)}>
                    <option value="">{t.filters.all}</option>
                    {opts.map(([v, n]) => <option key={v} value={v}>{d.text(v, t, lang, names)} ({n})</option>)}
                  </select>
                </label>
              ) : (
                <div key={d.key} className="vp-chips">
                  <span className="vp-label">{t.filters[d.title]}</span>
                  <button type="button" className={`vp-chip${tf[d.key] ? "" : " is-on"}`} onClick={() => pickTf(d.key, null)}>{t.filters.all}</button>
                  {opts.map(([v, n]) => (
                    <button key={v} type="button" className={`vp-chip${tf[d.key] === v ? " is-on" : ""}`} onClick={() => pickTf(d.key, tf[d.key] === v ? null : v)}>
                      {d.text(v, t, lang, names)} · {n}
                    </button>
                  ))}
                </div>
              );
            })}
            <div className="vp-chips">
              <span className="vp-label">{t.plan.biome}</span>
              {BIOME_IDS.map((b) => (
                <button key={b} type="button" aria-pressed={biomes.includes(b)} className={`vp-chip${biomes.includes(b) ? " is-on" : ""}`}
                  onClick={() => setBiomes(biomes.includes(b) ? biomes.filter((x) => x !== b) : [...biomes, b])}>{t.biomes[b]}</button>
              ))}
              {biomes.length > 0 && <button type="button" className="vp-link" onClick={() => setBiomes([])}>{t.plan.clear}</button>}
            </div>
            <p className="vp-hint">{t.plan.biomesHint}</p>
          </div>
          <div className="vp-tr vp-th" aria-hidden="true">
            <span /><span>{t.plan.colItem}</span><span>{t.plan.colWhere}</span><span>{t.plan.colBiome}</span><span />
          </div>
          {hits.length === 0 && <p className="vp-none">{t.plan.noHits}</p>}
          {hits.slice(0, shown).map(([id, it]) => {
            const n = qtyOf.get(id);
            return (
              <div key={id} className={`vp-tr${n ? " is-in" : ""}`}>
                <Slot icon={it.icon} size="sm" />
                <span className="vp-name">
                  {it.slug && it.tab ? <RouteLink to={to(it.tab as ValheimSection, it.slug)} onNavigate={navigate}>{tx(it.name, lang)}</RouteLink> : tx(it.name, lang)}
                  <small>{t.plan.cats[it.cat!]}{it.stats && <> · {statLine(it)}</>}</small>
                </span>
                <span className="vp-dim">{where(id)}</span>
                <span className="vp-dim">{it.tier ? t.biomes[it.tier] : ""}</span>
                <button type="button" className={`vp-add${n ? " is-in" : ""}`} onClick={() => setPlan(addPick(st, id))}>{n ? t.plan.inList(n) : t.plan.add}</button>
              </div>
            );
          })}
          {hits.length > shown && (
            <button type="button" className="vp-more" onClick={() => setShown(shown + PAGE)}>{t.plan.more(Math.min(PAGE, hits.length - shown))}</button>
          )}
        </section>

        <aside className={`vh-box vp-list${open ? " is-open" : ""}`} aria-label={t.plan.yourList}>
          <button type="button" className="vp-bar" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span>{t.plan.open(st.picks.length)}</span><span>{open ? t.plan.close : "▲"}</span>
          </button>
          <div className="vp-list-in">
            <div className="vp-list-head">
              <h2>{t.plan.yourList}</h2>
              {st.picks.length > 0 && <button type="button" className="vp-link" onClick={() => setPlan({ ...st, picks: [] })}>{t.plan.clear}</button>}
            </div>
            {st.picks.length === 0 && <p className="vp-dim">{t.plan.empty}</p>}
            {st.picks.map((p, i) => {
              const it = data.items[p.id];
              const left = leftover.get(p.id);
              return (
                <div key={p.id} className="vp-pick">
                  <Slot icon={it.icon} size="sm" />
                  <span className="vp-pick-main">
                    <b>{tx(it.name, lang)}</b>
                    {(it.maxQ ?? 1) > 1 && (
                      <select className="vp-sel" aria-label={t.plan.level(p.level)} value={p.level} onChange={(e) => setPlan(setPick(st, i, { level: Number(e.target.value) }))}>
                        {Array.from({ length: it.maxQ! }, (_, k) => <option key={k} value={k + 1}>{t.plan.level(k + 1)}</option>)}
                      </select>
                    )}
                    {left && <small>{t.plan.batch(data.recipes[p.id]?.n ?? data.convert[p.id]?.[0]?.n ?? 1, left.made)}</small>}
                    {/* Vista previa de lo que pide, con cuánto (ZoTaD, 2026-09-25). */}
                    <span className="vp-prev">
                      {preview(data, st, p).map((k) => (
                        <span key={k.id} title={`${k.qty} × ${tx(data.items[k.id]?.name, lang)}`}>
                          <Slot icon={data.items[k.id]?.icon} qty={k.qty} size="sm" alt={tx(data.items[k.id]?.name, lang)} />
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="vp-qty">
                    <button type="button" className="vp-step" aria-label={t.plan.less} onClick={() => setPlan(setPick(st, i, { qty: p.qty - 1 }))}>−</button>
                    <input type="number" min={1} max={999} value={p.qty} aria-label={t.plan.qty} onChange={(e) => setPlan(setPick(st, i, { qty: Math.max(1, Number(e.target.value) || 1) }))} />
                    <button type="button" className="vp-step" aria-label={t.plan.plus} onClick={() => setPlan(setPick(st, i, { qty: p.qty + 1 }))}>+</button>
                  </span>
                </div>
              );
            })}
            {st.picks.length > 0 && (
              <>
                <hr className="vp-hr" />
                <div className="vp-sum">
                  <span><b>{summary.raw.length}</b>{t.plan.rawCount}</span>
                  <span><b>{summary.biomes.length}</b>{t.plan.biomeCount}</span>
                </div>
                <RouteLink className="vp-go" to={to("planner", "route")} onNavigate={navigate}>{t.plan.next}</RouteLink>
              </>
            )}
            <p className="vp-saved">{t.plan.saved}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
