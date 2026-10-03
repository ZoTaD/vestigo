/**
 * El `SandboxVars.lua` de un servidor (2026-10-01), escrito como lo escribe el juego (`SandboxOptions.writeLuaFile`,
 * leído en el bytecode de la 42.21):
 *
 * ```
 * SandboxVars = {
 *     VERSION = 6,
 *     -- <ayuda> Min: 0.00 Max: 4.00 Default: 0.80      (int y double)
 *     -- <ayuda> Default = Normal                       (enum, y después un renglón por valor)
 *     -- 1 = Insane
 *     Zombies = 4,
 *     …
 *     Basement = {
 *         -- <ayuda>
 *         SpawnFrequency = 4,
 *     },
 *     …
 * }
 * ```
 *
 * - Primero las opciones sin tabla; después cada tabla, en el orden del juego (`Basement`, `Map`, `ZombieLore`,
 *   `ZombieConfig`, `MultiplierConfig`, como en `Apocalypse.lua`).
 * - Dentro de cada parte, el orden de las hojas del menú: el del constructor de Java no viaja en los datos, y una tabla
 *   de Lua no tiene orden (el juego lee cada clave por su nombre).
 * - El "Default" de la ayuda es el de Apocalipsis, como en el juego: lo fija `setDefaultsToCurrentValues` al cargarlo.
 * - La ayuda va en el idioma de la página. El juego junta los renglones de la ayuda con un espacio; acá cada renglón es
 *   un comentario, que se lee mejor y el juego ignora igual.
 *
 * Y lo lee (`parseSandboxLua`, la Task 3 "pegá tu archivo"), con un tokenizador a mano que nunca ejecuta nada: ver más
 * abajo.
 */
import type { Lang } from "../../i18n";
import { coerce, MAX_FILE, tooBig, type Config, type Issue } from "./config";
import { fullPreset, GAME_NOTES, optionByKey, rangeNumber, SERVER, UNLABELED_ENUMS, type SandboxOption, type Value } from "./data";

/** Las tablas anidadas, en el orden en que las escribe el juego. Una que no esté acá (un parche nuevo) va al final. */
const TABLE_ORDER = ["Basement", "Map", "ZombieLore", "ZombieConfig", "MultiplierConfig"];

/** Un double como `String.valueOf` de Java: 216 → "216.0", 0.8 → "0.8". */
export const javaDouble = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** Un texto entre comillas de Lua, con `\` y `"` escapados (`StringConfigOption.getValueAsLuaString`). */
export const luaString = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** El valor de una opción como lo escribe el juego en el Lua. */
export function luaValue(o: SandboxOption, v: Value): string {
  if (o.type === "string") return luaString(String(v));
  if (o.type === "bool") return v ? "true" : "false";
  if (o.type === "double") return javaDouble(Number(v));
  return String(v);
}

/** Los renglones de comentario de una opción (sin la sangría): la ayuda, su rango o su default, y los valores del enum. */
function comments(o: SandboxOption, lang: Lang): string[] {
  const notes = GAME_NOTES[lang];
  const def = fullPreset(SERVER.baseline)[o.key];
  // El juego deshace las comillas escapadas de la ayuda (`\"` → `"`).
  const lines = o.tip ? o.tip[lang].replace(/\\"/g, '"').split("\n") : [];
  let extra: string | null = null;
  if ((o.type === "int" || o.type === "double") && o.min !== undefined && o.max !== undefined) {
    extra = notes.minMax(rangeNumber(o.type, o.min), rangeNumber(o.type, o.max), rangeNumber(o.type, Number(def)));
  } else if (o.type === "enum" && o.values && !UNLABELED_ENUMS.has(o.key)) {
    const label = o.values[Number(def) - 1];
    if (label) extra = notes.def(label[lang]);
  }
  if (extra) {
    if (lines.length) lines[lines.length - 1] += ` ${extra}`;
    else lines.push(extra);
  }
  if (o.type === "enum" && o.values && !UNLABELED_ENUMS.has(o.key)) {
    o.values.forEach((label, i) => lines.push(`${i + 1} = ${label[lang].replace(/\\"/g, '"')}`));
  }
  return lines;
}

/** Una opción con sus comentarios, con la sangría de su nivel. */
const block = (o: SandboxOption, name: string, v: Value, lang: Lang, pad: string): string =>
  comments(o, lang)
    .map((line) => `${pad}-- ${line}\n`)
    .join("") + `${pad}${name} = ${luaValue(o, v)},\n`;

export function writeSandboxLua(c: Config, lang: Lang): string {
  const loose: string[] = [];
  const tables = new Map<string, string[]>();
  for (const o of SERVER.options) {
    const dot = o.key.indexOf(".");
    const v = c.sandbox[o.key] ?? o.default;
    if (dot < 0) {
      loose.push(block(o, o.key, v, lang, "    "));
      continue;
    }
    const table = o.key.slice(0, dot);
    if (!tables.has(table)) tables.set(table, []);
    tables.get(table)!.push(block(o, o.key.slice(dot + 1), v, lang, "        "));
  }
  // Lo de los mods: una clave desconocida de una tabla del juego (`ZombieLore.DeUnMod = 3`, ver `parseSandboxLua`) vuelve
  // adentro de su tabla, porque el juego lee cada tabla entera por su nombre y una segunda `ZombieLore = {…}` al final
  // pisaría la primera. Las demás (las tablas de los mods) van al final, tal cual.
  const tail: string[] = [];
  for (const extra of c.extraLua) {
    const m = NESTED_EXTRA.exec(extra);
    if (!m) {
      tail.push(extraField(extra, "    "));
      continue;
    }
    if (!tables.has(m[1])) tables.set(m[1], []);
    tables.get(m[1])!.push(extraField(extra.slice(m[0].length), "        "));
  }
  const rank = (t: string) => (TABLE_ORDER.includes(t) ? TABLE_ORDER.indexOf(t) : TABLE_ORDER.length);
  const ordered = [...tables.keys()].sort((a, b) => rank(a) - rank(b));
  let out = `SandboxVars = {\n    VERSION = ${SERVER.version},\n` + loose.join("");
  for (const t of ordered) out += `    ${t} = {\n${tables.get(t)!.join("")}    },\n`;
  for (const extra of tail) out += extra;
  return `${out}}\n`;
}

/** Un campo de un mod que vuelve a una tabla del juego: `ZombieLore.` adelante (un nombre de Lua no lleva puntos). */
const NESTED_EXTRA = /^([A-Za-z_]\w*)\.(?=[A-Za-z_])/;

/** Un campo de `extra` como renglón: con sangría si no la trae, y con su coma si no la trae. */
function extraField(text: string, pad: string): string {
  // `trimEnd` y no `/\s+$/`: con un tramo largo de espacios en el medio, la regex es cuadrática (revisión del 2026-10-02).
  const body = (/^\s/.test(text) ? text : pad + text).trimEnd();
  return /[,;]$/.test(body) ? `${body}\n` : `${body},\n`;
}

/* ---------------------------------------------------------------------------------------------------------------------
 * El lector de "pegá tu archivo" (Task 3, 2026-10-02).
 *
 * Un `SandboxVars.lua` es código Lua: el juego lo ejecuta. Acá **nunca** se ejecuta nada (ni `eval`, ni `new Function`,
 * ni `import()`, ni un intérprete): un tokenizador a mano corta el texto en nombres, números, textos, `{ } = , ;` y
 * comentarios, y el lector acepta sólo una tabla de valores:
 *
 *   [SandboxVars = | return] { campo* }      campo = Nombre = (valor | { campo* }), con `,` o `;` opcionales
 *
 * Todo lo demás (una llamada como `tonumber(...)` o `require`, una cuenta, `os.execute`) es un `syntax` con su renglón:
 * ese campo se saltea y se sigue leyendo. Lo que viene después de la tabla cerrada (el `getSandboxOptions():…` de los
 * archivos del juego) es un `after` y se ignora.
 * ------------------------------------------------------------------------------------------------------------------- */

type TokType = "name" | "num" | "str" | "{" | "}" | "=" | "," | ";" | "(" | ")" | "other" | "bad" | "eof";
interface Tok {
  t: TokType;
  /** El nombre, el número o el texto ya sin escapes. */
  v?: string | number;
  line: number;
  start: number;
  end: number;
}

const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUM = /-?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const SINGLE = new Set(["{", "}", "=", ",", ";", "(", ")"]);
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v", "\\": "\\", '"': '"', "'": "'" };
const newlines = (s: string): number => {
  let n = 0;
  for (let i = s.indexOf("\n"); i >= 0; i = s.indexOf("\n", i + 1)) n++;
  return n;
};

/** Corta el texto en piezas. Nunca tira: lo que no entiende es un `bad` (un texto sin cerrar) o un `other`. */
function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  /** El nivel de un corchete largo (`[[`, `[==[`) que abre en `at`, o -1. */
  const longLevel = (at: number): number => {
    if (src[at] !== "[") return -1;
    let j = at + 1;
    while (src[j] === "=") j++;
    return src[j] === "[" ? j - at - 1 : -1;
  };
  /** Dónde termina el corchete largo que abre en `at` con nivel `level`, y lo de adentro; null si no cierra. */
  const longEnd = (at: number, level: number): { end: number; body: string } | null => {
    const open = at + level + 2;
    const close = `]${"=".repeat(level)}]`;
    const j = src.indexOf(close, open);
    return j < 0 ? null : { end: j + close.length, body: src.slice(open, j) };
  };

  while (i < n) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === "﻿") {
      i++;
      continue;
    }
    const start = i;
    const at = line;
    // Comentarios: `--[[ … ]]` (o `--[==[ … ]==]`) y `-- …` hasta el fin del renglón.
    if (c === "-" && src[i + 1] === "-") {
      const level = longLevel(i + 2);
      if (level >= 0) {
        const r = longEnd(i + 2, level);
        if (!r) {
          out.push({ t: "bad", line: at, start, end: n });
          line += newlines(src.slice(i));
          i = n;
          break;
        }
        line += newlines(src.slice(i, r.end));
        i = r.end;
        continue;
      }
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    // Un texto largo `[[ … ]]`: como en Lua, sin escapes y sin el salto que sigue a la apertura.
    if (c === "[") {
      const level = longLevel(i);
      if (level >= 0) {
        const r = longEnd(i, level);
        if (!r) {
          out.push({ t: "bad", line: at, start, end: n });
          line += newlines(src.slice(i));
          i = n;
          break;
        }
        line += newlines(src.slice(i, r.end));
        out.push({ t: "str", v: r.body.replace(/^\r?\n/, ""), line: at, start, end: r.end });
        i = r.end;
        continue;
      }
    }
    NAME.lastIndex = i;
    const name = NAME.exec(src);
    if (name) {
      i = NAME.lastIndex;
      out.push({ t: "name", v: name[0], line: at, start, end: i });
      continue;
    }
    if (c === "-" || c === "." || (c >= "0" && c <= "9")) {
      NUM.lastIndex = i;
      const num = NUM.exec(src);
      if (num) {
        i = NUM.lastIndex;
        // `3abc` o `1.2.3`: un número mal escrito, como para Lua.
        if (i < n && /[A-Za-z0-9_.]/.test(src[i])) {
          while (i < n && /[A-Za-z0-9_.]/.test(src[i])) i++;
          out.push({ t: "bad", line: at, start, end: i });
          continue;
        }
        const raw = num[0];
        const neg = raw.startsWith("-");
        const body = neg ? raw.slice(1) : raw;
        const value = /^0[xX]/.test(body) ? parseInt(body.slice(2), 16) : Number(body);
        out.push({ t: "num", v: neg ? -value : value, line: at, start, end: i });
        continue;
      }
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let text = "";
      let closed = false;
      let broken = false;
      while (j < n) {
        const d = src[j];
        if (d === c) {
          closed = true;
          j++;
          break;
        }
        if (d === "\n") break;
        if (d !== "\\") {
          text += d;
          j++;
          continue;
        }
        const e = src[j + 1];
        if (e === undefined) {
          j++;
          break;
        }
        if (Object.hasOwn(ESCAPES, e)) {
          text += ESCAPES[e];
          j += 2;
        } else if (e === "\n") {
          text += "\n";
          line++;
          j += 2;
        } else if (e === "z") {
          j += 2;
          while (j < n && /\s/.test(src[j])) {
            if (src[j] === "\n") line++;
            j++;
          }
        } else if (e === "x" && /^[0-9a-fA-F]{2}$/.test(src.slice(j + 2, j + 4))) {
          text += String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16));
          j += 4;
        } else if (e >= "0" && e <= "9") {
          const digits = /^\d{1,3}/.exec(src.slice(j + 1, j + 4))![0];
          const code = Number(digits);
          if (code > 255) broken = true;
          else text += String.fromCharCode(code);
          j += 1 + digits.length;
        } else if (e === "u" && src[j + 2] === "{") {
          const m = /^\{([0-9a-fA-F]{1,6})\}/.exec(src.slice(j + 2, j + 11));
          const code = m ? parseInt(m[1], 16) : NaN;
          if (m && code <= 0x10ffff) {
            text += String.fromCodePoint(code);
            j += 2 + m[0].length;
          } else {
            broken = true;
            j += 2;
          }
        } else {
          // Un escape que Lua no conoce (`\q`): el juego no cargaría el archivo.
          broken = true;
          j += 2;
        }
      }
      out.push(closed && !broken ? { t: "str", v: text, line: at, start, end: j } : { t: "bad", line: at, start, end: j });
      i = j;
      continue;
    }
    i++;
    out.push({ t: SINGLE.has(c) ? (c as TokType) : "other", line: at, start, end: i });
  }
  out.push({ t: "eof", line, start: n, end: n });
  return out;
}

export interface LuaParse {
  /** `false` sólo si no hay ninguna tabla que leer (vacío, un `require`, otra cosa). */
  ok: boolean;
  wrapper: "SandboxVars" | "return" | null;
  /** `VERSION` o `Version`. */
  version: number | null;
  /** Sólo las claves del juego con un valor que el juego acepta. */
  values: Record<string, Value>;
  /**
   * Lo que no es del juego (tablas o claves de mods, o viejas), con su texto original, para devolverlo al escribir. Una
   * clave desconocida de una tabla del juego lleva la tabla adelante: `ZombieLore.DeUnMod = 3`.
   */
  extra: string[];
  issues: Issue[];
}

/** Las tablas del juego (`ZombieLore`, `ZombieConfig`…): las que tienen opciones con punto. */
const GAME_TABLES = new Set(SERVER.options.filter((o) => o.key.includes(".")).map((o) => o.key.slice(0, o.key.indexOf("."))));
/** Las palabras de Lua que no pueden ser el nombre de un campo. */
const KEYWORDS = new Set(
  "and break do else elseif end false for function goto if in local nil not or repeat return then true until while".split(" "),
);

/** Lee un `SandboxVars.lua` (o un preset del juego, `return { … }`) sin ejecutarlo. Nunca tira. */
export function parseSandboxLua(text: string): LuaParse {
  try {
    return readLua(text);
  } catch {
    // No debería pasar nunca (el lector no recurre sin tope y no indexa nada sin mirar), pero un archivo pegado no puede
    // dejar la página en blanco: si algo tira, el archivo no se lee y se dice.
    return { ok: false, wrapper: null, version: null, values: {}, extra: [], issues: [{ line: 1, kind: "syntax", fatal: true }] };
  }
}

/**
 * Cuántas tablas adentro de otras se leen. Las del juego tienen dos niveles y las de los mods rara vez más de tres; un
 * archivo con miles (`{ A = { A = { …`) agotaba la pila (revisión del 2026-10-02). Más hondo, un `syntax` y se saltea.
 */
const MAX_DEPTH = 32;

function readLua(text: string): LuaParse {
  const res: LuaParse = { ok: false, wrapper: null, version: null, values: {}, extra: [], issues: [] };
  if (tooBig(text)) {
    res.issues.push({ line: 1, kind: "size" });
    return res;
  }
  // Lo que usa el juego cuando un valor no sirve: el de Apocalipsis, que es lo que tiene antes de leer el archivo
  // (`setValue` ignora el valor y deja el que estaba).
  const base = fullPreset(SERVER.baseline);
  const toks = tokenize(text);
  let k = 0;
  const peek = (o = 0): Tok => toks[Math.min(k + o, toks.length - 1)];
  const next = (): Tok => toks[k < toks.length - 1 ? k++ : k];

  // Los avisos, y lo que se anota por clave para poder olvidarlo: en una tabla de Lua gana la última asignación, así que
  // una clave repetida borra el valor, el extra y los avisos de la anterior (ver `forget`). Se marcan y se filtran al
  // final, para no recorrer las listas en cada repetición.
  const issues: Issue[] = [];
  const dropped = new Set<Issue>();
  const droppedExtra = new Set<number>();
  const keyIssues = new Map<string, Issue[]>();
  const keyExtra = new Map<string, number>();
  /** Las claves de los extras de cada tabla del juego (`ZombieLore` → `ZombieLore.DeUnMod`…). */
  const tableExtra = new Map<string, Set<string>>();
  const note = (issue: Issue) => {
    issues.push(issue);
    if (issue.key) keyIssues.set(issue.key, [...(keyIssues.get(issue.key) ?? []), issue]);
  };
  const forget = (key: string) => {
    delete res.values[key];
    for (const i of keyIssues.get(key) ?? []) dropped.add(i);
    keyIssues.delete(key);
    const at = keyExtra.get(key);
    if (at !== undefined) droppedExtra.add(at);
    keyExtra.delete(key);
  };
  /** Una segunda `ZombieLore = {…}` reemplaza entera a la primera, como en Lua. */
  const forgetTable = (table: string) => {
    forget(table);
    for (const o of SERVER.options) if (o.key.startsWith(`${table}.`)) forget(o.key);
    for (const key of tableExtra.get(table) ?? []) forget(key);
    tableExtra.delete(table);
  };

  const syntaxAt = new Map<number, Issue>();
  /**
   * Un `syntax` por renglón. `fatal`: con esto Lua no carga el archivo (un texto sin cerrar, una coma que falta, una
   * llave sin cerrar); sin `fatal` es Lua válido que acá no se ejecuta (una llamada, una cuenta).
   */
  const syntax = (line: number, fatal = false): Issue => {
    let issue = syntaxAt.get(line);
    if (!issue) {
      issue = { line, kind: "syntax" };
      syntaxAt.set(line, issue);
      issues.push(issue);
    }
    if (fatal) issue.fatal = true;
    return issue;
  };
  /** Arranca un campo: `Nombre =`. */
  const fieldStart = (): boolean => {
    const t = peek();
    return t.t === "name" && !KEYWORDS.has(String(t.v)) && peek(1).t === "=";
  };

  /**
   * Saltea un campo roto hasta la `,` o el `;` que lo cierra (o la `}` de su tabla), contando paréntesis y llaves. Si el
   * campo roto no cierra en su renglón y un renglón de más abajo arranca otro campo (`Zombies = 2,` después de un texto
   * sin cerrar), para ahí: así un error no se come el resto del archivo. Si en el camino hay algo que Lua no entiende, o
   * se llega al final con algo abierto, el aviso pasa a `fatal`.
   */
  const skip = (from: number, issue: Issue) => {
    let depth = 0;
    for (let first = true; ; first = false) {
      const t = peek();
      if (t.t === "eof") {
        if (depth > 0) issue.fatal = true;
        return;
      }
      if (depth === 0) {
        if (t.t === "," || t.t === ";" || t.t === "}") return;
        if (!first && t.line > from && fieldStart()) return;
      }
      if (t.t === "bad") issue.fatal = true;
      if (t.t === "{" || t.t === "(") depth++;
      else if ((t.t === "}" || t.t === ")") && depth > 0) depth--;
      next();
    }
  };
  /** Un syntax en `t` (fatal si `t` es algo que Lua no entiende), y se saltea lo que sigue. */
  const broken = (t: Tok) => skip(t.line, syntax(t.line, t.t === "bad"));

  /** Saltea una tabla entera, de la `{` a su `}`, sin mirar adentro y sin recursión. Devuelve la `}` (null si no cierra). */
  const skipTable = (): Tok | null => {
    let depth = 0;
    do {
      const t = next();
      if (t.t === "{") depth++;
      else if (t.t === "}") depth--;
      else if (t.t === "eof") {
        syntax(t.line, true);
        return null;
      }
      if (depth === 0) return t;
    } while (depth > 0);
    return null;
  };

  /**
   * Después de un valor tiene que venir un separador, la `}` o (si falta la coma) otro campo más abajo. Si no
   * (`Zombies = 2 + 1`, `A = os.execute(...)`), el valor no vale: un syntax, y se saltea.
   */
  const follows = (last: Tok): boolean => {
    const t = peek();
    if (t.t === "," || t.t === ";" || t.t === "}" || t.t === "eof") return true;
    if (t.line > last.line && fieldStart()) return true;
    broken(t);
    return false;
  };

  /** Un valor suelto: número, texto, `true`/`false` o `nil` (que en Lua es no tenerlo). */
  const scalar = (): { ok: true; v: Value | null; tok: Tok } | { ok: false } => {
    const t = peek();
    let v: Value | null;
    if (t.t === "num" || t.t === "str") v = t.v as Value;
    else if (t.t === "name" && (t.v === "true" || t.v === "false")) v = t.v === "true";
    else if (t.t === "name" && t.v === "nil") v = null;
    else {
      broken(t);
      return { ok: false };
    }
    next();
    return follows(t) ? { ok: true, v, tok: t } : { ok: false };
  };

  let depth = 0;
  /**
   * Una tabla `{ campo* }`, con `onField` para cada `Nombre =`. Devuelve la `}` que la cierra (null si no cierra). Más
   * honda que `MAX_DEPTH`, se saltea entera con un syntax (`skipTable` no recurre).
   */
  const table = (onField: (name: Tok) => boolean): { close: Tok | null; clean: boolean } => {
    if (depth >= MAX_DEPTH) {
      syntax(peek().line).deep = true;
      return { close: skipTable(), clean: false };
    }
    depth++;
    try {
      next(); // la `{`
      let clean = true;
      for (;;) {
        let t = peek();
        if (t.t === "eof") {
          syntax(t.line, true);
          return { close: null, clean: false };
        }
        if (t.t === "}") {
          next();
          return { close: t, clean };
        }
        let good: boolean;
        if (fieldStart()) {
          next();
          next();
          good = onField(t);
        } else {
          broken(t);
          good = false;
        }
        if (!good) clean = false;
        t = peek();
        if (t.t === "," || t.t === ";") next();
        else if (t.t !== "}" && t.t !== "eof" && good) {
          // Dos campos sin coma en el medio: Lua no lo acepta. Se avisa y se sigue con el que viene.
          syntax(t.line, true);
          clean = false;
        }
      }
    } finally {
      depth--;
    }
  };

  /** Un campo de una tabla que no se interpreta (la de un mod): sólo se comprueba que sea una tabla de valores. */
  const opaqueField = (): boolean => {
    if (peek().t === "{") {
      const r = table(opaqueField);
      return !!r.close && r.clean && follows(r.close);
    }
    return scalar().ok;
  };

  /** Una opción del juego: el valor pasa por `coerce`, como lo pasaría el juego por `setValue`. */
  const option = (key: string, opt: SandboxOption, name: Tok): boolean => {
    forget(key);
    if (peek().t === "{") {
      // Una tabla donde va un valor: se saltea entera, sin mirar adentro.
      const close = skipTable();
      if (!close || !follows(close)) return false;
      note({ line: name.line, key, kind: "type", got: "{…}", used: base[key] });
      return true;
    }
    const s = scalar();
    if (!s.ok) return false;
    if (s.v === null) return true; // `nil`: el juego no la ve, y queda la que tenía.
    const r = coerce(opt, s.v);
    if (r.ok) res.values[key] = r.value;
    else note({ line: name.line, key, kind: r.reason, got: text.slice(s.tok.start, s.tok.end), used: base[key] });
    return true;
  };

  /** Una clave que no es del juego: se conserva con su texto, si es un valor o una tabla de valores. */
  const unknown = (prefix: string, name: Tok): boolean => {
    const key = prefix + String(name.v);
    forget(key);
    let end: number;
    if (peek().t === "{") {
      const r = table(opaqueField);
      if (!r.close || !r.clean || !follows(r.close)) return false;
      end = r.close.end;
    } else {
      const s = scalar();
      if (!s.ok) return false;
      end = s.tok.end;
    }
    keyExtra.set(key, res.extra.length);
    res.extra.push(prefix + text.slice(name.start, end));
    if (prefix) {
      const table = prefix.slice(0, -1);
      if (!tableExtra.has(table)) tableExtra.set(table, new Set());
      tableExtra.get(table)!.add(key);
    }
    note({ line: name.line, key, kind: "unknown" });
    return true;
  };

  /** Un campo de una tabla del juego (`ZombieLore = { Speed = 2 }`). */
  const gameTableField =
    (table: string) =>
    (name: Tok): boolean => {
      const key = `${table}.${name.v}`;
      const opt = optionByKey(key);
      return opt ? option(key, opt, name) : unknown(`${table}.`, name);
    };

  let versionLine = 0;
  const topField = (name: Tok): boolean => {
    const key = String(name.v);
    if (key === "VERSION" || key === "Version") {
      forget(key);
      const s = scalar();
      if (!s.ok) return false;
      if (typeof s.v === "number") {
        res.version = s.v;
        versionLine = name.line;
      } else note({ line: name.line, key, kind: "type", got: text.slice(s.tok.start, s.tok.end) });
      return true;
    }
    if (GAME_TABLES.has(key)) {
      forgetTable(key);
      if (peek().t === "{") {
        const r = table(gameTableField(key));
        return !!r.close && follows(r.close);
      }
      // Un valor donde va una tabla del juego: el juego busca la tabla y no encuentra nada.
      const s = scalar();
      if (!s.ok) return false;
      note({ line: name.line, key, kind: "type", got: text.slice(s.tok.start, s.tok.end) });
      return true;
    }
    const opt = optionByKey(key);
    return opt ? option(key, opt, name) : unknown("", name);
  };

  const finish = (): LuaParse => {
    res.issues = issues.filter((i) => !dropped.has(i));
    if (droppedExtra.size) res.extra = res.extra.filter((_, i) => !droppedExtra.has(i));
    return res;
  };

  // El envoltorio: `SandboxVars = {`, `return {` o la tabla sola.
  const first = peek();
  if (first.t === "name" && first.v === "SandboxVars" && peek(1).t === "=") {
    res.wrapper = "SandboxVars";
    k += 2;
  } else if (first.t === "name" && first.v === "return") {
    res.wrapper = "return";
    k += 1;
  }
  if (peek().t !== "{") {
    // Vacío o sólo comentarios: nada que avisar. Otra cosa (un `require`, una llamada): un syntax.
    if (peek().t !== "eof" || res.wrapper) syntax(peek().line, peek().t === "bad");
    return finish();
  }
  res.ok = true;
  const top = table(topField);
  if (top.close && peek().t !== "eof") issues.push({ line: peek().line, kind: "after" });
  if (res.version !== null && res.version < SERVER.version) {
    issues.push({ line: versionLine, key: "VERSION", kind: "version", got: String(res.version) });
  }
  return finish();
}

/**
 * Qué archivo es: Lua si arranca (salteando comentarios) con `SandboxVars` o `return`, o si aparece una `{` antes que
 * cualquier `=`; si no, un `.ini`. Los renglones que arrancan con `#` (los comentarios del `.ini`) no cuentan.
 */
export function fileKind(text: string): "lua" | "ini" {
  const code = text
    .slice(0, MAX_FILE)
    .split("\n")
    .map((l) => (l.trimStart().startsWith("#") ? "" : l))
    .join("\n");
  const toks = tokenize(code);
  const first = toks[0];
  if (first.t === "name" && (first.v === "SandboxVars" || first.v === "return")) return "lua";
  for (const t of toks) {
    if (t.t === "{") return "lua";
    if (t.t === "=") return "ini";
  }
  return "ini";
}
