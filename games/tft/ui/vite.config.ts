import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { devApi } from "./dev-api";
import { ROBOTS_TXT, sitemapXml, type SitemapData } from "./src/sitemap";
import { prerenderPages, renderHtml, ogImagePath, stripComments } from "./src/prerender";
import { renderOg } from "./og/og";
import { ogSpecs, type OgData } from "./og/pages";
import { parseRoute, type Route } from "./src/route";
import { COPY } from "./src/i18n";

/** El nombre del producto sale de la copia, como todo el resto del texto. */
const BRAND = COPY.en.brand;

const dataDir = fileURLToPath(new URL("../data", import.meta.url));
const analysisDir = fileURLToPath(new URL("../analysis/src", import.meta.url));
const deadlockDir = fileURLToPath(new URL("../../deadlock/data", import.meta.url));

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
  return {
    data: {
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
 * Corre en `generateBundle` después del de SEO, cuando index.html ya está en el
 * bundle: cada archivo es ese mismo HTML con las etiquetas sustituidas, así que
 * el JS y el CSS que carga son los mismos y la app arranca igual. Netlify sirve
 * un archivo real antes de consultar el redirect de SPA.
 */
function prerenderRoutes(): Plugin {
  return {
    name: "vestigo-prerender",
    apply: "build",
    // Después de vestigo-seo-files, y sobre todo después de que Vite haya
    // emitido index.html: sin él no hay nada que copiar.
    enforce: "post",
    async generateBundle(_options, bundle) {
      const entry = bundle["index.html"];
      if (!entry || entry.type !== "asset") {
        this.warn("No se encontró index.html en el bundle: no se prerenderizó ninguna ruta.");
        return;
      }
      // Sin los comentarios de index.html: explican decisiones en el repo, pero
      // salían en cada página servida.
      const html = stripComments(String(entry.source));

      const pages = prerenderPages(readSitemapData().data, (path) => ogDrawn.has(path));

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

      const cuerpos = new Map<string, string>();
      const t0 = Date.now();
      try {
        const { renderApp } = (await ssr.ssrLoadModule("/src/entry-server.tsx")) as {
          renderApp: (route: Route) => Promise<string>;
        };
        for (const page of pages) cuerpos.set(page.path, await renderApp(parseRoute(page.path)));
      } finally {
        // Pase lo que pase: un servidor sin cerrar deja el proceso del build vivo.
        await ssr.close();
      }
      this.info?.(`Renderizadas ${cuerpos.size} rutas en ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

      /**
       * El `index.html` de la raíz también lleva cuerpo, y es el que más lo
       * necesita: Netlify lo sirve para el dominio pelado **y como fallback de
       * cualquier ruta que no tenga archivo propio**. Se le pone el cuerpo de
       * `/en`, que es a donde la raíz manda.
       */
      const raiz = cuerpos.get("/en");
      const paginaEn = pages.find((p) => p.path === "/en");
      if (raiz && paginaEn) entry.source = renderHtml(html, paginaEn, BRAND, raiz);
      else if (raiz) entry.source = html.replace('<div id="root"></div>', `<div id="root">${raiz}</div>`);

      for (const page of pages) {
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
        // archivo y "items/" una carpeta. La raíz la escribe Vite y no se pisa.
        const clean = page.path.replace(/^\/+|\/+$/g, "");
        if (!clean) continue;
        this.emitFile({
          type: "asset",
          fileName: `${clean}.html`,
          source: renderHtml(html, page, BRAND, cuerpos.get(page.path)),
        });
      }
      this.info?.(`Prerenderizadas ${pages.length} rutas.`);
    },
  };
}

export default defineConfig({
  // devApi stands in for the Supabase Edge Function while developing, speaking
  // the same contract so the UI cannot tell them apart.
  plugins: [react(), devApi(), seoFiles(), prerenderRoutes()],
  resolve: {
    // The pipeline writes its output to games/tft/data. The UI reads it directly
    // so there is a single source of truth — no copying, no drift.
    // @analysis is the pure report logic, shared with the tests that cover it.
    // @deadlock is the same arrangement for the other game: its pipeline writes
    // to games/deadlock/data and this reads it in place. Un alias por juego y no
    // uno genérico, para que un import diga de cuál de los dos está hablando.
    alias: { "@data": dataDir, "@analysis": analysisDir, "@deadlock": deadlockDir },
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
