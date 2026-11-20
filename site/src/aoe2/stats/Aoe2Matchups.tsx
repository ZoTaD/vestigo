/**
 * Matchups de AoE2 (2026-11-20): matriz civ contra civ en 1v1 con las 16 civs más jugadas (la de todas pasaría los
 * 3.000 nodos de DOM), y una civ elegida contra todas las demás, con la muestra de cada cruce.
 */
import { useMemo, useState } from "react";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { Aoe2Loading, MuestraChica, Panel, civBySlug, type Nav } from "../ui";
import { civTable, matchup } from "./data";
import { Civ, FILTROS_INICIALES, StatFilters, WrBar, pct, useSummary, type Filters } from "./parts";
import { SinDatos } from "./Aoe2Civs";

const N = 16;

export default function Aoe2Matchups(_: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const s = useSummary();
  const [f, setF] = useState<Filters>(FILTROS_INICIALES);
  const civs = useMemo(() => (s ? civTable(s, { ...f, mode: "rm1v1" }).sort((a, b) => b.games - a.games) : []), [s, f]);
  const [elegida, setElegida] = useState<string>("");
  if (s === undefined) return <Aoe2Loading />;
  if (s === null || !civs.length) return <SinDatos />;
  const top = civs.slice(0, N).map((c) => c.civ);
  const yo = elegida || civs[0].civ;
  const contra = civs
    .map((c) => c.civ)
    .filter((c) => c !== yo)
    .map((o) => ({ o, ...matchup(s, f.window, f.band, yo, o) }))
    .filter((m) => m.games > 0)
    .sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));
  return (
    <>
      <StatFilters f={f} set={setF} s={s} modes={["rm1v1"]} />
      <Panel h={t.st.matchH} sub={t.st.matchSub}>
        <div className="a2-matrix-wrap">
          <table className="a2-matrix">
            <thead>
              <tr>
                <th />
                {top.map((c) => (
                  <th key={c} title={civBySlug(c)?.name[lang]}>
                    <Civ slug={c} size={24} name={false} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((a) => (
                <tr key={a}>
                  <th title={civBySlug(a)?.name[lang]}>
                    <Civ slug={a} size={24} name={false} />
                  </th>
                  {top.map((b) => {
                    const m = matchup(s, f.window, f.band, a, b);
                    const d = m.wr == null ? 0 : m.wr - 0.5;
                    return (
                      <td
                        key={b}
                        title={m.wr == null ? "" : `${civBySlug(a)?.name[lang]} vs ${civBySlug(b)?.name[lang]}: ${pct(m.wr)} (${m.games})`}
                        style={{ background: m.wr == null ? undefined : d >= 0 ? `rgba(105,210,127,${Math.min(0.55, d * 4)})` : `rgba(242,107,91,${Math.min(0.55, -d * 4)})`, opacity: m.small ? 0.55 : 1 }}
                      >
                        {m.wr == null ? "" : Math.round(m.wr * 100)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel h={t.st.pickH(civBySlug(yo)?.name[lang] ?? yo)}>
        <label className="a2-filters">
          {t.st.pickCiv}{" "}
          <select value={yo} onChange={(e) => setElegida(e.target.value)}>
            {civs.map((c) => (
              <option key={c.civ} value={c.civ}>
                {civBySlug(c.civ)?.name[lang] ?? c.civ}
              </option>
            ))}
          </select>
        </label>
        <table className="a2-table">
          <tbody>
            {contra.map((m) => (
              <tr key={m.o}>
                <td>
                  <Civ slug={m.o} size={26} />
                </td>
                <td className={`num ${(m.wr ?? 0) >= 0.5 ? "a2-up" : "a2-down"}`}>
                  <b>{pct(m.wr)}</b>
                </td>
                <td className="a2-hide-s a2-barcell">
                  <WrBar wr={m.wr ?? 0.5} />
                </td>
                <td className="num">
                  {m.games.toLocaleString(lang)}
                  {m.small && <MuestraChica games={m.games} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
