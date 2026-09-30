/**
 * Las piezas que comparten las pestañas de Diablo II (2026-09-29): el título
 * entre gemas, el tooltip del juego (negro con el borde dorado de 9 piezas) y
 * los íconos de inventario. Los colores de texto son los del juego: dorado
 * para los únicos y las palabras rúnicas, verde para los conjuntos, azul para
 * las stats mágicas, naranja para las runas.
 */
import type { ReactNode } from "react";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { gameImg } from "../d2rData";
import { itemImg } from "./wiki";

export type Tone = "unique" | "set" | "rune" | "magic" | "white" | "gray";

/** El título de cada bloque, entre las dos gemas doradas del menú del juego. */
export function D2Head({ id, title, lede, as = "h2" }: { id?: string; title: string; lede?: ReactNode; as?: "h1" | "h2" }) {
  const H = as;
  return (
    <div className="d2-head">
      <H className="d2-h2" id={id}>
        <img src={gameImg("gem-l")} alt="" width={54} height={44} />
        <span>{title}</span>
        <img src={gameImg("gem-r")} alt="" width={54} height={44} />
      </H>
      {lede && <p>{lede}</p>}
    </div>
  );
}

/** El ícono de inventario de un ítem (o nada si el juego no tiene uno). */
export function ItemIcon({ asset, size = "md", alt = "" }: { asset: string | null | undefined; size?: "sm" | "md" | "lg"; alt?: string }) {
  const src = itemImg(asset);
  if (!src) return <span className={`d2-ic is-${size} is-empty`} aria-hidden="true" />;
  return (
    <span className={`d2-ic is-${size}`}>
      <img src={src} alt={alt} loading="lazy" />
    </span>
  );
}

/**
 * El tooltip del juego, como bloque de la página (en las fichas va abierto).
 * `head` son las líneas de arriba (nombre, base), `lines` las stats en azul y
 * `groups` bloques extra (bonificaciones de conjunto, variantes).
 */
export function ItemBox({
  name,
  tone,
  sub,
  base,
  lines,
  groups,
  foot,
}: {
  name: string;
  tone: Tone;
  sub?: ReactNode;
  base?: ReactNode[];
  lines?: string[];
  groups?: { title?: ReactNode; tone?: Tone; lines: string[] }[];
  foot?: ReactNode;
}) {
  return (
    <div className="d2-box">
      <div className={`d2-box-name d2-tone-${tone}`}>{name}</div>
      {sub && <div className={`d2-box-sub d2-tone-${tone}`}>{sub}</div>}
      {base && base.length > 0 && (
        <div className="d2-box-base">
          {base.map((b, i) => (
            <div key={i}>{b}</div>
          ))}
        </div>
      )}
      {lines && lines.length > 0 && (
        <ul className="d2-box-lines d2-tone-magic">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {groups?.map((g, i) => (
        <div className="d2-box-group" key={i}>
          {g.title && <div className="d2-box-gtitle">{g.title}</div>}
          <ul className={`d2-box-lines d2-tone-${g.tone ?? "magic"}`}>
            {g.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
      {foot && <div className="d2-box-foot">{foot}</div>}
    </div>
  );
}

/** Una tarjeta de lista: ícono, nombre con el color de su calidad y una línea chica. */
export function ItemCard({
  to,
  navigate,
  asset,
  name,
  tone,
  meta,
  children,
}: {
  to: Route;
  navigate: (r: Route) => void;
  asset: string | null | undefined;
  name: string;
  tone: Tone;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <RouteLink className="d2-card" to={to} onNavigate={navigate}>
      <ItemIcon asset={asset} size="sm" />
      <span className="d2-card-txt">
        <b className={`d2-tone-${tone}`}>{name}</b>
        {meta && <small>{meta}</small>}
        {children}
      </span>
    </RouteLink>
  );
}

/** La miga de pan de una ficha: vuelve a la pestaña. */
export function BackLink({ to, navigate, label }: { to: Route; navigate: (r: Route) => void; label: string }) {
  return (
    <RouteLink className="d2-back" to={to} onNavigate={navigate}>
      ← {label}
    </RouteLink>
  );
}

/** Quita tildes y pasa a minúsculas, para buscar "cresta" y encontrar "Cresta". */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El campo de búsqueda de las listas. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input className="d2-search" type="search" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

/** Una fila de botones para filtrar ("Todos · Armas · Escudos…"). */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="d2-chips-row" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={String(o.value)} className={`d2-chip${o.value === value ? " is-on" : ""}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
