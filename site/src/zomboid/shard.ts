/**
 * En qué archivo está la ficha de un objeto o una receta de Project Zomboid (2026-09-30). `site.py` reparte las fichas
 * en 100 archivos por pestaña (`@zomboid/site/items/<NN>.json`) para que cada página baje uno solo (~10 KB con gzip) y
 * no las 3.826: el número sale del slug, así que la página lo calcula sin bajar ningún índice.
 *
 * FNV-1a de 32 bits sobre los bytes UTF-8 del slug, módulo 100, con dos dígitos ("07"). Es `shard()` de
 * `games/zomboid/tools/site.py` paso por paso: si se cambia uno se cambia el otro (lo prueba
 * `site/test/zomboidSiteData.test.ts`, que busca cada ficha real en el archivo que dice esta función).
 *
 * El botín (2026-10-01, `loot.py`) reparte igual: por objeto en 100 archivos (`@zomboid/loot/items/<NN>.json`, con
 * `pzShard`) y por habitación del mapa en 32 (`@zomboid/loot/rooms/<NN>.json`, con `pzShardOf(nombre, 32)`).
 */
/** 100 y no 64: con 64, tres archivos de objetos pasaban los 120 KB (ver `SHARDS` en site.py). Dos dígitos: 00 a 99. */
export const PZ_SHARDS = 100;
/** Los archivos del botín por habitación: ~375 habitaciones del mapa con tabla, ~12 por archivo. `ROOM_SHARDS` de loot.py. */
export const PZ_LOOT_ROOM_SHARDS = 32;

const encoder = new TextEncoder();

/** FNV-1a de 32 bits sobre los bytes UTF-8 de `s`, sin signo: `fnv1a32` de site.py. */
export function pzHash(s: string): number {
  let h = 0x811c9dc5;
  for (const b of encoder.encode(s)) {
    h ^= b;
    // `Math.imul` multiplica en 32 bits como el `& 0xFFFFFFFF` de Python; `>>> 0` lo deja sin signo.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** El archivo de una clave entre `n` (como mucho 100, para que el nombre siga siendo de dos dígitos): `shard(key, n)`. */
export function pzShardOf(key: string, n: number): string {
  return String(pzHash(key) % n).padStart(2, "0");
}

export function pzShard(slug: string): string {
  return pzShardOf(slug, PZ_SHARDS);
}
