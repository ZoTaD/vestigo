/**
 * Lo de la grabación en una fila del historial (2026-11-20; APM y clic a Feudal desde el 26/11): apertura, APM y cuándo
 * pasó a Feudal. Se pide recién cuando la fila aparece en pantalla.
 */
import { useEffect, useRef, useState } from "react";
import { useAoe2Copy } from "../../aoe2Copy";
import { useAnalysis } from "./useOpening";

export default function OpeningTag({ match, owner, player }: { match: number; owner: number; player: number }) {
  const t = useAoe2Copy();
  const ref = useRef<HTMLSpanElement>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setVisto(true);
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setVisto(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const r = useAnalysis(match, owner, visto);
  const a = r?.[player];
  const op = a?.opening;
  return (
    <span ref={ref} className="a2-rec">
      <span className={`a2-op${op ? ` is-${op}` : ""}`}>{r === undefined ? t.op.loading : op ? t.op.names[op] : t.op.none}</span>
      {a?.apm != null && <span title={t.match.apmHint}>{a.apm} APM</span>}
      {a?.ages[0] != null && <span>{t.match.ages[0]} {t.match.clock(a.ages[0])}</span>}
    </span>
  );
}
