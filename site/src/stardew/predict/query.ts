// Datos del predictor de Stardew Valley 1.6.15: la forma de `games/stardew/data/predict.json`
// (lo genera `games/stardew/tools/predict_data.py`). Acá van sólo los tipos; la lógica de las
// consultas del juego (`RANDOM_ITEMS`, geodas, carro) se suma en la tarea siguiente.
//
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
