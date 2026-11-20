/**
 * "Sus aperturas" en el perfil de AoE2 (2026-11-20): al apretar el botón, se piden las aperturas de sus últimas 20
 * partidas 1v1 de ranking (de a dos, cada grabación ~1 MB) y se cuentan con su % de victorias.
 */
import { useState } from "react";
import { useAoe2Copy } from "../../aoe2Copy";
import { Panel } from "../ui";
import type { Aoe2Match } from "../api/wel";
import type { Opening } from "../api/openings";
import { fetchOpening } from "./useOpening";

const N = 20;

export default function TheirOpenings({ matches, id }: { matches: Aoe2Match[]; id: number }) {
  const t = useAoe2Copy();
  const candidatas = matches.filter((m) => (m.mode === "rm1v1" || m.mode === "ew1v1") && m.end - m.start > 300).slice(0, N);
  const [res, setRes] = useState<{ op: Opening; win: boolean }[] | null>(null);
  const [hechas, setHechas] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  if (!candidatas.length) return null;
  const analizar = async () => {
    setCorriendo(true);
    const out: { op: Opening; win: boolean }[] = [];
    await Promise.all(
      candidatas.map(async (m) => {
        const r = await fetchOpening(m.id, id);
        setHechas((n) => n + 1);
        const op = r?.[id];
        const yo = m.players.find((p) => p.profileId === id);
        if (op && yo && yo.result !== "other") out.push({ op, win: yo.result === "win" });
      }),
    );
    setRes(out);
    setCorriendo(false);
  };
  const cuenta = new Map<Opening, { g: number; w: number }>();
  for (const r of res ?? []) {
    const c = cuenta.get(r.op) ?? { g: 0, w: 0 };
    c.g++;
    if (r.win) c.w++;
    cuenta.set(r.op, c);
  }
  return (
    <Panel h={t.op.theirsH} sub={res ? t.op.theirsSub(res.length) : undefined}>
      {!res ? (
        <button type="button" className="a2-btn" onClick={() => void analizar()} disabled={corriendo}>
          {corriendo ? `${t.op.analyze} · ${hechas}/${candidatas.length}` : t.op.analyze}
        </button>
      ) : (
        <ul className="a2-vs">
          {[...cuenta.entries()].sort((a, b) => b[1].g - a[1].g).map(([op, c]) => (
            <li key={op}>
              <span className={`a2-op is-${op}`}>{t.op.names[op]}</span>
              <span className={c.w / c.g >= 0.5 ? "a2-up" : "a2-down"}>{t.st.vsLine(`${Math.round((c.w / c.g) * 100)}%`, c.g)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
