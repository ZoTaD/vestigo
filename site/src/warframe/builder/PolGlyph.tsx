/**
 * El glifo de una polaridad (2026-10-27): un trazo propio y simple, no el arte del juego. Va en el color del texto; en
 * un casillero, celeste si la polaridad coincide con la del mod y rojizo si no.
 */
import { useWfCopy } from "../../warframeCopy";
import type { Pol } from "../data";

const TRAZO: Record<Pol | "none", string> = {
  madurai: "M5 19 L12 5 L19 19 M9 14 h6",
  vazarin: "M5 6 h14 L12 20 Z M12 6 v8",
  naramon: "M4 12 h16 M8 8 l-4 4 4 4 M16 8 l4 4 -4 4",
  zenurik: "M6 5 h12 L6 19 h12",
  unairu: "M12 4 a8 8 0 1 0 0.01 0 M12 9 v6",
  penjaga: "M4 16 C8 4 16 4 20 16 M8 16 C10 10 14 10 16 16",
  umbra: "M12 4 v16 M5 8 l7 4 7 -4 M5 16 l7 -4 7 4",
  none: "M7 12 h10",
};

export function PolGlyph({ pol, state }: { pol: Pol | null; state?: "match" | "miss" | null }) {
  const t = useWfCopy();
  const label = pol ? t.polarity[pol] : t.builder.noPol;
  return (
    <svg className={`wf-pol${state ? ` is-${state}` : ""}`} viewBox="0 0 24 24" role="img" aria-label={label}>
      <title>{label}</title>
      <path d={TRAZO[pol ?? "none"]} />
    </svg>
  );
}
