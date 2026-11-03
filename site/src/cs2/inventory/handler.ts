/**
 * El intermediario del inventario de CS2 (2026-11-03, etapa 3): `/api/cs2/inventory?id=<SteamID64 | nombre | URL>`.
 * Lo corre la Netlify Function (`netlify/functions/cs2-inventory.mts`) y, en `npm run dev`, un middleware de Vite.
 * `fetcher` se pasa para probarlo sin red.
 *
 * - Resuelve un nombre de perfil con el XML de Steam y baja hasta 3 páginas del inventario (6.000 objetos).
 * - La CDN de Netlify guarda cada respuesta 15 minutos (los errores, 1): Steam corta con 429 si se le pide mucho.
 * - **No registra nada**: ni SteamID ni IP. Sólo devuelve.
 */
import { compact, inventoryUrl, merge, parseProfile, parseVanityXml, vanityUrl, type InvError, type InvItem } from "./steam";

const PAGES = 3;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; vestigo.gg inventory)" };

function reply(body: unknown, status: number, cdnSeconds: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${Math.min(cdnSeconds, 300)}`,
      "netlify-cdn-cache-control": `public, s-maxage=${cdnSeconds}, stale-while-revalidate=300`,
    },
  });
}
/** Un error, con el SteamID si ya se sabe: la página arma con él el enlace para pegar el inventario a mano. */
const fail = (error: InvError, steamid?: string) => reply({ error, ...(steamid ? { steamid } : {}) }, { bad: 400, private: 403, notfound: 404, busy: 503 }[error], 60);

export async function handleInventory(url: URL, fetcher: typeof fetch = fetch): Promise<Response> {
  const prof = parseProfile(url.searchParams.get("id") ?? "");
  if (!prof) return fail("bad");
  const get = (u: string) => fetcher(u, { headers: UA, signal: AbortSignal.timeout(10_000) });
  try {
    let id = prof.value;
    if (prof.kind === "vanity") {
      const r = await get(vanityUrl(prof.value));
      if (r.status === 429 || r.status >= 500) return fail("busy");
      const found = parseVanityXml(await r.text());
      if (!found) return fail("notfound");
      id = found;
    }
    const pages: InvItem[][] = [];
    let start: string | undefined;
    let partial = false;
    for (let i = 0; i < PAGES; i++) {
      const r = await get(inventoryUrl(id, start));
      if (r.status === 403 || r.status === 401) return fail("private", id);
      if (r.status === 429 || r.status >= 500) return fail("busy", id);
      if (!r.ok) return fail("notfound");
      const page = compact(await r.json().catch(() => null));
      if ("error" in page) return fail(page.error, id);
      pages.push(page.items);
      if (!page.more || !page.lastAssetId) break;
      start = page.lastAssetId;
      partial = i === PAGES - 1;
    }
    return reply({ steamid: id, items: merge(pages), ...(partial ? { partial: true } : {}) }, 200, 900);
  } catch {
    return fail("busy");
  }
}
