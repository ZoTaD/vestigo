/**
 * Un enlace a otra pestaña de la libreta con lo elegido en la query (2026-10-02): Personaje con un `?b=`, Fabricación con
 * un `?q=…`. Lo comparten `planner/link.tsx`, `crafting/link.tsx` y el "Armalo en Personaje" de Fabricación, que antes
 * copiaban el mismo manejador cada uno.
 *
 * `RouteLink` no sirve tal cual: escribe sólo el camino, y la query es lo que lleva lo elegido. Al clic normal se escribe
 * primero la dirección entera y después se navega: `navigate` (App.tsx) sólo suma un paso al Atrás si el camino cambió,
 * y como ya es el mismo, queda uno solo. La pestaña de destino lee su query al montarse.
 *
 * No importa nada más que el registro de áreas: va en los chunks de Objetos, Recetas, Rasgos y Personaje.
 */
import type { ReactNode } from "react";
import { areas } from "../areasRegistry";
import type { Route } from "../route";

export default function QueryLink({
  to,
  href,
  navigate,
  className,
  children,
}: {
  /** La ruta de la pestaña de destino (sin la query). */
  to: Route;
  /** La dirección entera, con la query. */
  href: string;
  /** Sin `navigate`, es un enlace común (recarga la página). */
  navigate?: (r: Route) => void;
  className?: string;
  children: ReactNode;
}) {
  // Como `RouteLink`: el chunk de destino empieza a bajar cuando el mouse o el foco llegan al enlace.
  const warm = () => void areas().preloadRoute(to);
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // Pestaña nueva, ventana nueva o descarga: que las maneje el navegador.
        if (!navigate || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        window.history.pushState(null, "", href);
        navigate(to);
      }}
      onPointerEnter={warm}
      onFocus={warm}
    >
      {children}
    </a>
  );
}
