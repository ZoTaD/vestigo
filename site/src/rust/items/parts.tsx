/**
 * Piezas chicas que comparten las secciones de la ficha de Rust (2026-10-05): el ícono de un objeto y el enlace a otra
 * ficha. Nacieron dentro de `ItemFicha.tsx` y salieron cuando la ficha se partió en secciones.
 */
import type { ReactNode } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import type { Ref } from "./data";

export type Nav = (r: Route) => void;

/** El ícono de un objeto. El texto alternativo va vacío: al lado siempre está el nombre. */
export function Icon({ id, size = 40 }: { id: string; size?: number }) {
  return <img src={`/rust/items/${id}.webp`} alt="" width={size} height={size} />;
}

/** Un enlace a la ficha de otro objeto, o el nombre suelto si no tiene ficha (una skin, un objeto oculto). */
export function RefLink({ r, route, navigate, children }: { r: Ref; route: Route; navigate: Nav; children: ReactNode }) {
  return r.slug ? (
    <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "items", detail: r.slug }} onNavigate={navigate}>
      {children}
    </RouteLink>
  ) : (
    <span className="rs-ref">{children}</span>
  );
}
