import { useEffect, useState } from "react";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import type { BandId } from "./deadlockData";
import type { Item } from "./deadlockItemsData";
import { items as itemSlugs } from "./deadlockSlugs";
import { ItemIcon } from "./DeadlockItemTip";

/**
 * Dos vistas de la pestaña Objetos que leen archivos que ya publica el
 * pipeline, cada uno pedido recién al abrir su vista:
 *
 * - **Cambios del parche** (`patch-movers.json`): los objetos que más ganaron
 *   y más perdieron winrate con la última edición, en Fantasma+.
 * - **Temprano o tarde** (`item-timing.<banda>.json`): cada objeto contra los
 *   de su precio comprados en el mismo minuto, resumido en cuatro grupos.
 */

/* ── Cambios del parche ───────────────────────────────────────────────────── */

/** [id, winrate antes, winrate después, partidas antes, partidas después] */
type Mover = [number, number, number, number, number];

interface PatchMoversFile {
  days: number;
  editions: Record<string, { date: string; complete: boolean; items: { up: Mover[]; down: Mover[] } }>;
}

let movers: Promise<PatchMoversFile> | null = null;

function useFile<T>(load: () => Promise<T>, key: string): T | null | undefined {
  const [state, set] = useState<{ key: string; v: T | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    load().then(
      (v) => vivo && set({ key, v }),
      () => vivo && set({ key, v: null })
    );
    return () => {
      vivo = false;
    };
    // `load` cambia con la banda, que ya va en `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.v : undefined;
}

export function ItemsPatchChanges({
  items,
  patchTitle,
  onOpenItem,
}: {
  items: Item[];
  patchTitle: string;
  onOpenItem: (slug: string | undefined) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.itemsPage.patchView;
  const file = useFile(() => (movers ??= import("@deadlock/patch-movers.json").then((m) => m.default as unknown as PatchMoversFile)), "movers");
  if (file === undefined) return <p className="dl-loading-note">{copy.deadlock.itemsPage.loading}</p>;
  const claves = file ? Object.keys(file.editions).sort() : [];
  const ed = file && claves.length > 0 ? file.editions[claves[claves.length - 1]] : null;
  if (!file || !ed || ed.items.up.length + ed.items.down.length === 0) return <p className="detail-note">{c.none}</p>;

  const porId = new Map(items.map((i) => [i.itemId, i]));
  const pct = (x: number) => `${(x * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

  const columna = (dir: "up" | "down") => (
    <section className="box dl-imove" data-dir={dir}>
      <h2 className="box-title">{dir === "up" ? `▲ ${c.up}` : `▼ ${c.down}`}</h2>
      <ol className="dl-imove-list">
        {ed.items[dir].map((m, i) => {
          const it = porId.get(m[0]);
          if (!it) return null;
          const d = (m[2] - m[1]) * 100;
          const slug = itemSlugs.toSlug.get(String(it.itemId));
          return (
            <li key={m[0]} className={i === 0 ? "is-first" : undefined}>
              <button type="button" className="dl-imove-row" onClick={() => slug && onOpenItem(slug)}>
                <span className="dl-imove-rank">{i + 1}</span>
                <ItemIcon itemId={it.itemId} img={it.img} size={i === 0 ? 56 : 40} focusable={false} />
                <span className="dl-imove-name">{it.name}</span>
                <span className="dl-imove-wr">
                  {pct(m[1])} → {pct(m[2])}
                  <small>{c.games(m[4].toLocaleString(locale))}</small>
                </span>
                <b className="dl-imove-delta">
                  {d > 0 ? "+" : "−"}
                  {Math.abs(d).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
                  <small> {c.pts}</small>
                </b>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );

  return (
    <div className="dl-imoves">
      <p className="detail-note dl-items-shopnote">
        {c.lead(patchTitle, file.days)} {!ed.complete && c.open(file.days)}
      </p>
      <div className="dl-imoves-grid">
        {columna("up")}
        {columna("down")}
      </div>
    </div>
  );
}

/* ── Temprano o tarde ─────────────────────────────────────────────────────── */

type Slot = [n: number, wr: number, delta: number] | null;

interface ItemTimingFile {
  edges: number[];
  items: Record<string, Slot[]>;
}

const TIMING: Record<BandId, () => Promise<{ default: unknown }>> = {
  "phantom-above": () => import("@deadlock/item-timing.phantom-above.json"),
  "archon-oracle": () => import("@deadlock/item-timing.archon-oracle.json"),
  "ritualist-emissary": () => import("@deadlock/item-timing.ritualist-emissary.json"),
  "arcanist-below": () => import("@deadlock/item-timing.arcanist-below.json"),
};

/** Antes de este minuto es "temprano"; desde `LATE`, "tarde". */
const EARLY = 20;
const LATE = 25;
/** Compras mínimas en cada lado para ubicar un objeto. */
const MIN_N = 400;
/**
 * Por debajo de un punto contra su precio no se lo llama ni bueno ni malo: un
 * objeto entra a un grupo sólo si los dos lados pasan ese umbral. Con medio
 * punto, dos de cada tres objetos caían en "fuerte temprano" por centésimas.
 */
const DEAD = 10;
/** Cuántos por grupo: los más marcados. */
const TOP = 10;

type Group = "early" | "late" | "always" | "never";

/** El promedio ponderado de la diferencia (en milésimas) de los tramos de un lado. */
function side(slots: Slot[], edges: number[], pick: (start: number) => boolean): { n: number; d: number } {
  let n = 0;
  let sum = 0;
  slots.forEach((s, i) => {
    if (!s || !pick(edges[i])) return;
    n += s[0];
    sum += s[0] * s[2];
  });
  return { n, d: n > 0 ? sum / n : 0 };
}

export function classify(file: ItemTimingFile): Map<number, { group: Group; early: number; late: number }> {
  const out = new Map<number, { group: Group; early: number; late: number }>();
  for (const [id, slots] of Object.entries(file.items)) {
    const e = side(slots, file.edges, (start) => start < EARLY);
    const l = side(slots, file.edges, (start) => start >= LATE);
    if (e.n < MIN_N || l.n < MIN_N) continue;
    if (Math.abs(e.d) < DEAD || Math.abs(l.d) < DEAD) continue;
    const group: Group =
      e.d > 0 && l.d > 0 ? "always" : e.d < 0 && l.d < 0 ? "never" : e.d > l.d ? "early" : "late";
    out.set(Number(id), { group, early: e.d, late: l.d });
  }
  return out;
}

export function ItemsEarlyLate({
  items,
  band,
  onOpenItem,
}: {
  items: Item[];
  band: BandId;
  onOpenItem: (slug: string | undefined) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.itemsPage.timingView;
  const file = useFile(() => TIMING[band]().then((m) => m.default as ItemTimingFile), band);
  if (file === undefined) return <p className="dl-loading-note">{copy.deadlock.itemsPage.loading}</p>;
  if (!file) return <p className="detail-note">{c.none}</p>;

  const grupos = classify(file);
  const porId = new Map(items.map((i) => [i.itemId, i]));
  const pts = (d: number) =>
    `${d >= 0 ? "+" : "−"}${(Math.abs(d) / 10).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
  /** Lo que separa a un objeto de su grupo: la distancia entre temprano y tarde, o lo lejos del cero. */
  const fuerza = (g: Group, e: number, l: number) =>
    g === "early" ? e - l : g === "late" ? l - e : g === "always" ? e + l : -(e + l);

  const orden: Group[] = ["early", "late", "always", "never"];
  return (
    <div className="dl-itiming">
      <p className="detail-note dl-items-shopnote">{c.lead}</p>
      <div className="dl-itiming-grid">
        {orden.map((g) => {
          const lista = [...grupos.entries()]
            .filter(([id, v]) => v.group === g && porId.has(id))
            .sort((a, b) => fuerza(g, b[1].early, b[1].late) - fuerza(g, a[1].early, a[1].late))
            .slice(0, TOP);
          if (lista.length === 0) return null;
          return (
            <section className="box dl-itiming-box" key={g} data-group={g}>
              <h2 className="box-title">{c.groups[g].title}</h2>
              <p className="detail-note">{c.groups[g].lead}</p>
              <ul className="dl-itiming-list">
                {lista.map(([id, v]) => {
                  const it = porId.get(id)!;
                  const slug = itemSlugs.toSlug.get(String(id));
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="dl-itiming-item"
                        onClick={() => slug && onOpenItem(slug)}
                        aria-label={c.tip(it.name, pts(v.early), pts(v.late))}
                      >
                        <ItemIcon itemId={id} img={it.img} size={40} focusable={false} />
                        <span className="dl-itiming-name">{it.name}</span>
                        <span className="dl-itiming-nums">
                          <span data-dir={v.early >= 0 ? "up" : "down"}>{pts(v.early)}</span>
                          <span aria-hidden="true">→</span>
                          <span data-dir={v.late >= 0 ? "up" : "down"}>{pts(v.late)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
