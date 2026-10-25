// Datos del predictor de Stardew Valley 1.6.15: la forma de `games/stardew/data/predict.json`
// (lo genera `games/stardew/tools/predict_data.py`) y, al final, las consultas del juego que
// usan esos datos (`GameStateQuery`, `ItemQueryResolver`, `Utility.ApplyQuantityModifiers`).
// Están las que usan las geodas, el carro (`RANDOM_ITEMS`, `PerItemCondition`, las condiciones de
// `Data/Shops` "Traveler") y el clima (`WeatherConditions` de `Data/LocationContexts`); cualquier otra
// tira error en vez de evaluarse mal.
//
import { hashString, type DotNetRandom } from "./rng";

// Regla de todo el archivo: un campo opcional que falta vale el valor por omisión que dice
// su comentario (el script no guarda lo que vale lo de siempre).

/** Un par `[inglés, español]`. */
export type Par = [en: string, es: string];

/**
 * Una entrada de `Data/Objects`: `[id, categoría, tipo, precio, banderas]`.
 * `categoría` (`Category`) y `tipo` (`Type`, p. ej. "Basic", "Fish", "Minerals") son los de
 * `ITEM_HAS_EXPLICIT_OBJECT_CATEGORY` (categoría < 0), `ITEM_CATEGORY` e `ITEM_OBJECT_TYPE`.
 * `precio` es el `Price` de los datos (con `@requirePrice` alcanza que sea > 0).
 * `banderas`: bit 1 = `ExcludeFromRandomSale`.
 */
export type ObjetoDato = [id: string, categoria: number, tipo: string, precio: number, banderas: number];

/**
 * Una entrada de `Data/Furniture`: `[id, precio, banderas]`. `precio` es el campo 5 del mueble
 * (`Furniture.salePrice`); `banderas`: bit 1 = campo 10 (`ExcludeFromRandomSale`). Los ids pueden ser
 * texto (`"JojaCatalogue"`); `RANDOM_ITEMS (F) 0 1612` sólo toma los numéricos de ese rango.
 */
export type MuebleDato = [id: string, precio: number, banderas: number];

/**
 * `QuantityModifier` del juego (`Utility.ApplyQuantityModifiers`).
 * `mod`: 0 suma, 1 resta, 2 multiplica, 3 divide, 4 fija el valor.
 */
export interface Modificador {
  /** Consulta de estado del juego que tiene que cumplirse (sin ella, siempre se aplica). */
  condition?: string;
  mod: 0 | 1 | 2 | 3 | 4;
  amount: number;
  /** Si está, el valor sale de elegir uno al azar de esta lista (en vez de `amount`). */
  random?: number[];
}

/** Un premio de `GeodeDrops` (`Utility.getTreasureFromGeode`). Se prueban por `precedence` creciente. */
export interface PremioGeoda {
  id: string;
  /** Probabilidad (`random.NextBool(chance)`). */
  chance: number;
  precedence: number;
  /** Consulta de estado del juego, p. ej. `PLAYER_STAT Current GeodesCracked 16`. Sin ella, siempre se cumple. */
  condition?: string;
  /** Id calificado fijo, p. ej. `(O)74`. */
  itemId?: string;
  /** Lista de la que se elige uno al azar (`ChooseFrom`) cuando no hay `itemId`. */
  randomItemId?: string[];
  /** Cantidad mínima / máxima (omitidas: la que traiga el objeto). */
  minStack?: number;
  maxStack?: number;
  stackModifiers?: Modificador[];
  /** Correo que el juego marca al recoger el premio (p. ej. `goldenCoconutHat`). */
  setFlagOnPickup?: string;
}

/** Una geoda: sus premios y si, además, puede salir un premio de los genéricos del código. */
export interface GeodaDato {
  /** `GeodeDropsDefaultItems`: si es `true`, la mitad de las veces se saltea `drops` y sale un premio genérico. */
  defaultItems: boolean;
  drops: PremioGeoda[];
}

/**
 * Una entrada de `Data/Shops` "Traveler" (`ShopBuilder.GetShopStock`), en el orden del juego.
 * Los campos opcionales que faltan valen: `condition`, `itemId`, `randomItemId`, `maxItems`,
 * `applyProfitMargins`, `perItemCondition` y los modificadores: ninguno; `minStack` y `maxStack`: -1;
 * `availableStock`: 1; `availableStockLimit`, `priceModifierMode`, `availableStockModifierMode` y
 * `stackModifierMode`: 0; los booleanos: `false`.
 */
export interface EntradaCarro {
  id: string;
  /** Precio base (`Price`); -1 = el del objeto (`useObjectDataPrice`) o su `salePrice`. */
  price: number;
  /** Consulta de estado del juego que tiene que cumplirse para que la entrada exista. */
  condition?: string;
  /** Id calificado o consulta (`RANDOM_ITEMS (O) 2 789 @requirePrice @isRandomSale`). */
  itemId?: string;
  randomItemId?: string[];
  /** Cuántos objetos devuelve como máximo la consulta. */
  maxItems?: number;
  minStack?: number;
  maxStack?: number;
  applyProfitMargins?: boolean;
  /** Cantidad a la venta (-1 = ilimitada). */
  availableStock?: number;
  /** 0 sin límite, 1 por partida, 2 por jugador (`LimitedStockMode`). */
  availableStockLimit?: number;
  /** Si no repite lo que ya está en el carro. */
  avoidRepeat?: boolean;
  /** Si usa el `Price` de `Data/Objects` en vez del precio de venta. */
  useObjectDataPrice?: boolean;
  ignoreShopPriceModifiers?: boolean;
  priceModifiers?: Modificador[];
  /** 0 todos juntos, 1 el menor, 2 el mayor (`QuantityModifierMode`). */
  priceModifierMode?: number;
  availableStockModifiers?: Modificador[];
  availableStockModifierMode?: number;
  stackModifiers?: Modificador[];
  stackModifierMode?: number;
  /** Se vende como receta. */
  isRecipe?: boolean;
  /** Filtro por objeto de la consulta (`ITEM_CATEGORY`, `ITEM_OBJECT_TYPE`...). */
  perItemCondition?: string;
}

/** Un festival pasivo de `Data/PassiveFestivals`. */
export interface FestivalPasivo {
  id: string;
  /** 0 primavera, 1 verano, 2 otoño, 3 invierno. */
  season: number;
  startDay: number;
  endDay: number;
  /** Hora de inicio del primer día (HHMM, p. ej. 1700). */
  startTime: number;
  /** Consulta de estado del juego que tiene que cumplirse para que ocurra. */
  condition?: string;
  /** Nombre a mostrar; los festivales sin calendario no lo tienen. */
  name?: Par;
  /** Ubicaciones cuyo mapa cambia durante el festival (`MapReplacements`: p. ej. `Beach`). */
  mapReplacements?: string[];
  /**
   * Alguna de `mapReplacements` está en el contexto del valle (`GameLocation.InValleyContext`): ese día
   * no llueve (`Game1.getWeatherModificationsForDate`, `LocationWeather.UpdateDailyWeather`). La playa
   * del Mercado nocturno sí; el desierto no.
   */
  inValley?: boolean;
}

/** Una condición de `WeatherConditions`: el clima toma la primera cuya `condition` se cumple. */
export interface CondicionClima {
  id: string;
  /** Consulta de estado del juego (sin ella, siempre se cumple: la última, `Default`). */
  condition?: string;
  /** `Sun`, `Rain`, `Storm`, `Snow`, `Wind` o `GreenRain`. */
  weather: string;
}

/** Lo que baja la pestaña del predictor (`predict.json`). */
export interface PredictData {
  /** TODOS los objetos de `Data/Objects`, en el orden del archivo (el de `ItemRegistry` para `RANDOM_ITEMS`). */
  objects: ObjetoDato[];
  /** TODOS los muebles de `Data/Furniture`, en el orden del archivo. */
  furniture: MuebleDato[];
  /**
   * Nombre `[en, es]` por id calificado de lo que el sitio no tiene en su lista de objetos: los muebles
   * que el carro puede sacar (`RANDOM_ITEMS (F) 0 1612`) y los sombreros, camisas, papeles, máquinas y
   * armas que nombran las geodas, el carro y la caja misteriosa. Los objetos `(O)` no están: salen de `names-*.json`.
   */
  names: Record<string, Par>;
  /** Por id de geoda: `535`, `536`, `537`, `749`, `275` (cofre de artefactos), `791` (coco dorado). */
  geodes: Record<string, GeodaDato>;
  /** Las entradas de la tienda del carro ambulante, en orden. */
  traveler: EntradaCarro[];
  /** `Crop.getRandomLowGradeCropForThisSeason`: ids de objeto por estación, en el orden de su `Next(n)`. En invierno el juego elige antes otra estación al azar. */
  lowGradeCrops: { spring: string[]; summer: string[]; fall: string[] };
  /** `Utility.getRaccoonSeedForCurrentTimeOfYear`: `seeds` por estación (0 primavera ... 3 invierno) y `lastDay`, el último día de cada una en que vale su semilla (pasado, vale la de la siguiente). */
  raccoonSeeds: { seeds: string[]; lastDay: number[] };
  festivals: {
    /** `Utility.isFestivalDay`: los días de festival de cada estación. */
    days: Record<"spring" | "summer" | "fall" | "winter", number[]>;
    /** Nombre de cada festival por clave (`spring13`). */
    names: Record<string, Par>;
    passive: FestivalPasivo[];
  };
  /** `WeatherConditions` del contexto `Default` de `Data/LocationContexts`, en orden. */
  weather: CondicionClima[];
}

// ------------------------------------------------------------------ consultas del juego

/** Lo que las consultas `ITEM_*` saben del objeto `Target`. */
export interface ItemInfo {
  /** `Item.Category`. */
  category: number;
  /** `Object.Type` (sólo objetos; los muebles también son `Object` en el juego). */
  type?: string;
  /** `ObjectDataDefinition.HasExplicitCategory`: es `(O)` y su `Category` de `Data/Objects` es < 0. */
  explicitCategory: boolean;
}

/**
 * Lo que las consultas leen del estado del juego. Todo lo opcional que falte hace tirar a la
 * consulta que lo pide, así una condición nueva del juego no se evalúa en silencio con un valor
 * inventado (las geodas no pasan fecha ni amistades; el carro no pasa estadísticas ni correo).
 */
export interface QueryContext {
  /** `Farmer.stats.Get(nombre)` del jugador actual. */
  stat(name: string): number;
  /** `Farmer.hasOrWillReceiveMail` del jugador actual (recibido, en el buzón o para mañana). */
  hasMail(id: string): boolean;
  /** Id calificado del objeto `Target` (`ITEM_ID Target ...`), si hay. */
  target?: string;
  /** Datos del objeto `Target` para `ITEM_CATEGORY`, `ITEM_OBJECT_TYPE` e `ITEM_HAS_EXPLICIT_OBJECT_CATEGORY`. */
  item?(qualifiedId: string): ItemInfo | undefined;
  /** `Game1.season` (0 primavera ... 3 invierno), para `SEASON`. */
  season?: 0 | 1 | 2 | 3;
  /** `Game1.year`, para `YEAR`. */
  year?: number;
  /** `Game1.dayOfMonth`, para `DAY_OF_MONTH`, `SEASON_DAY` y `SYNCED_SUMMER_RAIN_RANDOM`. */
  dayOfMonth?: number;
  /** `Game1.stats.DaysPlayed`, para `DAYS_PLAYED`. */
  daysPlayed?: number;
  /** `Utility.CreateDaySaveRandom(a)`, para `SYNCED_SUMMER_RAIN_RANDOM`. */
  daySave?(a: number): DotNetRandom;
  /** `IS_GREEN_RAIN_DAY`: `Utility.isGreenRainDay` de MAÑANA (`Game1.Date` + 1, con `Game1.year`). */
  greenRainTomorrow?: boolean;
  /** El `Random` de quien consulta (`RANDOM`): el de la tienda, en el carro. */
  random?: DotNetRandom;
  /** `Utility.TryCreateIntervalRandom(intervalo, clave)`, para `SYNCED_RANDOM`. */
  synced?(interval: string, key: string): DotNetRandom;
  /** `PLAYER_HEARTS Current <npc> <min> [max]`. */
  hearts?(npc: string, min: number, max: number): boolean;
  /** `IS_COMMUNITY_CENTER_COMPLETE`. */
  ccComplete?: boolean;
  /** `IS_JOJA_MART_COMPLETE` (`Utility.hasFinishedJojaRoute`). */
  jojaComplete?: boolean;
  /** `IS_MULTIPLAYER` (`Game1.IsMultiplayer`: hay otros granjeros). */
  multiplayer?: boolean;
  /** Un campo entero de `NetWorldState` para `WORLD_STATE_FIELD` (el nombre llega en minúsculas). */
  worldInt?(field: string): number;
}

const igual = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** El jugador de una consulta: el predictor es de un solo granjero, así que sólo vale `Current`. */
function jugador(clave: string, q: string): void {
  if (!igual(clave, "Current")) throw new Error(`consulta con jugador "${clave}" sin soporte: ${q}`);
}

/** Un dato opcional del contexto, o error si la consulta lo pide y no está. */
function pedir<T>(v: T | undefined, que: string, q: string): T {
  if (v === undefined) throw new Error(`la consulta necesita ${que} y el predictor no lo pasó: ${q}`);
  return v;
}

const MAX_INT = 2147483647;
const ENTERO = /^\s*[+-]?\d+\s*$/;

/** `ArgUtility.TryGetInt` (y `TryGetOptionalInt` con `omision`): un entero o error. */
function entero(x: string | undefined, q: string, omision?: number): number {
  if (x === undefined && omision !== undefined) return omision;
  if (x === undefined || !ENTERO.test(x)) throw new Error(`se esperaba un entero en: ${q}`);
  return Number.parseInt(x, 10);
}

/** `Helpers.RandomImpl`: `random.NextDouble() < chance` (sin `@addDailyLuck`, que el predictor no sabe). */
function azar(r: DotNetRandom, args: string[], desde: number, q: string): boolean {
  const chance = Number(args[desde]);
  if (args[desde] === undefined || Number.isNaN(chance)) throw new Error(`RANDOM sin probabilidad: ${q}`);
  if (args.slice(desde + 1).some((a) => igual(a, "@addDailyLuck"))) throw new Error(`@addDailyLuck sin soporte: ${q}`);
  // El juego la lee como `float` y la compara pasada a `double`.
  return r.nextDouble() < Math.fround(chance);
}

const ESTACIONES = ["spring", "summer", "fall", "winter"];

/** El objeto `Target` de las consultas `ITEM_*` (`Helpers.TryGetItemArg`), o `undefined` si no hay. */
function objetivo(args: string[], ctx: QueryContext, q: string): ItemInfo | undefined {
  if (!igual(args[1] ?? "", "Target")) throw new Error(`${args[0]} sólo con Target: ${q}`);
  if (ctx.target === undefined) return undefined;
  return pedir(ctx.item, "los datos del objeto", q)(ctx.target);
}

/** Una consulta suelta, sin el `!` (`GameStateQuery.DefaultResolvers`). */
function consulta(args: string[], ctx: QueryContext, q: string): boolean {
  const clave = args[0].toUpperCase();
  switch (clave) {
    case "TRUE":
      return true;
    case "FALSE":
      return false;
    // GameStateQuery.DefaultResolvers.ANY: alguna de las consultas (cada una entre comillas).
    case "ANY":
      return args.slice(1).some((x) => checkConditions(x, ctx));
    // GameStateQuery.DefaultResolvers.PLAYER_STAT: min <= stat <= max (max opcional).
    case "PLAYER_STAT": {
      jugador(args[1], q);
      const min = Number.parseInt(args[3], 10);
      const max = args[4] === undefined ? MAX_INT : Number.parseInt(args[4], 10);
      if (Number.isNaN(min) || Number.isNaN(max)) throw new Error(`PLAYER_STAT mal formada: ${q}`);
      const v = ctx.stat(args[2]);
      return v >= min && v <= max;
    }
    // GameStateQuery.DefaultResolvers.PLAYER_HAS_MAIL: sólo el tipo "Any" (el que usan las geodas).
    case "PLAYER_HAS_MAIL": {
      jugador(args[1], q);
      if (args[3] !== undefined && !igual(args[3], "Any")) throw new Error(`PLAYER_HAS_MAIL con tipo sin soporte: ${q}`);
      return ctx.hasMail(args[2]);
    }
    // GameStateQuery.DefaultResolvers.PLAYER_HEARTS (sin "Any" ni "AnyDateable").
    case "PLAYER_HEARTS": {
      jugador(args[1], q);
      const npc = pedir(args[2], "el nombre", q);
      if (igual(npc, "Any") || igual(npc, "AnyDateable")) throw new Error(`PLAYER_HEARTS ${npc} sin soporte: ${q}`);
      return pedir(ctx.hearts, "las amistades", q)(npc, entero(args[3], q), entero(args[4], q, MAX_INT));
    }
    // GameStateQuery.DefaultResolvers.ITEM_ID: el id calificado o sin calificar, sin mayúsculas.
    case "ITEM_ID": {
      if (!igual(args[1], "Target")) throw new Error(`ITEM_ID sólo con Target: ${q}`);
      const t = ctx.target;
      if (t === undefined) return false;
      const corto = t.replace(/^\([A-Z]+\)/, "");
      return args.slice(2).some((x) => igual(x, t) || igual(x, corto));
    }
    // GameStateQuery.DefaultResolvers.ITEM_CATEGORY: sin categorías, "cualquiera < -1".
    case "ITEM_CATEGORY": {
      const it = objetivo(args, ctx, q);
      if (it === undefined) return false;
      if (args.length === 2) return it.category < -1;
      return args.slice(2).some((x) => it.category === entero(x, q));
    }
    // GameStateQuery.DefaultResolvers.ITEM_OBJECT_TYPE: sólo objetos.
    case "ITEM_OBJECT_TYPE": {
      const tipo = objetivo(args, ctx, q)?.type;
      if (tipo === undefined) return false;
      return args.slice(2).some((x) => igual(x, tipo));
    }
    // GameStateQuery.DefaultResolvers.ITEM_HAS_EXPLICIT_OBJECT_CATEGORY.
    case "ITEM_HAS_EXPLICIT_OBJECT_CATEGORY":
      return objetivo(args, ctx, q)?.explicitCategory ?? false;
    // GameStateQuery.DefaultResolvers.SEASON: alguna de las estaciones.
    case "SEASON": {
      const hoy = pedir(ctx.season, "la estación", q);
      return args.slice(1).some((x) => {
        const i = ESTACIONES.indexOf(x.toLowerCase());
        if (i < 0) throw new Error(`estación desconocida: ${q}`);
        return i === hoy;
      });
    }
    // GameStateQuery.DefaultResolvers.SEASON_DAY: pares estación-día, alguno igual a hoy.
    case "SEASON_DAY": {
      const hoy = pedir(ctx.season, "la estación", q);
      const dia = pedir(ctx.dayOfMonth, "el día del mes", q);
      for (let i = 1; i < args.length; i += 2) {
        const est = ESTACIONES.indexOf((args[i] ?? "").toLowerCase());
        if (est < 0) throw new Error(`estación desconocida: ${q}`);
        if (est === hoy && dia === entero(args[i + 1], q)) return true;
      }
      return false;
    }
    // GameStateQuery.DefaultResolvers.DAY_OF_MONTH: alguno de los días (o "even"/"odd").
    case "DAY_OF_MONTH": {
      const dia = pedir(ctx.dayOfMonth, "el día del mes", q);
      return args.slice(1).some((x) => {
        if (ENTERO.test(x)) return dia === Number.parseInt(x, 10);
        if (igual(x, "even")) return dia % 2 === 0;
        if (igual(x, "odd")) return dia % 2 === 1;
        throw new Error(`día del mes inválido: ${q}`);
      });
    }
    // GameStateQuery.DefaultResolvers.DAYS_PLAYED: min <= días jugados <= max (max opcional).
    case "DAYS_PLAYED": {
      const d = pedir(ctx.daysPlayed, "los días jugados", q);
      return d >= entero(args[1], q) && d <= entero(args[2], q, MAX_INT);
    }
    // GameStateQuery.DefaultResolvers.SYNCED_SUMMER_RAIN_RANDOM: `CreateDaySaveRandom(hash("summer_rain_chance"))`
    // con `NextBool(0.12f + día * 0.003f)` (en `float`, como el juego).
    case "SYNCED_SUMMER_RAIN_RANDOM": {
      const r = pedir(ctx.daySave, "la semilla", q)(hashString("summer_rain_chance"));
      const f = Math.fround;
      const chance = f(f(0.12) + f(pedir(ctx.dayOfMonth, "el día del mes", q) * f(0.003)));
      return chance >= 1 || r.nextDouble() < chance;
    }
    // GameStateQuery.DefaultResolvers.IS_GREEN_RAIN_DAY: si MAÑANA hay lluvia verde.
    case "IS_GREEN_RAIN_DAY":
      return pedir(ctx.greenRainTomorrow, "la lluvia verde de mañana", q);
    // GameStateQuery.DefaultResolvers.YEAR: min <= año <= max (max opcional).
    case "YEAR": {
      const y = pedir(ctx.year, "el año", q);
      return y >= entero(args[1], q) && y <= entero(args[2], q, MAX_INT);
    }
    // GameStateQuery.DefaultResolvers.RANDOM: con el `Random` de quien consulta.
    case "RANDOM":
      return azar(pedir(ctx.random, "el Random de la consulta", q), args, 1, q);
    // GameStateQuery.DefaultResolvers.SYNCED_RANDOM: `TryCreateIntervalRandom(intervalo, clave)`.
    case "SYNCED_RANDOM": {
      const r = pedir(ctx.synced, "la semilla", q)(pedir(args[1], "el intervalo", q), pedir(args[2], "la clave", q));
      return azar(r, args, 3, q);
    }
    case "IS_COMMUNITY_CENTER_COMPLETE":
      return pedir(ctx.ccComplete, "si el Centro Comunitario está completo", q);
    case "IS_JOJA_MART_COMPLETE":
      return pedir(ctx.jojaComplete, "si la ruta de Joja está completa", q);
    case "IS_MULTIPLAYER":
      return pedir(ctx.multiplayer, "si es multijugador", q);
    // GameStateQuery.DefaultResolvers.WORLD_STATE_FIELD: sólo campos enteros (min <= v <= max).
    case "WORLD_STATE_FIELD": {
      const v = pedir(ctx.worldInt, "el estado del mundo", q)(pedir(args[1], "el campo", q).toLowerCase());
      if (!ENTERO.test(args[2] ?? "")) return false;
      return v >= Number.parseInt(args[2], 10) && v <= entero(args[3], q, MAX_INT);
    }
    default:
      throw new Error(`consulta de estado sin soporte en el predictor: ${q}`);
  }
}

/**
 * `ArgUtility.SplitQuoteAware`: parte por `sep` fuera de comillas. Con `sacarComillas` las quita
 * (`SplitBySpaceQuoteAware`); sin, las deja (`GameStateQuery.SplitRaw`). Las barras de escape no
 * están: tiran error.
 */
function partir(s: string, sep: RegExp, sacarComillas: boolean): string[] {
  if (s.includes("\\")) throw new Error(`consulta con escapes sin soporte: ${s}`);
  const out: string[] = [];
  let cur = "";
  let dentro = false;
  for (const ch of s) {
    if (ch === '"') {
      dentro = !dentro;
      if (!sacarComillas) cur += ch;
    } else if (!dentro && sep.test(ch)) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (dentro) throw new Error(`comillas sin cerrar: ${s}`);
  out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x !== "");
}

/**
 * `GameStateQuery.CheckConditions`: consultas separadas por coma (fuera de comillas), todas tienen
 * que cumplirse y se corta en la primera que falla; `!` adelante niega. Vacía o ausente = verdadera.
 */
export function checkConditions(query: string | undefined, ctx: QueryContext): boolean {
  if (query === undefined || query === "" || query === "TRUE") return true;
  if (query === "FALSE") return false;
  for (const parte of partir(query, /,/, false)) {
    const args = partir(parte, /\s/, true);
    if (args.length === 0) continue;
    let negada = false;
    if (args[0].startsWith("!")) {
      negada = true;
      args[0] = args[0].slice(1);
    }
    const ok = consulta(args, ctx, query);
    if (ok === negada) return false;
  }
  return true;
}

/** `GameStateQuery.IsImmutablyFalse`: alguna parte es `FALSE` (o `!TRUE`). */
function siempreFalsa(query: string | undefined): boolean {
  if (query === undefined || query === "" || query === "TRUE") return false;
  if (query === "FALSE") return true;
  return partir(query, /,/, false).some((p) => {
    const a = partir(p, /\s/, true)[0] ?? "";
    return a.startsWith("!") ? igual(a.slice(1), "TRUE") : igual(a, "FALSE");
  });
}

/** `RandomExtensions.ChooseFrom`: `options[random.Next(options.Count)]`. */
export function chooseFrom<T>(r: DotNetRandom, xs: readonly T[]): T {
  return xs[r.next(xs.length)];
}

/**
 * `Utility.ApplyQuantityModifiers` con `QuantityModifier.Apply` (en `float`, como el juego).
 * `mode`: 0 todos encadenados, 1 el menor, 2 el mayor. Ojo: si el modificador tiene `random`,
 * el valor se elige ANTES de mirar la condición, así que consume `Next` aunque no se aplique.
 */
export function applyQuantityModifiers(
  value: number,
  mods: readonly Modificador[] | undefined,
  mode: number,
  ctx: QueryContext,
  r: DotNetRandom,
): number {
  if (!mods || mods.length === 0) return value;
  const f = Math.fround;
  const v = f(value);
  let res: number | undefined;
  for (const m of mods) {
    let amount = f(m.amount);
    if (m.random && m.random.length > 0) amount = f(chooseFrom(r, m.random));
    // El juego le pasa el mismo `random` a la condición (el `RANDOM 0.1` del carro).
    if (!checkConditions(m.condition, { ...ctx, random: r })) continue;
    const base = mode === 1 || mode === 2 ? v : (res ?? v);
    let x: number;
    switch (m.mod) {
      case 0:
        x = f(base + amount);
        break;
      case 1:
        x = f(base - amount);
        break;
      case 2:
        x = f(base * amount);
        break;
      case 3:
        x = f(base / amount);
        break;
      default:
        x = amount;
    }
    if (mode === 1) res = res === undefined || x < res ? x : res;
    else if (mode === 2) res = res === undefined || x > res ? x : res;
    else res = x;
  }
  return res ?? v;
}

/** Los campos de `ISpawnItemData` que usa el predictor. */
export interface SpawnFields {
  itemId?: string;
  randomItemId?: string[];
  minStack?: number;
  maxStack?: number;
  stackModifiers?: Modificador[];
  stackModifierMode?: number;
}

/**
 * `ItemQueryResolver.TryResolveRandomItem(ISpawnItemData)` + `ApplyItemFields` para ids fijos
 * (calificados): elige de `randomItemId` con `ChooseFrom`, después la cantidad (`Next(min, max + 1)`
 * si `maxStack > 1`) y los `stackModifiers` con el objeto como `Target`. Las consultas de objetos
 * (`RANDOM_ITEMS`...) no están acá: tiran error. `cantidadBase` es el `Stack` con el que el juego
 * crea el objeto (1). No recorta al máximo de la pila (`FixStackSize`): las geodas no llegan.
 */
export function resolveSpawnItem(
  data: SpawnFields,
  r: DotNetRandom,
  ctx: QueryContext,
  cantidadBase = 1,
): { id: string; qty: number } | null {
  let id = data.itemId;
  if (data.randomItemId && data.randomItemId.length > 0) id = chooseFrom(r, data.randomItemId);
  if (id === undefined || id.trim() === "") return null;
  if (!/^\([A-Z]+\)\S+$/.test(id)) throw new Error(`consulta de objetos sin soporte en el predictor: ${id}`);
  // La misma cuenta que el carro (`ApplyItemFields`), para que no se desincronicen.
  const qty = cantidad(data, id, r, ctx, cantidadBase);
  return { id, qty };
}

// ------------------------------------------------------------------ consultas de objetos (tiendas)

/** `ItemQueryContext` de una tienda: el `Random` de la tienda y el estado para las condiciones. */
export interface ResolveContext extends QueryContext {
  random: DotNetRandom;
}

/** Los campos de `ISpawnItemData` que lee `ItemQueryResolver.TryResolve` en una tienda. */
export interface ResolveFields extends SpawnFields {
  perItemCondition?: string;
  maxItems?: number;
  isRecipe?: boolean;
}

/** Lo que devuelve `TryResolve` (después de `ApplyItemFields`). */
export interface Resuelto {
  id: string;
  qty: number;
}

/** `Item.Category`, `Object.Type` y la categoría explícita de un objeto `(O)` (para `PerItemCondition`). */
export function itemInfo(data: PredictData, qid: string): ItemInfo | undefined {
  if (!qid.startsWith("(O)")) throw new Error(`datos de objeto sin soporte para ${qid} (sólo (O))`);
  const o = indiceObjetos(data).get(qid.slice(3));
  if (!o) return undefined;
  return { category: o[1], type: o[2], explicitCategory: o[1] < 0 };
}

const indices = new WeakMap<PredictData, Map<string, ObjetoDato>>();
function indiceObjetos(data: PredictData): Map<string, ObjetoDato> {
  let m = indices.get(data);
  if (!m) {
    m = new Map(data.objects.map((o) => [o[0], o]));
    indices.set(data, m);
  }
  return m;
}

/** `int.TryParse` del id (con espacios y signo, dentro de 32 bits). */
function idNumerico(id: string): number | undefined {
  if (!/^\s*[+-]?\d+\s*$/.test(id)) return undefined;
  const n = Number.parseInt(id, 10);
  return n >= -2147483648 && n <= 2147483647 ? n : undefined;
}

/**
 * `ItemQueryResolver.DefaultResolvers.RANDOM_ITEMS <tipo> [min] [max] [@isRandomSale] [@requirePrice]`:
 * baraja TODO `GetAllData()` con `orderby random.Next()` (un `Next()` por entrada, en el orden de los
 * datos, y orden estable si empatan) y después filtra por venta al azar, rango de id y precio. Es
 * perezoso: devuelve los ids en orden y el que llama corta. Sólo `(O)` y `(F)`.
 */
function* randomItems(args: string[], r: DotNetRandom, data: PredictData, q: string): Generator<string> {
  const tipo = args[0];
  let min = -2147483648;
  let max = 2147483647;
  let i = 1;
  const a1 = args[1] === undefined ? undefined : idNumerico(args[1]);
  if (a1 !== undefined) {
    min = a1;
    i++;
    const a2 = args[2] === undefined ? undefined : idNumerico(args[2]);
    if (a2 !== undefined) {
      max = a2;
      i++;
    }
  }
  let venta = false;
  let precio = false;
  for (; i < args.length; i++) {
    if (igual(args[i], "@isRandomSale")) venta = true;
    else if (igual(args[i], "@requirePrice")) precio = true;
    else throw new Error(`argumento de RANDOM_ITEMS sin soporte: ${q}`);
  }
  // [id, precio de venta (`salePrice(ignoreProfitMargins: true)`), ExcludeFromRandomSale]
  let todos: [string, number, boolean][];
  if (tipo === "(O)") {
    // Object.salePrice = Price * 2 (los minerales con precio por año también dan > 0 si Price > 0).
    todos = data.objects.map((o) => [o[0], o[3] * 2, (o[4] & 1) !== 0]);
  } else if (tipo === "(F)") {
    // Furniture.salePrice = el precio del mueble (campo 5).
    todos = data.furniture.map((f) => [f[0], f[1], (f[2] & 1) !== 0]);
  } else throw new Error(`RANDOM_ITEMS de tipo sin soporte: ${q}`);
  const conRango = min !== -2147483648 || max !== 2147483647;
  const claves = todos.map(() => r.next());
  const orden = todos.map((_, k) => k).sort((x, y) => claves[x] - claves[y] || x - y);
  for (const k of orden) {
    const [id, venta$, excluido] = todos[k];
    if (venta && excluido) continue;
    if (conRango) {
      const n = idNumerico(id);
      if (n === undefined || n < min || n > max) continue;
    }
    if (precio && !(venta$ > 0)) continue;
    yield tipo + id;
  }
}

/** `ApplyItemFields`: la cantidad (`Next(min, max + 1)` si `maxStack > 1`) y sus modificadores; las recetas, 1. */
function cantidad(data: ResolveFields, id: string, r: DotNetRandom, ctx: QueryContext, base: number): number {
  if (data.isRecipe) return 1;
  let min = data.minStack ?? -1;
  let max = data.maxStack ?? -1;
  let qty = base;
  if (min === -1 && max === -1) qty = base;
  else if (max > 1) {
    min = Math.max(min, 1);
    max = Math.max(max, min);
    qty = r.next(min, max + 1);
  } else if (min > 1) qty = min;
  return Math.trunc(applyQuantityModifiers(qty, data.stackModifiers, data.stackModifierMode ?? 0, { ...ctx, target: id }, r));
}

/**
 * `ItemQueryResolver.TryResolve(ISpawnItemData, ..., avoidRepeat, avoidItemIds)` con
 * `ItemQuerySearchMode.All`, como lo llama `ShopBuilder.GetShopStock`: elige de `randomItemId`
 * (`Utility.TryGetRandomExcept` si hay `avoidItemIds`), resuelve el id o la consulta (con
 * `PerItemCondition`, sin repetidos y salteando `avoidItemIds`, hasta `MaxItems`) y aplica
 * `ApplyItemFields`. No toca `avoidItemIds`: eso lo hace la tienda (`TrackSeenItems`).
 */
export function tryResolve(
  data: ResolveFields,
  ctx: ResolveContext,
  pd: PredictData,
  avoidRepeat: boolean,
  avoidItemIds: ReadonlySet<string> | null,
): Resuelto[] {
  const r = ctx.random;
  let sel = data.itemId;
  if (data.randomItemId && data.randomItemId.length > 0) {
    let opciones: readonly string[] = data.randomItemId;
    // List.Except: sin los evitados y sin repetidos.
    if (avoidItemIds && avoidItemIds.size > 0) opciones = [...new Set(data.randomItemId)].filter((x) => !avoidItemIds.has(x));
    if (opciones.length === 0) throw new Error("TryGetRandomExcept sin opciones (el juego tira)");
    sel = chooseFrom(r, opciones);
  }
  if (sel === undefined || sel.trim() === "") return [];
  const esp = sel.indexOf(" ");
  const clave = (esp < 0 ? sel : sel.slice(0, esp)).toUpperCase();
  let ids: string[];
  if (clave === "RANDOM_ITEMS") {
    const args = sel.slice(esp + 1).split(" ").filter((x) => x !== "");
    const vistos = avoidRepeat ? new Set<string>() : null;
    const sinFiltro = !avoidRepeat && (!avoidItemIds || avoidItemIds.size === 0) && siempreFalsa(data.perItemCondition);
    const tope = data.maxItems ?? Infinity;
    ids = [];
    if (tope > 0) {
      for (const id of randomItems(args, r, pd, sel)) {
        if (!sinFiltro) {
          if (avoidItemIds?.has(id)) continue;
          if (vistos) {
            if (vistos.has(id)) continue;
            vistos.add(id);
          }
          if (!checkConditions(data.perItemCondition, { ...ctx, random: undefined, target: id })) continue;
        }
        ids.push(id);
        if (ids.length >= tope) break;
      }
    }
  } else if (/^\([A-Z]+\)\S+$/.test(sel)) {
    // Un id fijo: `ItemRegistry.Create`, salvo que esté en `avoidItemIds` (sin `MaxItems` ni condición).
    ids = avoidItemIds?.has(sel) ? [] : [sel];
  } else throw new Error(`consulta de objetos sin soporte en el predictor: ${sel}`);
  return ids.map((id) => ({ id, qty: cantidad(data, id, r, ctx, 1) }));
}
