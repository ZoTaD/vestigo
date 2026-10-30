/**
 * Confort y descanso (2026-10-30): marcas lo que tienes a 10 m de la cama y da el confort y cuánto dura el descanso.
 * De cada grupo cuenta sólo la mejor; las piezas sin grupo suman todas. Estado: `?p=id,id…` y `ns=1` sin techo.
 */
import { useMemo } from "react";
import { useLang } from "../i18n";
import { useValheimCopy } from "../valheimCopy";
import { BIOME_IDS, tx, type BiomeId, type PieceRow } from "../valheimData";
import { Slot, useTab, type Nav, type To } from "../ValheimParts";
import { useCalcCopy } from "./copy";
import { comfortLevel, restedSeconds } from "./math";
import { useQueryState } from "./parts";

const GROUPS = ["Fire", "Bed", "Chair", "Table", "Carpet", "Banner", "Lantern", "Display", "Decor", "Garland", "Leisure"];
const LOOSE = "-";
/** Las piezas de las fiestas (Yule, Halloween, solsticio): sólo se construyen en su temporada, la sugerencia no las usa. */
const SEASONAL = new Set(["piece_maypole", "piece_xmastree", "piece_jackoturnip", "piece_xmasgarland", "piece_xmascrown", "piece_mistletoe", "piece_snowlantern", "piece_CelebrationGarland"]);

export default function ComfortCalc(_: { to: To; navigate: Nav }) {
  const t = useCalcCopy();
  const v = useValheimCopy();
  const { lang } = useLang();
  const rows = useTab("building");
  const [q, setQ] = useQueryState();
  const pieces = useMemo(() => (rows ?? []).filter((p) => p.comfort), [rows]);
  const groups = useMemo(() => {
    const m = new Map<string, PieceRow[]>();
    for (const p of pieces) {
      const g = p.comfortGroup ?? LOOSE;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(p);
    }
    for (const l of m.values()) l.sort((a, b) => (b.comfort ?? 0) - (a.comfort ?? 0) || a.name.en.localeCompare(b.name.en));
    return [...GROUPS.filter((g) => m.has(g)).map((g) => [g, m.get(g)!] as const), ...(m.has(LOOSE) ? [[LOOSE, m.get(LOOSE)!] as const] : [])];
  }, [pieces]);
  if (!rows) return <p className="vh-loading">{v.loading}</p>;

  const sel = new Set((q.get("p") ?? "").split(",").filter((id) => pieces.some((p) => p.id === id)));
  const shelter = q.get("ns") !== "1";
  const write = (s: Set<string>) => setQ({ p: [...s].join(",") || null });
  const toggle = (p: PieceRow) => {
    const s = new Set(sel);
    if (s.has(p.id)) s.delete(p.id);
    else {
      // Dentro de un grupo se elige una: la nueva reemplaza a la otra.
      if (p.comfortGroup) for (const o of pieces) if (o.comfortGroup === p.comfortGroup) s.delete(o.id);
      s.add(p.id);
    }
    write(s);
  };
  const best = (b: BiomeId) => {
    const top = BIOME_IDS.indexOf(b);
    const ok = (p: PieceRow) => !SEASONAL.has(p.id) && BIOME_IDS.indexOf(p.tier ?? "meadows") <= top;
    const s = new Set<string>();
    for (const [g, list] of groups) {
      if (g === LOOSE) list.filter(ok).forEach((p) => s.add(p.id));
      else { const p = list.find(ok); if (p) s.add(p.id); }
    }
    write(s);
  };
  const chosen = pieces.filter((p) => sel.has(p.id));
  const level = comfortLevel(chosen.map((p) => ({ id: p.id, comfort: p.comfort ?? 0, group: p.comfortGroup ?? null })), shelter);
  const mins = restedSeconds(level) / 60;

  return (
    <div className="vc-comfort">
      <div className="vc-comfort-top">
        <div className="vc-big">
          <span>{t.comfort.level}</span><b>{level}</b>
          <span>{t.comfort.rested}</span><b>{t.comfort.minutes(mins)}</b>
        </div>
        <div>
          <label className="vc-check">
            <input type="checkbox" checked={shelter} onChange={(e) => setQ({ ns: e.target.checked ? null : 1 })} /> {t.comfort.shelter}
          </label>
          {!shelter && <p className="vc-note">{t.comfort.shelterOff}</p>}
          <p className="vc-note">{t.comfort.onlyBest}</p>
          <span className="vc-label">{t.comfort.best}</span>
          <div className="vh-opts">
            {BIOME_IDS.filter((b) => b !== "ocean").map((b) => (
              <button key={b} type="button" className="vh-chip" data-biome={b} onClick={() => best(b)}><span className="vh-dot" />{v.biomes[b]}</button>
            ))}
            <button type="button" className="vh-chip" onClick={() => write(new Set())}>{t.comfort.clear}</button>
          </div>
        </div>
      </div>
      <h3 className="vc-h3">{t.comfort.pick}</h3>
      <div className="vc-groups">
        {groups.map(([g, list]) => {
          const on = list.find((p) => sel.has(p.id));
          return (
            <section key={g} className="vc-group vh-box">
              <h4>{g === LOOSE ? t.comfort.loose : t.comfort.group[g] ?? g}{g !== LOOSE && on ? <span> +{on.comfort}</span> : null}</h4>
              <div className="vc-pieces">
                {list.map((p) => (
                  <button key={p.id} type="button" className="vc-piece" aria-pressed={sel.has(p.id)} onClick={() => toggle(p)} title={tx(p.name, lang)}>
                    <Slot icon={p.icon} size="sm" alt="" />
                    <span>{tx(p.name, lang)}{SEASONAL.has(p.id) && <small className="vh-dim"> · {t.comfort.seasonal}</small>}</span>
                    <b>+{p.comfort}</b>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
