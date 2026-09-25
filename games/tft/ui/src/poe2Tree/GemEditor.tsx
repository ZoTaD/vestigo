/**
 * Las gemas de la build por tramos de niveles (pestaña "Gemas" del cajón).
 * Usa las gemas de la enciclopedia (nombre, ícono, color) y guarda sus slugs;
 * el `.build` las pasa a ids de metadata con `gems.json`.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { fold, loadCat, nameOf, type Gem } from "../poe2EncyclopediaData";
import type { GemStage } from "./share";
import { useTreeCopy } from "./copy";

interface Props {
  stages: GemStage[];
  level: number;
  onChange: (s: GemStage[]) => void;
}

function Picker({ gems, support, onPick, onClose }: { gems: Gem[]; support: boolean; onPick: (slug: string) => void; onClose: () => void }) {
  const t = useTreeCopy();
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const f = fold(q.trim());
    return gems
      .filter((g) => (support ? g.kind === "support" : g.kind !== "support"))
      .filter((g) => !f || fold(g.en).includes(f) || fold(g.es).includes(f))
      .slice(0, 30);
  }, [gems, q, support]);
  return (
    <div className="p2t-picker">
      <input
        className="p2t-input"
        autoFocus
        placeholder={t.gems.search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && list[0]) onPick(list[0].slug); }}
      />
      <div className="p2t-picker-list">
        {list.map((g) => (
          <button key={g.slug} type="button" className="p2t-picker-row" onClick={() => onPick(g.slug)}>
            {g.icon && <img src={g.icon} alt="" width={26} height={26} />}
            <span className={`p2t-gem-n is-${g.color}`}>{nameOf(g, lang)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GemEditor({ stages, level, onChange }: Props) {
  const t = useTreeCopy();
  const { lang } = useLang();
  const [gems, setGems] = useState<Gem[] | null>(null);
  const [open, setOpen] = useState<{ stage: number; skill: number | null } | null>(null);
  useEffect(() => { loadCat("gems").then(setGems).catch(() => setGems([])); }, []);
  const by = useMemo(() => new Map((gems ?? []).map((g) => [g.slug, g])), [gems]);
  if (!gems) return <p className="p2t-empty">{t.gems.loading}</p>;

  const set = (i: number, st: GemStage) => onChange(stages.map((s, j) => (j === i ? st : s)));
  const icon = (slug: string, small = false) => {
    const g = by.get(slug);
    return g?.icon ? <img className={small ? "p2t-gem-ic is-s" : "p2t-gem-ic"} src={g.icon} alt="" title={g ? nameOf(g, lang) : slug} /> : null;
  };
  const addStage = () => {
    const last = stages[stages.length - 1];
    const from = last ? Math.min(100, last.to + 1) : 1;
    onChange([...stages, { from, to: 100, skills: last ? last.skills.map((s) => ({ slug: s.slug, sup: [...s.sup] })) : [] }]);
  };

  return (
    <div className="p2t-gems">
      {!stages.length && <p className="p2t-empty">{t.gems.empty}</p>}
      {stages.map((st, i) => {
        const now = level >= st.from && level <= st.to;
        return (
          <section key={i} className={`p2t-gstage${now ? " is-now" : ""}`}>
            <header className="p2t-gstage-h">
              <label>
                {t.gems.from}{" "}
                <input type="number" min={1} max={100} value={st.from} onChange={(e) => set(i, { ...st, from: Math.max(1, Math.min(100, +e.target.value || 1)) })} />
              </label>
              <label>
                {t.gems.to}{" "}
                <input type="number" min={1} max={100} value={st.to} onChange={(e) => set(i, { ...st, to: Math.max(1, Math.min(100, +e.target.value || 100)) })} />
              </label>
              {now && <span className="p2t-now">{t.gems.now}</span>}
              <button type="button" className="p2t-x" title={t.gems.removeStage} aria-label={t.gems.removeStage} onClick={() => onChange(stages.filter((_, j) => j !== i))}>×</button>
            </header>
            {st.skills.map((s, k) => {
              const g = by.get(s.slug);
              return (
                <div key={k} className="p2t-skill">
                  {icon(s.slug)}
                  <div className="p2t-skill-b">
                    <span className={`p2t-gem-n is-${g?.color ?? "none"}`}>{g ? nameOf(g, lang) : s.slug}</span>
                    <span className="p2t-sups">
                      {s.sup.map((x, m) => (
                        <button key={m} type="button" className="p2t-sup" title={`${t.gems.remove}: ${by.get(x) ? nameOf(by.get(x)!, lang) : x}`}
                          onClick={() => set(i, { ...st, skills: st.skills.map((y, n) => (n === k ? { ...y, sup: y.sup.filter((_, o) => o !== m) } : y)) })}>
                          {icon(x, true)}
                        </button>
                      ))}
                      {s.sup.length < 5 && (
                        <button type="button" className="p2t-add-sup" onClick={() => setOpen({ stage: i, skill: k })}>+ {t.gems.addSupport}</button>
                      )}
                    </span>
                  </div>
                  <button type="button" className="p2t-x" title={t.gems.remove} aria-label={t.gems.remove}
                    onClick={() => set(i, { ...st, skills: st.skills.filter((_, n) => n !== k) })}>×</button>
                </div>
              );
            })}
            {open?.stage === i ? (
              <Picker
                gems={gems}
                support={open.skill != null}
                onClose={() => setOpen(null)}
                onPick={(slug) => {
                  if (open.skill == null) set(i, { ...st, skills: [...st.skills, { slug, sup: [] }] });
                  else set(i, { ...st, skills: st.skills.map((y, n) => (n === open.skill ? { ...y, sup: [...y.sup, slug] } : y)) });
                  setOpen(null);
                }}
              />
            ) : (
              <button type="button" className="p2t-add" onClick={() => setOpen({ stage: i, skill: null })}>+ {t.gems.addSkill}</button>
            )}
          </section>
        );
      })}
      <button type="button" className="p2t-btn" onClick={addStage}>+ {t.gems.addStage}</button>
    </div>
  );
}
