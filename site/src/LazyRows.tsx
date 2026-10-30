import { Children, cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * Una lista larga dibujada de a tandas, a medida que se acerca a la pantalla (2026-10-06).
 *
 * Objetos de Project Zomboid dibujaba 3.823 íconos y ~16.000 nodos de una vez, y Recetas pedía ~940 imágenes al abrir
 * (medido en producción el 2026-10-06). Acá cada tanda de `chunk` filas es, hasta acercarse, un solo bloque vacío del
 * alto que va a ocupar; al quedar a `margin` de la pantalla se dibuja y ya no se desmonta.
 *
 * Va **adentro** del contenedor de la grilla (`.pzi-rows`, por ejemplo): las tandas dibujadas no agregan caja (las filas
 * quedan hijas directas de la grilla, así las columnas no se cortan entre tandas) y el bloque vacío ocupa todas las
 * columnas. El alto sale de la grilla real: cuántas columnas tiene y su separación, por el alto de fila que se pasa.
 * En una `<ul>` o un `<tbody>`, el bloque vacío es un `<li>` o una fila (`tag`).
 *
 * Con `eager`, la primera tanda se dibuja ya (la lista de arriba de todo, así lo que se ve al abrir no parpadea). Sin `IntersectionObserver` se dibuja todo.
 *
 * Una tanda que queda a más de `FAR` px de la pantalla vuelve a ser un bloque vacío (2026-10-30), del alto exacto que
 * medía dibujada, así la página no salta. Bajar hasta el final de Objetos de Terraria dejaba ~6.000 filas dibujadas; ahora
 * quedan las de alrededor de la pantalla. Para encontrar sus filas, cada una lleva `data-lr`: una etiqueta (`<li>`,
 * `<tr>`) la recibe siempre y un componente si pasa las props sobrantes a su raíz (como `RouteLink`); si no, la tanda
 * queda dibujada como antes.
 * El texto que no se dibujó no aparece en el Ctrl+F del navegador: estas listas tienen su propio buscador.
 */
export function LazyRows<T>({
  items,
  render,
  rowHeight,
  chunk = 60,
  margin = 1200,
  eager = false,
  tag = "div",
}: {
  items: readonly T[];
  /** Devuelve la fila con su `key`, como en un `map`. */
  render: (item: T, index: number) => ReactNode;
  /** El alto de una fila, en px, sin la separación: el respaldo para cuando la lista todavía no dibujó ninguna. */
  rowHeight: number;
  chunk?: number;
  /** Cuánto antes de llegar a la pantalla se dibuja una tanda, en px. */
  margin?: number;
  /** Dibujar la primera tanda ya: la de la lista que se ve al abrir, así no parpadea. */
  eager?: boolean;
  /**
   * La etiqueta del bloque vacío, según dónde va la lista: `div` en una grilla, `li` en una `<ul>` y `tr` en un
   * `<tbody>` (ahí es una fila con una celda que ocupa todas las columnas).
   */
  tag?: "div" | "li" | "tr";
}) {
  const id = useId();
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunk) chunks.push(items.slice(i, i + chunk));
  return (
    <>
      {chunks.map((rows, i) => (
        <Chunk key={i} mark={`${id}-${i}`} eager={eager && i === 0} rows={rows.length} rowHeight={rowHeight} margin={margin} tag={tag}>
          {rows.map((item, j) => render(item, i * chunk + j))}
        </Chunk>
      ))}
    </>
  );
}

/**
 * ¿Esta fila de una lista larga se dibuja sin su imagen? Sólo en el prerender y pasada la primera tanda: ahí van todas
 * las filas (por el texto y los enlaces), y el navegador pedía cientos de imágenes `lazy` de ese HTML antes de que
 * React lo cambiara por la lista de a tandas (272 imágenes al abrir Objetos de Terraria, medido el 2026-10-12).
 */
export const skipSprite = (index: number, firstChunk: number): boolean => typeof window === "undefined" && index >= firstChunk;

const canObserve = typeof window !== "undefined" && "IntersectionObserver" in window;
/** A cuántos px de la pantalla una tanda dibujada vuelve a ser un bloque vacío. Más que `margin`, así no va y viene. */
const FAR = 3000;
// En el prerender (sin `window`) no hay nada que medir, y así React no avisa por `useLayoutEffect` en el servidor.
const useMeasure = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function Chunk({ mark, eager, rows, rowHeight, margin, tag, children }: { mark: string; eager: boolean; rows: number; rowHeight: number; margin: number; tag: "div" | "li" | "tr"; children: ReactNode }) {
  const [shown, setShown] = useState(eager || !canObserve);
  const [height, setHeight] = useState(rows * rowHeight);
  const ref = useRef<HTMLElement>(null);
  // El alto que midió la tanda dibujada antes de volver a ser un bloque vacío: manda sobre la cuenta de abajo.
  const measured = useRef(false);

  // El alto con las columnas de verdad, antes de pintar: si no, la barra de scroll salta al medirse. Si la lista ya
  // tiene filas dibujadas, el alto de fila sale de ellas (en el celular una fila de tabla apilada mide el triple);
  // si no, del `rowHeight` que se pasó.
  useMeasure(() => {
    const el = ref.current;
    const grid = tag === "tr" ? el : el?.parentElement;
    if (shown || measured.current || !el || !grid) return;
    const drawn = [...(el.parentElement?.children ?? [])].filter((c) => c !== el && !c.hasAttribute("data-lazy")).slice(0, 12);
    const line = drawn.length ? drawn.reduce((sum, c) => sum + c.getBoundingClientRect().height, 0) / drawn.length : rowHeight;
    if (tag === "tr") {
      setHeight(rows * line);
      return;
    }
    const style = getComputedStyle(grid);
    const cols = Math.max(1, style.gridTemplateColumns.split(" ").filter(Boolean).length);
    const gap = parseFloat(style.rowGap) || 0;
    const lines = Math.ceil(rows / cols);
    setHeight(lines * line + Math.max(0, lines - 1) * gap);
  }, [shown, tag, rows, rowHeight]);

  useEffect(() => {
    const el = ref.current;
    if (shown || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: `${margin}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, margin]);

  // Dibujada: si queda lejos de la pantalla, mide su alto (de la primera a la última fila) y vuelve a ser un bloque.
  useMeasure(() => {
    if (!shown || !canObserve) return;
    const els = document.querySelectorAll<HTMLElement>(`[data-lr="${CSS.escape(mark)}"]`);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    const io = new IntersectionObserver(
      () => {
        const top = first.getBoundingClientRect().top;
        const bottom = last.getBoundingClientRect().bottom;
        if (bottom > -FAR && top < window.innerHeight + FAR) return;
        io.disconnect();
        measured.current = true;
        setHeight(bottom - top);
        setShown(false);
      },
      { rootMargin: `${FAR}px 0px` },
    );
    io.observe(first);
    io.observe(last);
    return () => io.disconnect();
  }, [shown, mark]);

  // La marca sólo hace falta en el navegador: el HTML del prerender queda como estaba.
  if (shown && !canObserve) return <>{children}</>;
  if (shown) return <>{Children.map(children, (c) => (isValidElement(c) ? cloneElement(c, { "data-lr": mark } as Record<string, string>) : c))}</>;
  if (tag === "tr")
    return (
      <tr ref={ref as RefObject<HTMLTableRowElement>} aria-hidden="true" data-lazy="">
        <td colSpan={99} style={{ height, padding: 0, border: 0 }} />
      </tr>
    );
  const style = { gridColumn: "1 / -1", height, listStyle: "none" };
  if (tag === "li") return <li ref={ref as RefObject<HTMLLIElement>} aria-hidden="true" data-lazy="" style={style} />;
  return <div ref={ref as RefObject<HTMLDivElement>} aria-hidden="true" data-lazy="" style={style} />;
}
