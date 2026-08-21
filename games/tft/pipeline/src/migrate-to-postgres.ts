import { fileURLToPath } from "node:url";
import { loadRawMatches, type StoredMatch } from "./store";
import { patchOf } from "./patch";

/**
 * One-off: push the local match store into Postgres.
 *
 * Everything goes up, including Double Up and older sets. The store keeps Riot's
 * payload verbatim and filtering happens on read (see store.isComparable), so
 * throwing data away here would only mean re-downloading it later.
 *
 * Run:
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs src/migrate-to-postgres.ts [patch]
 *
 * With no patch argument, every pending match goes up. Passing one (e.g. "16.14")
 * uploads only matches on that client version — the disk store accumulates every
 * patch ever pulled, and most of that is dead weight once a newer one is current.
 *
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs src/migrate-to-postgres.ts --repair-tiers
 *
 * `--repair-tiers` does something different: it does not upload anything new,
 * it fixes rows already in Postgres that were uploaded before this script sent
 * `tier` at all, so they sit there with `tier = ''` even though the disk store
 * has the rank all along. See `planTierRepairs` and `repairTiers`.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. The service role key
 * bypasses RLS, so it lives only here and in the Edge Function — never in the
 * browser, never in git.
 */

const STORE = "../data/matches";
/** Payloads run ~20 KB, so this keeps each request near half a megabyte. */
const BATCH = 25;

/**
 * Lo que se lee del payload. Escrito acá y no importado: `StoredMatch.match` viene
 * tipado como el `RawMatch` de riot/normalize, y castear entre dos interfaces
 * distintas con el mismo nombre es un error de tipos, no una conveniencia.
 */
interface MatchInfo {
  tft_set_number?: number;
  queueId?: number;
  queue_id?: number;
  game_datetime?: number;
  game_version?: string;
}

const infoOf = (s: StoredMatch): MatchInfo =>
  (s.match as unknown as { info?: MatchInfo }).info ?? {};

export interface MatchRow {
  match_id: string;
  region: string;
  set_number: number | null;
  queue_id: number | null;
  game_datetime: number | null;
  game_version: string | null;
  /**
   * El rango del jugador por el que llegamos a esta partida. El store en disco lo
   * tiene desde el 2026-07-23 y esta migración lo dejaba afuera, así que todo lo
   * subido antes quedó sin rango — y sin rango, bandCovers lo cuenta como apex.
   */
  tier: string;
  payload: unknown;
}

export function matchRow(s: StoredMatch): MatchRow {
  const info = infoOf(s);
  return {
    match_id: s.matchId,
    // The store predates per-match region tracking; the id carries it.
    region: (s.matchId.split("_")[0] || "na1").toLowerCase(),
    set_number: info.tft_set_number ?? null,
    queue_id: info.queueId ?? info.queue_id ?? null,
    game_datetime: info.game_datetime ?? null,
    game_version: info.game_version ?? null,
    tier: s.tier ?? "",
    payload: s.match,
  };
}

/**
 * Lo que falta subir. El parche es un filtro y no un adorno: el disco tiene 22.016
 * partidas y solo las del parche vigente alimentan lo que se publica, así que subir
 * el resto es gastar 180 MB del plan gratuito en datos que nadie va a leer.
 */
export function selectPending(
  stored: StoredMatch[],
  already: Set<string>,
  patch: string
): StoredMatch[] {
  return stored.filter((s) => {
    if (already.has(s.matchId)) return false;
    if (!patch) return true;
    return patchOf(infoOf(s).game_version ?? "") === patch;
  });
}

/** Una fila de Postgres, tal como la necesita {@link planTierRepairs}. */
export interface PgTierRow {
  match_id: string;
  tier: string | null;
}

export interface TierRepairPlan {
  /** Match ids a reparar, agrupados por el tier que hay que escribirles. */
  byTier: Map<string, string[]>;
  /** Vacías en Postgres y también en el disco: no hay de dónde sacar el tier. */
  unrepairable: number;
}

/**
 * Qué reparar: las filas que están en Postgres con `tier = ''` y sí tienen tier
 * en el disco. Agrupa por tier en vez de devolver una lista plana porque el
 * caller manda un PATCH por grupo, no uno por partida (ver `repairTiers`).
 *
 * Una fila con tier en Postgres no se toca aunque el disco diga otra cosa: el
 * disco es la fuente para lo que faltaba, no para pisar lo que ya está.
 */
export function planTierRepairs(stored: StoredMatch[], pgRows: PgTierRow[]): TierRepairPlan {
  const diskTier = new Map(stored.map((s) => [s.matchId, s.tier ?? ""]));
  const byTier = new Map<string, string[]>();
  let unrepairable = 0;
  for (const row of pgRows) {
    if ((row.tier ?? "") !== "") continue;
    const tier = diskTier.get(row.match_id) ?? "";
    if (!tier) {
      unrepairable++;
      continue;
    }
    const ids = byTier.get(tier) ?? [];
    ids.push(row.match_id);
    byTier.set(tier, ids);
  }
  return { byTier, unrepairable };
}

/**
 * A seat held by a person rather than a bot.
 *
 * Measured over the whole store, the puuid field takes exactly two shapes:
 * 78 characters for a real account (45,862 seats) and the literal "BOT" for a
 * filled seat (1,532). Bots share that one value, so a lobby with several of
 * them repeats the same (match_id, puuid) pair.
 *
 * The test is on length, not on the word: a player can put anything after the #
 * in their Riot ID, and 26 real accounts in the store are tagged #BOT —
 * "Brando#BOT" among them. Their puuid is still 78 characters, so they stay.
 * The tag line is theirs to choose; the puuid is Riot's to assign.
 */
const MIN_PUUID_LENGTH = 20;
const isRealPuuid = (puuid: string | undefined): puuid is string =>
  typeof puuid === "string" && puuid.length >= MIN_PUUID_LENGTH;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.\n" +
        "La service role key está en el dashboard, en Project Settings > API."
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function post(path: string, rows: unknown[], cfg: { url: string; key: string }) {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${path} respondió ${res.status}: ${await res.text()}`);
}

/** Match ids already in Postgres, so a re-run costs nothing. */
async function existing(cfg: { url: string; key: string }): Promise<Set<string>> {
  const found = new Set<string>();
  const page = 1000;
  // Corta con una página vacía y avanza por lo que vino, no por lo que se pidió:
  // PostgREST tiene su propio tope de filas por respuesta, así que "vino menos de
  // lo pedido" no significa "se acabaron los datos". El `order` es lo que hace que
  // paginar con `offset` no repita ni saltee.
  let offset = 0;
  for (;;) {
    const res = await fetch(
      `${cfg.url}/rest/v1/matches?select=match_id&limit=${page}&offset=${offset}` +
        `&order=match_id.asc`,
      { headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}` } }
    );
    if (!res.ok) throw new Error(`no pude leer matches: ${res.status}`);
    const rows = (await res.json()) as { match_id: string }[];
    for (const r of rows) found.add(r.match_id);
    if (rows.length === 0) break;
    offset += rows.length;
  }
  return found;
}

/** Las filas de Postgres con `tier = ''`, que es todo lo que `--repair-tiers` puede tocar. */
async function emptyTierRows(cfg: { url: string; key: string }): Promise<PgTierRow[]> {
  const out: PgTierRow[] = [];
  const page = 1000;
  let offset = 0;
  for (;;) {
    const res = await fetch(
      `${cfg.url}/rest/v1/matches?select=match_id,tier&tier=eq.&limit=${page}&offset=${offset}` +
        `&order=match_id.asc`,
      { headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}` } }
    );
    if (!res.ok) throw new Error(`no pude leer matches: ${res.status}`);
    const rows = (await res.json()) as PgTierRow[];
    out.push(...rows);
    if (rows.length === 0) break;
    offset += rows.length;
  }
  return out;
}

/**
 * Los ids de partida son de la forma `LA2_1518016995`. Antes de meter algo en
 * una URL de PostgREST tiene que pasar por acá, igual que ya hace la Edge
 * Function `tft-pull` con los ids que le llegan de Riot.
 */
const SAFE_MATCH_ID = /^[A-Za-z0-9_]+$/;

/** Cuántos ids entran en un solo `in.(...)`, para que la URL no sea gigante. */
const TIER_BATCH = 100;

/** Un PATCH por lote de ids que comparten tier, en vez de uno por partida. */
async function patchTier(
  ids: string[],
  tier: string,
  cfg: { url: string; key: string }
): Promise<void> {
  for (let i = 0; i < ids.length; i += TIER_BATCH) {
    const slice = ids.slice(i, i + TIER_BATCH);
    const unsafe = slice.filter((id) => !SAFE_MATCH_ID.test(id));
    if (unsafe.length > 0) {
      throw new Error(`match_id con caracteres inesperados: ${unsafe.join(", ")}`);
    }
    const res = await fetch(
      `${cfg.url}/rest/v1/matches?match_id=in.(${slice.join(",")})`,
      {
        method: "PATCH",
        headers: {
          apikey: cfg.key,
          authorization: `Bearer ${cfg.key}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({ tier }),
      }
    );
    if (!res.ok) throw new Error(`PATCH tier respondió ${res.status}: ${await res.text()}`);
  }
}

/**
 * Repara el tier de lo que ya está en Postgres: las filas con `tier = ''` que
 * el store en disco sí tiene etiquetadas. Nunca pisa una fila que ya tiene
 * tier, y no inventa nada para la que tampoco lo tiene en disco — no saber en
 * qué elo se jugó una partida es un dato legítimo, y el build de disco las
 * trata igual (bandCovers las manda a global y apex).
 */
async function repairTiers(cfg: { url: string; key: string }): Promise<void> {
  const stored = loadRawMatches(STORE);
  console.log(`store local: ${stored.length} partidas`);

  const empty = await emptyTierRows(cfg);
  console.log(`en Postgres sin tier: ${empty.length}`);

  const plan = planTierRepairs(stored, empty);
  let repaired = 0;
  for (const [tier, ids] of plan.byTier) {
    await patchTier(ids, tier, cfg);
    repaired += ids.length;
    console.log(`reparadas ${ids.length} a "${tier}" (${repaired} van)`);
  }

  console.log(`reparadas: ${repaired}`);
  console.log(`sin tier también en disco, sin tocar: ${plan.unrepairable}`);
}

async function main() {
  const cfg = config();

  // El flag empieza con guiones; sin excluirlo antes de buscar el parche
  // posicional, "--repair-tiers" se leería como un parche (ver build.ts,
  // que tuvo el mismo bug con "--from=pg").
  const argv = process.argv.slice(2).map((a) => a.trim());
  if (argv.includes("--repair-tiers")) {
    await repairTiers(cfg);
    return;
  }

  const stored = loadRawMatches(STORE);
  console.log(`store local: ${stored.length} partidas`);

  const already = await existing(cfg);
  console.log(`ya en Postgres: ${already.size}`);

  // Los scripts de npm no setean variables de entorno igual en PowerShell que en
  // bash (ver build.ts y pull.ts), así que el parche llega por argumento posicional.
  const patch = argv.find((a) => a && !a.startsWith("-")) ?? "";
  const pending = selectPending(stored, already, patch);
  if (patch) console.log(`filtrando por parche ${patch}`);
  if (pending.length === 0) {
    console.log("nada que subir");
    return;
  }
  console.log(`por subir: ${pending.length}`);

  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);

    const matches = slice.map(matchRow);
    await post("matches?on_conflict=match_id", matches, cfg);

    // Written after the matches, because of the foreign key.
    //
    // Bot seats all carry the literal puuid "BOT" — 321 matches in the store have
    // several of them — so a lobby filled with bots produced repeated
    // (match_id, puuid) pairs inside one request, and Postgres refuses an upsert
    // that would touch the same row twice. They are dropped rather than
    // deduplicated: this table exists to find a person's history, and a bot is
    // not someone whose history anyone will look up. The full lobby is still in
    // the match payload, untouched.
    const players = slice.flatMap((s) => {
      const seen = new Set<string>();
      return (s.match.info?.participants ?? [])
        .filter((p) => isRealPuuid(p.puuid) && !seen.has(p.puuid!) && seen.add(p.puuid!))
        .map((p) => ({ match_id: s.matchId, puuid: p.puuid, placement: p.placement ?? null }));
    });
    if (players.length > 0) {
      await post("match_players?on_conflict=match_id,puuid", players, cfg);
    }

    done += slice.length;
    console.log(`subidas ${done}/${pending.length}`);
  }

  console.log("listo");
}

// Guarded so importing this file for matchRow/selectPending (as migrate.test.ts
// does) doesn't also fire off a live run against Postgres.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
