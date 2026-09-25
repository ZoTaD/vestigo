/** Paso 2 del Planificador: la hoja de ruta (maqueta B). */
import { useEffect, useMemo, useState } from "react";
import { useLang } from "./i18n";
import RouteLink from "./RouteLink";
import type { ValheimSection } from "./route";
import { useValheimCopy, type ValheimCopy } from "./valheimCopy";
import { tx } from "./valheimData";
import {
  EMPTY_PLAN, encodePlan, plan as calc, sanitize, setAny, setVia, tree, viaOf, viaOptions,
  type PlannerData, type PSource, type TreeNode, type Via,
} from "./valheimPlanner";
import { setPlan, useHave, usePlan, writeUrl } from "./valheimPlannerStore";
import { Slot, type Nav, type To } from "./ValheimParts";
import type { Lang } from "./i18n";

function sourceText(s: PSource, t: ValheimCopy, lang: Lang): string {
  const who = s.name ? tx(s.name, lang) : "";
  if (s.how === "drop") {
    const n = s.min != null && s.max != null ? (s.min === s.max ? ` ${s.min}` : ` ${s.min}–${s.max}`) : "";
    const pc = s.chance != null && s.chance < 1 ? ` · ${Math.round(s.chance * 100)} %` : "";
    return `${who}${n}${pc}`;
  }
  const label = t.plan.how[s.how] ?? s.how;
  if (s.how === "chest") return label;
  if (s.how === "trader") return who ? `${label}: ${who}` : label;
  return who || label;
}

/** 2.288 / 2,288: el español no agrupa las cifras de cuatro dígitos por defecto. */
const thousands = (n: number, lang: Lang) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "es" ? "." : ",");

export default function ValheimPlannerRoute({ data, to, navigate }: { data: PlannerData; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const raw = usePlan();
  const st = useMemo(() => sanitize(data, raw), [data, raw]);
  const p = useMemo(() => calc(data, st), [data, st]);
  const [mode, setMode] = useState<"table" | "raw">("raw");
  // Las tildes van por lista de objetos: cambiar un camino no las borra.
  const [have, toggle] = useHave(encodePlan({ ...EMPTY_PLAN, picks: st.picks }));
  const [copied, setCopied] = useState(false);
  useEffect(() => { writeUrl(); }, []);
  // La hoja de ruta depende de cada lista: que no se indexe.
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex";
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  const name = (id: string) => tx(data.items[id]?.name, lang) || id;
  // "de chatarra", no "de Chatarra": en español el nombre va en minúscula en
  // medio de la frase. En inglés los nombres del juego van con mayúsculas.
  const lower = (s: string) => (lang === "es" ? s.charAt(0).toLocaleLowerCase("es") + s.slice(1) : s);
  const stName = (tok: string | null) => (tok && data.stations[tok] ? tx(data.stations[tok].name, lang) : "");
  const link = (id: string, children: React.ReactNode) => {
    const it = data.items[id];
    return it?.slug && it.tab ? <RouteLink to={to(it.tab as ValheimSection, it.slug)} onNavigate={navigate}>{children}</RouteLink> : <>{children}</>;
  };

  if (st.picks.length === 0) {
    return (
      <div className="vp">
        <header className="vh-head"><h1>{t.plan.routeTitle}</h1><p>{t.plan.nothing}</p></header>
        <RouteLink className="vp-go vp-go-inline" to={to("planner")} onNavigate={navigate}>{t.plan.goPick}</RouteLink>
      </div>
    );
  }

  const ids = new Set([...p.table.map((n) => n.id), ...p.steps.map((s) => s.id), ...p.raw.map((n) => n.id)]);
  const choices = [...ids].filter((id) => viaOptions(data, id).length > 1);
  const anys = [...new Set([...st.picks.map((x) => x.id), ...p.steps.map((s) => s.id)])].filter((id) => data.recipes[id]?.any);
  const label = (id: string, v: Via) => (v === "craft" ? t.plan.viaCraft(stName(data.recipes[id]?.st ?? null)) : v === "raw" ? t.plan.viaRaw : t.plan.viaFrom(lower(name(v.slice(5)))));

  const Node = ({ n, depth }: { n: TreeNode; depth: number }) => (
    <>
      <div className={`vp-node d${Math.min(depth, 3)}`}>
        {depth > 0 && <span className="vp-twig" aria-hidden="true">└</span>}
        <Slot icon={data.items[n.id]?.icon} size={depth ? "xs" : "sm"} />
        <span className="vp-q">{n.qty}</span>
        <span className="vp-nname">{link(n.id, name(n.id))}</span>
        {n.st && <span className="vp-via">{t.plan.atStation(stName(n.st), n.per)}</span>}
      </div>
      {n.kids.map((k) => <Node key={k.id} n={k} depth={depth + 1} />)}
    </>
  );

  return (
    <div className="vp">
      <header className="vh-head vp-rhead">
        <div>
          <RouteLink className="vh-back" to={to("planner")} onNavigate={navigate}>{t.plan.back}</RouteLink>
          <h1>{t.plan.routeTitle}</h1>
          <p>{st.picks.map((x) => `${x.qty > 1 ? `${x.qty} × ` : ""}${name(x.id)}${x.level > 1 ? ` (${t.plan.level(x.level).toLowerCase()})` : ""}`).join(" · ")}</p>
        </div>
        <div className="vp-stats">
          <span><b>≈ {thousands(Math.round(p.weight), lang)}</b>{t.plan.weight}, {t.plan.trips(p.trips)}</span>
          {p.fuelMinutes > 0 && <span><b>{p.fuelMinutes}</b>{t.plan.smelting}</span>}
          <span><b>{p.biomes.length}</b>{t.plan.biomes}</span>
        </div>
      </header>

      <div className="vp-rgrid">
        <section className="vh-box vp-break" aria-label={t.plan.breakdown}>
          <div className="vp-break-head">
            <h2>{t.plan.breakdown}</h2>
            <div className="vp-seg" role="group" aria-label={t.plan.breakdown}>
              <button type="button" className={mode === "table" ? "is-on" : ""} aria-pressed={mode === "table"} onClick={() => setMode("table")}>{t.plan.toTable}</button>
              <button type="button" className={mode === "raw" ? "is-on" : ""} aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>{t.plan.toRaw}</button>
            </div>
          </div>
          {p.table.map((n) => (
            <div key={n.id} className="vp-branch">
              {mode === "raw"
                ? <Node n={tree(data, st, n.id, n.qty)} depth={0} />
                : (
                  <div className="vp-node d0">
                    <Slot icon={data.items[n.id]?.icon} size="sm" />
                    <span className="vp-q">{n.qty}</span>
                    <span className="vp-nname">{link(n.id, name(n.id))}</span>
                  </div>
                )}
              <small className="vp-for">{t.plan.forWhat(n.for.map(name).join(", "))}</small>
            </div>
          ))}
          {p.leftovers.map((l) => <p key={l.id} className="vp-note">{name(l.id)}: {t.plan.left(l.asked, l.made)}</p>)}
        </section>

        <aside className="vp-side">
          <section className="vh-box vp-gather" aria-label={t.plan.gather}>
            <div className="vp-list-head">
              <h2>{t.plan.gather}</h2>
              <span className="vp-dim">{t.plan.ready(p.raw.filter((n) => have.has(n.id)).length, p.raw.length)}</span>
            </div>
            {p.raw.map((n) => {
              const it = data.items[n.id];
              return (
                <label key={n.id} className={`vp-need${have.has(n.id) ? " is-done" : ""}`}>
                  <input type="checkbox" checked={have.has(n.id)} onChange={() => toggle(n.id)} aria-label={`${t.plan.have}: ${name(n.id)}`} />
                  <Slot icon={it?.icon} size="xs" />
                  <span className="vp-q">{n.qty}</span>
                  <span className="vp-need-main">
                    <span><b>{link(n.id, name(n.id))}</b>{it?.tier && <em>{t.biomes[it.tier]}</em>}</span>
                    <small>{(data.sources[n.id] ?? []).slice(0, 3).map((s) => sourceText(s, t, lang)).join(" · ")}</small>
                  </span>
                </label>
              );
            })}
          </section>

          <section className="vh-box vp-stations" aria-label={t.plan.stations}>
            <h2>{t.plan.stations}</h2>
            <div className="vp-chips">
              {p.stations.map(([tok, lv]) => (
                <span key={tok} className="vp-stchip">
                  {data.stations[tok]?.icon && <Slot icon={data.stations[tok].icon} size="xs" />}
                  {t.plan.stationLevel(stName(tok), lv)}
                </span>
              ))}
            </div>
            {(choices.length > 0 || anys.length > 0) && (
              <>
                <h3>{t.plan.paths}</h3>
                {choices.map((id) => (
                  <label key={id} className="vp-path">
                    <span>{name(id)}</span>
                    <select className="vp-sel" value={viaOf(data, st, id)} onChange={(e) => setPlan(setVia(raw, id, e.target.value as Via))}>
                      {viaOptions(data, id).map((v) => <option key={v} value={v}>{label(id, v)}</option>)}
                    </select>
                  </label>
                ))}
                {anys.map((id) => (
                  <label key={`any-${id}`} className="vp-path">
                    <span>{t.plan.anyOf(name(id))}</span>
                    <select className="vp-sel" value={st.any[id] ?? data.recipes[id].req[0][0]} onChange={(e) => setPlan(setAny(raw, id, e.target.value))}>
                      {data.recipes[id].req.map(([rid]) => <option key={rid} value={rid}>{name(rid)}</option>)}
                    </select>
                  </label>
                ))}
              </>
            )}
            <button type="button" className="vp-more" onClick={() => { navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true)).catch(() => undefined); }}>
              {copied ? t.plan.copied : t.plan.copy}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
