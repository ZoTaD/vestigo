import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { redirectsFile, ROBOTS_TXT, SITEMAP_GROUPS, sitemapFile, sitemapIndexXml, sitemapXml, type RustSitemapData, type SitemapData, type ZomboidSitemapData } from "./src/sitemap";
import { prerenderPages, renderHtml, ogImagePath, stripComments } from "./src/prerender";
import { renderOg } from "./og/og";
import { ogSpecs, type OgData } from "./og/pages";
import { parseRoute, registerD2rSlugs, registerPzSlugs, registerRustSlugs, type Route } from "./src/route";
import { buildD2rEsSlugs } from "./src/d2r/slugs";
import { isRsLoadingPage } from "./src/rust/loadingGuard";
import { farmingPages, monumentsPages, patchesPages, type RustPage } from "./src/rust/sitemapPages";
import { CIRCUITS, circuitSlugsEs } from "./src/rust/electric/circuits";
import { buildEsSlugs } from "./src/esSlugs";
import type { D2IndexEntry } from "./src/d2r/index";
import { COPY } from "./src/i18n";
import { AREA_FILES, D2R_TAB_FILES, DEADLOCK_TAB_FILES, filesFor, originsFor, PZ_TAB_FILES, RUST_TAB_FILES } from "./src/areaFiles";

/** El nombre del producto sale de la copia, como todo el resto del texto. */
const BRAND = COPY.en.brand;

const deadlockDir = fileURLToPath(new URL("../games/deadlock/data", import.meta.url));
const poe2Dir = fileURLToPath(new URL("../games/poe2/data", import.meta.url));
// Valheim (2026-09-24): lo que arma `games/valheim/pipeline/site.py`, una lista por pestaña.
const valheimDir = fileURLToPath(new URL("../games/valheim/data/site", import.meta.url));
// El mapa por semilla (2026-09-25): las tablas de lugares que saca `pipeline/map_data.py`.
const valheimMapDir = fileURLToPath(new URL("../games/valheim/data/map", import.meta.url));
// Diablo II: Resurrected (2026-09-29): lo que escribe `games/d2r/tools/extract.py`.
const d2rDir = fileURLToPath(new URL("../games/d2r/data", import.meta.url));
// Project Zomboid (2026-09-30): lo que escriben `games/zomboid/tools/extract.py` y `map.py`.
const zomboidDir = fileURLToPath(new URL("../games/zomboid/data", import.meta.url));
// Rust (2026-10-05): lo que escribe `games/rust/tools/extract.py`.
const rustDir = fileURLToPath(new URL("../games/rust/data", import.meta.url));

/**
 * Las imágenes de Deadlock, servidas desde el sitio y no desde deadlock-api.
 *
 * Los JSON de la pipeline guardan URLs de `assets-bucket.deadlock-api.com`, que
 * es una copia de las carpetas del juego y ya se cayó una vez (2026-09-19).
 * `games/deadlock/tools/game_assets.py` saca esas mismas imágenes del juego
 * instalado a `public/deadlock/game/` y deja un `manifest.json` (ruta del bucket
 * → archivo local). Acá, al importar cualquier JSON de `@deadlock`, cada URL del
 * bucket que tiene copia local se cambia por la local; la que no, queda como
 * estaba. La pipeline y los componentes no se enteran.
 */
function localDeadlockAssets(): Plugin {
  const BUCKET = "https://assets-bucket.deadlock-api.com/assets-api-res/";
  const manifestPath = fileURLToPath(new URL("./public/deadlock/game/manifest.json", import.meta.url));
  const manifest: Record<string, string> = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf-8"))
    : {};
  const rx = /https:\/\/assets-bucket\.deadlock-api\.com\/assets-api-res\/[^"\s]+/g;
  return {
    name: "vestigo-local-deadlock-assets",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0].replaceAll("\\", "/");
      if (!file.endsWith(".json") || !file.startsWith(deadlockDir.replaceAll("\\", "/"))) return null;
      let n = 0;
      const out = code.replace(rx, (url) => {
        const local = manifest[url.slice(BUCKET.length)];
        if (!local) return url;
        n++;
        return `/deadlock/game/${local}`;
      });
      return n ? { code: out, map: null } : null;
    },
  };
}

/**
 * Lo que el sitemap y el prerender necesitan de los JSON de Deadlock. Los dos
 * plugins leían lo mismo cada uno por su cuenta; desde que TFT salió del sitio
 * (2026-09-15) es una sola lectura, acá.
 */
function readSitemapData(): { data: OgData } {
  const readDl = (name: string) => JSON.parse(readFileSync(`${deadlockDir}/${name}`, "utf-8"));
  const readDlMaybe = (name: string) => {
    try {
      return readDl(name);
    } catch {
      return null;
    }
  };
  const dlCatalog = readDl("catalog.json");
  const dlHeroesFile = readDl("heroes.json");
  const dlItemsFile = readDl("items.json");
  // Las ediciones de Vestigo News. El índice puede faltar en un checkout
  // anterior al 2026-09-17; en ese caso simplemente no hay páginas de edición.
  const news = readDlMaybe("news.json") as { editions: SitemapData["dlNews"] } | null;
  const dlNews = news?.editions ?? [];
  const dlEditions: OgData["dlEditions"] = {};
  for (const e of dlNews) {
    const ed = readDlMaybe(`news/${e.slug}.json`);
    if (!ed) continue;
    dlEditions[e.slug] = {
      nerfed: (ed.heroes as { heroId: number; verdict: string }[]).filter((h) => h.verdict === "nerf").map((h) => h.heroId),
      totals: ed.totals,
    };
  }
  // Path of Exile 2: las ligas, las fichas de la enciclopedia y las ediciones
  // del diario. Si falta alguno (un checkout sin los pipelines corridos), PoE2
  // queda afuera del sitemap en vez de tirar el build.
  const readP2 = (name: string) => {
    try {
      return JSON.parse(readFileSync(`${poe2Dir}/${name}`, "utf-8"));
    } catch {
      return null;
    }
  };
  const p2Leagues = readP2("economy/leagues.json");
  const p2Index = readP2("encyclopedia/index.json");
  const p2Patches = readP2("patches/index.json");
  const p2: SitemapData["p2"] =
    p2Leagues && p2Index && p2Patches
      ? {
          leagues: p2Leagues.leagues.map((l: { slug: string; name: string }) => ({ slug: l.slug, name: l.name })),
          entries: p2Index.map((e: { id: string; cat: string; en: string; es: string }) => ({ id: e.id, cat: e.cat, en: e.en, es: e.es })),
          editions: p2Patches.editions,
        }
      : undefined;
  // Valheim: el índice de la sección y las ediciones de la Crónica. Igual que
  // PoE2, si faltan queda afuera del sitemap en vez de tirar el build.
  const readVh = (name: string) => {
    try {
      return JSON.parse(readFileSync(`${valheimDir}/${name}`, "utf-8"));
    } catch {
      return null;
    }
  };
  const vhIndex = readVh("index.json");
  const vhPatches = readVh("patches/index.json");
  const vh: SitemapData["vh"] =
    vhIndex && vhPatches
      ? {
          entries: vhIndex.map((e: { slug: string; tab: string; en: string; es: string }) => ({ slug: e.slug, tab: e.tab, en: e.en, es: e.es })),
          editions: vhPatches.editions,
        }
      : undefined;
  // Diablo II: la portada, las pestañas, las fichas de la wiki y de los jefes de la calculadora de drops, y los parches.
  // Sin el extractor corrido, afuera del sitemap.
  let d2: SitemapData["d2"];
  try {
    d2 = JSON.parse(readFileSync(`${d2rDir}/meta.json`, "utf-8"));
    d2!.index = readD2Index();
    // Las direcciones en español de esas fichas (`/es/d2r/unicos/la-rechinante`), antes de armar ninguna.
    registerD2rSlugs(buildD2rEsSlugs(d2!.index));
    try {
      d2!.patches = JSON.parse(readFileSync(`${d2rDir}/patches/index.json`, "utf-8"));
    } catch {
      /* todavía sin parches */
    }
  } catch {
    d2 = undefined;
  }
  // Project Zomboid (2026-09-30): el sello del extractor y las fichas. Sin el sello, la sección queda afuera del sitemap.
  let zb: SitemapData["zb"];
  try {
    const m = JSON.parse(readFileSync(`${zomboidDir}/meta.json`, "utf-8"));
    const index = readPzIndex();
    // El mapa tiene su propio sello (`map.py`): sin él, el sitemap usa el del extractor para la pestaña.
    let mapExtractedAt: string | undefined;
    try {
      mapExtractedAt = JSON.parse(readFileSync(`${zomboidDir}/map/meta.json`, "utf-8")).extractedAt;
    } catch {
      mapExtractedAt = undefined;
    }
    // Y el botín, el suyo (`loot.py`): mueve la fecha de Objetos y la del Mapa. Sin él, todo queda como estaba.
    let lootExtractedAt: string | undefined;
    try {
      lootExtractedAt = JSON.parse(readFileSync(`${zomboidDir}/loot/meta.json`, "utf-8")).extractedAt;
    } catch {
      lootExtractedAt = undefined;
    }
    // Las versiones de la pestaña Parches (2026-10-02), con su fecha: cada página va al sitemap con la suya. Sin el
    // archivo (site.py sin correr), la pestaña queda sin páginas de versión.
    let patches: ZomboidSitemapData["patches"];
    try {
      type Meta = { slug: string; version: string; date: string; updated?: string };
      patches = (JSON.parse(readFileSync(`${zomboidDir}/site/patches/index.json`, "utf-8")).patches as Meta[]).map(
        ({ slug, version, date, updated }) => ({ slug, version, date, updated }),
      );
    } catch {
      patches = undefined;
    }
    zb = { version: m.version, extractedAt: m.extractedAt, mapExtractedAt, lootExtractedAt, index, patches };
    // Las direcciones en español de esas fichas (`/es/project-zomboid/objetos/palanca`), antes de armar ninguna, igual
    // que Diablo II.
    registerPzSlugs(buildEsSlugs(index, []));
  } catch {
    zb = undefined;
  }
  // Rust (2026-10-05): el sello del extractor y las fichas de Objetos. Sin el sello, la sección queda afuera del sitemap;
  // sin la lista (site_data.py sin correr), sin fichas. Los slugs en español se anotan antes de armar ninguna dirección:
  // si no, `/es/rust/objetos/fusil-de-asalto` llega al prerender sin traducir y la ficha sale con la hoja de "cargando…".
  let rs: SitemapData["rs"];
  try {
    const m = JSON.parse(readFileSync(`${rustDir}/meta.json`, "utf-8"));
    let items: RustSitemapData["items"];
    let list: { rows: NonNullable<RustSitemapData["items"]> } | undefined;
    try {
      list = JSON.parse(readFileSync(`${rustDir}/site/list.json`, "utf-8"));
    } catch {
      list = undefined; // sin site_data.py corrido: sin fichas, y está bien
    }
    if (list) {
      try {
        registerRustSlugs(JSON.parse(readFileSync(`${rustDir}/site/slugs-es.json`, "utf-8")));
        items = list.rows.map(({ slug, en, es, c, s, l, r }) => ({ slug, en, es, c, s, l, r }));
      } catch (e) {
        // Con la lista pero sin los slugs en español, las fichas no entran (saldrían con la hoja de "cargando…"):
        // se avisa para que no parezca que Rust simplemente no tiene fichas.
        console.warn(`[rust] hay list.json pero slugs-es.json falta o no se pudo leer (${(e as Error).message}); el sitemap y el prerender salen sin fichas.`);
        items = undefined;
      }
    }
    // Etapa 2 (2026-10-09): las fichas de Granjas (y las pestañas que vengan), con sus slugs en español anotados antes.
    const pages: RustPage[] = [];
    try {
      const farming = JSON.parse(readFileSync(`${rustDir}/farming.json`, "utf-8"));
      registerRustSlugs(JSON.parse(readFileSync(`${rustDir}/site/farming-slugs-es.json`, "utf-8")));
      pages.push(...farmingPages(farming));
    } catch (e) {
      console.warn(`[rust] sin las fichas de Granjas (${(e as Error).message})`);
    }
    try {
      const mons = JSON.parse(readFileSync(`${rustDir}/monuments.json`, "utf-8"));
      registerRustSlugs(JSON.parse(readFileSync(`${rustDir}/site/monuments-slugs-es.json`, "utf-8")));
      pages.push(...monumentsPages(mons));
    } catch (e) {
      console.warn(`[rust] sin las fichas de Monumentos (${(e as Error).message})`);
    }
    try {
      pages.push(...patchesPages(JSON.parse(readFileSync(`${rustDir}/patches/index.json`, "utf-8"))));
    } catch (e) {
      console.warn(`[rust] sin las ediciones de Parches (${(e as Error).message})`);
    }
    // Los circuitos listos de Electricidad (2026-10-09): sus slugs en español y su nombre (lo anota `circuits.ts`).
    registerRustSlugs({ electricity: circuitSlugsEs() });
    rs = { build: m.build, extractedAt: m.extractedAt, items, circuits: CIRCUITS.map((c) => c.slug), pages };
  } catch {
    rs = undefined;
  }
  return {
    data: {
      p2,
      vh,
      d2,
      zb,
      rs,
      // Los sellos de cada pipeline, para el `lastmod` del sitemap. La
      // enciclopedia de PoE2 no tiene sello y va sin fecha.
      dates: {
        deadlock: dlHeroesFile.generatedAt,
        poe2Economy: p2Leagues?.updated,
        valheim: readVh("meta.json")?.extractedAt,
        d2r: d2?.extractedAt,
        zomboid: zb?.extractedAt,
        rust: rs?.extractedAt,
      },
      dlHeroes: dlCatalog.heroes,
      dlItems: dlCatalog.items,
      dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
      dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
      dlNews,
      dlHeroStats: { band: dlHeroesFile.band, heroes: dlHeroesFile.heroes },
      dlEditions,
    },
  };
}

/**
 * Las fichas de Diablo II: las de la wiki (runas, palabras rúnicas, únicos, conjuntos, clases) y las de los jefes y
 * superúnicos de la calculadora de drops. Sin un índice, la sección entra sólo con lo del otro (o con sus pestañas).
 */
function readD2Index(): D2IndexEntry[] {
  const read = (file: string): D2IndexEntry[] => {
    try {
      return JSON.parse(readFileSync(`${d2rDir}/${file}`, "utf-8"));
    } catch {
      return []; // sin wiki.py o drops.py corrido
    }
  };
  return [...read("wiki/index.json"), ...read("drops/index.json")];
}

/**
 * Las fichas de Project Zomboid (objetos, recetas, rasgos, profesiones, habilidades y moodles), del `index.json` que
 * escribe `games/zomboid/tools/extract.py`. Sin el extractor corrido, ninguna, y lo avisa una vez: sin eso, el build
 * salía sin una sola ficha de Zomboid en el sitemap y sin decir por qué.
 *
 * Se guarda la lectura mientras el archivo no cambie (la fecha de modificación): los plugins de slugs y de nombres la
 * piden en cada `resolveId`, y releer y parsear ~5.000 fichas por cada import era trabajo tirado. El servidor de
 * desarrollo sigue viendo el índice nuevo en cuanto se regenera.
 */
let pzIndexCache: { mtimeMs: number; index: NonNullable<ZomboidSitemapData["index"]> } | undefined;
let pzIndexWarned = false;
function readPzIndex(): NonNullable<ZomboidSitemapData["index"]> {
  const file = `${zomboidDir}/index.json`;
  try {
    const { mtimeMs } = statSync(file);
    if (pzIndexCache?.mtimeMs !== mtimeMs) pzIndexCache = { mtimeMs, index: JSON.parse(readFileSync(file, "utf-8")) };
    return pzIndexCache.index;
  } catch (e) {
    if (!pzIndexWarned) {
      pzIndexWarned = true;
      console.warn(`[zomboid] no pude leer ${file} (${(e as Error).message}): Project Zomboid sale sin fichas.`);
    }
    return [];
  }
}

/**
 * Los slugs en español de las fichas de un juego como módulo (2026-09-30): `import slugs from "virtual:d2r-slugs-es"`
 * (Diablo II) o `"virtual:pz-slugs-es"` (Project Zomboid). Se arman de los índices en cada build (ver
 * `src/esSlugs.ts`), así no hay un archivo más que regenerar y no pueden quedar distintos de los del sitemap, que salen
 * de la misma cuenta. `files` son los índices que lee `build`: el servidor de desarrollo lo rearma si cambian.
 *
 * Con `sections`, sirve además un módulo por sección (`virtual:pz-slugs-es/items` → `{ items: {…} }`, vacío si la
 * sección se llama igual en los dos idiomas). Es para Zomboid, donde el mapa entero pesa ~236 KB (contra 19 KB en
 * Diablo II) y no puede viajar con la portada: cada pestaña trae sólo las secciones que enlaza. Una sección que no está
 * en el índice no resuelve, así un nombre mal escrito rompe el build en vez de dejar las fichas con el slug inglés.
 */
function esSlugsModule(id: string, files: string[], build: () => object, sections?: () => string[]): Plugin {
  const prefix = `${id}/`;
  return {
    name: `vestigo-${id.slice("virtual:".length)}`,
    resolveId(source) {
      if (source === id) return `\0${id}`;
      if (sections && source.startsWith(prefix) && sections().includes(source.slice(prefix.length))) return `\0${source}`;
      return null;
    },
    load(source) {
      if (source !== `\0${id}` && !source.startsWith(`\0${prefix}`)) return null;
      for (const f of files) this.addWatchFile(f);
      const all = build() as Record<string, unknown>;
      if (source === `\0${id}`) return `export default ${JSON.stringify(all)};`;
      const sec = source.slice(`\0${prefix}`.length);
      return `export default ${JSON.stringify({ [sec]: all[sec] ?? {} })};`;
    },
  };
}

/**
 * Los slugs en español de los objetos que enlaza la pestaña Fabricación de Project Zomboid (2026-10-02):
 * `virtual:pz-slugs-es/craft-items` → `{ items: {…} }` con sólo los objetos de `craft.json` (`items`, ~2.500: lo que se
 * fabrica, lo que se gasta y las herramientas), del mismo `buildEsSlugs` que el sitemap. La misma receta que
 * `skill-items`: el módulo de toda la sección trae las 3.826 fichas. Sin `craft.json` (sin `craft.py` corrido), sale
 * vacío. Antes que el de las secciones en la lista de plugins, por lo mismo que `skill-items`.
 */
function pzCraftItemSlugsModule(): Plugin {
  const id = "virtual:pz-slugs-es/craft-items";
  return {
    name: "vestigo-pz-craft-item-slugs",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(source) {
      if (source !== `\0${id}`) return null;
      this.addWatchFile(`${zomboidDir}/index.json`);
      this.addWatchFile(`${zomboidDir}/craft.json`);
      let wanted = new Set<string>();
      try {
        wanted = new Set(Object.keys(JSON.parse(readFileSync(`${zomboidDir}/craft.json`, "utf-8")).items ?? {}));
      } catch {
        // Sin el grafo no hay pestaña que enlace nada: el módulo sale vacío, como los de las secciones.
      }
      const all = buildEsSlugs(readPzIndex(), []).items ?? {};
      const items = Object.fromEntries(Object.entries(all).filter(([itemId]) => wanted.has(itemId)));
      return `export default ${JSON.stringify({ items })};`;
    },
  };
}

/**
 * Los slugs en español de lo que enlaza la pestaña Parches de Project Zomboid (2026-10-02):
 * `virtual:pz-slugs-es/patch-ents` → `{ items: {…}, recipes: {…}, … }` con sólo las fichas que aparecen en algún diff
 * de `site/patches/<versión>.json`, del mismo `buildEsSlugs` que el sitemap. Lo mismo que `skill-items`: sin esto, el
 * tenedor nuevo de la 42.22 enlazaría en español a `/objetos/fork` (abre la ficha, pero no es su dirección), y traer las
 * secciones enteras era pagar 3.826 objetos y 1.170 recetas por unos pocos. Mientras no haya diffs sale vacío. Antes que
 * el de las secciones en la lista de plugins, por lo mismo que `skill-items`.
 */
function pzPatchEntSlugsModule(): Plugin {
  const id = "virtual:pz-slugs-es/patch-ents";
  const dir = `${zomboidDir}/site/patches`;
  type Ent = { slug?: string };
  type Page = { diff?: { kinds: Record<string, { added: Ent[]; removed: Ent[]; changed: Ent[] }> } };
  return {
    name: "vestigo-pz-patch-ent-slugs",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(source) {
      if (source !== `\0${id}`) return null;
      this.addWatchFile(`${zomboidDir}/index.json`);
      // Qué fichas enlaza cada tipo de cambio (`KIND_SEC` en `zomboid/patches/data.ts`; las opciones de sandbox no
      // tienen ficha propia).
      const sec: Record<string, string> = { items: "items", recipes: "recipes", traits: "traits", professions: "professions", skills: "skills", moodles: "moodles" };
      const wanted = new Map<string, Set<string>>();
      let files: string[] = [];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");
      } catch {
        // Sin `site.py` corrido no hay páginas ni enlaces: el módulo sale vacío.
      }
      for (const f of files) {
        this.addWatchFile(`${dir}/${f}`);
        const page = JSON.parse(readFileSync(`${dir}/${f}`, "utf-8")) as Page;
        for (const [kind, d] of Object.entries(page.diff?.kinds ?? {})) {
          const tab = sec[kind];
          if (!tab) continue;
          const set = wanted.get(tab) ?? new Set<string>();
          for (const e of [...d.added, ...d.removed, ...d.changed]) if (e.slug) set.add(e.slug);
          wanted.set(tab, set);
        }
      }
      const all = buildEsSlugs(readPzIndex(), []) as Record<string, Record<string, string>>;
      const out = Object.fromEntries(
        [...wanted].map(([tab, slugs]) => [tab, Object.fromEntries(Object.entries(all[tab] ?? {}).filter(([slug]) => slugs.has(slug)))]),
      );
      return `export default ${JSON.stringify(out)};`;
    },
  };
}

/**
 * Las versiones de Parches de Project Zomboid que tienen página (2026-10-02): `virtual:pz-patch-pages` →
 * `["42-20", "42-21"]`, los nombres de los archivos de `site/patches/` sin `index.json`. Lo usa `pzPatchName` (en el
 * shell, para el `<head>` al navegar). Antes era un `import.meta.glob`, que dejaba en el shell el nombre con hash del
 * chunk de cada página: cada vez que site.py reescribía una, cambiaba el shell y se invalidaba la caché de todo el sitio.
 * Esto sólo cambia cuando entra una versión.
 */
function pzPatchPagesModule(): Plugin {
  const id = "virtual:pz-patch-pages";
  const dir = `${zomboidDir}/site/patches`;
  return {
    name: "vestigo-pz-patch-pages",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(source) {
      if (source !== `\0${id}`) return null;
      this.addWatchFile(dir);
      let slugs: string[] = [];
      try {
        slugs = readdirSync(dir)
          .filter((f) => f.endsWith(".json") && f !== "index.json")
          .map((f) => f.slice(0, -".json".length))
          .sort();
      } catch {
        // Sin `site.py` corrido no hay páginas.
      }
      return `export default ${JSON.stringify(slugs)};`;
    },
  };
}

/**
 * Los slugs en español de los objetos que enlaza la pestaña Habilidades de Project Zomboid (2026-09-30):
 * `virtual:pz-slugs-es/skill-items` → `{ items: {…} }` con sólo los libros de habilidad y las revistas de
 * `site/skills.json` (~200), sacados del mismo `buildEsSlugs` que el sitemap. El módulo de toda la sección
 * (`virtual:pz-slugs-es/items`) trae los de las 3.826 fichas (47 KB con gzip) para esos enlaces; y escribirlos a mano,
 * como los 30 de Moodles, eran 200 renglones que se desactualizan con cada parche. Va con el nombre de una sección más
 * para que `manualChunks` lo deje con los datos de su pestaña y no en vendor. Va antes que el de las secciones en la lista
 * de plugins: ése no lo resuelve ("skill-items" no es una sección del índice), pero su `load` atiende cualquier id con su
 * prefijo y lo devolvía vacío.
 */
function pzSkillItemSlugsModule(): Plugin {
  const id = "virtual:pz-slugs-es/skill-items";
  return {
    name: "vestigo-pz-skill-item-slugs",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(source) {
      if (source !== `\0${id}`) return null;
      this.addWatchFile(`${zomboidDir}/index.json`);
      this.addWatchFile(`${zomboidDir}/site/skills.json`);
      type SkillRow = { books: { item: { id: string } }[]; magazines: { id: string }[] };
      let skills: SkillRow[] = [];
      try {
        skills = JSON.parse(readFileSync(`${zomboidDir}/site/skills.json`, "utf-8"));
      } catch {
        // Sin el extractor corrido no hay habilidades ni enlaces: el módulo sale vacío, como los de las secciones.
      }
      const wanted = new Set(skills.flatMap((s) => [...s.books.map((b) => b.item.id), ...s.magazines.map((m) => m.id)]));
      const all = buildEsSlugs(readPzIndex(), []).items ?? {};
      const items = Object.fromEntries(Object.entries(all).filter(([itemId]) => wanted.has(itemId)));
      return `export default ${JSON.stringify({ items })};`;
    },
  };
}

/**
 * Los slugs en español de la ropa del sobreviviente del Planificador de Zomboid (2026-10-01):
 * `virtual:pz-slugs-es/outfit-items` → `{ items: {…} }` con sólo las prendas de `outfits.json` (~55), del mismo
 * `buildEsSlugs` que el sitemap. Es lo mismo que `skill-items`: "Lleva puesto" enlaza a Objetos, y sin esto el enlace en
 * español iría con el slug inglés (abre la ficha, pero no es su dirección). Antes que el de las secciones, por lo mismo.
 */
function pzOutfitItemSlugsModule(): Plugin {
  const id = "virtual:pz-slugs-es/outfit-items";
  return {
    name: "vestigo-pz-outfit-item-slugs",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(source) {
      if (source !== `\0${id}`) return null;
      this.addWatchFile(`${zomboidDir}/index.json`);
      this.addWatchFile(`${zomboidDir}/outfits.json`);
      type Outfits = { outfits: Record<string, Record<string, { wear: { slug?: string }[] }>> };
      let data: Outfits = { outfits: {} };
      try {
        data = JSON.parse(readFileSync(`${zomboidDir}/outfits.json`, "utf-8"));
      } catch {
        // Sin `model3d.py` corrido no hay ropa ni enlaces: el módulo sale vacío.
      }
      const wanted = new Set(Object.values(data.outfits).flatMap((bySex) => Object.values(bySex).flatMap((o) => o.wear.map((w) => w.slug))));
      const all = buildEsSlugs(readPzIndex(), []).items ?? {};
      const items = Object.fromEntries(Object.entries(all).filter(([itemId]) => wanted.has(itemId)));
      return `export default ${JSON.stringify({ items })};`;
    },
  };
}

/**
 * Los nombres de las fichas de Project Zomboid, un módulo por sección (2026-09-30): `virtual:pz-names/items` exporta
 * `{ [id]: [en, es] }` con sólo las fichas de esa sección. Es lo único que necesita el `<head>` de una ficha al navegar
 * (`zomboid/index.ts` → `PageMeta.tsx`): el `index.json` entero pesa 143 KB con gzip por sus `ref` y por las cinco
 * secciones que esa ficha no usa, y bajarlo para poner un título era pagar de más. Igual que los slugs, una sección que
 * no está en el índice no resuelve: un nombre mal escrito rompe el build en vez de quedar sin título. Sale de la misma
 * lectura del índice que el sitemap y los slugs, así no hay un archivo más que regenerar ni que se desincronice.
 */
function pzNamesModule(): Plugin {
  const prefix = "virtual:pz-names/";
  return {
    name: "vestigo-pz-names",
    resolveId(source) {
      if (source.startsWith(prefix) && readPzIndex().some((e) => e.sec === source.slice(prefix.length))) return `\0${source}`;
      return null;
    },
    load(source) {
      if (!source.startsWith(`\0${prefix}`)) return null;
      this.addWatchFile(`${zomboidDir}/index.json`);
      const sec = source.slice(`\0${prefix}`.length);
      // [en, es], y en los rasgos gemelos de profesión también sus profesiones: [en, es, viaEn, viaEs] (ver `metaFor`).
      const names = Object.fromEntries(
        readPzIndex()
          .filter((e) => e.sec === sec)
          .map((e) => [e.id, e.via ? [e.en, e.es, e.via.en, e.via.es] : [e.en, e.es]]),
      );
      return `export default ${JSON.stringify(names)};`;
    },
  };
}

/**
 * Las imágenes de vista previa que este build llegó a dibujar, por ruta de
 * página. Las escribe `seoFiles` y las lee `prerenderRoutes`: una página sólo
 * declara su imagen propia si existe, y si no vuelve a `og.jpg`.
 */
const ogDrawn = new Set<string>();

/** Corre `fn` sobre cada elemento con hasta `n` a la vez. */
async function eachLimit<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

/**
 * Writes robots.txt and sitemap.xml at build time.
 *
 * Generated rather than committed because both describe the catalog, and the
 * catalog is regenerated every run. A sitemap listing heroes that no longer
 * exist teaches Google that our URLs 404, which is worse than having no sitemap.
 */
function seoFiles(): Plugin {
  return {
    name: "vestigo-seo-files",
    apply: "build",
    async generateBundle() {
      const { data } = readSitemapData();

      // `/sitemap.xml` es el índice y cada juego tiene su sitemap; las fechas
      // salen de cada página (`sitemapLastmod`), no del deploy.
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapIndexXml(data) });
      for (const group of SITEMAP_GROUPS) {
        this.emitFile({ type: "asset", fileName: sitemapFile(group), source: sitemapXml(data, group) });
      }
      this.emitFile({ type: "asset", fileName: "robots.txt", source: ROBOTS_TXT });
      // Las direcciones viejas de Diablo II en español, a las de ahora (ver `redirectsFile`).
      this.emitFile({ type: "asset", fileName: "_redirects", source: redirectsFile(data) });

      /**
       * Las imágenes de vista previa, una por héroe, objeto y edición (ver
       * `og/og.ts`). Se dibujan acá y no se commitean: son ~400 JPEG que
       * cambiarían con cada catálogo. Una que falle se anota y su página vuelve
       * a `og.jpg`; el build no se cae por una carta que no bajó.
       */
      const t0 = Date.now();
      const specs = ogSpecs(data);
      let failed = 0;
      await eachLimit(specs, 6, async ({ path, spec }) => {
        const file = ogImagePath(parseRoute(path), data.dlNews?.[0]?.slug);
        if (!file) return;
        try {
          const source = await renderOg(spec);
          this.emitFile({ type: "asset", fileName: file.slice(1), source });
          ogDrawn.add(file);
        } catch (e) {
          failed++;
          this.warn(`og ${path}: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
      this.info?.(`Dibujadas ${ogDrawn.size} imágenes de vista previa${failed ? ` (${failed} fallaron)` : ""} en ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    },
  };
}

/**
 * Escribe un index.html por ruta, con el `<head>` de esa página.
 *
 * La app reescribe su propio `<head>` al navegar, y a Google le alcanza porque
 * ejecuta JavaScript. A los scrapers de link previews no: leen el HTML crudo y
 * se van, así que cada link compartido se previsualizaba como la home genérica
 * con la URL equivocada. Organic Social era 10 de 27 sesiones cuando se midió,
 * o sea el segundo canal del sitio.
 *
 * Corre en `writeBundle`, después del de SEO y con `dist/` ya escrito: cada
 * archivo es el mismo index.html con las etiquetas sustituidas, así que
 * el JS y el CSS que carga son los mismos y la app arranca igual. Netlify sirve
 * un archivo real antes de consultar el redirect de SPA.
 */
/**
 * Lo que el HTML de cada página tiene que anunciar (2026-09-25).
 *
 * Cada juego es un chunk aparte con su CSS (`src/areas.ts`), y cada pestaña de
 * Deadlock otro (`DeadlockArea.tsx`). La página prerenderizada se ve antes de
 * que corra el JS, así que sin su hoja en el `<head>` se vería sin estilos
 * hasta que llegara el chunk; y sin `modulepreload`, cada chunk recién se
 * pediría después de bajar y ejecutar el anterior. Acá se busca en el bundle el
 * chunk de cada archivo (`filesFor` en `src/areaFiles.ts`), se siguen sus
 * imports estáticos y se juntan sus JS y sus CSS, menos lo que el `index.html`
 * de Vite ya trae. Devuelve una función con caché: hay miles de páginas y
 * pocas combinaciones.
 */
function areaTags(bundle: Record<string, { type: string } & Record<string, any>>, html: string): (files: string[]) => { css: string; js: string[] } {
  const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
  const byFile = new Map(chunks.map((c) => [c.fileName as string, c]));
  const norm = (id: string | null | undefined) => (id ?? "").replaceAll("\\", "/");
  const chunkOf = (file: string) => {
    // Por el módulo y no por `facadeModuleId`: cuando otro chunk importa algo
    // del área (el árbol de PoE2 importa de su módulo), Rollup la deja sin
    // fachada y ese campo viene en null.
    const has = (c: Record<string, any>) => Object.keys(c.modules ?? {}).some((m) => norm(m).endsWith(`/${file}`));
    const root = chunks.find((c) => norm(c.facadeModuleId).endsWith(`/${file}`)) ?? chunks.find(has);
    if (!root) throw new Error(`prerender: no hay chunk para ${file}. ¿Cambió areas.ts o DeadlockArea.tsx?`);
    return root;
  };
  // Que falte un chunk tiene que romper el build ahora, no en la página que lo use.
  for (const file of [...Object.values(AREA_FILES), ...Object.values(DEADLOCK_TAB_FILES), ...Object.values(D2R_TAB_FILES), ...Object.values(PZ_TAB_FILES), ...Object.values(RUST_TAB_FILES)]) chunkOf(file!);
  const fresh = (f: string) => !html.includes(`/${f}"`);
  const cache = new Map<string, { css: string; js: string[] }>();
  return (files) => {
    const key = files.join("|");
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const js = new Set<string>();
    const css = new Set<string>();
    const visit = (c: Record<string, any>) => {
      if (js.has(c.fileName) || c.isEntry) return;
      js.add(c.fileName);
      for (const f of c.viteMetadata?.importedCss ?? []) css.add(f);
      for (const imp of c.imports ?? []) {
        const next = byFile.get(imp);
        if (next) visit(next);
      }
    };
    for (const file of files) visit(chunkOf(file));
    const tags = {
      css: [...css].filter(fresh).map((f) => `<link rel="stylesheet" crossorigin href="/${f}">`).join("\n    "),
      js: [...js].filter(fresh),
    };
    cache.set(key, tags);
    return tags;
  };
}

/**
 * El HTML de cada página no nombra ningún JS con hash (2026-10-06): carga `/app.js`, de nombre fijo.
 *
 * La entrada (`index-<hash>.js`) cambia con cualquier dato, y cada uno de los 22 mil HTML la nombraba, junto con los
 * `modulepreload` de su pestaña. Medido con dos publicaciones seguidas de la tier list de Deadlock: cambiaban 22.221
 * HTML y, sin contar los hashes, sólo 485 (los de Deadlock). Netlify sube lo que cambió, o sea ~345 MB por publicación
 * para nada. Ahora `app.js` lleva la entrada y lo que precarga cada pestaña, y el HTML sólo dice qué pestaña es
 * (`<html data-pre="…">`, con los nombres de los archivos fuente, que no cambian).
 *
 * El CSS sigue en el HTML: sin él la página prerenderizada se vería sin estilos hasta que llegara el JS, y su hash
 * sólo cambia si cambia el CSS (en esa medición, ningún CSS cambió). `app.js` no va en `/assets/`: se sirve con la
 * caché por defecto de Netlify (se revalida en cada visita) y no con la de un año.
 */
const ENTRY_TAGS = /\s*<script type="module" crossorigin src="\/(assets\/[^"]+\.js)"><\/script>|\s*<link rel="modulepreload" crossorigin href="\/(assets\/[^"]+\.js)">/g;

function splitEntry(html: string): { html: string; entry: string; base: string[] } {
  let entry = "";
  const base: string[] = [];
  let first = true;
  const out = html.replace(ENTRY_TAGS, (_, script: string | undefined, preload: string | undefined) => {
    if (script) entry = script;
    else if (preload) base.push(preload);
    if (!first) return "";
    first = false;
    return '\n    <script type="module" src="/app.js"></script>';
  });
  if (!entry) throw new Error("prerender: index.html no trae el <script> de la entrada; no se puede armar app.js.");
  return { html: out, entry, base };
}

function appJs(entry: string, base: string[], preloads: Map<string, string[]>): string {
  const table = JSON.stringify(Object.fromEntries(preloads));
  return [
    "// Generado por vite.config.ts (prerenderRoutes): la entrada y lo que precarga cada pestaña. No editar.",
    `const B=${JSON.stringify(base)},P=${table};`,
    "for(const f of B.concat(P[document.documentElement.dataset.pre]||[])){const l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href='/'+f;document.head.appendChild(l)}",
    `import('/${entry}');`,
    "",
  ].join("\n");
}

function prerenderRoutes(): Plugin {
  return {
    name: "vestigo-prerender",
    apply: "build",
    // Después de vestigo-seo-files, y sobre todo después de que Vite haya
    // emitido index.html: sin él no hay nada que copiar.
    enforce: "post",
    /**
     * **Cada página se escribe a disco apenas se renderiza** (2026-09-24). Antes
     * se juntaban todos los cuerpos en un Map y cada HTML se emitía al bundle:
     * con Valheim eran 10.766 páginas (242 MB) vivas a la vez, dos veces, y el
     * build de Netlify se quedó sin memoria (tope de ~2 GB de Node). Por eso
     * esto corre en `writeBundle`, cuando Vite ya escribió `dist/`, y no en
     * `generateBundle`.
     */
    async writeBundle(options, bundle) {
      const entry = bundle["index.html"];
      if (!entry || entry.type !== "asset") {
        this.warn("No se encontró index.html en el bundle: no se prerenderizó ninguna ruta.");
        return;
      }
      const outDir = options.dir ?? "dist";
      // Sin los comentarios de index.html: explican decisiones en el repo, pero
      // salían en cada página servida.
      const split = splitEntry(stripComments(String(entry.source)));
      const html = split.html;
      const preloads = new Map<string, string[]>();

      const pages = prerenderPages(readSitemapData().data, (path) => ogDrawn.has(path));
      const tags = areaTags(bundle as Parameters<typeof areaTags>[0], String(entry.source));

      /**
       * La app renderizada a texto, ruta por ruta.
       *
       * Se levanta un Vite en modo servidor sólo para esto y se cierra al
       * terminar. Es más lento que un `build --ssr` aparte, y se elige igual:
       * `npm run build` tiene que seguir siendo **un comando**, porque es el que
       * corre Netlify y el que corre cualquiera que clone el repo. Un segundo
       * paso que alguien puede olvidar publicaría el sitio sin cuerpo y sin que
       * nada falle.
       *
       * El plugin lleva `apply: "build"`, así que este Vite anidado —que corre en
       * modo `serve`— no se vuelve a cargar a sí mismo.
       *
       * **Si el render falla, el build falla.** Es deliberado: la alternativa era
       * emitir la página sin cuerpo, que es exactamente el estado que esto vino a
       * arreglar y que nadie notaría hasta mirar el HTML servido tres semanas
       * después.
       */
      const { createServer } = await import("vite");
      const ssr = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
        logLevel: "error",
      });

      const t0 = Date.now();
      let escritas = 0;
      try {
        const { renderApp } = (await ssr.ssrLoadModule("/src/entry-server.tsx")) as {
          renderApp: (route: Route) => Promise<string>;
        };
        for (const page of pages) {
          const route = parseRoute(page.path);
          const cuerpo = await renderApp(route);
          // Una página de Project Zomboid escrita con la hoja de "cargando…" (2026-09-30) sale sin un solo dato ni
          // enlace, y nadie lo nota hasta mirar el HTML servido: pasa si `preloadZomboid` (entry-server.tsx) no espera
          // los datos de una pestaña nueva, o si una ficha cae en un archivo que no se pidió. Mejor que el build falle.
          if (route.view === "zomboid" && cuerpo.includes('class="pz-loading"')) {
            throw new Error(`prerender: ${page.path} salió con la hoja de "cargando…" en vez de sus datos.`);
          }
          // Lo mismo en Rust: una ficha cuyo slug en español no se anotó (ver `readSitemapData`) o cuyo archivo no se
          // pidió en `entry-server.tsx` sale vacía.
          if (route.view === "rust" && isRsLoadingPage(cuerpo)) {
            throw new Error(`prerender: ${page.path} salió con la hoja de "cargando…" en vez de sus datos.`);
          }
          const conexiones = originsFor(route)
            .map((o) => `<link rel="preconnect" href="${o.href}"${o.cors ? " crossorigin" : ""}>`)
            .join("\n    ");
          const files = filesFor(route);
          const pre = files.join("|");
          const own = tags(files);
          if (!preloads.has(pre)) preloads.set(pre, own.js);
          const propias = [own.css, conexiones].filter(Boolean).join("\n    ");
          const pagina = renderHtml(html, page, BRAND, cuerpo)
            .replace("</head>", () => (propias ? `  ${propias}\n  </head>` : "</head>"))
            .replace(/<html\b/, () => `<html data-pre="${pre}"`);
          /**
           * El `index.html` de la raíz también lleva cuerpo, y es el que más lo
           * necesita: Netlify lo sirve para el dominio pelado **y como fallback
           * de cualquier ruta que no tenga archivo propio**. Lleva el de `/en`,
           * que es a donde la raíz manda.
           */
          if (page.path === "/en") writeFileSync(join(outDir, "index.html"), pagina);
          // "/es/deadlock/items/basic-magazine" → "es/deadlock/items/basic-magazine.html".
          //
          // Un archivo suelto y NO "<ruta>/index.html": con la forma de carpeta,
          // Netlify responde 301 agregando la barra final, así que cada URL del
          // sitemap redirigía y la canonical apuntaba a una dirección distinta de
          // la que el servidor entregaba. Verificado contra el sitio desplegado,
          // que es el único lugar donde esto se ve: `vite preview` sirve las dos
          // formas con 200 y no lo habría delatado.
          //
          // Una sección y sus detalles conviven sin chocar: "items.html" es un
          // archivo y "items/" una carpeta. La raíz ya la escribió Vite.
          const clean = page.path.replace(/^\/+|\/+$/g, "");
          if (!clean) continue;
          const file = join(outDir, `${clean}.html`);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, pagina);
          escritas++;
        }
      } finally {
        // Pase lo que pase: un servidor sin cerrar deja el proceso del build vivo.
        await ssr.close();
      }
      writeFileSync(join(outDir, "app.js"), appJs(split.entry, split.base, preloads));
      this.info?.(`Prerenderizadas ${escritas} rutas en ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    },
  };
}

/**
 * En qué archivo va cada módulo (2026-09-25), para que una publicación de datos
 * no le haga bajar todo el JS de nuevo a quien vuelve.
 *
 * Un chunk que importa otro lleva su nombre con hash adentro: si el de abajo
 * cambia, cambia el de arriba. Con el reparto por defecto, la entrada tenía los
 * `import()` de cada juego y además React y la cáscara, y todos los chunks
 * importaban de ella: un dato de `heroes.json` cambiaba 30 archivos, React
 * incluido, cuatro veces por día. Ahora:
 *
 * - `vendor`: React y los ayudantes de Vite. Sólo cambia si se actualiza React.
 * - `shell`: todo lo que la entrada importa de forma estática (barra, idioma,
 *   rutas…), salvo `areas.ts`. No conoce ningún nombre con hash de un juego:
 *   `areas.ts` le llega por `areasRegistry.ts`.
 * - La entrada: `main.tsx` y `areas.ts`. Es lo único que cambia siempre, y son
 *   un par de KB.
 */
function manualChunks() {
  let shell: Set<string> | null = null;
  const norm = (id: string) => id.split("?")[0].replaceAll("\\", "/");
  return (id: string, api: { getModuleIds: () => IterableIterator<string>; getModuleInfo: (id: string) => { importedIds: readonly string[] } | null }) => {
    const file = norm(id);
    // Los ayudantes de Vite (\0vite/preload-helper y compañía) los importan los
    // chunks que tienen `import()`: en la entrada arrastrarían a todos.
    // Los slugs en español de cada juego (`\0virtual:d2r-slugs-es`, `\0virtual:pz-slugs-es` y los de cada sección de
    // Zomboid, `\0virtual:pz-slugs-es/items`) y los nombres de sus fichas (`\0virtual:pz-names/items`) también empiezan
    // con \0, pero son datos de su sección: van con ella. En vendor, los ~236 KB de slugs de Zomboid los bajaría cualquiera
    // que entre al sitio, y los nombres, que se piden de a una sección, volverían a ser un solo bloque.
    // `\0virtual:pz-patch-pages` (las versiones de Parches con página) también: cambia con cada versión, no con React.
    const datosDeSeccion = /^\0virtual:(?:[\w-]+-slugs-es(?:\/[\w-]+)?|pz-names\/[\w-]+|pz-patch-pages)$/.test(id);
    // Leaflet (el visor del Mapa de Zomboid, 2026-09-30) va en su propio chunk y no en vendor: vendor lo baja cualquiera
    // que entre al sitio, y Leaflet sólo hace falta en el Mapa. Antes que la regla de `\0`: el plugin de CommonJS le
    // arma envoltorios virtuales (`\0…/leaflet-src.js?commonjs-module`) que también son de Leaflet. Su CSS no: va con el
    // módulo que la importa (el del visor, que también se pide aparte).
    if (file.includes("/node_modules/leaflet/")) return /\.css$/.test(file) ? undefined : "leaflet";
    // three.js (el sobreviviente en 3D del Planificador de Zomboid, 2026-10-01) va en su propio chunk, como Leaflet: sólo
    // lo baja quien toca "Ver en 3D". En vendor lo bajaría cualquiera que entre al sitio.
    if (file.includes("/node_modules/three/")) return "three";
    // React Flow (el editor de Electricidad de Rust, 2026-10-09) también: sólo lo baja quien abre el editor. Con sus
    // dependencias (zustand, d3-*, classcat), que nadie más usa. Su CSS va con el módulo que lo importa.
    if (/\/node_modules\/(?:@xyflow|zustand|d3-[\w-]+|classcat|use-sync-external-store)\//.test(file)) return /\.css$/.test(file) ? undefined : "xyflow";
    if (id.startsWith("\0") && !file.includes("modulepreload-polyfill") && !datosDeSeccion) return "vendor";
    if (file.includes("/node_modules/")) return /\.(c|m)?jsx?$/.test(file) ? "vendor" : undefined;
    // Diminuto y sin datos, pero lo importan la copia de Deadlock y la portada:
    // suelto, Rollup lo metía en el chunk de los datos de héroes y la copia
    // entera (94 KB) cambiaba con cada publicación.
    if (file.endsWith("/src/deadlockBandNames.ts")) return "shell";
    if (!shell) {
      shell = new Set();
      const main = [...api.getModuleIds()].find((m) => norm(m).endsWith("/src/main.tsx"));
      const stack = main ? [main] : [];
      while (stack.length) {
        for (const dep of api.getModuleInfo(stack.pop()!)?.importedIds ?? []) {
          const d = norm(dep);
          if (shell.has(dep) || d.includes("/node_modules/") || dep.startsWith("\0")) continue;
          // `areas.ts` se queda en la entrada, pero lo que importa sí va a `shell`.
          if (!d.endsWith("/src/areas.ts")) shell.add(dep);
          stack.push(dep);
        }
      }
    }
    return shell.has(id) && /\.(tsx?|json)$/.test(file) ? "shell" : undefined;
  };
}

export default defineConfig({
  plugins: [
    localDeadlockAssets(),
    esSlugsModule("virtual:d2r-slugs-es", [`${d2rDir}/wiki/index.json`, `${d2rDir}/drops/index.json`], () => buildD2rEsSlugs(readD2Index())),
    // Antes que el de las secciones: su `load` atiende todo lo que empiece con `virtual:pz-slugs-es/`.
    pzCraftItemSlugsModule(),
    pzSkillItemSlugsModule(),
    pzOutfitItemSlugsModule(),
    pzPatchEntSlugsModule(),
    pzPatchPagesModule(),
    esSlugsModule(
      "virtual:pz-slugs-es",
      [`${zomboidDir}/index.json`],
      () => buildEsSlugs(readPzIndex(), []),
      () => [...new Set(readPzIndex().map((e) => e.sec))],
    ),
    pzNamesModule(),
    react(),
    seoFiles(),
    prerenderRoutes(),
  ],
  build: {
    rollupOptions: { output: { manualChunks: manualChunks() } },
  },
  /**
   * Cada JSON como `JSON.parse("…")` y no como un objeto de JavaScript (2026-10-06). Son ~50 MB de datos (31 de
   * Zomboid): convertidos a objetos, Rollup los recorría como código y el build pasaba los 5,8 GB de RAM (el tope en
   * Netlify es 6). Además el navegador lee un `JSON.parse` más rápido que el mismo objeto escrito en JS. Lo que se
   * pierde es importar una clave suelta (`import { x } from "./a.json"`), que el sitio no usa.
   */
  json: { stringify: true },
  resolve: {
    // Cada pipeline escribe su salida en games/<juego>/data y el sitio la lee
    // ahí mismo: una sola fuente, sin copias que se desincronicen. Un alias por
    // juego y no uno genérico, para que un import diga de qué juego habla.
    alias: { "@deadlock": deadlockDir, "@poe2": poe2Dir, "@valheim": valheimDir, "@valheimMap": valheimMapDir, "@d2r": d2rDir, "@zomboid": zomboidDir, "@rust": rustDir },
  },
  server: {
    // 5173 by default, but overridable so a second session can run its own
    // server side by side instead of colliding with the one already up.
    port: Number(process.env.PORT) || 5173,
    // Without this Vite binds IPv6 only, so http://127.0.0.1:5173 answers
    // nothing while http://localhost:5173 works — depending on how the browser
    // resolves the name. Listening on both removes that coin flip.
    host: true,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
  // `vite preview` sirve el build con la misma CSP que Netlify en producción, para
  // que un origen que falte se vea acá (bloqueado, en la consola) y no en vivo.
  preview: { headers: { "Content-Security-Policy": netlifyCsp() } },
});

/** La Content-Security-Policy tal como está en netlify.toml: una sola fuente. */
function netlifyCsp(): string {
  const toml = readFileSync(fileURLToPath(new URL("../netlify.toml", import.meta.url)), "utf-8");
  const m = toml.match(/^\s*Content-Security-Policy\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error("netlify.toml no tiene Content-Security-Policy");
  return m[1];
}
