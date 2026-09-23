/**
 * La guía de compra del armador y el orden de habilidades, sin React.
 *
 * **La guía es el editor de builds del juego**: categorías con nombre y
 * descripción, cada una con sus objetos en el orden en que se compran, un ancho
 * que se puede cambiar y un orden entre ellas. Un objeto puede estar en varias
 * categorías (el juego lo permite: "opcionales" repite lo de otra) pero no dos
 * veces en la misma.
 *
 * **El orden de habilidades es la grilla del juego**: cada punto se le pone a
 * una de las cuatro habilidades; el primero la desbloquea y los tres siguientes
 * la mejoran, a 1, 2 y 5 puntos de habilidad (lo muestra la grilla del juego,
 * captura de ZoTaD del 2026-09-22).
 *
 * Las dos cosas viajan en el link junto con la build: `g=` y `a=`.
 */

export interface GuideCategory {
  id: string;
  name: string;
  desc: string;
  /** Ancho del recuadro, en columnas de tarjeta. */
  width: number;
  items: number[];
}

export const GUIDE_MAX_CATEGORIES = 12;
export const GUIDE_MAX_ITEMS = 30;
export const GUIDE_NAME_MAX = 40;
export const GUIDE_DESC_MAX = 80;
export const GUIDE_MIN_WIDTH = 3;
export const GUIDE_MAX_WIDTH = 12;
export const GUIDE_DEFAULT_WIDTH = 8;

let secuencia = 0;
/** Un id local, sólo para que React y el editor distingan categorías. */
export const newCategoryId = (): string => `c${Date.now().toString(36)}${(secuencia++).toString(36)}`;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export function addCategory(guide: GuideCategory[], name: string, desc = ""): GuideCategory[] {
  if (guide.length >= GUIDE_MAX_CATEGORIES) return guide;
  return [
    ...guide,
    { id: newCategoryId(), name: name.slice(0, GUIDE_NAME_MAX), desc: desc.slice(0, GUIDE_DESC_MAX), width: GUIDE_DEFAULT_WIDTH, items: [] },
  ];
}

export const removeCategory = (guide: GuideCategory[], id: string): GuideCategory[] => guide.filter((c) => c.id !== id);

export function updateCategory(
  guide: GuideCategory[],
  id: string,
  cambio: Partial<Pick<GuideCategory, "name" | "desc" | "width">>
): GuideCategory[] {
  return guide.map((c) =>
    c.id !== id
      ? c
      : {
          ...c,
          ...(cambio.name !== undefined ? { name: cambio.name.slice(0, GUIDE_NAME_MAX) } : {}),
          ...(cambio.desc !== undefined ? { desc: cambio.desc.slice(0, GUIDE_DESC_MAX) } : {}),
          ...(cambio.width !== undefined ? { width: clamp(cambio.width, GUIDE_MIN_WIDTH, GUIDE_MAX_WIDTH) } : {}),
        }
  );
}

/** Sube (−1) o baja (+1) una categoría un lugar. */
export function moveCategory(guide: GuideCategory[], id: string, dir: -1 | 1): GuideCategory[] {
  const i = guide.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= guide.length) return guide;
  const out = [...guide];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function addToCategory(guide: GuideCategory[], id: string, itemId: number): GuideCategory[] {
  return guide.map((c) =>
    c.id !== id || c.items.includes(itemId) || c.items.length >= GUIDE_MAX_ITEMS ? c : { ...c, items: [...c.items, itemId] }
  );
}

export function removeFromCategory(guide: GuideCategory[], id: string, itemId: number): GuideCategory[] {
  return guide.map((c) => (c.id !== id ? c : { ...c, items: c.items.filter((x) => x !== itemId) }));
}

/**
 * Mueve un objeto de una categoría a una posición de otra (o de la misma).
 * `index` es la posición en la categoría de destino *antes* de insertarlo; si
 * el destino ya tiene el objeto y es otra categoría, no se duplica.
 */
export function moveItem(
  guide: GuideCategory[],
  from: string,
  itemId: number,
  to: string,
  index: number
): GuideCategory[] {
  const destino = guide.find((c) => c.id === to);
  const origen = guide.find((c) => c.id === from);
  if (!destino || !origen || !origen.items.includes(itemId)) return guide;
  if (from !== to && destino.items.includes(itemId)) return guide;
  if (from !== to && destino.items.length >= GUIDE_MAX_ITEMS) return guide;

  return guide.map((c) => {
    let items = c.items;
    if (c.id === from) items = items.filter((x) => x !== itemId);
    if (c.id === to) {
      // En la misma categoría, sacar el objeto corre una posición a los que
      // estaban después: se compensa para que caiga donde se soltó.
      const viejo = c.items.indexOf(itemId);
      const donde = from === to && viejo !== -1 && viejo < index ? index - 1 : index;
      const base = from === to ? items : c.items;
      const pos = clamp(donde, 0, base.length);
      items = [...base.slice(0, pos), itemId, ...base.slice(pos)];
    }
    return items === c.items ? c : { ...c, items };
  });
}

/* ── Orden de habilidades ──────────────────────────────────────────── */

/** Un desbloqueo y tres mejoras. */
export const ABILITY_MAX_POINTS = 4;
export const ABILITY_PATH_MAX = 16;
/** Lo que cuesta cada mejora en puntos de habilidad, como lo rotula el juego. */
export const UPGRADE_COSTS = [1, 2, 5] as const;

export function addAbilityPoint(path: number[], abilityId: number): number[] {
  if (path.length >= ABILITY_PATH_MAX) return path;
  if (path.filter((x) => x === abilityId).length >= ABILITY_MAX_POINTS) return path;
  return [...path, abilityId];
}

/** Qué pone cada paso: `null` es el desbloqueo, 1/2/5 el costo de la mejora. */
export function stepLabels(path: number[]): (number | null)[] {
  const vistos = new Map<number, number>();
  return path.map((id) => {
    const n = vistos.get(id) ?? 0;
    vistos.set(id, n + 1);
    return n === 0 ? null : UPGRADE_COSTS[n - 1] ?? null;
  });
}

/* ── En el link ────────────────────────────────────────────────────── */

/** `encodeURIComponent` deja pasar `.`, `_` y `~`, que acá son separadores. */
const esc = (s: string) =>
  encodeURIComponent(s).replace(/\./g, "%2E").replace(/_/g, "%5F").replace(/~/g, "%7E");
const des = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
};

/**
 * `ancho.ids.en.base36_nombre_descripcion`, las categorías separadas por `~`.
 * El nombre y la descripción van codificados para que ningún `_`, `~` o `.` que
 * escriba el jugador rompa el formato.
 */
export function encodeGuide(guide: GuideCategory[]): string {
  return guide
    .map((c) => [[c.width, ...c.items.map((i) => i.toString(36))].join("."), esc(c.name), esc(c.desc)].join("_"))
    .join("~");
}

export function decodeGuide(s: string): GuideCategory[] {
  if (!s) return [];
  const out: GuideCategory[] = [];
  for (const parte of s.split("~").slice(0, GUIDE_MAX_CATEGORIES)) {
    const [numeros = "", nombre = "", desc = ""] = parte.split("_");
    const [ancho, ...ids] = numeros.split(".");
    const items: number[] = [];
    for (const x of ids) {
      if (!/^[0-9a-z]+$/.test(x)) continue;
      const id = parseInt(x, 36);
      if (Number.isFinite(id) && !items.includes(id)) items.push(id);
      if (items.length >= GUIDE_MAX_ITEMS) break;
    }
    const w = parseInt(ancho ?? "", 10);
    out.push({
      id: newCategoryId(),
      name: des(nombre).slice(0, GUIDE_NAME_MAX),
      desc: des(desc).slice(0, GUIDE_DESC_MAX),
      width: Number.isFinite(w) ? clamp(w, GUIDE_MIN_WIDTH, GUIDE_MAX_WIDTH) : GUIDE_DEFAULT_WIDTH,
      items,
    });
  }
  return out;
}

/** El orden de habilidades como casillas del juego (1-4), un dígito por paso. */
export function encodeAbilityPath(path: number[], slotOf: (id: number) => number | undefined): string {
  return path.map((id) => slotOf(id) ?? "").join("");
}

export function decodeAbilityPath(s: string, idOfSlot: (slot: number) => number | undefined): number[] {
  let path: number[] = [];
  for (const ch of s.slice(0, ABILITY_PATH_MAX)) {
    const id = idOfSlot(Number(ch));
    if (id !== undefined) path = addAbilityPoint(path, id);
  }
  return path;
}
