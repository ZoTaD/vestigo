import { routePath, type Route } from "./route";

/**
 * Un enlace de navegación interna que **es un `<a href>` de verdad**.
 *
 * ---
 *
 * **Por qué existe: el sitio no tenía ni un enlace interno.** Toda la navegación
 * eran `<button onClick>`, así que el HTML que recibe un rastreador era esto:
 *
 *     GET https://vestigo.gg/en/deadlock
 *     4.149 bytes · enlaces <a>: 0 · botones: 0
 *
 * Google conocía las 361 URLs por el sitemap, entraba, no encontraba un solo
 * enlace y no gastaba rastreo. Search Console lo decía con todas las letras
 * sobre `/en/tft/meta`, la página más importante del sitio: *"Página de
 * referencia: no se ha detectado ninguna"*, y **341 de 361 páginas descubiertas
 * sin indexar**. No era autoridad de dominio ni contenido: era que **no existía
 * grafo de enlaces**.
 *
 * ---
 *
 * **Sigue siendo una SPA.** El clic normal se cancela y navega por `pushState`,
 * igual que antes; el `href` está para que exista el enlace en el HTML. Los
 * clics que el navegador tiene que manejar él —rueda, ctrl/cmd, shift, alt— se
 * dejan pasar, así que de paso arregla algo que antes no andaba: **abrir una
 * pestaña nueva con el botón del medio**, y ver a dónde va el link al pasar el
 * mouse.
 */
export default function RouteLink({
  to,
  onNavigate,
  className,
  active,
  children,
  ...rest
}: {
  to: Route;
  onNavigate: (route: Route) => void;
  className?: string;
  /** Marca la página actual: pinta el estado y pone `aria-current`. */
  active?: boolean;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">) {
  return (
    <a
      href={routePath(to)}
      className={className}
      data-active={active}
      aria-current={active ? "page" : undefined}
      onClick={(e) => {
        // Lo que el navegador tiene que seguir manejando: pestaña nueva, ventana
        // nueva, descarga. Cancelarlos rompería expectativas básicas.
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onNavigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
