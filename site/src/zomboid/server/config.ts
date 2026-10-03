/**
 * El modelo de la configuración del generador de servidor (2026-10-01): las 269 opciones de sandbox y las 144 del
 * `.ini`, completas, más la base contra la que se cuentan los cambios. Es puro: lo usan la página, los escritores
 * (`lua.ts`, `ini.ts`) y el link (`link.ts`), y se prueba sin un navegador.
 */
import { fullPreset, INI_DEFAULTS, presetById, SERVER, type IniOption, type PresetId, type SandboxOption, type Value } from "./data";

export type { PresetId, Value } from "./data";

export interface Config {
  /** La base contra la que se cuentan los cambios (y la que da el "Default" de cada fila). */
  preset: PresetId;
  /** Las 269, completas. */
  sandbox: Record<string, Value>;
  /** Las 144, completas. */
  ini: Record<string, Value>;
  /** Tablas o claves de `SandboxVars.lua` que no son del juego (mods), tal cual: las trae "pegá tu archivo" (Task 3). */
  extraLua: string[];
  /** Renglones `Clave=valor` desconocidos del `.ini`, tal cual (Task 3). */
  extraIni: string[];
}

/** Un preset recién elegido, con el `.ini` en sus defaults. Un id desconocido cae en la base del juego (Apocalipsis). */
export const fromPreset = (id: PresetId): Config => {
  const preset = presetById(id) ? id : SERVER.baseline;
  return { preset, sandbox: { ...fullPreset(preset) }, ini: { ...INI_DEFAULTS }, extraLua: [], extraIni: [] };
};

/** Las claves de sandbox que difieren del preset base, en el orden de las hojas. */
export const sandboxChanges = (c: Config): string[] => {
  const base = fullPreset(c.preset);
  return SERVER.options.filter((o) => c.sandbox[o.key] !== base[o.key]).map((o) => o.key);
};

/** Las claves del `.ini` que difieren del default (el de Java: el `.ini` no tiene presets), en el orden del juego. */
export const iniChanges = (c: Config): string[] => SERVER.ini.filter((o) => c.ini[o.key] !== INI_DEFAULTS[o.key]).map((o) => o.key);

export type CoerceError = "type" | "range" | "enum" | "equals";
export type Coerced = { ok: true; value: Value } | { ok: false; reason: CoerceError };

/**
 * Un número escrito como lo escribiría una persona o un archivo: con signo, decimales y exponente. Sin `Number()` a
 * secas, que da 0 con "" y 16 con "0x10".
 */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const toNumber = (raw: string | number | boolean): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || !NUMBER.test(raw.trim())) return null;
  return Number(raw.trim());
};

/**
 * Un valor para una opción, del formulario, del link o de un archivo, como lo aceptaría el juego:
 * - `type`: no es de su tipo (un texto en un número, un decimal en un entero);
 * - `range`: un número fuera de su mínimo y máximo (el juego lo ignora y deja el que tenía: `IntegerConfigOption.setValue`);
 * - `enum`: un valor que la lista no tiene;
 * - `equals`: un texto del `.ini` con un `=`. El servidor lee cada renglón con `line.split("=")` y se queda con el
 *   segundo pedazo (`ConfigFile.read`): `PublicName=Mi = server` carga "Mi ", y una URL con `?id=…` en
 *   `PublicDescription` se corta. En el Lua el texto va entre comillas y no pasa: sólo se rechaza en el `.ini`.
 *
 * Un texto no puede bajar de renglón: rompería el renglón del `.ini` y el texto entre comillas del Lua. Los saltos se
 * vuelven un espacio.
 */
export function coerce(opt: SandboxOption | IniOption, raw: string | number | boolean): Coerced {
  switch (opt.type) {
    case "bool": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      const s = String(raw).trim().toLowerCase();
      // Como `BooleanConfigOption.parse`: "true" o "1" es sí.
      if (s === "true" || s === "1") return { ok: true, value: true };
      if (s === "false" || s === "0") return { ok: true, value: false };
      return { ok: false, reason: "type" };
    }
    case "enum": {
      const n = toNumber(raw);
      if (n === null || !Number.isInteger(n)) return { ok: false, reason: "type" };
      const count = "values" in opt && opt.values ? opt.values.length : "n" in opt && opt.n ? opt.n : 0;
      return n >= 1 && n <= count ? { ok: true, value: n } : { ok: false, reason: "enum" };
    }
    case "int":
    case "double": {
      const n = toNumber(raw);
      if (n === null || (opt.type === "int" && !Number.isInteger(n))) return { ok: false, reason: "type" };
      if ((opt.min !== undefined && n < opt.min) || (opt.max !== undefined && n > opt.max)) return { ok: false, reason: "range" };
      return { ok: true, value: n };
    }
    default: {
      if (typeof raw === "boolean") return { ok: false, reason: "type" };
      const text = String(raw).replace(/[\r\n]+/g, " ");
      // Las de sandbox siempre traen su nombre traducido; las del `.ini` no tienen (el juego las muestra por la clave).
      // zomboidServerConfig.test.ts vigila que siga así: un `name` en una del `.ini` apagaría este aviso.
      if (!("name" in opt) && text.includes("=")) return { ok: false, reason: "equals" };
      return { ok: true, value: text };
    }
  }
}

type ServerLink = (typeof SERVER.links)[number];
const LINKS_FROM = new Map<string, ServerLink[]>();
for (const l of SERVER.links) LINKS_FROM.set(l.from, [...(LINKS_FROM.get(l.from) ?? []), l]);

/**
 * Lo que la pantalla de servidor del juego escribe en otras opciones cuando elegís `value` en `key`
 * (`Page3:onComboBoxSelected` / `onTickBoxSelected`): `Zombies` pone `ZombieConfig.PopulationMultiplier`,
 * `ZombieRespawn` las tres de reaparición y `ZombieMigrate` `ZombieConfig.RedistributeHours`. Sin vínculo, `{}`.
 *
 * Importa porque en Java `Zombies` sólo mueve un tope: la cantidad real de zombis sale del multiplicador. Si el
 * generador cambiara `Zombies` solo, el archivo diría "Muy alto" con la población de "Normal".
 */
export function linkedValues(key: string, value: Value): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const l of LINKS_FROM.get(key) ?? []) {
    const hit = l.values.find(([from]) => from === value);
    if (hit) out[l.to] = hit[1];
  }
  return out;
}

/**
 * Los días del mes `month` (1–12) del año `year`, con los bisiestos. El juego no los cuenta: su pantalla calcula el
 * último día con el primer año (`getFirstYear`, 1993 fijo) y febrero le da 28 siempre. Acá sí, porque el mundo arranca
 * en el año elegido y el 29/2/1996 es una fecha que el juego carga sin problema.
 */
export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** El año de verdad de `StartYear` (1 = el primero del juego, 1993). */
const startYear = (sandbox: Record<string, Value>): number => SERVER.rules.firstYear + Number(sandbox.StartYear ?? 1) - 1;

/**
 * Una opción que **cambiaste vos** en la página, con lo que el juego hace en su pantalla de servidor:
 * - las enlazadas (`linkedValues`) toman su valor, y quedan como "cambiadas" si difieren del preset;
 * - el día de inicio se achica al último del mes si el mes (o el año) no lo tiene, como `Page3:syncStartDay`
 *   (31 de febrero → 28), salvo que acá febrero de un año bisiesto llega a 29 (ver `daysInMonth`).
 *
 * No se usa al elegir un preset ni al leer un link o un archivo pegado (Task 3): ahí cada valor viene como está, igual
 * que cuando el juego carga un `SandboxVars.lua`.
 */
export function setOption(c: Config, kind: "sandbox" | "ini", key: string, value: Value): Config {
  if (kind === "ini") return { ...c, ini: { ...c.ini, [key]: value } };
  const sandbox = { ...c.sandbox, [key]: value, ...linkedValues(key, value) };
  if (key === "StartMonth" || key === "StartYear" || key === "StartDay") {
    const last = daysInMonth(startYear(sandbox), Number(sandbox.StartMonth));
    if (Number(sandbox.StartDay) > last) sandbox.StartDay = last;
  }
  return { ...c, sandbox };
}

/**
 * "Volver al valor del preset" (o al default, en el `.ini`). Una opción que enlaza a otras las vuelve también: si no,
 * `Zombies` volvía a "Normal" y la población quedaba en la de "Muy alto".
 */
export function resetOption(c: Config, kind: "sandbox" | "ini", key: string): Config {
  if (kind === "ini") return { ...c, ini: { ...c.ini, [key]: INI_DEFAULTS[key] } };
  const base = fullPreset(c.preset);
  const sandbox = { ...c.sandbox, [key]: base[key] };
  for (const l of LINKS_FROM.get(key) ?? []) sandbox[l.to] = base[l.to];
  return { ...c, sandbox };
}

/**
 * Un aviso del lector de "pegá tu archivo" (Task 3), con su renglón (desde 1):
 * - `syntax`: algo que no es una tabla de valores (una llamada, una cuenta, un texto sin cerrar): se saltea;
 * - `unknown`: una clave que no es del juego (un mod, o una vieja como `XpMultiplier`): se conserva en `extra`;
 * - `type`, `range`, `enum`: un valor que el juego no acepta; queda afuera y `used` es el que usa el juego en su lugar;
 * - `equals`: un texto del `.ini` con un `=`; se conserva, y `used` es lo que de verdad lee el servidor;
 * - `after`: lo que sigue a la tabla cerrada (el `getSandboxOptions():initSandboxVars()` de los del juego): se ignora;
 * - `version`: un `VERSION` viejo (el juego actualiza el archivo al cargarlo);
 * - `size`: un archivo de más de 512 KB (en bytes), que no se lee.
 */
export type IssueKind = "syntax" | "unknown" | "type" | "range" | "enum" | "after" | "version" | "size" | "equals";
export interface Issue {
  line: number;
  key?: string;
  kind: IssueKind;
  /** El valor como estaba escrito en el archivo. */
  got?: string;
  /** El que usa el juego en su lugar. */
  used?: Value;
  /** Un `syntax` con el que Lua no carga el archivo así como está (un texto sin cerrar, una coma que falta). */
  fatal?: boolean;
  /** Un `syntax` por tablas anidadas más hondo de lo que se lee (ver `MAX_DEPTH` en `lua.ts`). */
  deep?: boolean;
}

/**
 * Lo más grande que se lee, en bytes de UTF-8 (lo que mide el archivo en disco y `File.size`): un `SandboxVars.lua` del
 * juego pesa ~60 KB, y uno con muchos mods bastante menos que esto.
 */
export const MAX_FILE = 512 * 1024;

/** Si un texto pasa de `MAX_FILE` bytes en UTF-8. Sin armar el arreglo de bytes: se cuentan y se corta al pasarse. */
export function tooBig(text: string): boolean {
  if (text.length > MAX_FILE) return true; // cada letra es al menos un byte
  if (text.length * 3 <= MAX_FILE) return false; // ninguna pasa de tres bytes por unidad de UTF-16
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // Un par sustituto (un emoji) son 4 bytes en dos unidades: 2 + 2.
    bytes += c < 0x80 ? 1 : c < 0x800 || (c >= 0xd800 && c <= 0xdfff) ? 2 : 3;
    if (bytes > MAX_FILE) return true;
  }
  return false;
}

/** Lo que un lector (`parseSandboxLua` o `parseIni`) deja para cargar. */
export interface Parsed {
  values: Record<string, Value>;
  extra: string[];
}

/**
 * El preset al que más se parece un `SandboxVars.lua`: el de menos diferencias (si empatan, el primero del juego). Lo que
 * el archivo no trae cuenta como Apocalipsis, que es lo que tiene un servidor dedicado antes de leerlo.
 */
export function nearestPreset(values: Record<string, Value>): { id: PresetId; diff: number } {
  const full = { ...fullPreset(SERVER.baseline), ...values };
  let best: { id: PresetId; diff: number } | null = null;
  for (const p of SERVER.presets) {
    const preset = fullPreset(p.id);
    const diff = SERVER.options.reduce((n, o) => n + (full[o.key] !== preset[o.key] ? 1 : 0), 0);
    if (!best || diff < best.diff) best = { id: p.id, diff };
  }
  return best!;
}

let ROWS: { key: string; values: Value[] }[] | null = null;

/**
 * Las filas de los presets comparados (Task 4): las opciones en las que algún preset, como lo carga el juego, difiere de
 * otro (153 de las 269 en la 42.21), en el orden de las hojas, con sus valores en el orden de los presets (Apocalipsis
 * primero). `StartDay` no está: vale 9 en los cinco. Los datos no cambian mientras la página está abierta: se arma una
 * sola vez.
 */
export function presetRows(): { key: string; values: Value[] }[] {
  if (!ROWS) {
    const full = SERVER.presets.map((p) => fullPreset(p.id));
    ROWS = SERVER.pages.flatMap((page) =>
      SERVER.options
        .filter((o) => o.page === page.id && full.some((f) => f[o.key] !== full[0][o.key]))
        .map((o) => ({ key: o.key, values: full.map((f) => f[o.key]) })),
    );
  }
  return ROWS;
}

/**
 * Una configuración armada con lo que leyó "pegá tu archivo". Lo que el `SandboxVars.lua` no trae queda en
 * **Apocalipsis**, no en la base: un servidor dedicado nace con `SandboxOptions` en Apocalipsis y `readLuaFile` sólo pisa
 * lo que el archivo dice. La base (`base`, o `nearestPreset`) es la etiqueta ("se parece a …") y contra qué se cuentan los
 * cambios. El `.ini`, sobre los defaults. Los `extra` (lo de los mods) van tal cual, para devolverlos al descargar.
 *
 * Como al leer un link, los valores entran como están, sin `setOption`: el archivo ya dice la población y la reaparición
 * por separado, y el juego no las enlaza al cargarlo.
 */
export function fromParsed(lua?: Parsed, ini?: Parsed, base?: PresetId): Config {
  const preset = base && presetById(base) ? base : nearestPreset(lua?.values ?? {}).id;
  return {
    preset,
    sandbox: { ...fullPreset(SERVER.baseline), ...lua?.values },
    ini: { ...INI_DEFAULTS, ...ini?.values },
    extraLua: [...(lua?.extra ?? [])],
    extraIni: [...(ini?.extra ?? [])],
  };
}
