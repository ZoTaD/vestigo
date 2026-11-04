/**
 * El login con Steam (OpenID 2.0), sin nada que dependa del Worker: así se
 * prueba con vitest a secas.
 *
 * Steam no da OAuth: da OpenID 2.0, que sólo dice "esta persona es el ID tal".
 * La firma no se verifica acá; se le pregunta a Steam con
 * `check_authentication` (ver `index.ts`). Lo de este archivo es lo que se
 * chequea antes y después de esa pregunta.
 */

export const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** El ID de 64 bits menos esto es el `account_id` que usa deadlock-api. */
const STEAM_ID_BASE = 76561197960265728n;

/**
 * La ruta a la que se vuelve después de entrar.
 *
 * Sólo rutas del propio sitio: una `/` y después cualquier cosa que no sea otra
 * `/` ni una `\` (`//evil.com` y `/\evil.com` los navegadores los leen como
 * otro dominio). Todo lo demás vuelve a la portada: si no, el login sería una
 * redirección abierta con nuestro dominio adelante.
 */
export function safeReturn(raw: string | null | undefined): string {
  if (!raw || raw.length > 512) return "/";
  if (!/^\/(?![/\\])/.test(raw)) return "/";
  if (/[\u0000-\u001f]/.test(raw)) return "/";
  return raw;
}

/** La dirección de Steam a la que se manda a la persona para entrar. */
export function loginUrl(origin: string, back: string): string {
  const returnTo = `${origin}/api/auth/steam/callback?r=${encodeURIComponent(safeReturn(back))}`;
  const q = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": origin,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID}?${q}`;
}

/**
 * Lo que Steam mandó de vuelta, chequeado antes de preguntarle si es válido.
 *
 * Devuelve el ID de Steam o `null`. Que esto pase no alcanza: falta que Steam
 * confirme la firma (`checkAuthBody` + `isValidResponse`).
 */
export function claimedSteamId(params: URLSearchParams, origin: string): string | null {
  if (params.get("openid.mode") !== "id_res") return null;
  if (params.get("openid.ns") !== OPENID_NS) return null;
  if (params.get("openid.op_endpoint") !== STEAM_OPENID) return null;
  const returnTo = params.get("openid.return_to") ?? "";
  if (!returnTo.startsWith(`${origin}/api/auth/steam/callback`)) return null;
  const claimed = params.get("openid.claimed_id") ?? "";
  if (params.get("openid.identity") !== claimed) return null;
  return CLAIMED_ID.exec(claimed)?.[1] ?? null;
}

/** El cuerpo de la pregunta a Steam: lo mismo que mandó, con otro `mode`. */
export function checkAuthBody(params: URLSearchParams): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");
  return body;
}

/** La respuesta de Steam es texto `clave:valor` por línea. */
export function isValidResponse(text: string): boolean {
  return text.split("\n").some((line) => line.trim() === "is_valid:true");
}

/** El `account_id` de 32 bits, el que va en `/deadlock/player/<id>`. */
export function accountIdOf(steamId: string): number {
  return Number(BigInt(steamId) - STEAM_ID_BASE);
}
