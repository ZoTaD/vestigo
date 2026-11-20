/**
 * Aperturas en Civilizaciones de AoE2 (2026-11-20, pedido de ZoTaD): la mejor civ para cada apertura y, eligiendo una
 * apertura, todas las civs que la juegan con su % de victorias ("los francos, los mejores con scouts"). Sale de las
 * grabaciones de RM 1v1 que lee el colector diario.
 */
import { useState } from "react";
import { useLang } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { MuestraChica, Panel } from "../ui";
import { OPENINGS } from "../api/openings";
import { bestPerOpening, civOpenings, openingTable, type Summary } from "./data";
import { Civ, WrBar, pct, type Filters } from "./parts";

export function OpeningsView({ s, f }: { s: Summary; f: Filters }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const mejores = bestPerOpening(s, f.window, f.band);
  const [op, setOp] = useState("scouts");
  const filas = openingTable(s, f.window, f.band, op);
  if (!Object.keys(s.windows[f.window]?.open ?? {}).length) return null;
  return (
    <>
      {mejores.length > 0 && (
      <Panel h={t.op.bestFor} sub={t.op.sub}>
        <ul className="a2-cards">
          {mejores.map((m) => (
            <li key={m.opening}>
              <small>{t.op.names[m.opening]}</small>
              <Civ slug={m.civ} size={28} />
              <span className={m.wr >= 0.5 ? "a2-up" : "a2-down"}>
                {pct(m.wr)} · {t.op.games(m.games)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      )}
      <Panel h={`${t.op.h} · ${t.op.names[op]}`} sub={mejores.length ? undefined : t.op.sub}>
        <div className="a2-chips" role="radiogroup" aria-label={t.op.pick}>
          {OPENINGS.filter((o) => o !== "other").map((o) => (
            <button key={o} type="button" role="radio" aria-checked={o === op} className={o === op ? "is-on" : undefined} onClick={() => setOp(o)}>
              {t.op.names[o]}
            </button>
          ))}
        </div>
        <table className="a2-table">
          <tbody>
            {filas.map((r) => (
              <tr key={r.civ}>
                <td>
                  <Civ slug={r.civ} size={26} />
                </td>
                <td className={`num ${r.wr >= 0.5 ? "a2-up" : "a2-down"}`}>
                  <b>{pct(r.wr)}</b>
                </td>
                <td className="a2-hide-s a2-barcell">
                  <WrBar wr={r.wr} />
                </td>
                <td className="num">
                  {r.games.toLocaleString(lang)}
                  {r.small && <MuestraChica games={r.games} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

/** "Cómo abre" en la ficha de una civ. */
export function CivOpenings({ s, f, civ }: { s: Summary; f: Filters; civ: string }) {
  const t = useAoe2Copy();
  const ops = civOpenings(s, f.window, f.band, civ);
  if (!ops.length) return null;
  const total = ops.reduce((a, o) => a + o.games, 0);
  return (
    <Panel h={t.op.civH} sub={t.op.civSub}>
      <ul className="a2-vs">
        {ops.map((o) => (
          <li key={o.opening}>
            <span>
              <span className={`a2-op is-${o.opening}`}>{t.op.names[o.opening]}</span> {pct(o.games / total, 0)}
            </span>
            <span className={o.wr >= 0.5 ? "a2-up" : "a2-down"}>
              {t.st.vsLine(pct(o.wr), o.games)}
              {o.small && <MuestraChica games={o.games} />}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
