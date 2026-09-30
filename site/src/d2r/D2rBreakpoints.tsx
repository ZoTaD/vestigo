/**
 * Breakpoints (2026-09-29): las tablas de FCR, FHR y FBR de cada clase y tipo de
 * arma, con el Conjurador, y una calculadora: con tus porcentajes marca el
 * escalón en que estás y cuánto te falta para el siguiente.
 */
import { useState } from "react";
import { useLang } from "../i18n";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { gameImg } from "../d2rData";
import { E, tr } from "./wiki";
import { BREAKPOINTS, bpState, type BpKind } from "./breakpoints";
import { D2Head } from "./ui";
import classesJson from "@d2r/wiki/classes.json";

const CLASS_NAMES = new Map((classesJson as unknown as { id: string; name: { en: string; es: string } }[]).map((c) => [c.id, c.name]));
const KINDS: BpKind[] = ["fcr", "fhr", "fbr"];
/** Todos los tipos de arma que puede usar alguna clase: si un grupo los tiene todos, es "con cualquier arma". */
const ALL_WEAPONS = ["HTH", "1HS", "1HT", "2HS", "2HT", "STF", "BOW", "XBW"];

export default function D2rBreakpoints(_: { route: Route; navigate: (r: Route) => void }) {
  const t = useD2rCopy();
  const tb = t.bp;
  const { lang } = useLang();
  const [cls, setCls] = useState("sorceress");
  const [mine, setMine] = useState<Record<BpKind, number>>({ fcr: 0, fhr: 0, fbr: 0 });
  const data = BREAKPOINTS[cls];

  // El nombre de un grupo de armas, sin repetir ("Dos armas" aparece en cuatro variantes).
  const weapons = (w: string[]) => {
    if (ALL_WEAPONS.every((x) => w.includes(x))) return tb.anyWeapon;
    return [...new Set(w.map((x) => tb.wclass[x] ?? x))].join(" · ");
  };

  return (
    <>
      <D2Head as="h1" title={t.tabs.breakpoints} lede={tb.lede} />
      <div className="d2-plan-classes d2-bp-classes" role="group" aria-label={t.planner.cls}>
        {E.classes.map((c) => (
          <button type="button" key={c.id} className={`d2-plan-class${cls === c.id ? " is-on" : ""}`} aria-pressed={cls === c.id} onClick={() => setCls(c.id)} title={tr(CLASS_NAMES.get(c.id), lang)}>
            <img src={gameImg(`class/${c.id}`)} alt={tr(CLASS_NAMES.get(c.id), lang)} />
          </button>
        ))}
        <b className="d2-bp-cls">{tr(CLASS_NAMES.get(cls), lang)}</b>
      </div>

      <div className="d2-bp-yours">
        <span className="d2-bp-yours-h">{tb.yours}</span>
        {KINDS.map((k) => (
          <label className="d2-plan-field" key={k}>
            {k.toUpperCase()}
            <input type="number" min={0} max={999} value={mine[k]} onChange={(e) => setMine((m) => ({ ...m, [k]: Math.max(0, Math.min(999, Number(e.target.value) || 0)) }))} />
            %
          </label>
        ))}
      </div>

      <div className="d2-bp-grid">
        {KINDS.map((k) => (
          <section key={k} className="d2-bp-kind">
            <h2 className="d2-h3">{tb.kinds[k]}</h2>
            {(data?.[k] ?? []).map((g, gi) => {
              const st = bpState(g.table, mine[k]);
              return (
                <div className="d2-bp-group" key={gi}>
                  <p className="d2-bp-weapons">{weapons(g.w)}</p>
                  <p className="d2-bp-now">
                    <b>{tb.now(st.frames)}</b> · {st.next ? tb.next(st.next[0], st.next[0] - mine[k]) : tb.maxed}
                  </p>
                  <table className="d2-table d2-bp-table">
                    <thead>
                      <tr>
                        <th>{tb.needed}</th>
                        <th>{tb.frames}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.table.map(([pct, frames], i) => (
                        <tr key={pct} className={i === st.index ? "is-now" : ""}>
                          <td>{pct}%</td>
                          <td>{frames}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
