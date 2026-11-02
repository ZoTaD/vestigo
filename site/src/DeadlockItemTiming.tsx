import { useEffect, useState } from "react";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { deltaColor } from "./DeadlockItemCharts";
import type { BandId } from "./deadlockData";

/**
 * "Win rate by buy time": el winrate de un objeto según el minuto de compra.
 *
 * Una barra por tramo con el winrate crudo, **pintada por la diferencia contra
 * los objetos del mismo precio comprados en ese mismo tramo** (ver
 * `itemTiming.ts` en el pipeline). Sin esa base, todas las curvas bajan igual —
 * comprar temprano es ir adelante— y el gráfico diría lo mismo de todos los
 * objetos. Los tramos con pocas compras no llegan del pipeline y no se dibujan.
 *
 * El archivo de la banda (~15 KB) se pide al abrir la primera ficha, no con la
 * página.
 */

type Slot = [n: number, wr: number, delta: number] | null;

interface ItemTimingFile {
  edges: number[];
  items: Record<string, Slot[]>;
}

const FILES: Record<BandId, () => Promise<{ default: unknown }>> = {
  "phantom-above": () => import("@deadlock/item-timing.phantom-above.json"),
  "archon-oracle": () => import("@deadlock/item-timing.archon-oracle.json"),
  "ritualist-emissary": () => import("@deadlock/item-timing.ritualist-emissary.json"),
  "arcanist-below": () => import("@deadlock/item-timing.arcanist-below.json"),
};

const memo = new Map<BandId, Promise<ItemTimingFile>>();

function load(band: BandId): Promise<ItemTimingFile> {
  let p = memo.get(band);
  if (!p) {
    p = FILES[band]().then((m) => m.default as ItemTimingFile);
    p.catch(() => memo.delete(band));
    memo.set(band, p);
  }
  return p;
}

export default function DeadlockItemTiming({ itemId, band }: { itemId: number; band: BandId }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.itemsPage.timing;
  const [file, setFile] = useState<ItemTimingFile | null>(null);

  useEffect(() => {
    let vivo = true;
    load(band).then(
      (f) => vivo && setFile(f),
      () => undefined
    );
    return () => {
      vivo = false;
    };
  }, [band]);

  const slots = file?.items[String(itemId)];
  if (!file || !slots) return null;

  const filas = slots
    .map((s, i) => ({ s, from: file.edges[i], to: file.edges[i + 1] as number | undefined }))
    .filter((x): x is { s: NonNullable<Slot>; from: number; to: number | undefined } => x.s !== null);
  if (filas.length === 0) return null;

  // La escala de las barras arranca en 40 %: con un eje desde cero, 48 % y 56 %
  // serían dos barras casi iguales.
  const MIN = 400;
  const MAX = Math.max(600, ...filas.map((f) => f.s[1]));
  const pct = (v: number) => `${(v / 10).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const pp = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±") + (Math.abs(v) / 10).toLocaleString(locale, { maximumFractionDigits: 1 });

  return (
    <section className="dl-timing" aria-labelledby={`dl-timing-${itemId}`}>
      <h3 className="dl-timing-title" id={`dl-timing-${itemId}`}>
        {c.title}
      </h3>
      <p className="dl-timing-lead">{c.lead}</p>
      <ol className="dl-timing-rows">
        {filas.map(({ s: [n, wr, d], from, to }) => (
          <li key={from} title={c.buys(n.toLocaleString(locale))}>
            <span className="dl-timing-when">{to == null ? c.after(from) : c.range(from, to)}</span>
            <span className="dl-timing-track">
              <span
                className="dl-timing-bar"
                style={{
                  width: `${Math.max(4, ((Math.min(wr, MAX) - MIN) / (MAX - MIN)) * 100)}%`,
                  background: deltaColor(d / 10),
                }}
              />
            </span>
            <span className="dl-timing-wr">{pct(wr)}</span>
            <span className="dl-timing-delta" data-sign={d > 0 ? "up" : d < 0 ? "down" : "flat"}>
              {pp(d)}
            </span>
          </li>
        ))}
      </ol>
      <p className="dl-timing-note">{c.note}</p>
    </section>
  );
}
