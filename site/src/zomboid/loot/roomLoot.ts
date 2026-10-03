/**
 * Qué puede aparecer en cada habitación del Mapa de Project Zomboid (2026-10-02), tal como lo escribe
 * `games/zomboid/tools/loot.py` en `loot/rooms/<NN>.json`: por nombre de cuarto del juego (`kitchen`, `garage`, con
 * mayúsculas y números como los tiene el mapa), la tabla que usa, cuántos objetos puede traer y los 30 más probables, con
 * los nombres de los objetos y de los muebles en el mismo archivo. `_all` es lo de cualquier lugar sin botín propio.
 *
 * Sólo lo importa la hoja del edificio (`map/BuildingSheet.tsx`), así los 32 cargadores viajan en ese chunk y no en el de
 * la pestaña. Cada archivo es un `import()` aparte: tocar un edificio baja sólo los de sus habitaciones (y el de `_all`).
 */
import { PZ_LOOT_ROOM_SHARDS, pzShardOf } from "../shard";
import { shardedFichas } from "../store";

/** Un objeto en "Qué hay": su ficha, el mueble que más lo trae y la chance de que uno de esos muebles lo traiga. */
export interface RoomLootRow {
  id: string;
  en: string;
  es: string;
  icon: string | null;
  /** El mueble, `[inglés, español]`. */
  cont: [string, string];
  p: number;
  /** Si sólo sale con una condición: `t`, `r`, `i` o `z:<zona>` (ver `LootRow` en `data.ts`). */
  force?: string;
}

export interface RoomLootView {
  /** `false`: ninguno de los nombres tiene tabla propia y se muestra lo de `_all`. */
  own: boolean;
  /** Cuántos objetos distintos puede traer: la mayor `n` entre los nombres con tabla, o la de `_all`. */
  n: number;
  top: RoomLootRow[];
}

/** Un archivo tal cual lo escribe loot.py. */
interface RoomFile {
  items: Record<string, [en: string, es: string, icon: string | null]>;
  conts: Record<string, [en: string, es: string]>;
  rooms: Record<string, { t: string; n: number; top: [slug: string, cont: string, p: number, force?: string][] }>;
}

/** Una habitación con sus filas ya nombradas: así la lista no vuelve a buscar en el archivo en cada dibujo. */
interface RoomEntry {
  t: string;
  n: number;
  top: RoomLootRow[];
}

const TOP = 30;
const ALL = "_all";

/** El archivo pasado a `{ nombre del cuarto: sus filas }`, que es lo que sabe repartir `shardedFichas`. */
function named({ default: f }: { default: RoomFile }): { default: Record<string, RoomEntry> } {
  const out: Record<string, RoomEntry> = {};
  for (const [raw, r] of Object.entries(f.rooms))
    out[raw] = {
      t: r.t,
      n: r.n,
      top: r.top.map(([id, cont, p, force]) => {
        const [en, es, icon] = f.items[id];
        const row: RoomLootRow = { id, en, es, icon, cont: f.conts[cont] ?? [cont, cont], p };
        if (force) row.force = force;
        return row;
      }),
    };
  return { default: out };
}

// El `import.meta.glob` va escrito acá (sin `eager`) para que Vite arme un chunk por archivo; cada cargador se envuelve
// para nombrar las filas una sola vez, al llegar.
const files = Object.fromEntries(
  Object.entries(import.meta.glob<{ default: RoomFile }>("@zomboid/loot/rooms/*.json")).map(([path, load]) => [
    path,
    () => load().then(named),
  ]),
);
const rooms = shardedFichas<RoomEntry>(files, (raw) => pzShardOf(raw, PZ_LOOT_ROOM_SHARDS));

/** Los nombres a pedir: los del grupo más `_all`, sin repetir. */
const wanted = (raws: string[]) => [...new Set([...raws, ALL])];

/**
 * Pide los archivos de esos nombres y el de `_all`, una vez cada uno. Si uno falla, la próxima llamada lo vuelve a pedir
 * (`shardedFichas` olvida el pedido fallido).
 */
export async function loadRoomLoot(raws: string[]): Promise<void> {
  await Promise.all(wanted(raws).map((raw) => rooms.load(raw)));
}

/**
 * Lo que puede aparecer en un grupo de habitaciones ("Dormitorio ×3" puede ser `bedroom` y `bedroom4`): `undefined` si
 * falta algún archivo. Junta las filas de los nombres con tabla propia, cada objeto una vez con su mayor chance (y su
 * mueble), de la más alta a la más baja y a la par por slug, hasta 30. Si ninguno tiene tabla, lo de `_all`.
 */
export function roomLootFor(raws: string[]): RoomLootView | null | undefined {
  const all = rooms.peek(ALL);
  const entries = raws.map((raw) => rooms.peek(raw));
  if (all === undefined || entries.includes(undefined)) return undefined;
  const own = entries.filter((e): e is RoomEntry => !!e);
  if (!own.length) return all ? { own: false, n: all.n, top: all.top } : null;
  const best = new Map<string, RoomLootRow>();
  for (const e of own)
    for (const row of e.top) {
      const had = best.get(row.id);
      if (!had || row.p > had.p) best.set(row.id, row);
    }
  const top = [...best.values()].sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, TOP);
  return { own: true, n: Math.max(...own.map((e) => e.n)), top };
}
