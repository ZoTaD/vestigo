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

export async function handleMatches(fetcher: typeof fetch = fetch): Promise<Response> {
  let r: Response;
  try {
    r = await fetcher(URL_MATCHES, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip" } });
  } catch {
    return json({ error: "upstream", status: 0 }, 502);
  }
  if (!r.ok) return json({ error: "upstream", status: r.status }, 502);
  try {
    const data = (await r.json()) as { parse?: { text?: { "*"?: string } } };
    const matches = parseMatches(data.parse?.text?.["*"] ?? "");
    return json({ at: Math.floor(Date.now() / 1000), matches }, 200, {
      "Cache-Control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    });
  } catch {
    return json({ error: "upstream", status: r.status }, 502);
  }
}
