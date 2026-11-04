/**
 * La función de partidos de CS2 (2026-11-03, etapa 6a): pide `Liquipedia:Matches` por su API y devuelve los partidos
 * en JSON. La CDN de Netlify guarda la respuesta 10 minutos, así a Liquipedia le llega un pedido cada 10 minutos como
 * mucho (su límite para `parse` es uno cada 30 s). No registra nada.
 */
import { parseMatches } from "./matches";

const URL_MATCHES = "https://liquipedia.net/counterstrike/api.php?action=parse&page=Liquipedia:Matches&prop=text&format=json";
const UA = "VestigoBot/1.0 (https://vestigo.gg)";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

/**
 * Una falla también queda en la CDN (90 s): si no, con Liquipedia limitando, cada visita volvería a pedirle. `durable`:
 * una sola copia para toda la CDN, no una por nodo.
 */
const fail = (status: number) =>
  json({ error: "upstream", status }, 502, { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=90" });

/**
 * `url`: la dirección pedida. Con parámetros (`?utm_…`, `?x=1`) la CDN la guardaría aparte y cada variante le pediría a
 * Liquipedia: se redirige a la dirección limpia sin pedir nada.
 */
export async function handleMatches(fetcher: typeof fetch = fetch, url?: URL): Promise<Response> {
  if (url?.search) return new Response(null, { status: 301, headers: { Location: "/api/cs2/matches", "Cache-Control": "public, max-age=3600" } });
  let r: Response;
  try {
    r = await fetcher(URL_MATCHES, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip" } });
  } catch {
    return fail(0);
  }
  if (!r.ok) return fail(r.status);
  try {
    // La API de MediaWiki puede contestar 200 con `{"error": …}` (por ejemplo, `ratelimited`).
    const data = (await r.json()) as { parse?: { text?: { "*"?: string } } };
    const html = data.parse?.text?.["*"];
    if (html == null) return fail(r.status);
    return json({ at: Math.floor(Date.now() / 1000), matches: parseMatches(html) }, 200, {
      "Cache-Control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=600, stale-while-revalidate=3600",
    });
  } catch {
    return fail(r.status);
  }
}
