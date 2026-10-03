/**
 * El link para compartir una configuración del generador (2026-10-01): `?p=<preset>&s=<clave>:<valor>;…&i=<clave>:<valor>;…`,
 * sólo con lo que cambiaste respecto del preset (sandbox) o del default (`.ini`). Así un link con dos cambios mide dos
 * cambios, y no las 413 opciones.
 *
 * - Cada clave y cada valor van con `encodeURIComponent` (un `;` o un `:` dentro de un texto no rompen nada), y el
 *   parámetro entero se escribe con `URLSearchParams`, que lo vuelve a escapar: al leerlo, `URLSearchParams` deshace la
 *   segunda capa y `decodeURIComponent` la primera.
 * - **Nunca** lleva `INI_SECRET` (la contraseña del servidor, la de RCON, el token de Discord y el webhook), ni
 *   `INI_NO_LINK` (la IP anunciada, los ids del servidor y las rutas de tu compu), ni lo que trajo "pegá tu archivo" de
 *   mods (`extra*`): eso es de tu archivo, no de un link que se pega en un foro.
 * - Leer nunca tira: un preset desconocido cae en Apocalipsis, y una clave desconocida o un valor que `coerce` rechaza se
 *   descartan sin perder el resto. Un link armado a mano tampoco puede poner una contraseña.
 */
import { coerce, fromPreset, iniChanges, sandboxChanges, type Config } from "./config";
import { iniByKey, optionByKey, presetById, SERVER, type IniOption, type PresetId, type SandboxOption } from "./data";

/**
 * Las claves del `.ini` que guardan un secreto. Revisadas las 144 (2026-10-01): son éstas cuatro. Los canales de
 * Discord (`DiscordChatChannel`…) son ids que no dan acceso a nada.
 */
export const INI_SECRET = ["Password", "RCONPassword", "DiscordToken", "WebhookAddress"];
/**
 * Las que tampoco viajan en el link sin ser secretas (revisión del 2026-10-01):
 * - `server_browser_announced_ip`: un servidor privado no la publica, y un link pegado en un foro la expondría;
 * - `ResetID` y `ServerPlayerID`: son de un servidor; copiadas a otro, mezclan los personajes de los dos;
 * - `BadWordListFile` y `GoodWordListFile`: rutas de tu compu, que pueden llevar tu usuario de Windows.
 * `Seed` sí viaja: es la gracia de compartir un mundo.
 */
export const INI_NO_LINK = ["server_browser_announced_ip", "ResetID", "ServerPlayerID", "BadWordListFile", "GoodWordListFile"];
/** Lo que el link nunca lleva, ni al escribirlo ni al leerlo (un link armado a mano tampoco lo puede poner). */
const OFF_LINK = new Set([...INI_SECRET, ...INI_NO_LINK]);

const pairs = (keys: string[], values: Config["sandbox"]) =>
  keys.map((k) => `${encodeURIComponent(k)}:${encodeURIComponent(String(values[k]))}`).join(";");

/** Las claves de la dirección que son de la configuración (`encodeConfig`); las demás (`utm_…`) se conservan. */
export const CONFIG_KEYS = ["p", "s", "i"];

export function encodeConfig(c: Config): string {
  const q = new URLSearchParams({ p: c.preset });
  const s = sandboxChanges(c);
  const i = iniChanges(c).filter((k) => !OFF_LINK.has(k));
  if (s.length) q.set("s", pairs(s, c.sandbox));
  if (i.length) q.set("i", pairs(i, c.ini));
  return q.toString();
}

/** Los pares `clave:valor` de un parámetro, ya sin escapar. Uno roto (sin `:`, o con un `%` suelto) se saltea. */
function readPairs(raw: string | null): [string, string][] {
  if (!raw) return [];
  const out: [string, string][] = [];
  for (const part of raw.split(";")) {
    const at = part.indexOf(":");
    if (at <= 0) continue;
    try {
      out.push([decodeURIComponent(part.slice(0, at)), decodeURIComponent(part.slice(at + 1))]);
    } catch {
      // Un `%` que no es un escape: ese par no se entiende, los demás sí.
    }
  }
  return out;
}

export function decodeConfig(q: URLSearchParams): Config {
  const p = q.get("p");
  const c = fromPreset(p && presetById(p) ? (p as PresetId) : SERVER.baseline);
  const apply = (target: Config["sandbox"], find: (k: string) => SandboxOption | IniOption | undefined, raw: string | null) => {
    for (const [key, value] of readPairs(raw)) {
      const opt = find(key);
      if (!opt) continue;
      const r = coerce(opt, value);
      if (r.ok) target[opt.key] = r.value;
    }
  };
  apply(c.sandbox, optionByKey, q.get("s"));
  apply(c.ini, (k) => (OFF_LINK.has(k) ? undefined : iniByKey(k)), q.get("i"));
  return c;
}

/** La de entrada (Apocalipsis sin cambios ni extras): la página limpia, sin `?` en la dirección. */
export const isDefaultConfig = (c: Config): boolean =>
  c.preset === SERVER.baseline && !sandboxChanges(c).length && !iniChanges(c).length && !c.extraLua.length && !c.extraIni.length;
