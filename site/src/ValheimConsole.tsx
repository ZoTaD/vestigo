/**
 * El nombre interno de una ficha y su comando de consola, listo para copiar (2026-10-30). Objetos: `spawn Id 1`;
 * criaturas: `spawn Id 1 1` (el último número es el nivel: 1 sin estrellas, 3 con dos). Las piezas no se invocan.
 */
import { useState } from "react";
import { useCalcCopy } from "./valheimCalc/copy";

export default function ValheimConsole({ id, kind }: { id: string; kind: "item" | "creature" | "piece" }) {
  const t = useCalcCopy();
  const cmd = kind === "piece" ? null : kind === "creature" ? `spawn ${id} 1 1` : `spawn ${id} 1`;
  return (
    <section className="vh-box vh-console">
      <h3>{t.spawn.title}</h3>
      <div className="vh-cmd"><small>{t.spawn.id}</small><code>{id}</code><Copy text={id} /></div>
      {cmd ? <div className="vh-cmd"><code>{cmd}</code><Copy text={cmd} /></div> : <p className="vh-cmd"><small>{t.spawn.noSpawn}</small></p>}
      {cmd && <p className="vh-cmd"><small>{t.spawn.how}</small></p>}
    </section>
  );
}

function Copy({ text }: { text: string }) {
  const t = useCalcCopy();
  const [done, setDone] = useState(false);
  const copy = () => {
    const ok = () => { setDone(true); setTimeout(() => setDone(false), 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, () => undefined);
    else {
      // Sin la API del portapapeles (http, navegadores viejos): el truco del textarea.
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch { /* nada */ }
      ta.remove();
    }
  };
  return <button type="button" className="vh-chip" onClick={copy}>{done ? t.spawn.copied : t.spawn.copy}</button>;
}
