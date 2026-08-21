/**
 * La parte pura de bajar las imágenes del catálogo a nuestro propio dominio:
 * qué nombre de archivo le toca a cada URL remota, y detectar si dos URLs
 * distintas terminarían pisándose. Sin red ni disco, así que los tests la
 * ejercitan directo.
 *
 * Separado de images.ts a propósito, igual que catalog-text.ts está separado
 * de catalog.ts: ese otro archivo es el script — importarlo dispara ~700
 * descargas.
 */
import { createHash } from "node:crypto";

/** Una entrada del catálogo (campeón, trait o ítem) tal como la ve este módulo. */
export interface ImageOwner {
  img: string;
  [key: string]: unknown;
}

export type CatalogSection = Record<string, ImageOwner>;

/**
 * Nombre de archivo estable para una URL de CommunityDragon.
 *
 * No es el basename de la URL: CommunityDragon repite basenames entre
 * carpetas distintas (dos "..._square.png" bajo rutas de personaje distintas,
 * por ejemplo — pasa con al menos 8 pares en el catálogo del set 17). Hashear
 * la URL completa evita eso: la misma URL da siempre el mismo archivo, y dos
 * URLs distintas no pueden terminar en el mismo nombre salvo colisión de
 * SHA-1, que assertNoCollisions verifica igual en vez de darla por descontada.
 */
export function localImageName(url: string): string {
  const hash = createHash("sha1").update(url).digest("hex");
  const ext = /\.[a-zA-Z0-9]+$/.exec(new URL(url).pathname)?.[0] ?? "";
  return `${hash}${ext}`;
}

/**
 * Toda URL remota distinta que aparece en champions/traits/items, mapeada al
 * archivo local que le toca. Una entrada cuyo `img` ya es una ruta local (una
 * corrida anterior ya la bajó) no entra al plan — así una segunda corrida no
 * vuelve a pedir nada que ya está.
 */
export function planImages(sections: CatalogSection[]): Map<string, string> {
  const plan = new Map<string, string>();
  for (const section of sections) {
    for (const entry of Object.values(section)) {
      if (!entry.img || !/^https?:\/\//.test(entry.img)) continue;
      if (!plan.has(entry.img)) plan.set(entry.img, localImageName(entry.img));
    }
  }
  return plan;
}

/**
 * Tira si dos URLs distintas quedaron asignadas al mismo nombre de archivo.
 * Sin este chequeo, la segunda pisaría en disco a la primera en silencio.
 */
export function assertNoCollisions(plan: Map<string, string>): void {
  const byName = new Map<string, string>();
  for (const [url, name] of plan) {
    const prior = byName.get(name);
    if (prior && prior !== url) {
      throw new Error(`colisión de nombre de imagen: "${name}" corresponde tanto a ${prior} como a ${url}`);
    }
    byName.set(name, url);
  }
}
