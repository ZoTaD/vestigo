import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

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
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunk) chunks.push(items.slice(i, i + chunk));
  return (
    <>
      {chunks.map((rows, i) => (
        <Chunk key={i} eager={eager && i === 0} rows={rows.length} rowHeight={rowHeight} margin={margin} tag={tag}>
          {rows.map((item, j) => render(item, i * chunk + j))}
        </Chunk>
      ))}
    </>
  );
}

const canObserve = typeof window !== "undefined" && "IntersectionObserver" in window;
// En el prerender (sin `window`) no hay nada que medir, y así React no avisa por `useLayoutEffect` en el servidor.
const useMeasure = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function Chunk({ eager, rows, rowHeight, margin, tag, children }: { eager: boolean; rows: number; rowHeight: number; margin: number; tag: "div" | "li" | "tr"; children: ReactNode }) {
  const [shown, setShown] = useState(eager || !canObserve);
  const [height, setHeight] = useState(rows * rowHeight);
  const ref = useRef<HTMLElement>(null);

  // El alto con las columnas de verdad, antes de pintar: si no, la barra de scroll salta al medirse. Si la lista ya
  // tiene filas dibujadas, el alto de fila sale de ellas (en el celular una fila de tabla apilada mide el triple);
  // si no, del `rowHeight` que se pasó.
  useMeasure(() => {
    const el = ref.current;
    const grid = tag === "tr" ? el : el?.parentElement;
    if (shown || !el || !grid) return;
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

  if (shown) return <>{children}</>;
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
