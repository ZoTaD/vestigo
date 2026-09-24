/**
 * Piezas chicas que comparten la lista, la ficha y las guías de Valheim.
 */
import { useEffect, useReducer } from "react";
import RouteLink from "./RouteLink";
import type { Route, ValheimSection, ValheimTab } from "./route";
import { useLang } from "./i18n";
import { useValheimCopy } from "./valheimCopy";
import { iconUrl, loadTab, peekTab, tx, type BiomeId, type Ref, type TabRows, type WikiPhoto } from "./valheimData";

export type Nav = (route: Route) => void;
export type To = (section: ValheimSection, detail?: string) => Route;

/** Las filas de una pestaña: al instante si ya están (prerender), si no, las pide. */
export function useTab<T extends ValheimTab>(tab: T | null): TabRows[T] | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const rows = tab ? peekTab(tab) : null;
  useEffect(() => {
    if (!tab || peekTab(tab)) return;
    let vivo = true;
    loadTab(tab).then(() => vivo && bump()).catch(() => undefined);
    return () => { vivo = false; };
  }, [tab]);
  return rows;
}

/** La casilla de inventario del juego, con el ícono y la cantidad. */
export function Slot({ icon, qty, size, alt = "" }: { icon: string | null | undefined; qty?: string | number | null; size?: "xs" | "sm" | "lg"; alt?: string }) {
  const px = size === "lg" ? 84 : size === "sm" ? 30 : size === "xs" ? 20 : 42;
  return (
    <span className={`vh-slot${size ? ` is-${size}` : ""}`}>
      {icon && <img src={iconUrl(icon)} alt={alt} loading="lazy" width={px} height={px} />}
      {qty != null && qty !== "" && <span className="vh-qty">{qty}</span>}
    </span>
  );
}

/** Un enlace a otra ficha. Sin destino (una estación sin pieza), sólo el texto. */
export function RefLink({ r, to, navigate, className, children }: { r: Ref | null | undefined; to: To; navigate: Nav; className?: string; children: React.ReactNode }) {
  if (!r || !r.slug || !r.tab) return <span className={className}>{children}</span>;
  return (
    <RouteLink className={className} to={to(r.tab, r.slug)} onNavigate={navigate}>
      {children}
    </RouteLink>
  );
}

/** Ingrediente o botín: casilla enlazada con cantidad y nombre abajo. */
export function Ing({ r, qty, to, navigate }: { r: Ref; qty?: string | number | null; to: To; navigate: Nav }) {
  const { lang } = useLang();
  return (
    <RefLink r={r} to={to} navigate={navigate} className="vh-ing">
      <Slot icon={r.icon} qty={qty} />
      <span>{tx(r.name, lang)}</span>
    </RefLink>
  );
}

export function BiomeChip({ id }: { id: BiomeId | string }) {
  const t = useValheimCopy();
  return (
    <span className="vh-chip" data-biome={id}>
      <span className="vh-dot" />
      {t.biomes[id as BiomeId] ?? id}
    </span>
  );
}

export function BiomeTags({ ids }: { ids: (BiomeId | string)[] | null | undefined }) {
  if (!ids || ids.length === 0) return null;
  return (
    <span className="vh-tags">
      {ids.map((b) => <BiomeChip key={b} id={b} />)}
    </span>
  );
}

/** Las tres barras de comida del juego. `max` fija la escala para comparar entre fichas. */
export function FoodBars({ food }: { food: { hp: number; st: number; eitr: number } }) {
  const t = useValheimCopy();
  const row = (label: string, v: number, cls: string, max: number) =>
    v > 0 && (
      <div className="vh-bar">
        <span>{label}</span>
        <span className="vh-bar-t"><span className={`vh-bar-f ${cls}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></span>
        <b>{Math.round(v)}</b>
      </div>
    );
  return (
    <div className="vh-bars">
      {row(t.cols.hp, food.hp, "is-hp", 110)}
      {row(t.cols.st, food.st, "is-st", 110)}
      {row(t.cols.eitr, food.eitr, "is-ei", 100)}
    </div>
  );
}

export const pctChance = (c: number) => (c >= 1 ? "" : `${Math.round(c * 1000) / 10}%`);
export const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

/**
 * Una foto de la wiki. Pedido de ZoTaD (2026-09-24): nada enlaza a la wiki; el
 * crédito (Valheim Wiki, CC BY-SA 3.0) va en el pie de la página y el autor de
 * cada foto, al pasar el cursor.
 */
export function WikiFigure({ photo, alt, className }: { photo: WikiPhoto; alt: string; className?: string }) {
  const t = useValheimCopy();
  return (
    <figure className={`vh-photo${className ? ` ${className}` : ""}`}>
      <img src={photo.src} alt={alt} title={t.photoBy(photo.author)} width={photo.w} height={photo.h} loading="lazy" />
    </figure>
  );
}
