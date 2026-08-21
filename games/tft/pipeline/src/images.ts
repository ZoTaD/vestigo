import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planImages, assertNoCollisions, type CatalogSection } from "./image-plan";

// Rutas relativas a este archivo, igual que catalog.ts. Este script lee el
// catálogo que catalog.ts ya escribió — no lo reconstruye — así que reponer
// las imágenes nunca obliga a pagar los 71 MB de map22.bin.json que catalog.ts
// baja para los códigos de Team Planner.
const CATALOG_PATH = new URL("../../data/catalog.json", import.meta.url);
const IMG_BASE = new URL("../../ui/public/img/", import.meta.url);

// 700+ descargas una por una tardan minutos; todas a la vez abren 700 sockets
// de golpe contra un servidor que no es nuestro. Un pool chico es un término
// medio razonable.
const CONCURRENCY = 12;

interface Catalog {
  set: string;
  champions: CatalogSection;
  traits: CatalogSection;
  items: CatalogSection;
}

/** Baja una URL a disco. Devuelve false — nunca tira — si algo falla. */
async function downloadOne(url: string, destPath: URL): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`respondió ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(destPath, buf);
    return true;
  } catch (e) {
    console.warn(`  no se pudo bajar ${url}: ${(e as Error).message}`);
    return false;
  }
}

/** Un pool de concurrencia mínimo: N workers que van sacando de la misma cola. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf-8")) as Catalog;
  const set = catalog.set;
  if (!set) throw new Error("catalog.json no tiene campo `set`");

  const sections = [catalog.champions, catalog.traits, catalog.items];
  const plan = planImages(sections);
  assertNoCollisions(plan);

  // El número de set va en la ruta, no solo en el nombre de archivo: los
  // archivos de public/ no llevan hash de contenido, así que sin el set en la
  // ruta un cambio de set serviría arte viejo desde la caché del navegador.
  const setDir = new URL(`set${set}/`, IMG_BASE);
  mkdirSync(setDir, { recursive: true });

  console.log(`plan: ${plan.size} imágenes únicas para el set ${set}`);

  let downloaded = 0;
  let alreadyPresent = 0;
  const failedUrls = new Set<string>();

  await pool([...plan.entries()], CONCURRENCY, async ([url, filename]) => {
    const destPath = new URL(filename, setDir);
    if (existsSync(destPath)) {
      alreadyPresent++;
      return;
    }
    const ok = await downloadOne(url, destPath);
    if (ok) downloaded++;
    else failedUrls.add(url);
  });

  // Reescribe `img` a la ruta local, salvo las que fallaron: esas conservan la
  // URL remota, el mismo criterio que catalog.ts ya usa con map22 — un fallo
  // parcial arma un catálogo usable con un aviso, no un catálogo roto.
  let rewritten = 0;
  for (const section of sections) {
    for (const entry of Object.values(section)) {
      if (!entry.img || failedUrls.has(entry.img)) continue;
      const filename = plan.get(entry.img);
      if (!filename) continue; // ya era una ruta local de una corrida anterior
      entry.img = `/img/set${set}/${filename}`;
      rewritten++;
    }
  }

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), "utf-8");

  console.log(
    `imágenes: ${downloaded} bajadas, ${alreadyPresent} ya presentes, ${failedUrls.size} fallidas ` +
      `(de ${plan.size} URLs únicas) — ${rewritten} campos \`img\` reescritos a ${fileURLToPath(setDir)}`
  );
  if (failedUrls.size > 0) {
    console.warn(
      `advertencia: ${failedUrls.size} imagen(es) no se pudieron bajar; esas entradas conservan su URL remota de CommunityDragon`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
