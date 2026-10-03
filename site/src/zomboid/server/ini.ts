/**
 * El `.ini` de un servidor (2026-10-01), escrito como lo escribe el juego (`ConfigFile.write`, que usa
 * `ServerOptions`): por opción, la ayuda como `# …`, `Clave=valor` y un renglón en blanco, en el orden del juego. Los
 * booleanos van `true`/`false`, los double con el `String.valueOf` de Java (30.0) y el texto sin comillas. Como en el
 * juego, los int y double llevan "Min/Max/Default" al final de su ayuda.
 *
 * Y lo lee (`parseIni`, la Task 3 "pegá tu archivo"), renglón por renglón como el servidor.
 */
import type { Lang } from "../../i18n";
import type { Config, Issue } from "./config";
import { coerce, iniChanges, tooBig } from "./config";
import { GAME_NOTES, iniByKey, INI_DEFAULTS, rangeNumber, SERVER, type IniOption, type Value } from "./data";
import { javaDouble } from "./lua";

/** El valor de una opción como lo escribe el juego en el `.ini`. */
export function iniValue(o: IniOption, v: Value): string {
  if (o.type === "bool") return v ? "true" : "false";
  if (o.type === "double") return javaDouble(Number(v));
  return String(v);
}

/** Los renglones de la ayuda de una opción (sin el `# `), con su rango si es un número. */
function comments(o: IniOption, lang: Lang): string[] {
  const lines = o.tip ? o.tip[lang].replace(/\\"/g, '"').split("\n") : [];
  if ((o.type === "int" || o.type === "double") && o.min !== undefined && o.max !== undefined) {
    const extra = GAME_NOTES[lang].minMax(rangeNumber(o.type, o.min), rangeNumber(o.type, o.max), rangeNumber(o.type, Number(o.default)));
    if (lines.length) lines[lines.length - 1] += ` ${extra}`;
    else lines.push(extra);
  }
  return lines;
}

export function writeIni(c: Config, lang: Lang): string {
  // `ResetID`, `ServerPlayerID` y `Seed` los sortea el servidor la primera vez que arranca. Escribirlos con su default
  // (0 / vacío) sería escribir un valor inventado: sólo van si los tocaste. Ojo: que falten sólo sirve para un servidor
  // nuevo. Si este .ini reemplaza al de uno que ya existe (el nombre por defecto, `servertest`, es el del juego), el
  // servidor sortea ids nuevos al arrancar (`ServerOptions` + `saveServerTextFile`) y los jugadores tienen que crear
  // otro personaje: por eso la página pide copiar los de tu .ini (la nota de esas dos filas y la intro), y la Task 3
  // ("pegá tu archivo") los va a traer solos.
  const touched = new Set(iniChanges(c));
  let out = "";
  for (const o of SERVER.ini) {
    if (o.random && !touched.has(o.key)) continue;
    out += comments(o, lang)
      .map((line) => `# ${line}\n`)
      .join("");
    out += `${o.key}=${iniValue(o, c.ini[o.key] ?? o.default)}\n\n`;
  }
  for (const extra of c.extraIni) out += `${extra}\n`;
  return out;
}

export interface IniParse {
  /** Sólo las claves del juego con un valor que el servidor acepta (y los textos con `=`, que se avisan). */
  values: Record<string, Value>;
  /** Los renglones `Clave=valor` que no son del juego, tal cual, para devolverlos al escribir. */
  extra: string[];
  issues: Issue[];
}

/**
 * Lee un `.ini` de servidor como el juego (`ConfigFile.read`): renglón por renglón, salteando los vacíos y los `#`, con
 * la clave hasta el primer `=`. Las claves se comparan exactas, como en el juego (`pvp` no es `PVP`). Nunca tira.
 *
 * Un texto con otro `=` (`PublicName=Mi = server`) se conserva tal cual, con un aviso: el servidor corta el renglón en
 * cada `=` y se queda con el segundo pedazo ("Mi "), que es el `used` del aviso.
 */
export function parseIni(text: string): IniParse {
  const res: IniParse = { values: {}, extra: [], issues: [] };
  if (tooBig(text)) {
    res.issues.push({ line: 1, kind: "size" });
    return res;
  }
  text.split("\n").forEach((raw, i) => {
    const line = i + 1;
    const row = raw.replace(/\r$/, "");
    const trimmed = row.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const at = row.indexOf("=");
    if (at < 0) {
      res.issues.push({ line, kind: "syntax", got: trimmed });
      return;
    }
    const key = row.slice(0, at).trim();
    const value = row.slice(at + 1);
    const opt = iniByKey(key);
    if (!opt) {
      res.extra.push(trimmed);
      res.issues.push({ line, key, kind: "unknown" });
      return;
    }
    const r = coerce(opt, value);
    if (r.ok) res.values[key] = r.value;
    else if (r.reason === "equals") {
      res.values[key] = value;
      res.issues.push({ line, key, kind: "equals", got: value, used: value.split("=")[0] });
    } else res.issues.push({ line, key, kind: r.reason, got: value, used: INI_DEFAULTS[key] });
  });
  return res;
}
