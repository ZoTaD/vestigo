/**
 * Los nombres de las fichas de Project Zomboid (2026-09-30): objetos, recetas, rasgos, profesiones, habilidades,
 * moodles y las dos de Servidor, cada uno en los dos idiomas, tal como los escribe `games/zomboid/tools/extract.py` en
 * `index.json`. Se piden aparte y sólo cuando hacen falta: el `<head>` de una ficha al navegar (`PageMeta.tsx`).
 *
 * Es uno por sección (`virtual:pz-names/<sec>`, ver `pzNamesModule` en `vite.config.ts`) y no el `index.json` entero:
 * con sus `ref` y sus cinco secciones de más son 691 KB, 143 KB con gzip, para poner un título. Por sección, con gzip:
 * objetos 74,6 KB (el más grande: 3.826 fichas), recetas 22,6 KB, rasgos 1,7 KB, habilidades 0,6 KB, profesiones
 * 0,5 KB y moodles 0,4 KB. Una ficha de rasgos baja 1,7 KB; una de objetos, la mitad de lo que bajaba antes. El índice
 * de Diablo II (`d2r/index.ts`) trae todas sus secciones juntas porque entra en 14 KB.
 *
 * `patches` no tiene fichas en el índice: su `<head>` lo sigue poniendo la pestaña con sus propios nombres.
 */
import type { PzTab } from "../route";
import { esHeadNames } from "./headName";

/** [en, es], o [en, es, viaEn, viaEs] en los rasgos de profesión con un gemelo que se elige (ver `metaFor`). */
type PzNames = Record<string, [string, string] | [string, string, string[], string[]]>;

/**
 * Una entrada por cada sección que tiene fichas en el índice. Explícita y no `import(\`virtual:pz-names/${sec}\`)`: así
 * Rollup ve cada módulo y le arma su chunk, y una sección nueva es una línea acá y no una sorpresa en el build.
 */
const LOADERS: Partial<Record<PzTab, () => Promise<{ default: PzNames }>>> = {
  items: () => import("virtual:pz-names/items"),
  recipes: () => import("virtual:pz-names/recipes"),
  traits: () => import("virtual:pz-names/traits"),
  professions: () => import("virtual:pz-names/professions"),
  skills: () => import("virtual:pz-names/skills"),
  moodles: () => import("virtual:pz-names/moodles"),
  // Las dos fichas de Servidor (los presets comparados y los cortes, 2026-10-02): sin esto, al navegar, el `<head>` de
  // la ficha se quedaba con el título del generador.
  server: () => import("virtual:pz-names/server"),
};

const cache = new Map<PzTab, PzNames>();
/** Por sección, las fichas que en español se llaman igual que otra: su nombre para el `<head>` (ver `esHeadNames`). */
const heads = new Map<PzTab, Map<string, string>>();
const pending = new Map<PzTab, Promise<void>>();

/**
 * El nombre de una ficha si su sección ya llegó; `null` si todavía no, o si no existe. `esHead` sólo viene cuando otra
 * ficha de la sección se llama igual en español: es el nombre del `<head>` en español ("Manitas (Handy)").
 */
export function peekPzName(
  sec: PzTab,
  id: string,
): { en: string; es: string; esHead?: string; via?: { en: string[]; es: string[] } } | null {
  const names = cache.get(sec);
  // `hasOwn`: un id que viene de la dirección (`/items/constructor`) no puede tropezar con lo que trae `Object.prototype`.
  if (!names || !Object.hasOwn(names, id)) return null;
  const [en, es, viaEn, viaEs] = names[id];
  const esHead = heads.get(sec)?.get(id);
  return { en, es, ...(esHead ? { esHead } : {}), ...(viaEn && viaEs ? { via: { en: viaEn, es: viaEs } } : {}) };
}

/** Pide los nombres de una sección, una sola vez. Una sección sin fichas (`patches`) no pide nada. */
export function loadPzNames(sec: PzTab): Promise<void> {
  const load = LOADERS[sec];
  if (!load) return Promise.resolve();
  if (!pending.has(sec)) {
    pending.set(
      sec,
      load().then(
        (m) => {
          cache.set(sec, m.default);
          heads.set(sec, esHeadNames(Object.entries(m.default).map(([id, [en, es]]) => ({ id, en, es }))));
        },
        (err) => {
          // Un corte de red no deja la sección perdida para siempre: la próxima ficha la vuelve a pedir. Mientras tanto
          // el `<head>` se queda con el título de la pestaña.
          pending.delete(sec);
          throw err;
        },
      ),
    );
  }
  return pending.get(sec)!;
}
