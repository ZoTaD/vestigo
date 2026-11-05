/**
 * Las piezas que comparten las pantallas de Company of Heroes 3 (2026-11-04), estética B "Puesto de mando": panel con
 * esquinas de bronce, número con el formato del idioma, ícono del juego, emblema de facción, costo con sus rótulos,
 * hoja de "cargando…" y el orden de tablas tocando el encabezado.
 *
 * Pensado para reutilizarse en los otros RTS que vengan (pedido de ZoTaD, 4/11): nada de acá depende de los datos de
 * CoH3 salvo las rutas de las imágenes.
 */
import { useState, type ReactNode } from "react";
import { useLang } from "../i18n";
import { leagueOf } from "./leagues";
import type { Route } from "../route";
import { SettledImg } from "../SettledImg";
import { FACTION_ICON, useCoh3Copy, type Faction } from "../coh3Copy";

export type Nav = (r: Route) => void;

/** Un número con la coma o el punto del idioma y `d` decimales. */
export function useNum() {
  const { lang } = useLang();
  const loc = lang === "es" ? "es-AR" : "en-US";
  return (v: number, d = 0) => v.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Un panel del puesto de mando: rótulo chico en bronce, título en esténcil y el contenido. */
export function Panel({ k, h, lede, children, className, id }: { k?: ReactNode; h?: ReactNode; lede?: ReactNode; children?: ReactNode; className?: string; id?: string }) {
  return (
    <section className={className ? `c3-panel ${className}` : "c3-panel"} id={id}>
      {k && <div className="c3-k">{k}</div>}
      {h && <h2 className="c3-h2">{h}</h2>}
      {lede && <p className="c3-lede">{lede}</p>}
      {children}
    </section>
  );
}

/**
 * Un ícono del juego (`public/coh3/i/<ruta>.webp`, la ruta tal cual la nombran los datos). `lazy`: se pide cuando la
 * fila queda quieta (`SettledImg`, para listas); la imagen principal de una ficha va sin `lazy`.
 */
export function Icon({ path, size = 64, lazy = true, className }: { path: string | null | undefined; size?: number; lazy?: boolean; className?: string }) {
  const cls = className ? `c3-icon ${className}` : "c3-icon";
  if (!path) return <span className={`${cls} is-empty`} style={{ width: size, height: size }} aria-hidden="true" />;
  const props = { className: cls, src: `/coh3/i/${path}.webp`, alt: "", width: size, height: size };
  return lazy ? <SettledImg {...props} /> : <img {...props} decoding="async" />;
}

/** El emblema de una facción, con o sin su nombre. */
export function FactionTag({ f, name = true, size = 22, short = true }: { f: Faction; name?: boolean; size?: number; short?: boolean }) {
  const t = useCoh3Copy();
  return (
    <span className="c3-fac">
      <img src={FACTION_ICON[f]} alt={name ? "" : t.faction[f]} width={size} height={size} decoding="async" />
      {name && <span>{short ? t.factionShort[f] : t.faction[f]}</span>}
    </span>
  );
}

/** Un costo: mano de obra, munición, combustible y población, cada uno con su rótulo (regla de la casa: unidades a la vista). */
export function Cost({ c }: { c: { mp?: number; mu?: number; fu?: number; pop?: number } | null | undefined }) {
  const t = useCoh3Copy();
  const num = useNum();
  if (!c) return <span className="c3-dim">{t.t.none}</span>;
  const parts = ([["mp", t.t.mp], ["mu", t.t.mu], ["fu", t.t.fu], ["pop", t.t.pop]] as const).filter(([k]) => (c[k] ?? 0) > 0);
  if (!parts.length) return <span className="c3-dim">{t.t.none}</span>;
  return (
    <span className="c3-cost">
      {parts.map(([k, label]) => (
        <span key={k} className={`c3-res is-${k}`} title={label}>
          <b>{num(c[k] ?? 0)}</b> <small>{label}</small>
        </span>
      ))}
    </span>
  );
}

/** La hoja de "cargando…" (o del error, con el botón para reintentar). Clase `c3-loading`: la busca el prerender. */
export function Coh3Loading({ onRetry }: { onRetry?: () => void }) {
  const t = useCoh3Copy();
  return (
    <main className="c3-main c3-loading" aria-busy={!onRetry}>
      <Panel>
        {onRetry ? (
          <p role="alert">
            {t.t.error}{" "}
            <button type="button" className="c3-btn" onClick={onRetry}>
              ↻
            </button>
          </p>
        ) : (
          <p>{t.t.loading}</p>
        )}
      </Panel>
    </main>
  );
}

// ——— Orden de tablas (como `cs2/sort.tsx`): tocar la misma columna invierte; una nueva arranca por lo más alto. ———

export type Sort<K extends string> = { key: K; dir: 1 | -1 };
type Val = string | number | null | undefined;

export function sortRows<T, K extends string>(rows: readonly T[], cols: Record<K, (r: T) => Val>, s: Sort<K>): T[] {
  const get = cols[s.key];
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)) * s.dir;
  });
}

export const nextSort = <K extends string>(s: Sort<K>, key: K, text = false): Sort<K> =>
  s.key === key ? { key, dir: -s.dir as 1 | -1 } : { key, dir: text ? 1 : -1 };

/** El estado del orden y el encabezado que lo cambia: `th(clave, rótulo)` devuelve el `<th>` con su botón. */
export function useSort<K extends string>(init: Sort<K>, text: readonly K[] = []) {
  const [sort, setSort] = useState<Sort<K>>(init);
  const th = (k: K, children: ReactNode, extra?: { title?: string; className?: string }) => {
    const on = sort.key === k;
    return (
      <th key={k} aria-sort={on ? (sort.dir > 0 ? "ascending" : "descending") : "none"} title={extra?.title} className={extra?.className}>
        <button type="button" className={`c3-sort${on ? " is-on" : ""}`} onClick={() => setSort((s) => nextSort(s, k, text.includes(k)))}>
          {children}
          <span className="c3-sort-i" aria-hidden="true">
            {on ? (sort.dir > 0 ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </th>
    );
  };
  return { sort, th, setSort };
}

/** La liga de un jugador (el `ranklevel` de Relic) con el tinte de su metal. Sin rango no dibuja nada. */
export function LeagueTag({ level, small = false }: { level: number | null | undefined; small?: boolean }) {
  const { lang } = useLang();
  if (!level) return null;
  const l = leagueOf(level);
  return <span className={`c3-league is-${l.metal}${small ? " is-sm" : ""}`}>{l.name[lang]}</span>;
}
