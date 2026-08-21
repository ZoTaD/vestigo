/**
 * The only place the UI talks to the outside world.
 *
 * In development this hits the Vite middleware in dev-api.ts; in production the
 * Cloudflare Worker. Both speak the same contract, so the base URL is the only
 * difference.
 */
import type { LpSnapshot } from "./lp";

/**
 * Dónde van los pedidos.
 *
 * **Constante, no variable de entorno**, y eso es a propósito. Cuando la API vivía
 * en Supabase, la URL venía de `VITE_API_BASE` seteada en Netlify — así que
 * mudarla exigía tocar el panel de Netlify además del código, y un despliegue con
 * la variable vieja habría seguido pegándole a la función apagada sin que nada
 * fallara en el build. Con la URL acá, el destino viaja en el commit.
 *
 * `DEV` es de Vite y se resuelve en tiempo de compilación: en desarrollo apunta al
 * middleware de dev-api.ts, en producción al Worker.
 */
const BASE = import.meta.env.DEV ? "/api" : "https://vestigo.vestigo-gg.workers.dev";

/**
 * El Worker no pide credenciales: no hay `verify_jwt` como en las Edge Functions
 * de Supabase, así que no viaja ninguna clave desde el navegador. Lo que protege
 * la cuota es el límite por visitante, contado del lado del servidor con la IP que
 * pone Cloudflare (ver overLimit en api.ts del Worker).
 */
const authHeaders = (): Record<string, string> => ({});

/** Error codes the server can return. Each one earns its own message on screen. */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "RIOT_KEY_INVALID"
  | "PLAYER_NOT_FOUND"
  /** Riot throttled us. */
  | "RATE_LIMITED"
  /** We throttled this caller, before ever reaching Riot. */
  | "TOO_MANY_REQUESTS"
  | "UPSTREAM_ERROR"
  | "NOT_CONFIGURED"
  | "NETWORK";

export class ApiError extends Error {
  constructor(readonly code: ApiErrorCode, message: string) {
    super(message);
  }
}

// What each failure means to someone staring at the screen lives in i18n.ts,
// keyed by the codes above. This module owns the contract, not the wording.

async function post<T>(route: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("NETWORK", "No se pudo alcanzar el servidor.");
  }

  const payload = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!res.ok) {
    const code = (payload?.error?.code ?? "UPSTREAM_ERROR") as ApiErrorCode;
    // Raw and language-neutral on purpose: this line sits under the translated
    // notice as the technical detail, so a status code beats a sentence.
    throw new ApiError(code, payload?.error?.message ?? `HTTP ${res.status}`);
  }
  return payload as T;
}

/** Riot's standing for the ranked TFT queue. Null when the account is unranked. */
export interface PlayerRank {
  /** Uppercase, as Riot writes it: "GOLD", "DIAMOND", "CHALLENGER". */
  tier: string;
  /** The division, I to IV. Empty in the apex tiers, which have none. */
  division: string;
  leaguePoints: number;
  /**
   * wins + losses: how many ranked games this account has played.
   *
   * Absent from an answer served before this field existed, which is why it is
   * optional — an old snapshot row is still a real point on the graph.
   */
  games?: number;
}

/** Account level and icon. Decoration, so every field is allowed to be missing. */
export interface PlayerAccount {
  /** The account's level, which is not a board's level in a match. */
  level: number;
  iconId: number;
}

export interface PlayerRef {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  /** What the report is measured against. Absent from an offline answer. */
  rank?: PlayerRank | null;
  /** Absent from an offline answer, and whenever Riot did not respond. */
  summoner?: PlayerAccount | null;
}

export interface SearchResult {
  player: PlayerRef;
  matchIds: string[];
  /** Ids already stored, which come back instantly. */
  cached: string[];
  /** True when the answer came from storage because Riot was unreachable. */
  offline?: boolean;
  /**
   * Everything we have ever recorded about where this account stood, newest
   * first. Comes back even on an offline answer: the series lives in our own
   * database, so Riot being down costs the newest point, not the history.
   */
  lpHistory?: LpSnapshot[];
}

/** Split "Nombre#TAG" the way a person types it. Names may contain spaces. */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const trimmed = input.trim();
  const hash = trimmed.lastIndexOf("#");
  if (hash < 1 || hash === trimmed.length - 1) return null;
  return { gameName: trimmed.slice(0, hash).trim(), tagLine: trimmed.slice(hash + 1).trim() };
}

export function searchPlayer(
  gameName: string,
  tagLine: string,
  region: string
): Promise<SearchResult> {
  return post<SearchResult>("search", { gameName, tagLine, region });
}

export function fetchMatch(matchId: string, region: string): Promise<{ match: unknown }> {
  return post<{ match: unknown }>("match", { matchId, region });
}

export interface LadderEntry {
  rank: number;
  gameName: string | null;
  tagLine: string | null;
  leaguePoints: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface LadderResult {
  region: string;
  entries: LadderEntry[];
}

/** The cached Challenger ladder for a region. Served from Postgres, so it works
 *  even when the Riot key has expired. */
export function fetchLadder(region: string): Promise<LadderResult> {
  return post<LadderResult>("ladder", { region });
}
