// Carro ambulante del predictor de Stardew Valley 1.6.15: qué vende, a qué precio y cuántos, en
// cada una de las próximas visitas. Reescribe `ShopBuilder.GetShopStock` sobre `Data/Shops`
// "Traveler"; se valida contra el juego real con el comando `cart` del oráculo
// (`test/fixtures/stardew-predict/cart.json`).
//
// Todo sale del `Random` del día (`Utility.CreateDaySaveRandom()`): el mismo en el bosque, en el
// Mercado nocturno y en el Festival del desierto. Lo que depende de la partida: los retratos (14
// corazones), los catálogos de Joja y Junimo (Centro Comunitario / Joja), la receta del anillo de
// bodas (multijugador) y las semillas de col morada del año 1 (`VisitsUntilY1Guarantee`).
//
// Lo que NO está: lo que el granjero ya compró hoy (`synchronizedShopStock`, se borra cada día) y
// la receta que ya sabe (`ShopMenu.AddForSale` la esconde: `CartItem.recipe` avisa para filtrarla).
import { daySaveRandom, daysPlayed, syncedRandom, type Seed } from "./rng";
import {
  applyQuantityModifiers,
  checkConditions,
  itemInfo,
  tryResolve,
  type EntradaCarro,
  type PredictData,
  type ResolveContext,
} from "./query";

/** El estado de la partida que leen las condiciones del carro, para un día. */
export interface CartState {
  seed: Seed;
  /** `Game1.stats.DaysPlayed` de ese día (ver `daysPlayed` de `rng.ts`). */
  daysPlayed: number;
  /** 0 primavera ... 3 invierno. */
  season: 0 | 1 | 2 | 3;
  day: number;
  year: number;
  /** `Game1.IsMultiplayer`: hay otros granjeros conectados (o cargados) en la partida. */
  multiplayer: boolean;
  /** `IS_COMMUNITY_CENTER_COMPLETE`: los seis cuartos del anfitrión y sin `JojaMember`. */
  ccComplete: boolean;
  /** `IS_JOJA_MART_COMPLETE` (`Utility.hasFinishedJojaRoute`). */
  jojaComplete: boolean;
  /** Los vecinos con los que el granjero tiene 14 corazones (3.500 puntos: casado o compañero de cuarto). */
  hearts14: string[];
  /** `netWorldState.VisitsUntilY1Guarantee` de ESE día (ver `guaranteeByVisit`). */
  visitsUntilY1Guarantee: number;
}

/** Un objeto a la venta. */
export interface CartItem {
  /** Id calificado, p. ej. `"(O)266"`. */
  id: string;
  price: number;
  /** Cuántos hay; `STOCK_ILIMITADO` = sin límite. */
  stock: number;
  /** Se vende como receta: el juego no la muestra si el granjero ya la sabe. */
  recipe?: boolean;
}

/** `int.MaxValue`: lo que el juego pone de cantidad cuando es ilimitada (`AvailableStock` -1). */
export const STOCK_ILIMITADO = 2147483647;

export type CartKind = "cart" | "nightMarket" | "desertFestival";
export interface Fecha {
  season: 0 | 1 | 2 | 3;
  day: number;
  year: number;
}

const ESTACIONES = ["spring", "summer", "fall", "winter"] as const;

/** `Object.salePrice(ignoreProfitMargins: true)` de un objeto `(O)` sin calidad. */
function precioObjeto(data: PredictData, id: string, year: number, receta: boolean): number {
  const o = data.objects.find((x) => x[0] === id);
  if (!o) throw new Error(`objeto desconocido: (O)${id}`);
  if (receta) return o[3] * 10;
  // Los minerales con precio fijo por año (madera, piedra, carbón y menas).
  const porAnio: Record<string, [number, number]> = {
    "388": [10, 50], "390": [20, 100], "382": [120, 250], "378": [80, 160], "380": [150, 250], "384": [350, 750],
  };
  const fijo = porAnio[id];
  if (fijo) return year <= 1 ? fijo[0] : fijo[1];
  return o[3] * 2;
}

/** `ShopBuilder.GetBasePrice` (sin margen de dificultad: el carro tiene `ApplyProfitMargins: false`). */
function precioBase(e: EntradaCarro, data: PredictData, id: string, year: number, receta: boolean): number {
  if (e.applyProfitMargins) throw new Error(`carro/${e.id}: ApplyProfitMargins sin soporte (depende de la dificultad)`);
  if (e.price >= 0) return e.price;
  if (id.startsWith("(O)")) {
    const o = data.objects.find((x) => x[0] === id.slice(3));
    if (!o) throw new Error(`objeto desconocido: ${id}`);
    // `UseObjectDataPrice`: el `Price` de `Data/Objects`; si no, el precio de venta.
    return e.useObjectDataPrice && !receta ? o[3] : precioObjeto(data, id.slice(3), year, receta);
  }
  if (id.startsWith("(F)")) {
    const f = data.furniture.find((x) => x[0] === id.slice(3));
    if (!f) throw new Error(`mueble desconocido: ${id}`);
    return f[1]; // Furniture.salePrice
  }
  throw new Error(`carro/${e.id}: precio de ${id} sin soporte`);
}

/** `ShopBuilder.TrackSeenItems`: lo suma a los vistos y dice si ya estaba. */
function yaVisto(vistos: Set<string>, id: string, receta: boolean): boolean {
  const clave = receta ? id + "#Recipe" : id;
  if (vistos.has(clave)) return true;
  vistos.add(clave);
  return false;
}

/** El contexto de las consultas del carro (`ItemQueryContext` de la tienda). */
function contexto(st: CartState, data: PredictData): Omit<ResolveContext, "random"> {
  return {
    stat: (n) => {
      throw new Error(`el carro no conoce la estadística ${n}`);
    },
    hasMail: (m) => {
      throw new Error(`el carro no conoce el correo ${m}`);
    },
    item: (qid) => itemInfo(data, qid),
    season: st.season,
    year: st.year,
    synced: (intervalo, clave) => {
      if (intervalo !== "day" && intervalo !== "season" && intervalo !== "year") {
        throw new Error(`SYNCED_RANDOM con intervalo ${intervalo} sin soporte`);
      }
      return syncedRandom(st.seed, intervalo, clave, st.daysPlayed, ESTACIONES[st.season], st.year);
    },
    // Sólo se sabe quién tiene 14 corazones (el máximo): alcanza para `PLAYER_HEARTS Current X 14`.
    hearts: (npc, min, max) => {
      if (min > 14) return false;
      if (min !== 14) throw new Error(`PLAYER_HEARTS ${npc} ${min}: el predictor sólo sabe quién tiene 14`);
      return max >= 14 && st.hearts14.includes(npc);
    },
    ccComplete: st.ccComplete,
    jojaComplete: st.jojaComplete,
    multiplayer: st.multiplayer,
    worldInt: (campo) => {
      if (campo === "visitsuntily1guarantee") return st.visitsUntilY1Guarantee;
      throw new Error(`WORLD_STATE_FIELD ${campo} sin soporte`);
    },
  };
}

/**
 * `ShopBuilder.GetShopStock("Traveler")`: lo que vende el carro ese día, en el orden de la tienda.
 * Por entrada: la condición (`CheckItemCondition`), `ItemQueryResolver.TryResolve`, el precio base
 * (`GetBasePrice`), `PriceModifiers` y `AvailableStockModifiers` con el `Random` de la tienda (se
 * tiran aunque después `AvoidRepeat` saque el objeto) y `TrackSeenItems`.
 */
export function predictCart(st: CartState, data: PredictData): CartItem[] {
  const random = daySaveRandom(st.seed, st.daysPlayed);
  const base = contexto(st, data);
  const ctx: ResolveContext = { ...base, random };
  const vistos = new Set<string>();
  const out: CartItem[] = [];
  for (const e of data.traveler) {
    // La condición de la entrada se mira sin el `Random` de la tienda (usaría `Game1.random`).
    if (!checkConditions(e.condition, base)) continue;
    const evitar = e.avoidRepeat ?? false;
    for (const x of tryResolve(e, ctx, data, evitar, evitar ? vistos : null)) {
      const receta = e.isRecipe ?? false;
      let precio = precioBase(e, data, x.id, st.year, receta);
      let stock = receta ? 1 : (e.availableStock ?? 1);
      // `ShopData.PriceModifiers` del carro: ninguno (lo verifica `predict_data.py`), así que
      // `IgnoreShopPriceModifiers` no cambia nada y no se tira ningún `Random` por ellos.
      const conObjeto = { ...ctx, target: x.id };
      precio = applyQuantityModifiers(precio, e.priceModifiers, e.priceModifierMode ?? 0, conObjeto, random);
      if (!receta) {
        stock = Math.trunc(
          applyQuantityModifiers(stock, e.availableStockModifiers, e.availableStockModifierMode ?? 0, conObjeto, random),
        );
      }
      if (!yaVisto(vistos, x.id, receta) || !evitar) {
        const item: CartItem = { id: x.id, price: Math.trunc(precio), stock: stock < 0 ? STOCK_ILIMITADO : stock };
        if (receta) item.recipe = true;
        out.push(item);
      }
    }
  }
  return out;
}

/**
 * Qué trae cada día al carro: `Forest.ShouldTravelingMerchantVisitToday` (`día % 7 % 5 == 0`:
 * viernes y domingos), el Mercado nocturno (`Data/PassiveFestivals` "NightMarket", 15-17 de
 * invierno, en la playa) y el Festival del desierto ("DesertFestival", 15-17 de primavera, con la
 * condición `LOCATION_ACCESSIBLE Desert`: el correo `ccVault` del anfitrión, el colectivo arreglado).
 */
function tipoDelDia(season: number, day: number, desertOpen: boolean): CartKind | null {
  if (day % 7 % 5 === 0) return "cart";
  if (day >= 15 && day <= 17) {
    if (season === 3) return "nightMarket";
    if (season === 0 && desertOpen) return "desertFestival";
  }
  return null;
}

/**
 * Las próximas `visits` fechas con carro desde `from` (incluido). `desertOpen` (sin dar: cerrado)
 * dice si el desierto está abierto, para el Festival del desierto.
 */
export function cartDays(
  from: Fecha,
  visits: number,
  opts: { desertOpen?: boolean } = {},
): (Fecha & { kind: CartKind })[] {
  const out: (Fecha & { kind: CartKind })[] = [];
  let { season, day, year } = from;
  while (out.length < visits) {
    const kind = tipoDelDia(season, day, opts.desertOpen ?? false);
    if (kind) out.push({ season, day, year, kind });
    day++;
    if (day > 28) {
      day = 1;
      season = ((season + 1) % 4) as 0 | 1 | 2 | 3;
      if (season === 0) year++;
    }
  }
  return out;
}

/**
 * `VisitsUntilY1Guarantee` en cada una de `days` (la salida de `cartDays` desde `today`), sabiendo
 * que hoy vale `v` (el de la partida: el juego guarda después de arrancar el día, así que si hoy hay
 * carro ya está descontado). Baja uno al arrancar cada día de carro en el bosque
 * (`Forest.DayUpdate`) y cada día de Mercado nocturno (`Game1._newDayAfterFade`) mientras sea >= 0;
 * el Festival del desierto no la toca. Las semillas de col morada salen el día que vale 0.
 */
export function guaranteeByVisit(v: number, today: Fecha, days: readonly (Fecha & { kind: CartKind })[]): number[] {
  const hoy = daysPlayed(today.season, today.day, today.year);
  return days.map((d) => {
    if (daysPlayed(d.season, d.day, d.year) > hoy && d.kind !== "desertFestival" && v >= 0) v--;
    return v;
  });
}
