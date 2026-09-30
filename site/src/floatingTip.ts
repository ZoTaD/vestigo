import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/**
 * Dónde se abre una ficha flotante (el tooltip de un objeto) para que quede
 * **entera dentro de la pantalla**. La usan la ficha de objeto de Deadlock
 * (`ConFicha`, `ItemTip`) y los tooltips de PoE2 (economía y enciclopedia).
 *
 * Se juntó acá el 2026-09-29, con las capturas de celular de los usuarios: cada
 * tooltip hacía su propia cuenta y las tres fallaban igual en el teléfono.
 *
 * - **La medida no puede depender de la posición.** La ficha de Deadlock iba con
 *   `width: auto` y, por ser `fixed`, se achicaba o se estiraba según dónde la
 *   dejaba la cuenta anterior: se medía con un ancho y se dibujaba con otro.
 *   Ahora el CSS le da un ancho fijo y la cuenta es una sola.
 * - **Se vuelve a ubicar cuando cambia de tamaño.** La ficha de Deadlock llega
 *   después de abrirse (primero dice "cargando") y la letra del juego también:
 *   una posición calculada con la caja vieja la dejaba colgando del borde.
 * - **Nunca pasa de los bordes.** El tooltip de la economía de PoE2 se corría a
 *   la izquierda del puntero sin tope y en el teléfono quedaba cortado.
 * - **Sin mouse no hay "al lado del puntero".** En el teléfono el tooltip se abre
 *   con el dedo y el dedo tapa justo ese lugar; ahí va como hoja abajo, centrada,
 *   y la pone el CSS (`@media (hover: none)`), así que acá no se calcula nada.
 */

// En el prerender no hay ventana: ahí useLayoutEffect sólo avisa, una vez por página. Se exporta para lo que también se
// prerenderiza y mide una caja apenas se abre (el tooltip de las runas de la portada de Diablo II).
export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** El aire mínimo entre la ficha y el borde de la pantalla. */
const MARGEN = 8;

/** Teléfonos y tablets: nada que pueda pasar por encima sin tocar. */
export const sinMouse = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;

export interface Ancla {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** El puntero como ancla sin tamaño. */
export const punto = (x: number, y: number): Ancla => ({ left: x, right: x, top: y, bottom: y });

/**
 * - `"debajo"`: centrada sobre el ancla y debajo; si no entra, arriba; si
 *   tampoco (una ficha alta con el objeto a media pantalla), al costado del
 *   objeto para no taparlo; y si nada entra, contra el borde (la ficha del
 *   objeto de Deadlock).
 * - `"costado"`: a la derecha del puntero; si no entra, a la izquierda; a la
 *   altura del puntero, con `subir` de la ficha por encima (los tooltips de PoE2).
 */
export type Lado = "debajo" | "costado";

export function ubicarFicha(ancla: Ancla, w: number, h: number, lado: Lado, subir = 1 / 3): { left: number; top: number } {
  // `clientWidth` y no `innerWidth`: la barra de scroll del escritorio ocupa 16 px.
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const enX = (v: number) => Math.max(MARGEN, Math.min(v, vw - w - MARGEN));
  const enY = (v: number) => Math.max(MARGEN, Math.min(v, vh - h - MARGEN));
  if (lado === "debajo") {
    const centrada = enX((ancla.left + ancla.right) / 2 - w / 2);
    const abajo = ancla.bottom + 6;
    const arriba = ancla.top - h - 6;
    if (abajo + h <= vh - MARGEN) return { left: centrada, top: abajo };
    if (arriba >= MARGEN) return { left: centrada, top: arriba };
    const alto = enY((ancla.top + ancla.bottom) / 2 - h / 2);
    if (ancla.right + 6 + w <= vw - MARGEN) return { left: ancla.right + 6, top: alto };
    if (ancla.left - 6 - w >= MARGEN) return { left: ancla.left - 6 - w, top: alto };
    return { left: centrada, top: enY(abajo) };
  }
  const derecha = ancla.right + 22;
  const izquierda = ancla.left - w - 22;
  const left = derecha + w <= vw - MARGEN ? derecha : izquierda >= MARGEN ? izquierda : enX(derecha);
  return { left, top: enY(ancla.top - h * subir) };
}

/**
 * Ubica una ficha `position: fixed` y devuelve su `style`. Con mouse, la mide,
 * la pone al lado de su ancla y la vuelve a ubicar si cambia de tamaño. Sin
 * mouse no devuelve posición (la hoja la ubica el CSS) y, si se pasa `cerrar`,
 * la cierra cuando se desliza la página: una hoja fija abajo tapaba lo que se
 * iba a leer, y en el teléfono no hay "sacar el mouse" que la cierre.
 *
 * `mover` es lo que cambia cuando se mueve el ancla (el puntero, la fila).
 */
export function useFloatingTip({
  ficha,
  abierta,
  ancla,
  lado,
  subir,
  mover,
  cerrar,
}: {
  ficha: RefObject<HTMLElement>;
  abierta: boolean;
  ancla: () => Ancla | null;
  lado: Lado;
  subir?: number;
  mover?: unknown;
  cerrar?: () => void;
}): CSSProperties | undefined {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Las funciones cambian en cada render; el efecto usa siempre la última.
  const anclaRef = useRef(ancla);
  anclaRef.current = ancla;
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;

  useIsoLayoutEffect(() => {
    const el = ficha.current;
    if (!abierta || !el) return;
    if (sinMouse()) {
      if (!cerrarRef.current) return;
      const y0 = window.scrollY;
      const alDeslizar = () => {
        if (Math.abs(window.scrollY - y0) > 40) cerrarRef.current?.();
      };
      window.addEventListener("scroll", alDeslizar, { passive: true });
      return () => window.removeEventListener("scroll", alDeslizar);
    }
    const ubicar = () => {
      const a = anclaRef.current();
      if (!a) return;
      const n = ubicarFicha(a, el.offsetWidth, el.offsetHeight, lado, subir);
      setPos((p) => (p && p.left === n.left && p.top === n.top ? p : n));
    };
    ubicar();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(ubicar);
    ro.observe(el);
    return () => ro.disconnect();
  }, [abierta, lado, subir, mover]);

  if (sinMouse()) return undefined;
  // Antes de la primera medida se dibuja oculta: nunca aparece en el lugar viejo.
  return pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" };
}
