import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { devApi } from "./dev-api";
import { ROBOTS_TXT, sitemapXml, type SitemapData } from "./src/sitemap";
import { prerenderPages, renderHtml } from "./src/prerender";
import { parseRoute, slugify, type Route } from "./src/route";
import { COPY } from "./src/i18n";

/** El nombre del producto sale de la copia, como todo el resto del texto. */
const BRAND = COPY.en.brand;

const dataDir = fileURLToPath(new URL("../data", import.meta.url));
const analysisDir = fileURLToPath(new URL("../analysis/src", import.meta.url));
const deadlockDir = fileURLToPath(new URL("../../deadlock/data", import.meta.url));

/**
 * Writes robots.txt and sitemap.xml at build time.
 *
 * Generated rather than committed because both describe the catalog, and the
 * catalog is regenerated every set. A sitemap listing champions that no longer
 * exist teaches Google that our URLs 404, which is worse than having no sitemap.
 */
function seoFiles(): Plugin {
  const read = (name: string) => JSON.parse(readFileSync(`${dataDir}/${name}`, "utf-8"));
  const readDl = (name: string) => JSON.parse(readFileSync(`${deadlockDir}/${name}`, "utf-8"));

  return {
    name: "vestigo-seo-files",
    apply: "build",
    generateBundle() {
      const catalog = read("catalog.json");
      const dlCatalog = readDl("catalog.json");
      const dlHeroesFile = readDl("heroes.json");
      const dlItemsFile = readDl("items.json");
      const data: SitemapData = {
        champions: catalog.champions,
        traits: catalog.traits,
        items: catalog.items,
        comps: read("comps.json").comps,
        unitIds: read("units.json").units.map((u: { id: string }) => u.id),
        itemIds: read("items.json").items.map((i: { id: string }) => i.id),
        dlHeroes: dlCatalog.heroes,
        dlItems: dlCatalog.items,
        dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
        dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
      };

      // The catalog stamps its own build time; using it rather than "now" keeps
      // lastmod honest — it is when the data changed, not when we deployed.
      const lastmod = String(catalog.generatedAt ?? "").slice(0, 10) || undefined;

      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: sitemapXml(data, lastmod ?? new Date().toISOString().slice(0, 10)),
      });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: ROBOTS_TXT });
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
/**
 * `virtual:tft-summary`: lo poco de TFT que la portada necesita, calculado
 * acá en Node y no importado en el navegador (ver `src/tftSummary.ts`).
 * Sin `apply`: corre en dev, en build y en vitest, que cargan esta config.
 */
function tftSummary(): Plugin {
  const id = "virtual:tft-summary";
  const resolved = "\0" + id;
  const read = (name: string) => JSON.parse(readFileSync(`${dataDir}/${name}`, "utf-8"));
  return {
    name: "vestigo-tft-summary",
    resolveId(source) {
      return source === id ? resolved : null;
    },
    load(source) {
      if (source !== resolved) return null;
      const catalog = read("catalog.json");
      const comps = read("comps.json");
      const items = read("items.json");
      type L = { en: string; es: string };
      const name = (l: L | undefined, fallback: string): L => ({ en: l?.en || fallback, es: l?.es || l?.en || fallback });
      const strip = (s: string) => s.replace(/^TFT\d+_/, "");
      const c0 = comps.comps[0];
      const best = c0
        ? (() => {
            const parts: L[] = [name(catalog.traits[c0.trait]?.name, strip(c0.trait))].concat(
              (c0.carries as string[]).map((cid) => name(catalog.champions[cid]?.name, strip(cid)))
            );
            const en = parts.map((p) => p.en).filter(Boolean).join(" ");
            const es = parts.map((p) => p.es).filter(Boolean).join(" ");
            return { slug: slugify(en), name: { en, es }, avgPlacement: c0.avgPlacement };
          })()
        : null;
      const i0 = (items.items as { id: string; avgPlacement: number; delta: number }[]).reduce<
        { id: string; avgPlacement: number; delta: number } | null
      >((b, i) => (!b || i.delta < b.delta ? i : b), null);
      const bestItem = i0
        ? (() => {
            const n = name(catalog.items[i0.id]?.name, strip(i0.id));
            return { slug: slugify(n.en), name: n, img: catalog.items[i0.id]?.img ?? "", avgPlacement: i0.avgPlacement, delta: i0.delta };
          })()
        : null;
      const summary = {
        set: String(catalog.set ?? ""),
        generatedAt: comps.generatedAt,
        sampleSize: comps.sampleSize,
        compsCount: comps.comps.length,
        best,
        bestItem,
      };
      return `export default ${JSON.stringify(summary)};`;
    },
  };
}

function prerenderRoutes(): Plugin {
  const read = (name: string) => JSON.parse(readFileSync(`${dataDir}/${name}`, "utf-8"));

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
      const html = String(entry.source);

      const readDl = (name: string) => JSON.parse(readFileSync(`${deadlockDir}/${name}`, "utf-8"));
      const catalog = read("catalog.json");
      const dlCatalog = readDl("catalog.json");
      const dlHeroesFile = readDl("heroes.json");
      const dlItemsFile = readDl("items.json");
      const data: SitemapData = {
        champions: catalog.champions,
        traits: catalog.traits,
        items: catalog.items,
        comps: read("comps.json").comps,
        unitIds: read("units.json").units.map((u: { id: string }) => u.id),
        itemIds: read("items.json").items.map((i: { id: string }) => i.id),
        dlHeroes: dlCatalog.heroes,
        dlItems: dlCatalog.items,
        dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
        dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
      };

      const pages = prerenderPages(data, String(catalog.set ?? ""));

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
      if (raiz) entry.source = html.replace('<div id="root"></div>', `<div id="root">${raiz}</div>`);

      for (const page of pages) {
        // "/es/tft/units/lissandra" → "es/tft/units/lissandra.html".
        //
        // Un archivo suelto y NO "<ruta>/index.html": con la forma de carpeta,
        // Netlify responde 301 agregando la barra final, así que cada URL del
        // sitemap redirigía y la canonical apuntaba a una dirección distinta de
        // la que el servidor entregaba. Verificado contra el sitio desplegado,
        // que es el único lugar donde esto se ve: `vite preview` sirve las dos
        // formas con 200 y no lo habría delatado.
        //
        // Una sección y sus detalles conviven sin chocar: "units.html" es un
        // archivo y "units/" una carpeta. La raíz la escribe Vite y no se pisa.
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
  plugins: [react(), devApi(), tftSummary(), seoFiles(), prerenderRoutes()],
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
