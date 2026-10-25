// La entrada de la pestaña Predictor de Stardew Valley 1.6.15 y lo que arma con ella: de la partida que leyó el Lector
// (`SavePredict`) o de una semilla y una fecha escritas a mano, el estado que pide cada predicción (`geodes.ts`,
// `weather.ts`, `mines.ts`, `cart.ts`, `night.ts`) y las predicciones ya hechas, listas para dibujar.
//
// Lo que el juego mira y la partida trae se lee tal cual (cada bandera nombra el método del juego que la consulta). Lo
// que no se puede saber sin partida (el correo, el piso más hondo, las amistades) no se inventa: o lo elige el usuario
// (`ManualOpts`) o la predicción que lo necesita no se muestra.
import { daysPlayed as diasJugados, type Seed } from "./rng";
import { predictGeodes, type Drop, type GeodeKind, type GeodeState } from "./geodes";
import { cartDays, guaranteeByVisit, predictCart, type CartItem, type CartKind, type CartState, type Fecha } from "./cart";
import { isGreenRainDay, seasonWeather, weatherTomorrow, type DayWeather, type Hoy } from "./weather";
import { predictMines, type MineDay } from "./mines";
import { predictNights, type NightPick } from "./night";
import type { PredictData } from "./query";
import type { PredictFarmer, SaveDate, SavePredict } from "../save/parse";

export type Season = 0 | 1 | 2 | 3;

/** Lo que se escribe a mano: la semilla de la partida y la fecha de hoy. */
export interface Manual {
  seed: Seed;
  season: Season;
  day: number;
  year: number;
}

/** De dónde salen las predicciones: la partida del Lector (con el granjero elegido) o una semilla escrita a mano. */
export type PredictInput =
  | { from: "save"; save: SavePredict; farmer: number; season: Season; day: number; year: number }
  | { from: "manual"; seed: Seed; season: Season; day: number; year: number };

// ------------------------------------------------------------------ la dirección

/** La semilla escrita: sin espacios ni ceros adelante, sólo dígitos y de 1 a 10. */
export function cleanSeed(raw: string): number | "empty" | "bad" {
  const s = raw.replace(/\s+/g, "");
  if (s === "") return "empty";
  if (!/^\d+$/.test(s)) return "bad";
  const sin = s.replace(/^0+(?=\d)/, "");
  return sin.length > 10 ? "bad" : Number(sin);
}

/** `p<estación>-<día>-<año>`: `p0-2-1` es el 2 de primavera del año 1. Fuera de rango, null. */
function readDay(raw: string | null): { season: Season; day: number; year: number } | null {
  const m = /^p([0-3])-(\d{1,2})-(\d{1,4})$/.exec(raw ?? "");
  if (!m) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (day < 1 || day > 28 || year < 1) return null;
  return { season: Number(m[1]) as Season, day, year };
}

/**
 * La semilla y la fecha de la dirección: `?seed=` o `?semilla=`, `?day=` o `?dia=` (`p0-2-1`) y `?legacy=1`. Sin
 * semilla, null; vacía, `empty`; con algo que no son 1 a 10 dígitos, `bad`. Sin fecha (o con una que no existe), el 1
 * de primavera del año 1.
 */
export function readManual(search: string): Manual | { error: "empty" | "bad" } | null {
  const p = new URLSearchParams(search);
  const raw = p.get("semilla") ?? p.get("seed");
  if (raw === null) return null;
  const id = cleanSeed(raw);
  if (typeof id === "string") return { error: id };
  const date = readDay(p.get("dia") ?? p.get("day")) ?? { season: 0 as Season, day: 1, year: 1 };
  return { seed: { gameId: id, legacy: p.get("legacy") === "1" }, ...date };
}

/** Lo contrario de `readManual`, con los nombres del idioma (`?semilla=…&dia=…` en español). */
export function writeManual(m: Manual, lang: "en" | "es"): string {
  const q = new URLSearchParams();
  q.set(lang === "es" ? "semilla" : "seed", String(m.seed.gameId));
  q.set(lang === "es" ? "dia" : "day", `p${m.season}-${m.day}-${m.year}`);
  if (m.seed.legacy) q.set("legacy", "1");
  return `?${q.toString()}`;
}

// ------------------------------------------------------------------ fechas

/** El día `n` días después de `f`. */
export function addDays(f: Fecha, n: number): Fecha {
  let { season, day, year } = f;
  for (let i = 0; i < n; i++) {
    day++;
    if (day > 28) {
      day = 1;
      season = ((season + 1) % 4) as Season;
      if (season === 0) year++;
    }
  }
  return { season, day, year };
}

const total = (f: Fecha): number => diasJugados(f.season, f.day, f.year);

// ------------------------------------------------------------------ la partida

const has = (xs: readonly string[], m: string): boolean => xs.includes(m);

/** El anfitrión (`Game1.MasterPlayer`): el primero con `host`, o el primero. */
const hostOf = (s: SavePredict): PredictFarmer => s.farmers.find((f) => f.host) ?? s.farmers[0];

/** `Farmer.hasCompletedCommunityCenter` del anfitrión y sin `JojaMember` (`IS_COMMUNITY_CENTER_COMPLETE`). */
function ccComplete(host: PredictFarmer): boolean {
  const r = host.mailReceived;
  return ["ccBoilerRoom", "ccCraftsRoom", "ccPantry", "ccFishTank", "ccVault", "ccBulletin"].every((m) => has(r, m)) && !has(r, "JojaMember");
}

/** `Utility.hasFinishedJojaRoute`: cada cuarto por Joja o por el Centro, y al menos uno de Joja (o `JojaMember`). */
function jojaComplete(host: PredictFarmer): boolean {
  const r = host.mailReceived;
  let joja = false;
  for (const [j, c] of [["jojaVault", "ccVault"], ["jojaPantry", "ccPantry"], ["jojaBoilerRoom", "ccBoilerRoom"], ["jojaCraftsRoom", "ccCraftsRoom"], ["jojaFishTank", "ccFishTank"]]) {
    if (has(r, j)) joja = true;
    else if (!has(r, c)) return false;
  }
  return joja || has(r, "JojaMember");
}

/**
 * `Game1.canHaveWeddingOnDay`: ni festival ni lluvia verde. La boda de un compromiso es el primer día desde su
 * `WeddingDate` que la admite (`queueWeddingsForToday`: `CountdownToWedding < 1`); la de hoy ya pasó al guardar.
 */
export function weddingDaysPlayed(weddings: readonly SaveDate[], today: Hoy, seed: Seed, data: PredictData): number[] {
  const claves = ["spring", "summer", "fall", "winter"] as const;
  const out = new Set<number>();
  for (const w of weddings) {
    let d: Fecha = total(w) > total(today) ? w : addDays(today, 1);
    for (let i = 0; i < 112; i++) {
      const fiesta = data.festivals.days[claves[d.season]].includes(d.day);
      if (!fiesta && !isGreenRainDay(seed, d.year, d.season, d.day)) break;
      d = addDays(d, 1);
    }
    out.add(today.daysPlayed + (total(d) - total(today)));
  }
  return [...out].sort((a, b) => a - b);
}

/** Lo que las predicciones leen de la partida, por granjero. Cada campo dice qué mira el juego. */
export interface SaveFlags {
  ccComplete: boolean;
  jojaComplete: boolean;
  /** `Game1.isLocationAccessible("Desert")`: el anfitrión recibió `ccVault` (también por la ruta de Joja). */
  desertOpen: boolean;
  /** `MineShaft.loadLevel`: `ccCraftsRoom` recibido y no para mañana, y `VisitedQuarryMine` (los dos del anfitrión). */
  quarry: boolean;
  /** `pickFarmEvent`: `Got_Capsule` y `raccoonTreeFallen` del anfitrión. */
  gotCapsule: boolean;
  raccoonTreeFallen: boolean;
  /** `pickFarmEvent`: `ccPantry` y `sawQiPlane` del granjero (`Game1.player`). */
  ccPantry: boolean;
  sawQiPlane: boolean;
  /** `pickFarmEvent`: algún granjero conectado recibió `gotFirstBillboardPrizeTicket` (se suponen todos conectados). */
  billboardTicket: boolean;
}

export function saveFlags(s: SavePredict, farmer: number): SaveFlags {
  const host = hostOf(s);
  const me = s.farmers[farmer] ?? host;
  return {
    ccComplete: ccComplete(host),
    jojaComplete: jojaComplete(host),
    desertOpen: has(host.mailReceived, "ccVault"),
    quarry: has(host.mailReceived, "ccCraftsRoom") && !has(host.mailTomorrow, "ccCraftsRoom") && has(host.mail, "VisitedQuarryMine"),
    gotCapsule: has(host.mailReceived, "Got_Capsule"),
    raccoonTreeFallen: has(host.mailReceived, "raccoonTreeFallen"),
    ccPantry: has(me.mailReceived, "ccPantry"),
    sawQiPlane: has(me.mailReceived, "sawQiPlane"),
    billboardTicket: s.farmers.some((f) => has(f.mailReceived, "gotFirstBillboardPrizeTicket")),
  };
}

// ------------------------------------------------------------------ la suerte

/** `0.025f` de `Farmer.DailyLuck`, como lo suma el juego (un `float` pasado a `double`). */
const AMULETO = Math.fround(0.025);
const TOPE = Math.fround(0.2);

/** `Farmer.DailyLuck`: la suerte compartida más el amuleto especial, entre -0,2 y 0,2. */
export const dailyLuck = (shared: number, charm: boolean): number => Math.min(Math.max(shared + (charm ? AMULETO : 0), -TOPE), TOPE);

/**
 * `TV.getFortuneForecast`: las claves de `StringsFromCSFiles` (`TV.cs.<clave>`) de la frase de la tele. Entre -0,07 y
 * -0,02 el juego elige una de dos con `Game1.random`: salen las dos.
 */
export function fortuneKeys(shared: number, luck: number): string[] {
  if (luck === 0) return ["13201"];
  if (shared === -0.12) return ["13191"];
  if (luck < -0.07) return ["13192"];
  if (luck < -0.02) return ["13193", "13195"];
  if (shared === 0.12) return ["13197"];
  if (luck > 0.07) return ["13198"];
  if (luck > 0.02) return ["13199"];
  return ["13200"];
}

// ------------------------------------------------------------------ las predicciones

/** Sin partida, lo que la semilla no dice y elige el usuario. Sin dar: partida nueva. */
export interface ManualOpts {
  /** Ya llegó al piso 120 de las Minas (aparecen los pisos de hongos). */
  lowest120?: boolean;
  /** La cantera de las Minas está abierta (el puente de la cantera arreglado y ya entró). */
  quarry?: boolean;
  sawQiPlane?: boolean;
  gotCapsule?: boolean;
  ccPantry?: boolean;
  raccoonTreeFallen?: boolean;
}

export interface PredictOpts {
  /** Aceite de ajo tomado hoy. */
  garlicOil?: boolean;
  /** Rosa de hadas madura en la granja: sí, no, o sin dar (no sé: las noches que cambian salen con las dos ramas). */
  fairyRose?: boolean;
  manual?: ManualOpts;
}

/** Las recetas que vende el carro, por id: `ShopMenu` esconde la que el granjero ya sabe (por su nombre). */
const RECETAS_DEL_CARRO: Record<string, string> = { "(O)801": "Wedding Ring" };

export interface CartVisit {
  date: Fecha;
  kind: CartKind;
  items: CartItem[];
  /** El año 1 sin partida: el día de las semillas de col morada garantizadas cambiaría la lista. */
  y1Unknown: boolean;
}

export interface Prediction {
  today: Hoy;
  seed: Seed;
  /** Con partida: el clima de mañana, exacto. */
  tomorrow: DayWeather | null;
  /** Con partida: la suerte de hoy del granjero y las claves de la frase de la tele. */
  luck: { value: number; keys: string[] } | null;
  /** El clima de cada día desde mañana hasta el 28. */
  season: { date: Fecha; weather: DayWeather }[];
  mines: (MineDay & { date: Fecha })[];
  cart: CartVisit[];
  /** De las próximas 14 noches, las que tienen evento; `date` es el día al que lleva la noche. */
  nights: { date: Fecha; pick: Exclude<NightPick, null> }[];
  /** Lo que se usó, para decirlo en pantalla. */
  used: { lowestMineLevel: number; quarry: boolean; desertOpen: boolean; multiplayer: boolean; weddings: number };
}

const NOCHES = 14;
const DIAS_DE_MINAS = 7;
const VISITAS = 4;

/** La fecha de hoy y su `DaysPlayed`: el de la partida (cuenta los días como el juego) o el del calendario. */
function hoyDe(input: PredictInput): Hoy {
  const cal = diasJugados(input.season, input.day, input.year);
  const dp = input.from === "save" && input.save.daysPlayed > 0 ? input.save.daysPlayed : cal;
  return { season: input.season, day: input.day, year: input.year, daysPlayed: dp };
}

/** Todo lo que se predice, menos las geodas (`geodesFor`, de a un tipo). */
export function predictAll(input: PredictInput, data: PredictData, opts: PredictOpts = {}): Prediction {
  const today = hoyDe(input);
  const seed: Seed = input.from === "save" ? { gameId: input.save.gameId, legacy: input.save.legacy } : input.seed;
  const dpDe = (f: Fecha) => today.daysPlayed + (total(f) - total(today));
  const man = opts.manual ?? {};
  const save = input.from === "save" ? input.save : null;
  const flags: SaveFlags = save
    ? saveFlags(save, input.from === "save" ? input.farmer : 0)
    : {
        ccComplete: false,
        jojaComplete: false,
        // Sin partida se muestra el Festival del desierto, con el aviso de que hace falta el desierto abierto.
        desertOpen: true,
        quarry: man.quarry ?? false,
        gotCapsule: man.gotCapsule ?? false,
        raccoonTreeFallen: man.raccoonTreeFallen ?? false,
        ccPantry: man.ccPantry ?? false,
        sawQiPlane: man.sawQiPlane ?? false,
        billboardTicket: false,
      };
  const me = save && input.from === "save" ? (save.farmers[input.farmer] ?? hostOf(save)) : null;
  // Las noches de boda no traen evento, también la mudanza de un compañero de cuarto (`pickFarmEvent` mira
  // `IsMarried() && WeddingDate == Date`, que Krobus cumple). El clima "Wedding" no: `_newDayAfterFade` pone
  // `weddingToday` sólo si el granjero no tiene compañero de cuarto (`hasCurrentOrPendingRoommate`).
  const bodas = save ? weddingDaysPlayed(save.weddings, today, seed, data) : [];
  const bodasClima = save ? weddingDaysPlayed(save.weddings.filter((w) => !w.roommate), today, seed, data) : [];
  const manana = addDays(today, 1);

  // Clima: el de mañana de la partida (exacto) y el resto de la estación de la semilla.
  const tomorrow = save ? weatherTomorrow(save.weatherTomorrow, seed, today, data, { wedding: bodasClima.includes(today.daysPlayed + 1) }) : null;
  const season = seasonWeather(seed, today, data).map((weather, i) => {
    const date = addDays(today, i + 1);
    if (i === 0 && tomorrow) return { date, weather: tomorrow };
    return { date, weather: bodasClima.includes(dpDe(date)) ? ({ kind: "wedding" } as DayWeather) : weather };
  });

  const luck = save && me ? (() => {
    const value = dailyLuck(save.dailyLuck, me.specialCharm);
    return { value, keys: fortuneKeys(save.dailyLuck, value) };
  })() : null;

  const lowestMineLevel = save ? save.lowestMineLevel : man.lowest120 ? 120 : 0;
  const mines = predictMines(seed, today.daysPlayed, DIAS_DE_MINAS, { lowestMineLevel, quarry: flags.quarry, garlicOil: opts.garlicOil ?? false }).map(
    (d, k) => ({ ...d, date: addDays(today, k) }),
  );

  const multiplayer = save ? save.multiplayer : false;
  const dias = cartDays(today, VISITAS, { desertOpen: flags.desertOpen });
  const garantia = guaranteeByVisit(save ? save.visitsUntilY1Guarantee : -1, today, dias);
  const cart = dias.map((d, i): CartVisit => {
    const st: CartState = {
      seed,
      daysPlayed: dpDe(d),
      season: d.season,
      day: d.day,
      year: d.year,
      multiplayer,
      ccComplete: flags.ccComplete,
      jojaComplete: flags.jojaComplete,
      hearts14: me ? me.spouse14 : [],
      visitsUntilY1Guarantee: garantia[i],
    };
    const items = predictCart(st, data).filter((x) => !(x.recipe && me && RECETAS_DEL_CARRO[x.id] && me.recipes.includes(RECETAS_DEL_CARRO[x.id])));
    return { date: { season: d.season, day: d.day, year: d.year }, kind: d.kind, items, y1Unknown: !save && d.year === 1 };
  });

  const picks = predictNights(seed, today.daysPlayed + 1, NOCHES, {
    year: manana.year,
    season: manana.season,
    day: manana.day,
    gotCapsule: flags.gotCapsule,
    ccPantry: flags.ccPantry,
    raccoonTreeFallen: flags.raccoonTreeFallen,
    sawQiPlane: flags.sawQiPlane,
    billboardTicket: flags.billboardTicket,
    weddingDaysPlayed: bodas,
    fairyRose: opts.fairyRose,
  });
  const nights = picks.flatMap((pick, i) => (pick === null ? [] : [{ date: addDays(manana, i), pick }]));

  return {
    today,
    seed,
    tomorrow,
    luck,
    season,
    mines,
    cart,
    nights,
    used: { lowestMineLevel, quarry: flags.quarry, desertOpen: flags.desertOpen, multiplayer, weddings: bodas.length },
  };
}

/** Lo que se abre en el yunque, en el orden de la pantalla. */
export const GEODE_KINDS: GeodeKind[] = ["535", "536", "537", "749", "275", "791", "MysteryBox", "GoldenMysteryBox"];

/**
 * ¿Se sabe el id del granjero? Una partida de antes de la 1.3 no trae `UniqueMultiplayerID`, y al cargarla el juego le
 * da uno al azar (`new NetLong(Utility.RandomLong())` en `Farmer`): hasta que se guarde en la 1.6 no hay geodas.
 */
export const knowsFarmerId = (input: PredictInput): boolean =>
  input.from === "save" && (input.save.farmers[input.farmer] ?? hostOf(input.save)).uid !== "0";

/** Las próximas `count` aperturas de `kind` del granjero elegido. Sin partida o sin su id, null. */
export function geodesFor(input: PredictInput, data: PredictData, kind: GeodeKind, count = 20): Drop[] | null {
  if (input.from !== "save" || !knowsFarmerId(input)) return null;
  const s = input.save;
  const f = s.farmers[input.farmer] ?? hostOf(s);
  const st: GeodeState = {
    seed: { gameId: s.gameId, legacy: s.legacy },
    uidHalf: f.uidHalf,
    geodesCracked: f.geodesCracked,
    mysteryBoxesOpened: f.mysteryBoxesOpened,
    deepestMineLevel: f.deepestMineLevel,
    fishingLevel: f.fishingLevel,
    season: input.season,
    day: input.day,
    mail: f.mail,
    mastery0: f.mastery0,
    bookMystery: f.bookMystery,
    qiBeans: s.qiBeans,
    goldenCoconutCracked: s.goldenCoconutCracked,
  };
  return predictGeodes(kind, st, data, count);
}
