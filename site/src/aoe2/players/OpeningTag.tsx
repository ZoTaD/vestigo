/**
 * La etiqueta de apertura de un jugador en una fila (2026-11-20): se pide recién cuando la fila aparece en pantalla.
 */
import { useEffect, useRef, useState } from "react";
import { useAoe2Copy } from "../../aoe2Copy";
import { useOpening } from "./useOpening";

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
  const r = useOpening(match, owner, visto);
  const op = r?.[player];
  return (
    <span ref={ref} className={`a2-op${op ? ` is-${op}` : ""}`}>
      {r === undefined ? t.op.loading : op ? t.op.names[op] : t.op.none}
    </span>
  );
}
