/**
 * Habilidades (2026-10-30): XP para el siguiente nivel y hasta un objetivo, cuánto se pierde al morir según la
 * dificultad, y la tabla de niveles. Estado: `?k=<id>&lv=<nivel>&to=<objetivo>&r=1&dm=<modo>`.
 */
import { useEffect, useState } from "react";
import { useLang } from "../i18n";
import { useValheimCopy } from "../valheimCopy";
import { loadSkills, peekSkills, type SkillRow } from "../valheimData";
import { Slot, type Nav, type To } from "../ValheimParts";
import { useCalcCopy } from "./copy";
import { afterDeath, xpBetween, xpForNext } from "./math";
import { intParam, num, useQueryState } from "./parts";
import { savedSkills } from "./savedSkills";

/** La pérdida por muerte de cada modificador de mundo (`m_DeathLowerFactor` 0,05 × `m_skillReductionRate`). */
const DEATH: Record<string, number> = { casual: 0.01, veryeasy: 0.01, easy: 0.025, normal: 0.05, hard: 0.075, hardcore: 1 };
/** Habilidades que suben por golpe o por acción; las de moverse suben con el tiempo y no se estiman. */
const PER_HIT = (id: number) => id < 100;
const PER_USE = (id: number) => id >= 104 && id <= 108;

export default function SkillsCalc(_: { to: To; navigate: Nav }) {
  const t = useCalcCopy();
  const v = useValheimCopy();
  const { lang } = useLang();
  const [skills, setSkills] = useState<SkillRow[] | null>(peekSkills);
  useEffect(() => {
    if (!skills) loadSkills().then(setSkills).catch(() => undefined);
  }, []);
  const [q, setQ] = useQueryState();
  const mine = savedSkills();
  if (!skills) return <p className="vh-loading">{v.loading}</p>;

  const list = skills.slice().sort((a, b) => (v.more.skills[a.id] ?? "").localeCompare(v.more.skills[b.id] ?? ""));
  const skill = list.find((s) => s.id === Number(q.get("k"))) ?? list.find((s) => s.id === 1)!;
  const rawLv = Number(q.get("lv"));
  const level = q.has("lv") && Number.isFinite(rawLv) ? Math.min(100, Math.max(0, rawLv)) : mine?.[skill.id] ?? 10;
  const goal = intParam(q, "to", Math.min(100, Math.floor(level) + 10), Math.ceil(level), 100);
  const rested = q.get("r") === "1";
  const mode = DEATH[q.get("dm") ?? ""] != null ? (q.get("dm") as string) : "normal";

  const whole = Math.floor(level);
  const toNext = whole >= 100 ? 0 : xpForNext(whole) * (1 - (level - whole));
  const toGoal = goal <= level ? 0 : toNext + xpBetween(whole + 1, goal);
  const per = skill.step * (rested ? 1.5 : 1);
  const what = PER_HIT(skill.id) ? t.skills.hits : PER_USE(skill.id) ? t.skills.uses : null;
  const dead = afterDeath(level, DEATH[mode]);
  const fmt = (n: number) => n.toLocaleString(lang === "es" ? "es" : "en", { maximumFractionDigits: 2 });

  let acc = 0;
  const table = Array.from({ length: 100 }, (_, n) => {
    acc += xpForNext(n);
    return { lv: n + 1, xp: xpForNext(n), total: acc };
  });

  return (
    <div className="vc-skills">
      <span className="vc-label">{t.skills.skill}</span>
      <div className="vc-skillgrid">
        {list.map((s) => (
          <button key={s.id} type="button" className="vc-piece" aria-pressed={s.id === skill.id} onClick={() => setQ({ k: s.id, lv: null, to: null })}>
            <Slot icon={s.icon} size="sm" />
            <span>{v.more.skills[s.id] ?? s.id}</span>
            {mine?.[s.id] != null && <b>{Math.floor(mine[s.id])}</b>}
          </button>
        ))}
      </div>
      <div className="vc-two">
        <label className="vc-range">
          <span className="vc-label">{t.skills.level}</span>
          <input className="vh-input vc-num" type="number" min={0} max={100} step={0.1} value={Math.round(level * 100) / 100} onChange={(e) => setQ({ lv: e.target.value })} />
        </label>
        <label className="vc-range">
          <span className="vc-label">{t.skills.target}</span>
          <input className="vh-input vc-num" type="number" min={0} max={100} value={goal} onChange={(e) => setQ({ to: e.target.value })} />
        </label>
      </div>
      <label className="vc-check"><input type="checkbox" checked={rested} onChange={(e) => setQ({ r: e.target.checked ? 1 : null })} /> {t.skills.rested}</label>
      <div className="vc-big vc-skillres">
        <span>{t.skills.toNext}</span>
        <b>{num(toNext, lang)}</b>
        {what && <small className="vh-dim">{t.skills.actions(Math.ceil(toNext / per), what)}</small>}
        <span>{t.skills.toGoal} ({goal})</span>
        <b>{num(toGoal, lang)}</b>
        {what && <small className="vh-dim">{t.skills.actions(Math.ceil(toGoal / per), what)}</small>}
      </div>
      <h3 className="vc-h3">{t.skills.death}</h3>
      <div className="vh-opts">
        {Object.keys(DEATH).map((m) => (
          <button key={m} type="button" className="vh-chip" aria-pressed={mode === m} onClick={() => setQ({ dm: m === "normal" ? null : m })}>{t.skills.modes[m]}</button>
        ))}
      </div>
      <p className="vc-total"><b>{t.skills.lose(fmt(level), fmt(dead))}</b> <span className="vh-dim">(−{fmt(level - dead)})</span></p>
      <p className="vc-note">{t.skills.noDrain}</p>
      <details className="vc-details">
        <summary>{t.skills.table}</summary>
        <table className="vc-table is-compact">
          <thead><tr><th>{t.skills.colLevel}</th><th>{t.skills.colXp}</th><th>{t.skills.colTotal}</th></tr></thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.lv} className={r.lv === Math.floor(level) + 1 ? "is-on" : undefined}><td>{r.lv}</td><td>{num(r.xp, lang)}</td><td>{num(r.total, lang)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
