import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { ROBOTS_TXT, sitemapXml, type SitemapData } from "./src/sitemap";
import { prerenderPages, renderHtml, ogImagePath, stripComments } from "./src/prerender";
import { renderOg } from "./og/og";
import { ogSpecs, type OgData } from "./og/pages";
import { parseRoute, type Route } from "./src/route";
import { COPY } from "./src/i18n";
import { AREA_FILES, DEADLOCK_TAB_FILES, filesFor } from "./src/areaFiles";

/** El nombre del producto sale de la copia, como todo el resto del texto. */
const BRAND = COPY.en.brand;

const deadlockDir = fileURLToPath(new URL("../games/deadlock/data", import.meta.url));
const poe2Dir = fileURLToPath(new URL("../games/poe2/data", import.meta.url));
// Valheim (2026-09-24): lo que arma `games/valheim/pipeline/site.py`, una lista por pestaña.
const valheimDir = fileURLToPath(new URL("../games/valheim/data/site", import.meta.url));
// El mapa por semilla (2026-09-25): las tablas de lugares que saca `pipeline/map_data.py`.
const valheimMapDir = fileURLToPath(new URL("../games/valheim/data/map", import.meta.url));

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
function readSitemapData(): { data: OgData; generatedAt: string } {
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
  return {
    data: {
      p2,
      vh,
      dlHeroes: dlCatalog.heroes,
      dlItems: dlCatalog.items,
      dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
      dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
      dlNews,
      dlHeroStats: { band: dlHeroesFile.band, heroes: dlHeroesFile.heroes },
      dlEditions,
    },
    generatedAt: String(dlHeroesFile.generatedAt ?? ""),
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
      const { data, generatedAt } = readSitemapData();

      // The data stamps its own build time; using it rather than "now" keeps
      // lastmod honest — it is when the data changed, not when we deployed.
      const lastmod = generatedAt.slice(0, 10) || undefined;

      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: sitemapXml(data, lastmod ?? new Date().toISOString().slice(0, 10)),
      });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: ROBOTS_TXT });

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
function areaTags(bundle: Record<string, { type: string } & Record<string, any>>, html: string): (files: string[]) => string {
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
  for (const file of [...Object.values(AREA_FILES), ...Object.values(DEADLOCK_TAB_FILES)]) chunkOf(file!);
  const fresh = (f: string) => !html.includes(`/${f}"`);
  const cache = new Map<string, string>();
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
    const tags = [
      ...[...css].filter(fresh).map((f) => `<link rel="stylesheet" crossorigin href="/${f}">`),
      ...[...js].filter(fresh).map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`),
    ].join("\n    ");
    cache.set(key, tags);
    return tags;
  };
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
      const html = stripComments(String(entry.source));

      const pages = prerenderPages(readSitemapData().data, (path) => ogDrawn.has(path));
      const tags = areaTags(bundle as Parameters<typeof areaTags>[0], html);

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
          const propias = tags(filesFor(route));
          const pagina = renderHtml(html, page, BRAND, cuerpo).replace(
            "</head>",
            propias ? `  ${propias}\n  </head>` : "</head>"
          );
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
    if (id.startsWith("\0") && !file.includes("modulepreload-polyfill")) return "vendor";
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
  plugins: [localDeadlockAssets(), react(), seoFiles(), prerenderRoutes()],
  build: {
    rollupOptions: { output: { manualChunks: manualChunks() } },
  },
  resolve: {
    // Cada pipeline escribe su salida en games/<juego>/data y el sitio la lee
    // ahí mismo: una sola fuente, sin copias que se desincronicen. Un alias por
    // juego y no uno genérico, para que un import diga de qué juego habla.
    alias: { "@deadlock": deadlockDir, "@poe2": poe2Dir, "@valheim": valheimDir, "@valheimMap": valheimMapDir },
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
});
