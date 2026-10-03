/**
 * Cómo bajan sus datos las pestañas de Project Zomboid con fichas (2026-09-30): la lista liviana, pedida una sola vez, y
 * las fichas repartidas en 100 archivos por el hash del slug (`shard.ts`), cada archivo pedido una sola vez. Nació en
 * `items/data.ts` y subió acá con Recetas, que carga igual: `load*` pide, `peek*` devuelve lo que ya llegó para el
 * primer render (y para el prerender, que espera a `preload*Route`).
 *
 * Las funciones de `import()` las pone cada pestaña (`import.meta.glob` y `import()` tienen que ir escritos en su
 * archivo para que Vite los vea y arme un chunk por archivo de datos): acá sólo va qué hacer con ellas.
 */
import { pzShard } from "./shard";

type Mod<T> = { default: T };

/** Algo que se pide una sola vez (la lista de una pestaña). Si falla, la próxima llamada lo vuelve a pedir. */
export function once<T>(importer: () => Promise<Mod<unknown>>) {
  let value: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    peek: (): T | null => value,
    load(): Promise<T> {
      pending ??= importer().then(
        (m) => (value = m.default as T),
        (err) => {
          // Un corte de red no deja la lista perdida hasta recargar: la próxima llamada la vuelve a pedir.
          pending = null;
          throw err;
        },
      );
      return pending;
    },
  };
}

/**
 * Las fichas de una pestaña, repartidas en archivos (`NN.json`). `files` es lo que da `import.meta.glob` sin `eager`: un
 * cargador por archivo, así Vite arma un chunk por archivo y nada entra en el de la pestaña. Se busca por número ("07") y
 * no por la ruta que usa de clave, que depende de cómo resuelva el alias.
 *
 * `shardOf` dice en qué archivo vive una clave: por defecto el de las fichas (`pzShard`, 100 archivos); el botín por
 * habitación usa otro reparto (`pzShardOf(clave, 32)`).
 */
export function shardedFichas<T>(
  files: Record<string, () => Promise<Mod<Record<string, T>>>>,
  shardOf: (key: string) => string = pzShard,
) {
  type Shard = Record<string, T>;
  const loaders = new Map(
    Object.entries(files).flatMap(([path, load]) => {
      const n = path.match(/(\d+)\.json$/)?.[1];
      return n ? [[n, load] as const] : [];
    }),
  );
  const shards = new Map<string, Shard>();
  const pending = new Map<string, Promise<Shard>>();

  function loadShard(n: string): Promise<Shard> {
    let p = pending.get(n);
    if (!p) {
      const load = loaders.get(n);
      // Un número sin archivo no pasa con datos sanos (el test de site.py lo cuida): se toma como un archivo vacío.
      p = (load ? load().then((m) => m.default) : Promise.resolve({} as Shard)).then(
        (s) => {
          shards.set(n, s);
          return s;
        },
        (err) => {
          pending.delete(n);
          throw err;
        },
      );
      pending.set(n, p);
    }
    return p;
  }

  // `hasOwn`: un slug que viene de la dirección (`/items/constructor`) no puede tropezar con `Object.prototype`.
  const pick = (shard: Shard, slug: string): T | null => (Object.hasOwn(shard, slug) ? shard[slug] : null);

  return {
    /** La ficha si su archivo ya llegó: `undefined` si todavía no, `null` si llegó y no está (un slug que no existe). */
    peek(slug: string): T | null | undefined {
      const shard = shards.get(shardOf(slug));
      return shard ? pick(shard, slug) : undefined;
    },
    /** Pide el archivo donde vive la ficha; `null` si no está. */
    load(slug: string): Promise<T | null> {
      return loadShard(shardOf(slug)).then((s) => pick(s, slug));
    },
  };
}
