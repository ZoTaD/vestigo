/**
 * El Worker de Vestigo: un solo script con las dos entradas.
 *
 * - `scheduled`: el cron de partidas, cada 5 minutos (ver pull.ts).
 * - `fetch`: por ahora sólo un disparador manual del mismo cron y un health
 *   check. La API pública (`search`, `match`, `ladder`) se muda acá después;
 *   hasta entonces la sirve la Edge Function de Supabase, que lee la misma
 *   ventana de partidas.
 *
 * Por qué un solo Worker y no uno por cosa: comparten el binding de D1, los
 * secrets y el despliegue. Separarlos sería tres veces la configuración para el
 * mismo código.
 */
import { pull, type Env } from "./pull";
import { handleApi } from "./api";

export default {
  /**
   * El cron. Cloudflare lo invoca desde adentro, así que acá no hace falta el
   * secreto que sí necesitaba la Edge Function: aquella era una URL pública y
   * cualquiera que la descubriera gastaba la cuota de Riot.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      pull(env).then((r) => {
        console.log(JSON.stringify(r));
      })
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const ruta = new URL(req.url).pathname.replace(/\/+$/, "");

    // La API pública: search, match y ladder (ver api.ts). Va primero porque es
    // lo único que sirve a un visitante; el resto son herramientas.
    const api = await handleApi(req, env, ruta);
    if (api) return api;

    if (ruta === "" || ruta === "/health") {
      const { total } = (await env.DB.prepare("select count(*) as total from matches").first<{ total: number }>()) ?? {
        total: 0,
      };
      return Response.json({ ok: true, partidas: total });
    }

    // El mismo cron, a mano, para probarlo sin esperar cinco minutos. Lleva
    // secreto porque esto SÍ es una URL pública.
    if (ruta === "/pull") {
      if (!env.CRON_SECRET || req.headers.get("x-cron-secret") !== env.CRON_SECRET) {
        return new Response("no", { status: 401 });
      }
      const r = await pull(env);
      return Response.json(r, { status: r.status === "ok" ? 200 : 500 });
    }

    return new Response("not found", { status: 404 });
  },
};
