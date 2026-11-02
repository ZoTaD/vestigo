import { useLayoutEffect, type RefObject } from "react";

/**
 * Tarjetas de alto variable en columnas parejas, sin huecos (ZoTaD, 2/11:
 * "ordenar todo para que entre bien y evitar espacios en blanco").
 *
 * **Columnas fijas no alcanzan**: qué tarjetas hay y cuánto miden depende de la
 * cuenta. Con la de prueba el primer piso medía 382 / 531 / 562 px y con una
 * del top 554 / 476 / 931. Y `columns` de CSS ya se descartó: partía el canto
 * rasgado de las tarjetas.
 *
 * **Tampoco alcanza "a la más corta en orden"** (el masonry de siempre): con la
 * cuenta del top, "Traits" (597 px) caía en la columna que en ese momento era
 * la más corta y la primera terminaba 500 px antes. Como son pocas tarjetas (6
 * o 7), se prueban todos los repartos y se queda el que deja la columna más alta
 * lo más baja posible. Dentro de cada columna se respeta el orden del DOM, y la
 * primera tarjeta (la ficha) va siempre arriba a la izquierda.
 *
 * Se aplica con `grid-column` y filas de 4 px (`grid-row-end: span N`): las
 * tarjetas **no cambian de padre**, así que no se vuelven a montar ni a pedir
 * nada. Se vuelve a medir cuando una tarjeta cambia de alto (llega su dato) o
 * aparece una nueva.
 */

/** Alto de cada fila de la grilla; igual a `grid-auto-rows` en el CSS. */
const ROW = 4;
/** Más tarjetas que esto y la búsqueda exhaustiva deja de ser barata. */
const MAX_EXACT = 9;

/** El reparto que minimiza la columna más alta. `out[i]` = columna de la tarjeta i. */
export function bestColumns(heights: number[], cols: number, gap: number): number[] {
  const n = heights.length;
  if (cols <= 1 || n === 0) return heights.map(() => 0);
  if (n > MAX_EXACT) {
    // Respaldo: a la más corta, en orden.
    const h = new Array(cols).fill(0);
    return heights.map((x) => {
      const c = h.indexOf(Math.min(...h));
      h[c] += x + gap;
      return c;
    });
  }
  let best: number[] = [];
  let bestMax = Infinity;
  const cur = new Array(n).fill(0);
  const alto = new Array(cols).fill(0);
  const go = (i: number) => {
    if (i === n) {
      const m = Math.max(...alto);
      if (m < bestMax - 0.5) {
        bestMax = m;
        best = cur.slice();
      }
      return;
    }
    // La ficha (la primera) va a la primera columna.
    const hasta = i === 0 ? 1 : cols;
    for (let c = 0; c < hasta; c++) {
      alto[c] += heights[i] + gap;
      if (alto[c] < bestMax) {
        cur[i] = c;
        go(i + 1);
      }
      alto[c] -= heights[i] + gap;
    }
  };
  go(0);
  return best;
}

export function useMasonry(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let previo = "";
    const layout = () => {
      const cs = getComputedStyle(el);
      const gap = parseFloat(cs.columnGap) || 0;
      // De `--cols` y no de `grid-template-columns`: ese cuenta también las
      // columnas implícitas que crea un `grid-column: 3` cuando la grilla pasa a
      // dos, y el reparto se quedaba en tres columnas angostas.
      const cols = Math.max(1, parseInt(cs.getPropertyValue("--cols"), 10) || 1);
      const hijos = Array.from(el.children) as HTMLElement[];
      const alturas = hijos.map((c) => c.getBoundingClientRect().height);
      const reparto = bestColumns(alturas, cols, gap);
      // Sin cambios no se toca el estilo: si no, cada medida dispararía otra.
      const firma = `${cols}|${alturas.map(Math.round).join(",")}|${reparto.join("")}`;
      if (firma === previo) return;
      previo = firma;
      hijos.forEach((c, i) => {
        c.style.gridColumn = cols > 1 ? String(reparto[i] + 1) : "";
        c.style.gridRowEnd = alturas[i] > 0 ? `span ${Math.ceil((alturas[i] + gap) / ROW)}` : "span 1";
      });
    };

    const ro = new ResizeObserver(layout);
    const observar = () => {
      ro.disconnect();
      ro.observe(el);
      for (const c of Array.from(el.children)) ro.observe(c);
      layout();
    };
    const mo = new MutationObserver(observar);
    mo.observe(el, { childList: true });
    observar();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  });
}
