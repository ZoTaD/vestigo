import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

/**
 * Una imagen de lista que se pide recién cuando su fila queda quieta en pantalla (2026-10-29).
 *
 * Bajar rápido por Objetos de Terraria (6.133 íconos) dibujaba todas las tandas de `LazyRows` y el `loading="lazy"` del
 * navegador pedía cada ícono que pasaba cerca: miles de pedidos en segundos, y Netlify cortó el sitio entero a esa IP
 * un rato (403 y conexiones colgadas, medido el 2026-10-29). Acá la imagen espera a estar cerca de la pantalla **y** a
 * que no haya scroll hace `QUIET` ms: si se pasa volando no se pide; si se frena, aparece.
 *
 * Hasta entonces lleva un GIF transparente en línea (sin pedido), así el casillero conserva su ancho y alto y el `alt`
 * no se escribe como texto. En el prerender (sin `window`) va la imagen de verdad, con `loading="lazy"` como antes.
 */
export function SettledImg({ src, alt = "", ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "loading" | "src"> & { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [on, setOn] = useState(!canObserve);
  useEffect(() => {
    const el = ref.current;
    if (on || !el) return;
    return watch(el, () => setOn(true));
  }, [on]);
  return <img ref={ref} src={on ? src : BLANK} alt={on ? alt : ""} {...rest} loading="lazy" decoding="async" />;
}

/** Un GIF de 1×1 transparente: ocupa el lugar sin pedir nada (la CSP permite `data:` en `img-src`). */
export const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
/** Cuánto tiempo sin scroll hace falta para pedir lo que está en pantalla, en ms. */
export const QUIET = 150;
/** Cuánto antes de llegar a la pantalla cuenta como "en pantalla", en px. */
const MARGIN = 300;

const canObserve = typeof window !== "undefined" && "IntersectionObserver" in window;

let lastScroll = 0;
let io: IntersectionObserver | null = null;
const waiting = new Map<Element, () => void>();
const near = new Set<Element>();

/** Llama a `done` una vez, cuando `el` esté cerca de la pantalla con el scroll quieto. Devuelve cómo dejar de mirar. */
export function watch(el: Element, done: () => void): () => void {
  if (!io) {
    window.addEventListener("scroll", () => (lastScroll = performance.now()), { capture: true, passive: true });
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            near.add(e.target);
            settle(e.target);
          } else near.delete(e.target);
        }
      },
      { rootMargin: `${MARGIN}px 0px` },
    );
  }
  waiting.set(el, done);
  io.observe(el);
  return () => forget(el);
}

function settle(el: Element) {
  if (!near.has(el) || !waiting.has(el)) return;
  const idle = performance.now() - lastScroll;
  if (idle < QUIET) {
    setTimeout(() => settle(el), QUIET - idle + 10);
    return;
  }
  const done = waiting.get(el)!;
  forget(el);
  done();
}

// Deja de mirar después, no en el acto: React en modo estricto desmonta y vuelve a montar cada efecto, y si se deja de
// mirar un elemento y se lo vuelve a mirar en la misma vuelta, Chrome no avisa nunca que está en pantalla.
function forget(el: Element) {
  waiting.delete(el);
  near.delete(el);
  queueMicrotask(() => {
    if (!waiting.has(el)) io?.unobserve(el);
  });
}
