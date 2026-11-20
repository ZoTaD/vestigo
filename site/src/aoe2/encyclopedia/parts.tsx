/** Las piezas que comparten las pestañas de la enciclopedia de AoE2 (2026-11-21). */
import { useEffect, useState, type ReactNode } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import type { Nav } from "../ui";
import { RECURSOS, type Nombre, type Recurso } from "./data";
import { useEncCopy } from "./copy";

type Cache<T> = { load: () => Promise<T>; peek: () => T | undefined };

/** Un archivo de la enciclopedia: lo ya cargado de entrada (prerender) y, si no, lo pide. */
export function useEnc<T>(c: Cache<T>): T | undefined {
  const [v, setV] = useState<T | undefined>(c.peek);
  useEffect(() => {
    if (v !== undefined) return;
    let vivo = true;
    void c.load().then((x) => vivo && setV(x));
    return () => {
      vivo = false;
    };
  }, [c, v]);
  return v;
}

/** Lo mismo para algo que se pide con parámetros (la ayuda de un id, la ficha de una civ). */
export function useCargado<T>(peek: () => T | null | undefined, load: () => Promise<T | null>, clave: string): T | null | undefined {
  const [v, setV] = useState<{ k: string; v: T | null | undefined }>(() => ({ k: clave, v: peek() }));
  const actual = v.k === clave ? v.v : peek();
  useEffect(() => {
    if (actual !== undefined) return;
    let vivo = true;
    void load().then((x) => vivo && setV({ k: clave, v: x }));
    return () => {
      vivo = false;
    };
  }, [clave, actual]);
  return actual;
}

const CARPETA = { u: "u", t: "t", b: "b" } as const;
/** El ícono del juego de una unidad (`u`), tecnología (`t`) o edificio (`b`), de tamaño fijo. */
export function Icono({ k, pic, size = 40, off = false, eager = false }: { k: keyof typeof CARPETA; pic: number; size?: number; off?: boolean; eager?: boolean }) {
  return (
    <img
      className={`a2-ico${off ? " is-off" : ""}`}
      src={`/aoe2/${CARPETA[k]}/${pic}.webp`}
      alt=""
      width={size}
      height={size}
      loading={eager ? undefined : "lazy"}
      decoding="async"
    />
  );
}

/** "60 comida · 75 oro" (o "Gratis"). */
export function Costo({ cost }: { cost: Partial<Record<Recurso, number>> }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const partes = RECURSOS.filter((r) => cost[r]).map((r) => `${cost[r]!.toLocaleString(lang)} ${t.res[r]}`);
  return <>{partes.length ? partes.join(" · ") : t.free}</>;
}

type Item = { id: number; slug: string; name: Nombre; pic: number };
/** Una fila de íconos con nombre que llevan a su ficha. */
export function Fichas({ items, k, route, navigate, off }: { items: readonly Item[]; k: "u" | "t"; route: Route; navigate: Nav; off?: (id: number) => boolean }) {
  const { lang } = useLang();
  return (
    <ul className="a2-chips">
      {items.map((x) => (
        <li key={x.id}>
          <RouteLink to={{ ...route, view: "aoe2", a2Section: k === "u" ? "units" : "technologies", detail: x.slug }} onNavigate={navigate}>
            <Icono k={k} pic={x.pic} size={36} off={off?.(x.id)} />
            <span>{x.name[lang] || x.name.en}</span>
          </RouteLink>
        </li>
      ))}
    </ul>
  );
}

/** Pares de dato y valor (como la ficha de partida). */
export function Datos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="a2-facts">
      {filas.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
