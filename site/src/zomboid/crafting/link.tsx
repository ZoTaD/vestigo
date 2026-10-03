/**
 * Un enlace al Planificador de fabricación con algo ya elegido (2026-10-02): "Planificá qué juntar" en la ficha de un
 * objeto que se fabrica, "Planificá esta receta" en la de una receta, "Planificá qué fabricar con este personaje" en
 * Personaje. Es un `<a href>` de verdad con lo elegido en la query (`?q=plank&r=plank~saw-log`), así se puede abrir en
 * otra pestaña o copiar; el clic lo maneja `QueryLink`. Fabricación lee la query al montarse y la limpia con `sanitize`.
 *
 * Liviano a propósito: va en los chunks de Objetos, Recetas y Personaje. Sólo trae `query.ts` (cómo se escribe lo
 * elegido), no el resto de `state.ts`; los datos de fabricación (`craft.json`) no se importan: el chunk de la pestaña
 * empieza a bajar al pasar el mouse.
 */
import type { ReactNode } from "react";
import { routePath, type Route } from "../../route";
import QueryLink from "../QueryLink";
import { EMPTY, encodeState, type CraftState } from "./query";

/** La ruta de la pestaña Fabricación, en el idioma de `route`. */
export const craftRoute = (route: Route): Route => ({ ...route, view: "zomboid", pzSection: "crafting", detail: undefined });

/** La dirección del planificador con lo elegido: `/es/project-zomboid/fabricacion?q=plank`. Sin nada, limpia. */
export const craftHref = (route: Route, st: Partial<CraftState>): string => {
  const qs = encodeState({ ...EMPTY, ...st });
  return routePath(craftRoute(route)) + (qs ? `?${qs}` : "");
};

export default function CraftLink({
  route,
  navigate,
  st,
  className,
  children,
}: {
  route: Route;
  navigate: (r: Route) => void;
  st: Partial<CraftState>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <QueryLink to={craftRoute(route)} href={craftHref(route, st)} navigate={navigate} className={className}>
      {children}
    </QueryLink>
  );
}
