/**
 * La calculadora de genética de Rust (2026-10-09): la planta del medio y hasta 8 vecinas → el resultado de la cruza,
 * casillero por casillero y con probabilidades si hay empate; con la planta elegida, lo que cambia en tiempo, cosecha,
 * esquejes y agua. Abajo, el buscador: el esqueje que querés y los que tenés → qué cruzar. El estado va en el link
 * (`state.ts`), como la calculadora de raideo. El motor está en `genetics.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { formatChance, formatDuration } from "../items/format";
import { useFarmingCopy } from "./copy";
import { say, type Farming } from "./data";
import { GeneChip, GeneRow } from "./GeneChips";
import {
  cloneCount, crossBreed, findPlans, harvestAmount, MAX_NEIGHBOURS, parseGenes, ripeMinutes, waterUse,
  type CrossWeights, type Gene, type Plan,
} from "./genetics";
import { CALC_KEYS, EMPTY_STATE, formatCalc, MAX_OWNED, parseCalc, parseOwned, type CalcState } from "./state";

type Nav = (r: Route) => void;

export default function GeneticsCalc({ farming: f, route, navigate }: { farming: Farming; route: Route; navigate: Nav }) {
  const t = useFarmingCopy();
  const c = t.calc;
  const { lang } = useLang();
  const locale = useLocale();
  const weights = useMemo(() => Object.fromEntries(f.genes.map((g) => [g.letter, g.cross])) as CrossWeights, [f]);
  const [s, setS] = useState<CalcState>(EMPTY_STATE);
  // Hasta leer el link no se escribe nada: el primer render (vacío, igual al prerender) lo borraría.
  const [ready, setReady] = useState(false);
  const [ownedText, setOwnedText] = useState("");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    const read = parseCalc(window.location.search, f.plants.map((p) => p.id));
    setS(read);
    setOwnedText(read.owned.join("\n"));
    setReady(true);
  }, [f]);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    for (const k of CALC_KEYS) params.delete(k);
    const search = [params.toString(), formatCalc(s)].filter(Boolean).join("&");
    const url = window.location.pathname + (search ? `?${search}` : "") + window.location.hash;
    if (url !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", url);
  }, [s, ready]);

  const center = parseGenes(s.center);
  const neighbours = s.neighbours.map((n) => parseGenes(n)).filter((g): g is Gene[] => !!g);
  const result = center ? crossBreed(center, neighbours, weights) : null;
  const plant = s.plant ? f.plants.find((p) => p.id === s.plant) : undefined;
  const pct = (p: number) => formatChance(p, locale);

  const setNeighbour = (i: number, v: string) => setS((x) => ({ ...x, neighbours: x.neighbours.map((n, j) => (j === i ? v : n)) }));
  const copyLink = () => {
    const done = (r: "ok" | "fail") => {
      setCopied(r);
      window.setTimeout(() => setCopied(null), 2000);
    };
    if (!navigator.clipboard) return done("fail");
    navigator.clipboard.writeText(window.location.href).then(() => done("ok"), () => done("fail"));
  };
  const find = () => {
    const target = parseGenes(s.target);
    const owned = parseOwned(ownedText);
    setS((x) => ({ ...x, owned }));
    setPlans(target ? findPlans(target, owned.map((o) => parseGenes(o)!), weights) : []);
  };

  return (
    <main className="rs-main rs-farm rs-gen">
      <RouteLink className="rs-back" to={{ ...route, view: "rust", rsSection: "farming", detail: undefined }} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{c.h1}</h1>
        </div>
        <p className="rs-lede">{c.lede}</p>
      </section>

      <div className="rs-gen-body">
        <section className="rs-pnl rs-gen-in">
          <label className="rs-gen-field">
            <span className="rs-hd">{c.plant}</span>
            <select value={s.plant ?? ""} onChange={(e) => setS((x) => ({ ...x, plant: e.target.value || null }))}>
              <option value="">—</option>
              {f.plants.map((p) => (
                <option value={p.id} key={p.id}>
                  {say(p.name, lang)}
                </option>
              ))}
            </select>
          </label>
          <GeneInput label={c.center} value={s.center} onChange={(v) => setS((x) => ({ ...x, center: v }))} invalid={c.invalid} big />
          <p className="rs-hd rs-gen-sub">{c.neighbours}</p>
          <ol className="rs-gen-neigh">
            {s.neighbours.map((n, i) => (
              <li key={i}>
                <GeneInput label={c.neighbour(i + 1)} value={n} onChange={(v) => setNeighbour(i, v)} invalid={c.invalid} />
                <button type="button" className="rs-btn" onClick={() => setS((x) => ({ ...x, neighbours: x.neighbours.filter((_, j) => j !== i) }))}>
                  {c.remove}
                </button>
              </li>
            ))}
          </ol>
          {s.neighbours.length < MAX_NEIGHBOURS && (
            <button type="button" className="rs-btn" onClick={() => setS((x) => ({ ...x, neighbours: [...x.neighbours, ""] }))}>
              {c.add}
            </button>
          )}
        </section>

        <section className="rs-pnl rs-gen-out" aria-live="polite">
          <h2 className="rs-hd">{c.result}</h2>
          {!result ? (
            <p className="rs-dim">{c.invalid}</p>
          ) : (
            <>
              <ul className="rs-gen-outcomes">
                {result.outcomes.map((o) => (
                  <li key={o.genes}>
                    <GeneRow genes={o.genes} />
                    <span>{o.genes === s.center ? c.noChange : c.chance(pct(o.p))}</span>
                  </li>
                ))}
              </ul>
              <h3 className="rs-sub">{c.slotsTitle}</h3>
              <ol className="rs-gen-slots">
                {result.slots.map((slot, i) => (
                  <li key={i}>
                    <span className="rs-dim">{c.slot(i + 1)}</span>
                    <GeneChip gene={center![i]} dim={slot.changes} />
                    <span aria-hidden="true">→</span>
                    {slot.changes ? (
                      Object.entries(slot.odds).map(([g, p]) => (
                        <span key={g} className="rs-gen-odd">
                          <GeneChip gene={g as Gene} />
                          {p! < 1 && <span>{pct(p!)}</span>}
                        </span>
                      ))
                    ) : (
                      <span className="rs-dim">{c.keeps}</span>
                    )}
                  </li>
                ))}
              </ol>
              {plant && center && (
                <>
                  <h3 className="rs-sub">
                    {c.stats}: {say(plant.name, lang)}
                  </h3>
                  <Stats farming={f} plantId={plant.id} before={center} after={parseGenes(result.outcomes[0].genes)!} />
                </>
              )}
            </>
          )}
          <p className="rs-raid-actions">
            <button type="button" className="rs-btn" onClick={copyLink}>
              {copied === "ok" ? c.copied : copied === "fail" ? c.copyFailed : c.share}
            </button>
          </p>
        </section>
      </div>

      <section className="rs-pnl">
        <h2 className="rs-hd">{c.finder}</h2>
        <p className="rs-farm-p">{c.finderLede}</p>
        <div className="rs-gen-find">
          <GeneInput label={c.target} value={s.target} onChange={(v) => setS((x) => ({ ...x, target: v }))} invalid={c.invalid} />
          <label className="rs-gen-field">
            <span className="rs-hd">{c.owned}</span>
            <textarea rows={4} value={ownedText} onChange={(e) => setOwnedText(e.target.value)} spellCheck={false} />
            <span className="rs-dim">
              {c.ownedHelp} · {c.tooMany(MAX_OWNED)}
            </span>
          </label>
          <p>
            <button type="button" className="rs-btn rs-btn-go" onClick={find}>
              {c.find}
            </button>
          </p>
        </div>
        {plans && (
          <div className="rs-gen-plans" aria-live="polite">
            {plans.length === 0 && <p>{c.noPlan}</p>}
            {plans.map((pl, i) =>
              pl.neighbours.length === 0 ? (
                <p key={i}>{c.already}</p>
              ) : (
                <div className="rs-gen-plan" key={i}>
                  <p>
                    {c.plan(pl.center, pl.neighbours.length)} <b>{c.chance(pct(pl.p))}</b>
                  </p>
                  <ul>
                    {pl.neighbours.map((n, j) => (
                      <li key={j}>
                        <GeneRow genes={n} />
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="rs-btn" onClick={() => setS((x) => ({ ...x, center: pl.center, neighbours: pl.neighbours.slice() }))}>
                    {c.use}
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <section className="rs-pnl rs-about">
        <h2 className="rs-hd">{t.genesTitle}</h2>
        {c.how.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>
    </main>
  );
}

/** Un campo de genes: se escribe como en el juego y al lado se ven los seis casilleros (o qué falta). */
function GeneInput({ label, value, onChange, invalid, big }: { label: string; value: string; onChange: (v: string) => void; invalid: string; big?: boolean }) {
  const ok = parseGenes(value);
  return (
    <label className={`rs-gen-field${big ? " is-big" : ""}`}>
      <span className="rs-hd">{label}</span>
      <span className="rs-gen-row">
        <input
          value={value}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="GGGYYY"
          aria-invalid={value !== "" && !ok}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^XWGYH]/g, ""))}
        />
        {ok ? <GeneRow genes={ok.join("")} /> : value ? <span className="rs-dim">{invalid}</span> : null}
      </span>
    </label>
  );
}

/** Tiempo, cosecha, esquejes y agua de la planta: con los genes de la del medio y con los del resultado más probable. */
function Stats({ farming: f, plantId, before, after }: { farming: Farming; plantId: string; before: Gene[]; after: Gene[] }) {
  const t = useFarmingCopy();
  const locale = useLocale();
  const p = f.plants.find((x) => x.id === plantId)!;
  const num = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });
  const rows: [string, (g: Gene[]) => string][] = [
    [t.facts.ripe, (g) => formatDuration(ripeMinutes(p, g, f.rules) * 60)],
    [t.facts.harvest, (g) => String(harvestAmount(p, g, f.rules))],
    [t.facts.clones, (g) => String(cloneCount(p, g))],
    [t.facts.water, (g) => t.perTick(num(waterUse(p, g, f.rules)))],
  ];
  return (
    <table className="rs-table rs-gen-stats">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col"><GeneRow genes={before.join("")} /></th>
          <th scope="col"><GeneRow genes={after.join("")} /></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, fn]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{fn(before)}</td>
            <td>{fn(after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
