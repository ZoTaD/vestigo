/** Paso 1 del Planificador: el catálogo con filtros y tu lista (maqueta B). */
import { useEffect, useMemo, useState } from "react";
import { useLang } from "./i18n";
import RouteLink from "./RouteLink";
import type { ValheimSection } from "./route";
import { useValheimCopy } from "./valheimCopy";
import { BIOME_IDS, fold, tx } from "./valheimData";
import { PLAN_CATS, plan as calc, sanitize, setPick, addPick, type PlanCat, type PlannerData } from "./valheimPlanner";
import { setPlan, usePlan, writeUrl } from "./valheimPlannerStore";
import { Slot, type Nav, type To } from "./ValheimParts";

const PAGE = 60;

export default function ValheimPlannerPick({ data, to, navigate }: { data: PlannerData; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const raw = usePlan();
  const st = useMemo(() => sanitize(data, raw), [data, raw]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<PlanCat | null>(null);
  const [biome, setBiome] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState(false);
  useEffect(() => { writeUrl(); }, []);
  useEffect(() => setShown(PAGE), [q, cat, biome]);

  // Por bioma de progresión, después por categoría y por nombre.
  const catalog = useMemo(() => {
    const tierIx = (b: string | null) => (b ? BIOME_IDS.indexOf(b as (typeof BIOME_IDS)[number]) : 99);
    return Object.entries(data.items)
      .filter(([, it]) => it.cat)
      .sort(([, a], [, b]) => tierIx(a.tier) - tierIx(b.tier) || PLAN_CATS.indexOf(a.cat!) - PLAN_CATS.indexOf(b.cat!)
        || tx(a.name, lang).localeCompare(tx(b.name, lang)));
  }, [data, lang]);
  const hits = useMemo(() => {
    const f = fold(q.trim());
    return catalog.filter(([, it]) => (!cat || it.cat === cat) && (!biome || it.tier === biome)
      && (!f || fold(it.name.en).includes(f) || fold(it.name.es).includes(f)));
  }, [catalog, q, cat, biome]);
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
            <div className="vp-chips">
              <span className="vp-label">{t.plan.biome}</span>
              {BIOME_IDS.map((b) => (
                <button key={b} type="button" className={`vp-chip${biome === b ? " is-on" : ""}`} onClick={() => setBiome(biome === b ? null : b)}>{t.biomes[b]}</button>
              ))}
            </div>
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
                  <small>{t.plan.cats[it.cat!]}</small>
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
