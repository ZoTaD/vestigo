/**
 * Las piezas que comparten las pantallas de Terraria (2026-10-12): el sprite de un objeto, su casillero, el enlace a
 * su ficha, la hoja de "cargando…" y el buscador que lleva a una ficha.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { useLang } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useTerrariaCopy } from "../terrariaCopy";
import { loadList, peekList, type Row } from "./data";
import { normalize, rarityColor } from "./items/stats";

export type Nav = (r: Route) => void;

/**
 * El sprite de un objeto, a su tamaño real o achicado para entrar en `max` px. Los sprites del juego ya vienen al
 * doble (un "píxel" son 2×2), así que no se agrandan. Sin sprite (`w === 0`) deja el lugar vacío, no una imagen rota.
 */
export function Sprite({ id, w, h, max = 40, eager = false }: { id: number; w: number; h: number; max?: number; eager?: boolean }) {
  if (!w) return <span className="tr-sprite is-empty" style={{ width: max, height: max }} />;
  const k = Math.min(1, max / Math.max(w, h));
  return (
    <img
      className="tr-sprite"
      src={`/terraria/items/${id}.png`}
      alt=""
      width={Math.round(w * k)}
      height={Math.round(h * k)}
      loading={eager ? undefined : "lazy"}
      decoding="async"
    />
  );
}

/** El casillero donde va un sprite: un hueco oscuro de tamaño fijo. */
export function Slot({ children, size = 52 }: { children: ReactNode; size?: number }) {
  return (
    <span className="tr-slot" style={{ width: size, height: size }}>
      {children}
    </span>
  );
}

/** El nombre de un objeto en el color de su rareza. */
export const rare = (r: number): CSSProperties => ({ color: rarityColor(r) });

export const itemRoute = (route: Route, slug: string): Route => ({ ...route, view: "terraria", trSection: "items", detail: slug });

/** La hoja de "cargando…". El prerender corta el build si una página sale con ella (`loadingGuard.ts`). */
export function TrLoading({ onRetry }: { onRetry?: () => void }) {
  const c = useTerrariaCopy();
  return (
    <main className="tr-main tr-loading" aria-busy={!onRetry}>
      <div className="tr-dug">
        {onRetry ? (
          <p role="alert">
            {c.loadError}{" "}
            <button type="button" className="tr-btn" onClick={onRetry}>
              {c.retry}
            </button>
          </p>
        ) : (
          <p>{c.loading}</p>
        )}
      </div>
    </main>
  );
}

/** Los objetos cuyo nombre contiene lo escrito; primero los que empiezan con eso. */
export function searchRows(rows: readonly Row[], query: string, max: number): Row[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: Row[] = [];
  const has: Row[] = [];
  for (const r of rows) {
    const n = normalize(r.name);
    if (n.startsWith(q)) starts.push(r);
    else if (n.includes(q)) has.push(r);
    if (starts.length >= max) break;
  }
  return [...starts, ...has].slice(0, max);
}

/**
 * Un buscador que lleva a algo: escribís y elegís. La lista se pide recién al enfocar el campo. `only` filtra qué
 * objetos se ofrecen (el árbol sólo ofrece los que se fabrican) y `to` dice a dónde lleva cada uno.
 */
export function ItemSearch({ label, placeholder, to, navigate, only, onPick }: { label: string; placeholder: string; to: (r: Row) => Route; navigate: Nav; only?: (r: Row) => boolean; /** Si está, elegir llama acá en vez de navegar (el árbol cambia de objeto sin cambiar de página). */ onPick?: (r: Row) => void }) {
  const c = useTerrariaCopy();
  const { lang } = useLang();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(() => peekList(lang));
  const want = () => {
    if (!rows) loadList(lang).then(setRows, () => undefined);
  };
  const pool = rows && only ? rows.filter(only) : rows;
  const hits = pool ? searchRows(pool, query, 8) : [];
  const go = (r: Row) => {
    setQuery("");
    if (onPick) onPick(r);
    else navigate(to(r));
  };
  return (
    <form
      className="tr-find"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (hits[0]) go(hits[0]);
      }}
    >
      <label>
        <span className="tr-label">{label}</span>
        <input type="search" value={query} placeholder={placeholder} autoComplete="off" onFocus={want} onChange={(e) => (want(), setQuery(e.target.value))} />
      </label>
      {query.trim().length > 1 && pool && (
        <ul className="tr-find-hits">
          {hits.length === 0 && <li className="tr-find-none">{c.home.searchNone}</li>}
          {hits.map((r) => (
            <li key={r.id}>
              <RouteLink className="tr-hit" to={to(r)} onNavigate={() => go(r)}>
                <Slot size={36}>
                  <Sprite id={r.id} w={r.w} h={r.h} max={28} />
                </Slot>
                <span style={rare(r.rare)}>{r.name}</span>
              </RouteLink>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
