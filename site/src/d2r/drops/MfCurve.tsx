/**
 * La curva del hallazgo mágico (2026-09-29): la chance del ítem en el mejor
 * lugar para MF de 0 a 1.000, con una frase que dice cuánto rinde cada tramo.
 * Rinde cada vez menos (el juego lo achica pasado el 10%), y es lo que más se
 * pregunta.
 */
import { useMemo } from "react";
import { useLocale } from "../../i18n";
import { useD2rCopy } from "../../d2rCopy";
import { dropData } from "./data";
import { chancePerKill } from "./engine";
import { odds } from "./format";
import { toSettings, type DropsState } from "./state";
import type { KillCtx, Target } from "./types";

const STEPS = Array.from({ length: 21 }, (_, i) => i * 50);
const W = 320;
const H = 120;
const PAD = 10;

export default function MfCurve({ target, kill, st }: { target: Target; kill: KillCtx; st: DropsState }) {
  const td = useD2rCopy().drops;
  const locale = useLocale();
  const pts = useMemo(() => {
    const s = toSettings(st);
    return STEPS.map((mf) => chancePerKill(dropData(), target, kill, { ...s, mf }));
    // El MF de la curva es el eje: no depende del que eligió el jugador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, kill, st.players, st.party, st.ladder]);
  const [p0, p300, p600] = [pts[0], pts[6], pts[12]];
  if (!(p0 > 0)) return null;
  if (Math.abs(p600 - p0) / p0 < 0.001) return <p className="d2-dr-note">{td.mfNoEffect}</p>;
  const max = Math.max(...pts);
  const x = (mf: number) => PAD + (mf / 1000) * (W - 2 * PAD);
  const y = (p: number) => H - PAD - (p / max) * (H - 2 * PAD);
  const cur = Math.min(1000, st.mf);
  // El punto va a la chance con el MF exacto y no a la muestra más cercana: fuera de un múltiplo de 50 flotaba a un costado de la curva.
  const here = chancePerKill(dropData(), target, kill, { ...toSettings(st), mf: cur });
  const fmt = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 2 });
  return (
    <section className="d2-dr-mf">
      <h2 className="d2-h3">{td.mfTitle}</h2>
      <svg className="d2-dr-mf-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={td.mfChart(odds(p0, locale, td), odds(pts[STEPS.length - 1], locale, td))}>
        <line className="d2-dr-mf-axis" x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} />
        <polyline points={pts.map((p, i) => `${x(STEPS[i])},${y(p)}`).join(" ")} />
        <circle cx={x(cur)} cy={y(here)} r="4" />
      </svg>
      <p>{td.mfSentence(fmt(p300 / p0), fmt(p600 / p300))}</p>
    </section>
  );
}
