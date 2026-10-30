/**
 * Combinador de comidas (2026-10-30): tres platos, sus totales al comer, la curva de salud, aguante y eitr en el
 * tiempo y el mejor trío de un bioma. El estado va en la dirección (`?a=&b=&c=` con los ids del juego).
 */
import { useMemo, useState } from "react";
import { useLang } from "../i18n";
import RouteLink from "../RouteLink";
import { useValheimCopy } from "../valheimCopy";
import { BIOME_IDS, tx, type BiomeId, type ItemRow } from "../valheimData";
import { Slot, useTab, type Nav, type To } from "../ValheimParts";
import { useCalcCopy } from "./copy";
import { BASE, bestCombo, canEatAgainAt, comboAt } from "./math";
import { num, Picker, useQueryState } from "./parts";

const KEYS = ["a", "b", "c"] as const;
/** Los biomas con comida propia, en orden (el océano no tiene). */
const FOOD_BIOMES: BiomeId[] = BIOME_IDS.filter((b) => b !== "ocean");

export default function FoodCalc({ to, navigate }: { to: To; navigate: Nav }) {
  const t = useCalcCopy();
  const v = useValheimCopy();
  const { lang } = useLang();
  const rows = useTab("foods");
  const foods = useMemo(() => (rows ?? []).filter((r) => r.food && (r.food.hp || r.food.st || r.food.eitr)), [rows]);
  const [q, setQ] = useQueryState();
  const picked = KEYS.map((k) => foods.find((f) => f.id === q.get(k)) ?? null);
  const chosen = picked.filter((f): f is ItemRow => !!f);
  const [bestBiome, setBestBiome] = useState<BiomeId | null>(null);

  if (!rows) return <p className="vh-loading">{v.loading}</p>;
  const set = (i: number, f: ItemRow | null) => setQ({ [KEYS[i]]: f?.id });
  const used = new Set(chosen.map((f) => f.id));
  const eat = comboAt(chosen.map((f) => f.food!), 0);
  const regen = chosen.reduce((s, f) => s + f.food!.regen, 0);
  const stats = (r: ItemRow) => (
    <>
      <b className="vh-num-hp">{r.food!.hp}</b> <b className="vh-num-st">{r.food!.st}</b>
      {r.food!.eitr > 0 && <> <b className="vh-num-ei">{r.food!.eitr}</b></>} <span className="vh-dim">· {t.food.lasts(r.food!.min)}</span>
    </>
  );
  const top = { hp: 25 + 3 * 120, st: 50 + 3 * 120, eitr: 3 * 120 };

  return (
    <div className="vc-food">
      <div className="vc-food-l">
        <h2 className="vh-plate vc-plate">{t.food.slots}</h2>
        {picked.map((f, i) => (
          <div key={i} className="vc-dish">
            <Picker
              rows={foods.filter((r) => !used.has(r.id) || r.id === f?.id)}
              value={f}
              onPick={(r) => set(i, r)}
              placeholder={t.food.pick}
              extra={stats}
              allowNone
              noneText={t.food.empty}
            />
            {f && (
              <RouteLink className="vc-link" to={to("foods", f.slug)} onNavigate={navigate} aria-label={tx(f.name, lang)}>↗︎</RouteLink>
            )}
          </div>
        ))}
        <h3 className="vc-h3">{t.food.atEat}</h3>
        {chosen.length ? (
          <>
            <div className="vh-bars">
              <Bar label={t.food.hp} value={eat.hp} max={top.hp} cls="hp" lang={lang} />
              <Bar label={t.food.st} value={eat.st} max={top.st} cls="st" lang={lang} />
              {eat.eitr > 0 && <Bar label={t.food.eitr} value={eat.eitr} max={top.eitr} cls="ei" lang={lang} />}
            </div>
            <p className="vc-note">{t.food.regen(regen)} · {t.food.base}</p>
          </>
        ) : (
          <p className="vc-note">{t.food.noFood}</p>
        )}
      </div>
      <div className="vc-food-r">
        <h3 className="vc-h3">{t.food.chart}</h3>
        <Chart foods={chosen} lang={lang} t={t} />
        <h3 className="vc-h3">{t.food.best}</h3>
        <div className="vh-opts">
          {FOOD_BIOMES.map((b) => (
            <button key={b} type="button" className="vh-chip" data-biome={b} aria-pressed={bestBiome === b} onClick={() => setBestBiome(bestBiome === b ? null : b)}>
              <span className="vh-dot" />{v.biomes[b]}
            </button>
          ))}
        </div>
        {bestBiome && (
          <div className="vc-best">
            <Best foods={foods} biome={bestBiome} kind="hpst" title={t.food.bestHpst} onUse={(fs) => setQ({ a: fs[0]?.id, b: fs[1]?.id, c: fs[2]?.id })} />
            {FOOD_BIOMES.indexOf(bestBiome) >= FOOD_BIOMES.indexOf("mistlands") && (
              <Best foods={foods} biome={bestBiome} kind="eitr" title={t.food.bestEitr} onUse={(fs) => setQ({ a: fs[0]?.id, b: fs[1]?.id, c: fs[2]?.id })} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Bar({ label, value, max, cls, lang }: { label: string; value: number; max: number; cls: "hp" | "st" | "ei"; lang: string }) {
  return (
    <div className="vh-bar">
      <span>{label}</span>
      <span className="vh-bar-t"><span className={`vh-bar-f is-${cls}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></span>
      <b>{num(value, lang)}</b>
    </div>
  );
}

function Best({ foods, biome, kind, title, onUse }: { foods: ItemRow[]; biome: BiomeId; kind: "hpst" | "eitr"; title: string; onUse: (f: ItemRow[]) => void }) {
  const t = useCalcCopy();
  const { lang } = useLang();
  const trio = useMemo(() => bestCombo(foods, kind, biome), [foods, kind, biome]);
  if (trio.length < 3) return null;
  const s = comboAt(trio.map((f) => f.food!), 0);
  return (
    <div className="vc-trio vh-box">
      <b>{title}</b>
      <div className="vc-trio-i">
        {trio.map((f) => (
          <span key={f.id} title={tx(f.name, lang)}><Slot icon={f.icon} size="sm" alt={tx(f.name, lang)} /></span>
        ))}
      </div>
      <span className="vc-trio-n"><b className="vh-num-hp">{num(s.hp, lang)}</b> · <b className="vh-num-st">{num(s.st, lang)}</b>{s.eitr > 0 && <> · <b className="vh-num-ei">{num(s.eitr, lang)}</b></>}</span>
      <span className="vc-trio-names">{trio.map((f) => tx(f.name, lang)).join(" · ")}</span>
      <button type="button" className="vh-chip is-on" onClick={() => onUse(trio)}>{t.food.load}</button>
    </div>
  );
}

const W = 600, H = 260, L = 42, R = 12, T = 14, B = 30;

/** La curva en el tiempo, en SVG propio: los tres valores minuto a minuto y cuándo se puede volver a comer cada plato. */
function Chart({ foods, lang, t }: { foods: ItemRow[]; lang: string; t: ReturnType<typeof useCalcCopy> }) {
  const [at, setAt] = useState<number | null>(null);
  const maxT = Math.max(30, ...foods.map((f) => f.food!.min));
  const series = foods.map((f) => f.food!);
  const peak = comboAt(series, 0);
  const hasEitr = peak.eitr > 0;
  const maxV = Math.max(100, Math.ceil(Math.max(peak.hp, peak.st, peak.eitr) / 50) * 50);
  const x = (m: number) => L + (m / maxT) * (W - L - R);
  const y = (val: number) => T + (1 - val / maxV) * (H - T - B);
  const path = (k: "hp" | "st" | "eitr") => {
    let d = "";
    for (let m = 0; m <= maxT; m += maxT / 120) d += `${d ? "L" : "M"}${x(m).toFixed(1)},${y(comboAt(series, m)[k]).toFixed(1)}`;
    return d;
  };
  const ticks = [];
  const step = maxT > 60 ? 15 : maxT > 30 ? 10 : 5;
  for (let m = 0; m <= maxT; m += step) ticks.push(m);
  const now = at == null ? null : comboAt(series, at);
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = (((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * maxT;
    setAt(Math.round(Math.min(maxT, Math.max(0, m))));
  };
  return (
    <figure className="vc-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.food.chart} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setAt(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(maxV * f)} y2={y(maxV * f)} className="vc-grid" />
            <text x={L - 6} y={y(maxV * f) + 4} textAnchor="end" className="vc-axis">{Math.round(maxV * f)}</text>
          </g>
        ))}
        {ticks.map((m) => <text key={m} x={x(m)} y={H - 10} textAnchor="middle" className="vc-axis">{t.food.min(m)}</text>)}
        {foods.map((f, i) => {
          const m = canEatAgainAt(f.food!);
          return (
            <g key={f.id}>
              <line x1={x(m)} x2={x(m)} y1={T} y2={H - B} className="vc-again" />
              <text x={x(m) + 4} y={T + 12 + i * 14} className="vc-again-t">{t.food.eatAgain(tx(f.name, lang as "en" | "es"))}</text>
            </g>
          );
        })}
        {foods.length > 0 && (
          <>
            <path d={path("hp")} className="vc-line is-hp" />
            <path d={path("st")} className="vc-line is-st" />
            {hasEitr && <path d={path("eitr")} className="vc-line is-ei" />}
          </>
        )}
        {foods.length === 0 && (
          <>
            <line x1={L} x2={W - R} y1={y(BASE.hp)} y2={y(BASE.hp)} className="vc-line is-hp" />
            <line x1={L} x2={W - R} y1={y(BASE.st)} y2={y(BASE.st)} className="vc-line is-st" />
          </>
        )}
        {at != null && <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} className="vc-cursor" />}
      </svg>
      <figcaption className="vc-note">
        {now ? (
          <>
            <b>{t.food.min(at!)}</b> · <b className="vh-num-hp">{num(now.hp, lang)}</b> {t.food.hp.toLowerCase()} · <b className="vh-num-st">{num(now.st, lang)}</b> {t.food.st.toLowerCase()}
            {hasEitr && <> · <b className="vh-num-ei">{num(now.eitr, lang)}</b> eitr</>}
          </>
        ) : t.food.hover}
      </figcaption>
    </figure>
  );
}
