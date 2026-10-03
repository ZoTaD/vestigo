/**
 * Los datos de la pestaña Servidor de Project Zomboid (2026-10-01), tal como los escribe
 * `games/zomboid/tools/server.py`: las 269 opciones de sandbox con sus hojas, los cinco presets, las 144 opciones del
 * `.ini` y los números de los cortes de agua y luz.
 *
 * Viajan enteros en el chunk de la pestaña (~40 KB con gzip): el generador los usa a todos de entrada (las 413 filas van
 * en el HTML del prerender), así que no hay "cargando…" ni línea en `TAB_DATA`.
 *
 * **El "Default" del juego es Apocalipsis.** `SandboxOptions` nace con los defaults de Java, pero su constructor carga
 * `Apocalypse.lua` y lo fija como default (`setDefaultsToCurrentValues`): ése es el de la pantalla de partida, el de la
 * ayuda "Default: X", el de "restablecer" y el de un servidor dedicado sin `SandboxVars.lua`. Por eso la página nunca
 * muestra `options[].default` (el de Java: `StartDay` 23, cuando el juego arranca el 9), sino `fullPreset(...)`.
 */
import serverJson from "@zomboid/server.json";

export type Loc = { en: string; es: string };
export type Value = number | boolean | string;

export interface SandboxOption {
  /** El nombre del juego, con su tabla: "Zombies", "ZombieLore.Speed". */
  key: string;
  type: "enum" | "int" | "double" | "bool" | "string";
  /** El del constructor de Java. No es el "Default" que muestra el juego: ver `fullPreset`. */
  default: Value;
  min?: number;
  max?: number;
  /** Enum: la etiqueta de cada valor, de 1 a n. */
  values?: Loc[];
  name: Loc;
  /** La ayuda del juego, con "\n" de verdad, sin el "Min/Max/Default" (lo arma quien la muestra). */
  tip?: Loc;
  /** La hoja del menú del juego ("TimeOptions" … "Animal"), o "Hidden" si el menú no la muestra. */
  page: string;
  /** El subtítulo de la hoja que arranca en esta opción. */
  title?: Loc;
}

export interface IniOption {
  key: string;
  type: "bool" | "int" | "double" | "string" | "text" | "enum";
  default: Value;
  min?: number;
  max?: number;
  /** Enum: cuántos valores tiene (el juego no les pone nombre). */
  n?: number;
  tip?: Loc;
  page: string;
  /** El servidor la sortea la primera vez que arranca (`ResetID`, `ServerPlayerID`, `Seed`): ver `ini.ts`. */
  random?: boolean;
}

export type PresetId = "apocalypse" | "outbreak" | "extinction" | "rising" | "six-months-later";

export interface ServerData {
  /** 6, el `Version` de `Apocalypse.lua`: el `VERSION` que escribe el juego en `SandboxVars.lua`. */
  version: number;
  pages: { id: string; name: Loc }[];
  options: SandboxOption[];
  /** El preset que el juego carga como default antes de cualquier otro: Apocalipsis. */
  baseline: PresetId;
  /**
   * `values` es el preset como lo carga el juego (Apocalipsis ⊕ el archivo del preset), sólo con lo que difiere del
   * default de Java. `desc` trae saltos de renglón.
   */
  presets: { id: PresetId; file: string; name: Loc; desc: Loc; values: Record<string, Value> }[];
  /**
   * Las opciones que la pantalla de servidor del juego reescribe cuando elegís otra (`Page3:onComboBoxSelected` /
   * `onTickBoxSelected` de ServerSettingsScreen.lua): `values` es [valor de `from`, valor que toma `to`]. Ver `setOption`
   * en `config.ts`.
   */
  links: { from: string; to: string; values: [Value, Value][] }[];
  iniPages: { id: string; name: Loc }[];
  ini: IniOption[];
  shutoff: { water: [number, number][]; elec: [number, number][]; never: number };
  rules: { dayStartHour: number; monthDays: number; firstYear: number };
  startHours: number[];
  dayLengthMinutes: number[];
}

export const SERVER = serverJson as unknown as ServerData;

// Con `Map` y no con un objeto: la clave sale de la dirección (`?s=constructor:1`) y no puede tropezar con el prototipo.
const SANDBOX_BY_KEY = new Map(SERVER.options.map((o) => [o.key, o]));
const INI_BY_KEY = new Map(SERVER.ini.map((o) => [o.key, o]));
const PRESET_BY_ID = new Map(SERVER.presets.map((p) => [p.id as string, p]));

export const optionByKey = (key: string): SandboxOption | undefined => SANDBOX_BY_KEY.get(key);
export const iniByKey = (key: string): IniOption | undefined => INI_BY_KEY.get(key);
export const presetById = (id: string): ServerData["presets"][number] | undefined => PRESET_BY_ID.get(id);

const FULL = new Map<string, Readonly<Record<string, Value>>>();

/**
 * Las 269 opciones de un preset, como las deja el juego al cargarlo: los defaults de Java pisados por `values` (que ya
 * es Apocalipsis ⊕ el archivo). Memorizado y congelado: lo comparten todas las filas, y nadie lo puede tocar por error.
 */
export function fullPreset(id: PresetId): Readonly<Record<string, Value>> {
  let full = FULL.get(id);
  if (!full) {
    const p = presetById(id) ?? presetById(SERVER.baseline)!;
    const out: Record<string, Value> = {};
    for (const o of SERVER.options) out[o.key] = Object.hasOwn(p.values, o.key) ? p.values[o.key] : o.default;
    full = Object.freeze(out);
    FULL.set(id, full);
  }
  return full;
}

/**
 * Lo que el juego suma a la ayuda de una opción en los archivos que escribe (`getTooltip` de cada clase de opción):
 * `Sandbox_MinMaxDefault` en los int y double, `Sandbox_Default` en los enum. Son textos del juego (`Sandbox.json`, EN y
 * ES_MX), copiados acá porque son dos y no vale la pena llevarlos en `server.json`.
 */
export const GAME_NOTES = {
  en: { minMax: (min: string, max: string, def: string) => `Min: ${min} Max: ${max} Default: ${def}`, def: (d: string) => `Default = ${d}` },
  es: { minMax: (min: string, max: string, def: string) => `Mínimo=${min} Máximo=${max} Por defecto=${def}`, def: (d: string) => `Por defecto=${d}` },
} as const;

/**
 * Los números del "Min/Max/Default" como los escribe el juego: los double con `%.02f` (0.60, 2147483647.00), los int
 * tal cual. Siempre con punto: el `String.format` de Java usa el idioma de la máquina, y un servidor en español
 * escribiría "0,60"; con punto el archivo es el mismo en cualquier máquina.
 */
export const rangeNumber = (type: string, n: number): string => (type === "double" ? n.toFixed(2) : String(n));

/**
 * El año y el día de inicio no tienen etiquetas en el juego (`server.json` les pone "1993"… y "1"… para la página): en
 * los archivos el juego no lista sus valores ni dice "Default = …" (`getValueTranslationByIndexOrNull` da null).
 */
export const UNLABELED_ENUMS: ReadonlySet<string> = new Set(["StartYear", "StartDay"]);

/** El sello de cada hoja del juego, en el generador y en los presets comparados. */
export const PAGE_STAMP: Readonly<Record<string, string>> = {
  TimeOptions: "sun",
  Zombie: "skull",
  Loot: "key",
  WorldOptions: "house",
  NatureOptions: "tree",
  Meta: "gears",
  Character: "facehappy",
  Vehicle: "steeringwheel",
  Animal: "cow",
  Hidden: "eye",
};

/** Los defaults del `.ini` (los de Java: el `.ini` no tiene presets). */
export const INI_DEFAULTS: Readonly<Record<string, Value>> = Object.freeze(
  Object.fromEntries(SERVER.ini.map((o) => [o.key, o.default])),
);
