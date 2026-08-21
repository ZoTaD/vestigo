/**
 * El cron que junta partidas solo, ahora en Cloudflare Workers y contra D1.
 *
 * Portado de `supabase/functions/tft-pull`. Lo que NO cambió es el diseño, y
 * conviene tenerlo a mano porque son las tres cosas que lo explican:
 *
 * 1. **La dev key vence cada 24 horas.** Esto va a fallar todos los días hasta
 *    que Riot apruebe la production key. Por eso cada corrida deja una fila en
 *    `pull_runs` con su motivo: un cron que falla en silencio parece que anda.
 * 2. **Comparte la cuota de Riot con las búsquedas en vivo**, así que hay un
 *    presupuesto de llamadas por corrida.
 * 3. **No se le puede pedir a Riot solo las rankeds**: el endpoint de ids ignora
 *    el parámetro `queue` (verificado: queue=1100 y queue=1090 devuelven lo
 *    mismo). Se filtra después de bajar la partida, no antes.
 *
 * Lo que sí cambió, y es a propósito: **ya no hay prune por tamaño**. En Postgres
 * existía porque el plan gratuito cortaba en 500 MB, y fue el mecanismo que un
 * día vació la tabla de partidas (medía la base entera y borraba solo de
 * `matches`). Acá el techo es otro y el recorte real lo hace la retención del
 * resumidor, que conserva las 14.000 más nuevas y **archiva en R2 antes de
 * borrar**. Un solo mecanismo de borrado, y el que sabe guardar lo que tira.
 *
 * 4. **No guarda partidas de un set que ya cerró** (ver `sets.ts`). El día que
 *    abre un set nuevo esto tira casi todo lo que baja durante unos días,
 *    porque la ventana de 10 días que se le pide a Riot sigue llena del set
 *    viejo. Es lo buscado: esas partidas se van a borrar igual, y guardarlas
 *    sería llenar D1 con datos condenados.
 */

import { currentSet } from "./sets";

export interface Env {
  DB: D1Database;
  RIOT_API_KEY: string;
  CRON_SECRET: string;
}

/**
 * El presupuesto de una corrida, en llamadas a Riot.
 *
 * Era 90 con el cron cada 5 minutos. Acá manda otro límite: **Workers permite 50
 * subrequests por invocación en el plan gratuito**, y cada llamada a Riot es una.
 * La primera corrida murió en la 52 con "Too many subrequests" — después de
 * guardar 40 partidas, así que no se pierde nada, pero la corrida queda en error
 * y el resto de los jugadores sin mirar.
 *
 * **Con el plan pago (2026-07-29) el techo pasó a 1.000 subrequests** y el cron de
 * 2 minutos se respeta. El límite dejó de ser Cloudflare y volvió a ser Riot: la
 * dev key da **100 llamadas cada 2 minutos**, que ahora es exactamente la ventana
 * de una corrida.
 *
 * **90, decisión de ZoTaD (2026-07-29), y el que quede corto es el visitante.**
 * Una búsqueda cuesta hasta 24 llamadas (cuenta + ids + rango + nivel + hasta 20
 * partidas), así que con 90 alguien que se busque justo mientras corre el cron
 * puede comerse un 429 de Riot. Se acepta a propósito: con ~21 visitantes por
 * semana, reservar 30 llamadas no protege a nadie real y cuesta un tercio de la
 * ingesta. La ventana se renueva cada 2 minutos, así que el que caiga ahí reintenta
 * y entra.
 *
 * **Este es el número a bajar en cuanto haya tráfico de verdad** — antes que
 * cualquier otra cosa. Y sube recién con la production key (500 cada 10 s).
 *
 * Queda anotado lo que costaba el plan gratuito, porque es la cuenta que justifica
 * los 5 dólares: 50 subrequests por invocación y el cron disparando cada 5 minutos
 * pase lo que pase dejaban la ingesta en ~500 partidas por hora. El que manda ahora
 * vuelve a ser el límite de Riot: 90 llamadas cada 2 minutos contra las 100 cada 2
 * que da la dev key, así que este número no sube más sin la production key.
 */
const CALL_BUDGET = 90;
/**
 * Cuántos jugadores se miran por corrida — el número que más importa: la API de
 * TFT no tiene "dame partidas", sólo `matches/by-puuid/{puuid}/ids`, así que la
 * única puerta a partidas nuevas es mirar más jugadores.
 *
 * Cuatro, no ocho, y sale de la misma cuenta que CALL_BUDGET: cada jugador cuesta
 * hasta 12 llamadas (rango + ids + 10 partidas nuevas), y el corte por presupuesto
 * frena antes de pasarse. 42 deja margen bajo el tope de 50 por si alguna consulta
 * a D1 también cuenta como subrequest.
 */
const PLAYERS_PER_RUN = 8;
const IDS_PER_PLAYER = 10;
/** Solo lo que le sirve al parche vigente; Riot filtra en origen y ahorra cuota. */
const WINDOW_DAYS = 10;
/** La cola rankeada estándar, la única que alimenta el meta. */
const RANKED_QUEUE = 1100;

const PLATFORM_TO_ROUTING: Record<string, string> = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  kr: "asia", jp1: "asia", oc1: "sea",
};

interface StoredMatch {
  info?: { queue_id?: number; tft_set_number?: number; game_datetime?: number; game_version?: string };
  metadata?: { participants?: string[] };
}

const ahora = () => new Date().toISOString();

export async function pull(env: Env): Promise<Record<string, unknown>> {
  let calls = 0;
  /** Una llamada a Riot, contada. Tira con el status adentro para que quede en el log. */
  const riot = async <T>(url: string): Promise<T> => {
    calls++;
    const res = await fetch(url, { headers: { "X-Riot-Token": env.RIOT_API_KEY } });
    if (!res.ok) throw new Error(`RIOT_${res.status}`);
    return (await res.json()) as T;
  };

  /**
   * El tier del jugador semilla, o "" si no se sabe. Nunca tira: quedarse sin la
   * etiqueta cuesta que esa partida no se pueda priorizar al borrar, y eso vale
   * muchísimo menos que perder la corrida entera. Sólo la cola estándar — el
   * rango de Hyper Roll no describe el elo de las partidas que guardamos.
   */
  const seedTier = async (puuid: string, platform: string): Promise<string> => {
    try {
      const entries = await riot<{ queueType: string; tier: string }[]>(
        `https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${encodeURIComponent(puuid)}`
      );
      return entries.find((e) => e.queueType === "RANKED_TFT")?.tier ?? "";
    } catch {
      return "";
    }
  };

  const run = await env.DB.prepare("insert into pull_runs (status) values ('running') returning id")
    .first<{ id: number }>();
  const runId = run?.id ?? null;

  let players = 0;
  let stored = 0;
  /** De las guardadas, cuántas alimentan el meta. El resto son normales y eventos. */
  let ranked = 0;
  /**
   * Bajadas y tiradas por ser de un set que ya cerró.
   *
   * Se cuenta y se loguea porque los días del cambio de set va a ser un número
   * grande y alarmante —la ventana de 10 días que pide el cron sigue llena de
   * partidas del set viejo— y hay que poder distinguir "esto es el cambio de
   * set, se arregla solo en unos días" de "algo se rompió y no guarda nada".
   */
  let skippedOldSet = 0;
  let status = "ok";
  let detail: string | null = null;

  try {
    if (!env.RIOT_API_KEY) throw new Error("NO_RIOT_KEY");

    // Los menos visitados primero, para que la cobertura se reparta en vez de
    // volver siempre sobre los mismos. En SQLite NULL ordena primero por
    // defecto, que es justo lo que se quiere (nunca consultado = máxima
    // prioridad), pero se escribe explícito para que no dependa de eso.
    const { results: rows } = await env.DB.prepare(
      "select puuid, region from players order by pulled_at is not null, pulled_at limit ?"
    )
      .bind(PLAYERS_PER_RUN)
      .all<{ puuid: string; region: string | null }>();

    const since = Math.floor((Date.now() - WINDOW_DAYS * 86_400_000) / 1000);

    for (const p of rows) {
      if (calls >= CALL_BUDGET) break;
      const platform = (p.region ?? "").toLowerCase();
      const routing = PLATFORM_TO_ROUTING[platform] ?? "americas";
      players++;

      // El rango del jugador semilla, con el que se etiquetan sus partidas. Una
      // llamada por jugador, no por partida.
      const tier = await seedTier(p.puuid, platform);

      const ids = await riot<string[]>(
        `https://${routing}.api.riotgames.com/tft/match/v1/matches/by-puuid/` +
          `${encodeURIComponent(p.puuid)}/ids?count=${IDS_PER_PLAYER}&startTime=${since}`
      );

      // Cuáles ya tenemos, en una sola consulta y no una por id.
      const safe = ids.filter((id) => /^[A-Za-z0-9_]+$/.test(id));
      const have = new Set<string>();
      if (safe.length > 0) {
        const { results } = await env.DB.prepare(
          `select match_id from matches where match_id in (${safe.map(() => "?").join(",")})`
        )
          .bind(...safe)
          .all<{ match_id: string }>();
        for (const r of results) have.add(r.match_id);
      }

      for (const id of safe) {
        if (calls >= CALL_BUDGET) break;
        if (have.has(id)) continue;

        const match = await riot<StoredMatch>(
          `https://${routing}.api.riotgames.com/tft/match/v1/matches/${encodeURIComponent(id)}`
        );
        const info = match.info ?? {};

        // Lo de un set que ya no es el vigente NO se guarda, y es la única
        // excepción a la regla de abajo de "se guarda aunque no sirva".
        //
        // La regla existe porque descartar algo ya bajado sólo garantiza
        // re-bajarlo. Acá eso no aplica: una partida del set anterior no se va a
        // volver a pedir nunca —el juego no la juega más— y encima está
        // condenada, porque cerrar un set borra sus crudas. Guardarla sería
        // pagar ~19 KB de D1 por un dato con fecha de vencimiento pasada.
        //
        // Se compara contra `tft_set_number`, que viene adentro de la partida, y
        // no contra la fecha: el día del cambio Riot despliega escalonado por
        // región durante ~24 h y conviven partidas de los dos sets. La fecha de
        // `sets.ts` decide desde cuándo dejamos de aceptar el set viejo; qué set
        // es cada partida lo dice la partida.
        //
        // `null` (partida sin el campo) pasa: es rarísimo y el filtro real de la
        // lectura ya lo descarta, y no quiero que un campo faltante se coma la
        // ingesta entera.
        const vigente = currentSet();
        if (typeof info.tft_set_number === "number" && info.tft_set_number !== vigente) {
          skippedOldSet++;
          continue;
        }

        // Se guarda aunque no sea ranked: el payload ya está bajado y el filtro
        // vive en la lectura. Descartarlo acá sólo garantizaría re-bajarlo.
        //
        // La partida y sus tableros van en un batch: D1 lo corre como una sola
        // transacción, así que no puede quedar una partida sin sus participantes
        // — que es lo que dejaría un corte entre las dos escrituras.
        const parts = match.metadata?.participants ?? [];
        await env.DB.batch([
          env.DB.prepare(
            "insert or replace into matches " +
              "(match_id, region, set_number, queue_id, game_datetime, game_version, payload, fetched_at, tier) " +
              "values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            id,
            p.region ?? "",
            info.tft_set_number ?? null,
            info.queue_id ?? null,
            info.game_datetime ?? null,
            info.game_version ?? null,
            JSON.stringify(match),
            ahora(),
            // El rango del jugador por el que llegamos a esta partida: no es el
            // del lobby, es la banda de la que se lo pescó.
            tier
          ),
          ...parts.map((puuid) =>
            env.DB.prepare("insert or ignore into match_players (match_id, puuid) values (?, ?)").bind(id, puuid)
          ),
        ]);

        stored++;
        if (info.queue_id === RANKED_QUEUE) ranked++;
      }

      await env.DB.prepare("update players set pulled_at = ? where puuid = ?").bind(ahora(), p.puuid).run();
    }
  } catch (e) {
    // El motivo importa más que el stack: "RIOT_401" es "se venció la key", la
    // falla que va a pasar todos los días hasta la production key.
    status = "error";
    detail = e instanceof Error ? e.message : String(e);
  }

  if (runId !== null) {
    await env.DB.prepare(
      "update pull_runs set finished_at = ?, players = ?, matches = ?, riot_calls = ?, status = ?, detail = ? where id = ?"
    )
      .bind(
        ahora(),
        players,
        stored,
        calls,
        status,
        detail ??
          `${ranked} de ${stored} rankeds` +
            (skippedOldSet > 0 ? ` — ${skippedOldSet} descartadas del set anterior` : ""),
        runId
      )
      .run();
  }

  return { players, matches: stored, ranked, calls, status, detail };
}
