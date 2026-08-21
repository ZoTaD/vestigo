import type { ItemMeta } from "./features";

/**
 * El recomendador: la mejor build que podemos defender, no la mejor imaginable.
 *
 * **Publicar los doce objetos de mayor aporte no funciona**, y no es una
 * cuestión de gusto. Cada aporte se mide por separado —esa compra contra quien
 * gastó lo mismo en otra cosa— así que sumarlos asume que los objetos no
 * interactúan entre sí. Interactúan. Sumando se puede publicar un conjunto que
 * **nadie combinó nunca**, sin una sola partida que respalde que junto funciona.
 * Es el error del k-means otra vez.
 *
 * Así que esto es **búsqueda local adentro de lo observado**: se parte de la
 * build más jugada y se cambian objetos de a uno, sin salirse nunca de lo que la
 * gente hizo de verdad.
 *
 * Diseño en `docs/design/2026-08-03-recomendador-de-builds-deadlock-design.md`.
 */

/** Un objeto de la build de la que se parte. */
export interface BaseItem {
  itemId: number;
  /** Aporte medido en ESTE héroe, en puntos de victoria. */
  edge: number;
  /** True si está entre los que más aportan de la corrida. No se tocan. */
  carries?: boolean;
}

/** Un objeto que podría entrar, con lo que lo respalda. */
export interface Candidate {
  itemId: number;
  edge: number;
  /** Compras que respaldan ese aporte. Sin esto, un aporte alto puede ser ruido. */
  buys: number;
}

/**
 * En cuántas partidas de este héroe un objeto convive con **todo** un conjunto.
 *
 * Se pasa como función y no como número precalculado porque **el conjunto crece
 * con cada cambio aceptado**. Con la co-ocurrencia medida sólo contra el núcleo
 * original, cada cambio quedaba respaldado por separado y la combinación
 * acumulada no — medido en la primera versión: un héroe llegó a **nueve
 * cambios**, o sea nueve de doce objetos distintos, y la garantía de "esto lo
 * juega gente" ya no cubría el resultado.
 */
export type Soporte = (itemId: number, conjunto: number[]) => number;

export interface Swap {
  out: number;
  in: number;
  edgeOut: number;
  edgeIn: number;
  /** Partidas donde el entrante convive con el núcleo. */
  support: number;
}

export interface Recommendation {
  /** Los doce finales, ya con los cambios aplicados. */
  items: number[];
  swaps: Swap[];
}

/**
 * Cuántos puntos de victoria tiene que ganar un cambio para valer la pena.
 *
 * **No alcanza con que el entrante mida más**: los aportes traen ruido, y con
 * ~150 pares por héroe siempre hay alguno que mide un poco más por azar. Medio
 * punto de victoria es una partida más cada doscientas — chico, pero es un
 * tamaño de efecto y no una diferencia de redondeo.
 */
export const MIN_GANANCIA = 0.5;

/**
 * Compras mínimas que tienen que respaldar el aporte del entrante.
 *
 * Es el mismo piso que usa el pareo para que un estrato cuente, subido: acá el
 * número no describe, **decide**, y una recomendación armada sobre veinte
 * compras sería una opinión con cara de medición.
 */
export const MIN_COMPRAS = 150;

/**
 * Partidas mínimas en las que el entrante tiene que convivir con el núcleo.
 *
 * Es la garantía de "esto lo juega gente". Sin ella el algoritmo puede pegar
 * objetos que miden bien por separado y que nadie combinó.
 */
export const MIN_SOPORTE = 60;

/**
 * Los cambios que mejoran una build, aplicados de a uno hasta que no queda
 * ninguno.
 *
 * **Los objetos marcados `carries` no se tocan** — son los que el pareo dice que
 * están cargando la build, y sacarlos es sacar lo que la hace funcionar. Esto
 * reemplaza a un tope numérico de cambios (decisión de ZoTaD, y es mejor: el
 * criterio sale de la medición en vez de ser un número inventado).
 *
 * Los candidatos a salir se recorren **del que menos aporta hacia arriba**, así
 * que lo primero que se ataca es lo que todo el mundo compra y no paga — que es
 * además lo más útil que le podemos decir a alguien.
 *
 * El entrante tiene que ser del **mismo escalón de precio y el mismo estante**,
 * y con eso el presupuesto de almas y la forma de la build se mantienen sin
 * tener que modelarlos.
 */
export function recommend(
  base: BaseItem[],
  pool: Candidate[],
  meta: Map<number, ItemMeta>,
  soporte: Soporte,
  opts: { minGanancia?: number; minCompras?: number; minSoporte?: number } = {}
): Recommendation {
  const minGanancia = opts.minGanancia ?? MIN_GANANCIA;
  const minCompras = opts.minCompras ?? MIN_COMPRAS;
  const minSoporte = opts.minSoporte ?? MIN_SOPORTE;

  const actual = base.map((b) => ({ ...b }));
  const swaps: Swap[] = [];
  // Un objeto que ya salió no puede volver a entrar: sin esto, dos cambios que
  // se gustan mutuamente se intercambian para siempre.
  const usados = new Set<number>(base.map((b) => b.itemId));

  for (;;) {
    /**
     * Contra qué se pide la evidencia: los protegidos **más todo lo que ya
     * entró**. Así el respaldo acompaña a la build que se está armando en vez de
     * quedarse mirando la de partida.
     */
    const anclas = [
      ...actual.filter((x) => x.carries).map((x) => x.itemId),
      ...swaps.map((s) => s.in),
    ];

    let mejor: { idx: number; cand: Candidate; ganancia: number; support: number } | null = null;

    // Del que menos aporta hacia arriba.
    const orden = actual
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !it.carries)
      .sort((a, b) => a.it.edge - b.it.edge);

    for (const { it, idx } of orden) {
      const salida = meta.get(it.itemId);
      if (!salida) continue;
      for (const cand of pool) {
        if (usados.has(cand.itemId)) continue;
        const entrada = meta.get(cand.itemId);
        if (!entrada) continue;
        if (entrada.cost !== salida.cost || entrada.slot !== salida.slot) continue;
        if (cand.buys < minCompras) continue;
        const ganancia = cand.edge - it.edge;
        if (ganancia < minGanancia) continue;
        // La evidencia se pide al final, que es lo caro: sólo para los que ya
        // pasaron precio, estante, muestra y tamaño de efecto.
        const sop = soporte(cand.itemId, anclas.filter((a) => a !== it.itemId));
        if (sop < minSoporte) continue;
        // Ante empate manda el id, para que la salida no dependa del orden en
        // que se recorrió el pool.
        if (
          !mejor ||
          ganancia > mejor.ganancia ||
          (ganancia === mejor.ganancia && cand.itemId < mejor.cand.itemId)
        ) {
          mejor = { idx, cand, ganancia, support: sop };
        }
      }
    }

    if (!mejor) break;

    const saliendo = actual[mejor.idx];
    swaps.push({
      out: saliendo.itemId,
      in: mejor.cand.itemId,
      edgeOut: saliendo.edge,
      edgeIn: mejor.cand.edge,
      support: mejor.support,
    });
    usados.add(mejor.cand.itemId);
    actual[mejor.idx] = { itemId: mejor.cand.itemId, edge: mejor.cand.edge };
  }

  return { items: actual.map((x) => x.itemId), swaps };
}

/**
 * Cuántas partidas de un héroe llevan un objeto **junto a todo un conjunto**.
 *
 * Se exige que estén TODOS, no una mayoría: el conjunto es lo que define a la
 * build, y "gente que lleva la mitad de esto" es otra build.
 *
 * Referencia simple y directa. En el pipeline conviene la versión indexada
 * (`soporteDe`), que evita recorrer a todos los jugadores en cada consulta.
 */
export function supportFor(
  builds: number[][],
  conjunto: number[],
  itemId: number
): number {
  if (conjunto.length === 0) return 0;
  let n = 0;
  for (const b of builds) {
    const s = new Set(b);
    if (!s.has(itemId)) continue;
    if (conjunto.every((c) => s.has(c))) n++;
  }
  return n;
}

/**
 * La misma cuenta, indexada por objeto.
 *
 * El recomendador pregunta el soporte **adentro del bucle** y contra un conjunto
 * que cambia, así que recorrer las ~5.000 partidas de un héroe en cada consulta
 * costaba demasiado. Con un índice `objeto → partidas que lo llevan`, cada
 * consulta recorre la lista más corta y no el corpus entero.
 */
export function soporteDe(builds: number[][]): Soporte {
  const porItem = new Map<number, number[]>();
  builds.forEach((b, i) => {
    for (const id of new Set(b)) {
      const l = porItem.get(id);
      if (l) l.push(i);
      else porItem.set(id, [i]);
    }
  });
  const sets = builds.map((b) => new Set(b));

  return (itemId, conjunto) => {
    if (conjunto.length === 0) return 0;
    const idx = porItem.get(itemId);
    if (!idx) return 0;
    let n = 0;
    for (const i of idx) {
      const s = sets[i];
      let todos = true;
      for (const c of conjunto) {
        if (!s.has(c)) { todos = false; break; }
      }
      if (todos) n++;
    }
    return n;
  };
}
