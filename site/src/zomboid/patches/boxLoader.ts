/**
 * El recuadro "Qué cambió" (`ChangesBox`), pedido una sola vez (2026-10-02). Va solo y sin dependencias porque lo importa
 * `preloadChanges`, que viaja en el chunk del área de Zomboid: con `once` de `store.ts` o con `useLoad` de `ui.tsx`, esos
 * módulos (que hoy viven en los chunks de las pestañas) se mudaban al área y los pagaba hasta la portada.
 */
import type ChangesBox from "./ChangesBox";
import type { FichaChange } from "./data";

export type Box = typeof ChangesBox;

let loaded: Box | null = null;
let pending: Promise<Box> | null = null;

/** El recuadro si ya bajó; si no, `null`. */
export const peekChangesBox = (): Box | null => loaded;

/** Baja el recuadro. Si falla, la próxima llamada lo vuelve a pedir. */
export function loadChangesBox(): Promise<Box> {
  pending ??= import("./ChangesBox").then(
    (m) => (loaded = m.default),
    (err) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}

/** Cómo encuentra cada pestaña la ficha de un id, con sus datos ya cargados. */
type Lookup = (id: string) => { changes?: FichaChange[] } | null | undefined;
const LOOKUPS = new Map<string, Lookup>();

/**
 * Cada pestaña con fichas anota acá cómo buscar una (al cargarse su chunk), para que `preloadChanges` sepa si la de la
 * ruta trae cambios sin importar los datos de ninguna pestaña: con un `import()` por pestaña, Rollup partía los datos de
 * Moodles y Habilidades en chunks aparte y cada pestaña pagaba ~1 KB más.
 */
export function registerChangesLookup(sec: string, lookup: Lookup): void {
  LOOKUPS.set(sec, lookup);
}

/** La ficha de una sección por su id, si la pestaña ya se cargó y la ficha ya llegó. */
export const lookupFicha = (sec: string, id: string) => LOOKUPS.get(sec)?.(id);
