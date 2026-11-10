import { useEffect, useMemo, useState } from "react";
import GameImg from "./GameImg";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { useHeroes, type BandId } from "./deadlockData";
import type { Item } from "./deadlockItemsData";
import { items as itemSlugs } from "./deadlockSlugs";
import { ItemIcon } from "./DeadlockItemTip";
import "./styles/deadlock-pros.css";

/**
 * "Infravalorados y sobrevalorados" (2026-11-10), vista de Objetos: con un
 * héroe elegido, lo que casi nadie le compra y gana mucho, y lo que todos le
 * compran y gana menos que lo que rinde su precio.
 *
 * Los números salen de `games/deadlock/pipeline/src/itemValue.ts` (ahí está
 * por qué la vara es el precio y no el winrate del héroe): un archivo por banda
 * (~40 KB) que baja al abrir la vista.
 */

/** Los mismos cortes del pipeline, para decirlos en pantalla. */
const LOW_BUY = 0.15;
const HIGH_BUY = 0.35;

/** `[item_id, compras, % de partidas ×1000, puntos ×1000]`. */
type ValueRow = [number, number, number, number];
interface ItemValueFile {
  from: string;
  to: string;
  heroes: Record<string, { n: number; under: ValueRow[]; over: ValueRow[] }>;
}

const FILES: Record<BandId, () => Promise<{ default: unknown }>> = {
  "phantom-above": () => import("@deadlock/item-value.phantom-above.json"),
  "archon-oracle": () => import("@deadlock/item-value.archon-oracle.json"),
  "ritualist-emissary": () => import("@deadlock/item-value.ritualist-emissary.json"),
  "arcanist-below": () => import("@deadlock/item-value.arcanist-below.json"),
};

const memo = new Map<BandId, Promise<ItemValueFile>>();
function load(band: BandId): Promise<ItemValueFile> {
  let p = memo.get(band);
  if (!p) {
    p = FILES[band]().then((m) => m.default as ItemValueFile);
    p.catch(() => memo.delete(band));
    memo.set(band, p);
  }
  return p;
}

interface Row {
  itemId: number;
  buy: number;
  delta: number;
}
interface Result {
  heroMatches: number;
  days: number;
  under: Row[];
  over: Row[];
}

const aFila = (r: ValueRow): Row => ({ itemId: r[0], buy: r[2] / 1000, delta: r[3] / 1000 });

export function ItemsValue({ items, band, onOpenItem }: { items: Item[]; band: BandId; onOpenItem: (slug: string | undefined) => void }) {
  const copy = useCopy();
  const c = copy.deadlock.itemsPage.value;
  const locale = useLocale();
  const meta = useHeroes(band);
  const heroes = useMemo(() => [...(meta?.heroes ?? [])].sort((a, b) => a.name.localeCompare(b.name, locale)), [meta, locale]);
  const [heroId, setHeroId] = useState<number | null>(null);
  const [res, setRes] = useState<Result | null | undefined>(undefined);
  const porId = useMemo(() => new Map(items.map((i) => [i.itemId, i])), [items]);

  // De entrada, el héroe más jugado de la banda.
  const elegido = heroId ?? [...(meta?.heroes ?? [])].sort((a, b) => b.matches - a.matches)[0]?.heroId ?? null;

  useEffect(() => {
    if (elegido === null) return;
    let vivo = true;
    setRes(undefined);
    load(band).then(
      (f) => {
        if (!vivo) return;
        const h = f.heroes[String(elegido)];
        const dias = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86_400_000) + 1;
        setRes(h ? { heroMatches: h.n, days: dias, under: h.under.map(aFila), over: h.over.map(aFila) } : { heroMatches: 0, days: dias, under: [], over: [] });
      },
      () => vivo && setRes(null)
    );
    return () => {
      vivo = false;
    };
  }, [elegido, band]);

  const pts = (d: number) => `${d >= 0 ? "+" : "−"}${(Math.abs(d) * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const hero = heroes.find((h) => h.heroId === elegido);

  const lista = (rows: Row[], kind: "under" | "over") => (
    <ol className="dl-iv-list">
      {rows.map((r, i) => {
        const it = porId.get(r.itemId);
        if (!it) return null;
        const slug = itemSlugs.toSlug.get(String(r.itemId));
        return (
          <li key={r.itemId} data-first={i === 0 || undefined}>
            <button type="button" className="dl-iv-item" onClick={() => slug && onOpenItem(slug)}>
              <span className="dl-iv-rank">{i + 1}</span>
              <ItemIcon itemId={r.itemId} img={it.img} size={i === 0 ? 52 : 40} focusable={false} />
              <span className="dl-iv-name">{it.name}</span>
              <span className="dl-iv-delta" data-dir={kind === "under" ? "up" : "down"}>
                {pts(r.delta)}
              </span>
              <span className="dl-iv-buy">{c.buyRate(pct(r.buy))}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="dl-iv">
      <p className="detail-note dl-items-shopnote">{c.lead}</p>
      <div className="dl-iv-heroes" role="radiogroup" aria-label={c.pickHero}>
        {heroes.map((h) => (
          <button
            key={h.heroId}
            type="button"
            role="radio"
            aria-checked={h.heroId === elegido}
            title={h.name}
            onClick={() => setHeroId(h.heroId)}
          >
            <GameImg src={h.img} alt={h.name} width={40} height={40} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>

      {res === undefined ? (
        <p className="dl-loading-note">{copy.deadlock.itemsPage.loading}</p>
      ) : res === null ? (
        <p className="detail-note">{c.error}</p>
      ) : (
        <>
          <p className="dl-iv-sample">{c.sample(hero?.name ?? "", res.heroMatches.toLocaleString(locale), res.days)}</p>
          <div className="dl-iv-grid">
            <section className="box dl-iv-box" data-kind="under">
              <h2 className="box-title">{c.under}</h2>
              <p className="detail-note">{c.underLead(pct(LOW_BUY))}</p>
              {res.under.length ? lista(res.under, "under") : <p className="detail-note">{c.none}</p>}
            </section>
            <section className="box dl-iv-box" data-kind="over">
              <h2 className="box-title">{c.over}</h2>
              <p className="detail-note">{c.overLead(pct(HIGH_BUY))}</p>
              {res.over.length ? lista(res.over, "over") : <p className="detail-note">{c.none}</p>}
            </section>
          </div>
          <p className="dl-hp-note">{c.method}</p>
        </>
      )}
    </div>
  );
}
