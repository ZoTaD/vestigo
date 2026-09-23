import { useRef, useState } from "react";
import { useCopy, useLocale } from "./i18n";
import type { Item } from "./deadlockItemsData";
import type { AbilityView } from "./deadlockBuildsData";
import { upgradePriority } from "./deadlockBuildsData";
import ShopCard from "./DeadlockShopCard";
import type { StatGroup, StatRow } from "./deadlockBuildStats";
import {
  moveCategory,
  moveItem,
  removeCategory,
  removeFromCategory,
  updateCategory,
  stepLabels,
  ABILITY_PATH_MAX,
  type GuideCategory,
} from "./deadlockBuildGuide";

/**
 * Las tres piezas del armador que no son la tienda: el editor de la guía (el
 * editor de builds del juego), la grilla del orden de habilidades y las stats
 * del héroe. La lógica vive en `deadlockBuildGuide.ts` y `deadlockBuildStats.ts`;
 * acá sólo se dibuja y se traducen los gestos a esas funciones.
 */

/* ── El editor de la guía ──────────────────────────────────────────── */

/** Lo que viaja en un arrastre: de qué categoría sale (o de la tienda) y qué objeto. */
interface Arrastre {
  from: string | "shop";
  itemId: number;
}

const TIPO_DND = "application/x-vestigo-item";

export function leerArrastre(e: React.DragEvent): Arrastre | null {
  try {
    const raw = e.dataTransfer.getData(TIPO_DND);
    return raw ? (JSON.parse(raw) as Arrastre) : null;
  } catch {
    return null;
  }
}

export function empezarArrastre(e: React.DragEvent, a: Arrastre) {
  e.dataTransfer.setData(TIPO_DND, JSON.stringify(a));
  e.dataTransfer.effectAllowed = "move";
}

export function GuideEditor({
  guide,
  active,
  porId,
  onChange,
  onSelect,
  onAddCategory,
  onSeed,
  onDropFromShop,
}: {
  guide: GuideCategory[];
  active: string | null;
  porId: Map<number, Item>;
  onChange: (g: GuideCategory[]) => void;
  onSelect: (id: string) => void;
  onAddCategory: () => void;
  /** Ausente cuando el héroe no tiene build medida. */
  onSeed?: () => void;
  /** Un objeto arrastrado desde la tienda a una posición de una categoría. */
  onDropFromShop: (catId: string, itemId: number, index: number) => void;
}) {
  const copy = useCopy();
  const c = copy.deadlock.builder.editor;

  const soltar = (e: React.DragEvent, catId: string, index: number) => {
    const a = leerArrastre(e);
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    if (a.from === "shop") onDropFromShop(catId, a.itemId, index);
    else onChange(moveItem(guide, a.from, a.itemId, catId, index));
  };

  return (
    <section className="dl-bd-editor" aria-labelledby="dl-bd-editor-title">
      <div className="dl-bd-editor-head">
        <div>
          <h2 className="dl-bd-editor-title" id="dl-bd-editor-title">{c.title}</h2>
          <p className="dl-bd-editor-lead">{c.lead}</p>
        </div>
        <div className="dl-bd-editor-actions">
          {onSeed && (
            <button type="button" className="dl-bd-pill" onClick={onSeed}>
              {c.seed}
            </button>
          )}
          <button type="button" className="dl-bd-pill is-strong" onClick={onAddCategory}>
            {c.addCategory}
          </button>
        </div>
      </div>

      {guide.length === 0 ? (
        <p className="dl-bd-editor-empty">{c.empty}</p>
      ) : (
        <div className="dl-bd-cats">
          {guide.map((cat, n) => (
            <Categoria
              key={cat.id}
              cat={cat}
              activa={cat.id === active}
              primera={n === 0}
              ultima={n === guide.length - 1}
              porId={porId}
              onSelect={() => onSelect(cat.id)}
              onRename={(name) => onChange(updateCategory(guide, cat.id, { name }))}
              onDesc={(desc) => onChange(updateCategory(guide, cat.id, { desc }))}
              onResize={(width) => onChange(updateCategory(guide, cat.id, { width }))}
              onMove={(dir) => onChange(moveCategory(guide, cat.id, dir))}
              onRemove={() => onChange(removeCategory(guide, cat.id))}
              onRemoveItem={(itemId) => onChange(removeFromCategory(guide, cat.id, itemId))}
              onDrop={(e, index) => soltar(e, cat.id, index)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Categoria({
  cat,
  activa,
  primera,
  ultima,
  porId,
  onSelect,
  onRename,
  onDesc,
  onResize,
  onMove,
  onRemove,
  onRemoveItem,
  onDrop,
}: {
  cat: GuideCategory;
  activa: boolean;
  primera: boolean;
  ultima: boolean;
  porId: Map<number, Item>;
  onSelect: () => void;
  onRename: (s: string) => void;
  onDesc: (s: string) => void;
  onResize: (w: number) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onRemoveItem: (itemId: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}) {
  const copy = useCopy();
  const c = copy.deadlock.builder.editor;
  const caja = useRef<HTMLDivElement>(null);
  const [sobre, setSobre] = useState(false);
  const nombre = cat.name || c.newCategory;

  /**
   * El tamaño se cambia arrastrando la esquina, como en el juego, y **salta de
   * a una columna de tarjeta**: un recuadro que corta una tarjeta al medio no
   * existe en el juego.
   */
  const redimensionar = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = caja.current;
    if (!el) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = cat.width;
    const columna = el.getBoundingClientRect().width / Math.max(1, w0);
    const mover = (ev: PointerEvent) => onResize(w0 + Math.round((ev.clientX - x0) / columna));
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  return (
    <div
      ref={caja}
      className="dl-bd-cat"
      data-active={activa || undefined}
      data-over={sobre || undefined}
      style={{ "--cols": cat.width } as React.CSSProperties}
      onClick={onSelect}
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        setSobre(false);
        onDrop(e, cat.items.length);
      }}
    >
      <div className="dl-bd-cat-head">
        <input
          className="dl-bd-cat-name"
          value={cat.name}
          placeholder={c.namePlaceholder}
          aria-label={c.namePlaceholder}
          onChange={(e) => onRename(e.target.value)}
        />
        <input
          className="dl-bd-cat-desc"
          value={cat.desc}
          placeholder={c.descPlaceholder}
          aria-label={c.descPlaceholder}
          onChange={(e) => onDesc(e.target.value)}
        />
        <span className="dl-bd-cat-tools">
          <button type="button" aria-label={c.moveUp} title={c.moveUp} disabled={primera} onClick={() => onMove(-1)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3l5 6H3z" fill="currentColor" /></svg>
          </button>
          <button type="button" aria-label={c.moveDown} title={c.moveDown} disabled={ultima} onClick={() => onMove(1)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 13L3 7h10z" fill="currentColor" /></svg>
          </button>
          <button type="button" aria-label={c.remove} title={c.remove} onClick={onRemove}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6L11.5 4M7 6.5v5M9 6.5v5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </span>
      </div>

      {cat.items.length === 0 ? (
        <p className="dl-bd-cat-empty">{c.emptyCategory}</p>
      ) : (
        <ul className="dl-bd-cat-items">
          {cat.items.map((id, i) => {
            const it = porId.get(id);
            if (!it) return null;
            return (
              <ShopCard
                key={id}
                item={it}
                label={c.removeFrom(it.name, nombre)}
                onPick={() => onRemoveItem(id)}
                liProps={{
                  draggable: true,
                  onDragStart: (e) => empezarArrastre(e, { from: cat.id, itemId: id }),
                  onDragOver: (e) => e.preventDefault(),
                  onDrop: (e) => onDrop(e, i),
                }}
              />
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="dl-bd-cat-resize"
        aria-label={c.resize}
        title={c.resize}
        onPointerDown={redimensionar}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onResize(cat.width + 1);
          if (e.key === "ArrowLeft") onResize(cat.width - 1);
        }}
      />
    </div>
  );
}

/* ── El orden de habilidades ───────────────────────────────────────── */

export function AbilityOrderEditor({
  abilities,
  path,
  onChange,
  onAdd,
  measured,
}: {
  /** En el orden de las casillas del juego. */
  abilities: AbilityView[];
  path: number[];
  onChange: (p: number[]) => void;
  onAdd: (abilityId: number) => void;
  /** La senda medida de la build más jugada, si la hay. */
  measured?: number[];
}) {
  const copy = useCopy();
  const c = copy.deadlock.builder.abilities;
  const bc = copy.deadlock.buildCard;
  const rotulos = stepLabels(path);
  const prioridad = upgradePriority(abilities, path);

  return (
    <section className="dl-bd-abil" aria-labelledby="dl-bd-abil-title">
      <div className="dl-bd-abil-head">
        <h2 className="dl-bd-editor-title" id="dl-bd-abil-title">{c.title}</h2>
        <div className="dl-bd-editor-actions">
          {measured && measured.length > 0 && (
            <button type="button" className="dl-bd-pill" onClick={() => onChange(measured.slice(0, ABILITY_PATH_MAX))}>
              {c.loadMeasured}
            </button>
          )}
          <button type="button" className="dl-bd-pill" disabled={path.length === 0} onClick={() => onChange(path.slice(0, -1))}>
            {c.undo}
          </button>
          <button type="button" className="dl-bd-pill" disabled={path.length === 0} onClick={() => onChange([])}>
            {c.clear}
          </button>
        </div>
      </div>
      <p className="dl-bd-editor-lead">{c.hint}</p>

      <div className="dl-bd-abil-grid" role="table">
        {abilities.map((a) => (
          <div className="dl-bd-abil-row" role="row" key={a.id}>
            <button
              type="button"
              className="dl-bd-abil-btn"
              aria-label={c.add(a.name)}
              title={c.add(a.name)}
              onClick={() => onAdd(a.id)}
            >
              <img src={a.img} alt="" width={30} height={30} />
            </button>
            <div className="dl-bd-abil-steps" role="cell">
              {Array.from({ length: ABILITY_PATH_MAX }, (_, n) => {
                const suya = path[n] === a.id;
                const r = rotulos[n];
                return (
                  <span key={n} className="dl-bd-abil-step" data-on={suya || undefined}>
                    {suya &&
                      (r === null ? (
                        <span className="dl-bd-abil-unlock" title={c.unlock} aria-label={c.unlock} />
                      ) : (
                        <span className="dl-bd-abil-up" title={c.upgrade(r)} aria-label={c.upgrade(r)}>
                          <span aria-hidden="true">◆</span>
                          {r}
                        </span>
                      ))}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {prioridad.length > 1 && (
        <div className="dl-prio">
          <span className="dl-prio-label">{bc.priority}</span>
          <ol className="dl-prio-list" aria-label={bc.priority}>
            {prioridad.map((a, i) => (
              <li key={a.id} className="dl-prio-step">
                <span className="dl-prio-n">{bc.priorityRank(i + 1)}</span>
                <img src={a.img} alt="" width={44} height={44} loading="lazy" />
                <span className="dl-prio-name">{a.name.replace(/ /g, " ")}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/* ── Las stats del héroe ───────────────────────────────────────────── */

const GRUPOS: StatGroup[] = ["weapon", "vitality", "spirit"];

export function StatsPanel({ rows }: { rows: StatRow[] }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.builder;
  const [grupo, setGrupo] = useState<StatGroup>("weapon");

  const num = (v: number, digits: number) =>
    v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const conUnidad = (r: StatRow, v: number) =>
    r.unit === "pct" ? `${num(v, r.digits)}%` : r.unit === "s" ? `${num(v, r.digits)} s` : r.unit === "m" ? `${num(v, r.digits)} m/s` : r.unit === "perSec" ? `${num(v, r.digits)}/s` : num(v, r.digits);

  return (
    <div className="dl-bd-stats">
      <h3 className="dl-bd-sub">{c.stats.title}</h3>
      <div className="dl-bd-stats-tabs" role="tablist">
        {GRUPOS.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={g === grupo} data-cat={g} onClick={() => setGrupo(g)}>
            {c.cats[g]}
          </button>
        ))}
      </div>
      <ul className="dl-bd-stats-list" role="tabpanel">
        {rows
          .filter((r) => r.group === grupo)
          .map((r) => {
            const d = r.value - r.base;
            const cambia = Math.abs(d) >= 10 ** -r.digits / 2;
            const mejor = r.lowerIsBetter ? d < 0 : d > 0;
            return (
              <li key={r.key} className="dl-bd-stat" data-changed={cambia || undefined}>
                <span className="dl-bd-stat-name">{c.stats.labels[r.key] ?? r.key}</span>
                <span className="dl-bd-stat-value">{conUnidad(r, r.value)}</span>
                {cambia && (
                  <span className="dl-bd-stat-delta" data-sign={mejor ? "up" : "down"}>
                    {d > 0 ? "+" : "−"}
                    {conUnidad(r, Math.abs(d))}
                  </span>
                )}
              </li>
            );
          })}
      </ul>
      <p className="detail-note dl-bd-stats-note">{c.stats.note}</p>
    </div>
  );
}
