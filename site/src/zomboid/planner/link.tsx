/**
 * Un enlace al Planificador de personaje con un personaje ya armado (2026-09-30): "Armar un personaje con esta
 * profesión" en la ficha de una profesión, "Probalo en el planificador" en la de un rasgo. Es un `<a href>` de verdad
 * con el `?b=` adentro, así se puede abrir en otra pestaña o copiar. El clic lo maneja `QueryLink` (ahí dice por qué no
 * alcanza con `RouteLink`). El planificador lee el `?b=` al montarse.
 */
import type { ReactNode } from "react";
import { routePath, type Route } from "../../route";
import QueryLink from "../QueryLink";
import { B_PARAM, encode, isDefault, type Build } from "./build";

/** La ruta de la pestaña Personaje, en el idioma de `route`. */
export const plannerRoute = (route: Route): Route => ({ ...route, view: "zomboid", pzSection: "planner", detail: undefined });

/** La dirección del planificador con un personaje: `/es/project-zomboid/personaje?b=burglar`. El de entrada, limpia. */
export const plannerHref = (route: Route, b: Build): string =>
  routePath(plannerRoute(route)) + (isDefault(b) ? "" : `?${B_PARAM}=${encode(b)}`);

export default function PlannerLink({
  route,
  navigate,
  build,
  className,
  children,
}: {
  route: Route;
  navigate: (r: Route) => void;
  build: Build;
  className?: string;
  children: ReactNode;
}) {
  return (
    <QueryLink to={plannerRoute(route)} href={plannerHref(route, build)} navigate={navigate} className={className}>
      {children}
    </QueryLink>
  );
}
