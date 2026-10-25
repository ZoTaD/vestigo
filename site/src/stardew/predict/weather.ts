// Clima del predictor de Stardew Valley 1.6.15: el de mañana (de la partida) y la lluvia o nieve del
// resto de la estación (de la semilla). Se valida contra el juego real con el comando `weather` del
// oráculo (`test/fixtures/stardew-predict/weather.json`).
//
// Cómo lo decide el juego, cada mañana D (`Game1._newDayAfterFade`, ya con la fecha nueva):
// 1. `Game1.UpdateWeatherForNewDay` toma lo que quedó guardado ayer como clima de hoy y le aplica
//    `getWeatherModificationsForDate` (primeros días, lluvia verde, tormentas fijas, festivales).
// 2. `LocationWeather.UpdateDailyWeather` decide lo que se guarda para D+1: festival, festival pasivo
//    del valle o la primera `WeatherConditions` de `Data/LocationContexts` "Default" que se cumple. Las
//    condiciones se evalúan con la fecha de HOY (D); sólo `IS_GREEN_RAIN_DAY` y los festivales miran D+1.
//    Eso es lo que la partida guarda como `weatherForTomorrow`.
//
// Lo que no se puede saber: las condiciones con `RANDOM` usan `Game1.random`, sembrado con los pasos
// del día (`stats.StepsTaken`). Por eso la tormenta (contra la lluvia) y el viento (contra el sol) sólo
// se dicen como posibles (`maybe`). Que llueva o no sí es exacto (`SYNCED_RANDOM` y
// `SYNCED_SUMMER_RAIN_RANDOM` dependen de la semilla y el día). Un tótem de lluvia usado hoy cambia el
// clima de mañana y no está en la partida guardada.
import { createRandom, daySaveRandom, DotNetRandom, syncedRandom, type Seed } from "./rng";
import { checkConditions, chooseFrom, type PredictData, type QueryContext } from "./query";

export type Wet = "rain" | "storm" | "snow" | "greenRain";

/**
 * El clima de un día. `maybe`: puede salir eso en vez de `kind`, según `RANDOM` (lluvia que puede ser
 * tormenta, sol que puede tener viento y, el 2 de verano, tormenta que puede ser sol: ahí la tormenta es lo probable,
 * ~85 %, y va primero).
 */
export interface DayWeather {
  kind: "sun" | "rain" | "storm" | "snow" | "greenRain" | "festival" | "wind" | "wedding";
  maybe?: "storm" | "wind" | "sun";
}

/** Un día del calendario y su `Game1.stats.DaysPlayed`. `season` 0 primavera ... 3 invierno. */
export interface Hoy {
  season: 0 | 1 | 2 | 3;
  day: number;
  year: number;
  daysPlayed: number;
}

const ESTACIONES = ["spring", "summer", "fall", "winter"] as const;

const TIPO: Record<string, DayWeather["kind"]> = {
  Sun: "sun", Rain: "rain", Storm: "storm", Snow: "snow", Wind: "wind", GreenRain: "greenRain",
  Festival: "festival", Wedding: "wedding",
};

function tipo(clima: string): DayWeather["kind"] {
  const k = TIPO[clima];
  if (!k) throw new Error(`clima desconocido: ${clima}`);
  return k;
}

/** El día siguiente (`WorldDate.TotalDays++`). */
function manana(h: Hoy): Hoy {
  if (h.day < 28) return { ...h, day: h.day + 1, daysPlayed: h.daysPlayed + 1 };
  const season = ((h.season + 1) % 4) as Hoy["season"];
  return { season, day: 1, year: season === 0 ? h.year + 1 : h.year, daysPlayed: h.daysPlayed + 1 };
}

/** `Utility.isGreenRainDay(day, season)` con `Game1.year = year`: un día de verano por año. */
export function isGreenRainDay(seed: Seed, year: number, season: number, day: number): boolean {
  if (season !== 1) return false;
  const r = createRandom(seed.legacy, year * 777, seed.gameId);
  return day === chooseFrom(r, [5, 6, 7, 14, 15, 16, 18, 23]);
}

/**
 * `Utility.isFestivalDay(day, season, "Default")`: un festival de `Data/Festivals/FestivalDates`. Los
 * ocho son en ubicaciones del valle (pueblo, bosque, playa, montaña), así que el contexto no los
 * filtra; el oráculo lo confirma con los mapas reales.
 */
function esFestival(data: PredictData, h: Hoy): boolean {
  return data.festivals.days[ESTACIONES[h.season]].includes(h.day);
}

/** El estado que leen las consultas del clima un día dado. */
function contexto(seed: Seed, h: Hoy, random?: DotNetRandom): QueryContext {
  const sig = manana(h);
  return {
    stat: (n) => {
      throw new Error(`el clima no conoce la estadística ${n}`);
    },
    hasMail: (m) => {
      throw new Error(`el clima no conoce el correo ${m}`);
    },
    season: h.season,
    year: h.year,
    dayOfMonth: h.day,
    daysPlayed: h.daysPlayed,
    random,
    synced: (intervalo, clave) => {
      if (intervalo !== "day" && intervalo !== "season" && intervalo !== "year") {
        throw new Error(`SYNCED_RANDOM con intervalo ${intervalo} sin soporte`);
      }
      return syncedRandom(seed, intervalo, clave, h.daysPlayed, ESTACIONES[h.season], h.year);
    },
    daySave: (a) => daySaveRandom(seed, h.daysPlayed, a),
    greenRainTomorrow: isGreenRainDay(seed, h.year, sig.season, sig.day),
  };
}

/**
 * Hay un festival pasivo del valle el día `h` (`Utility.TryGetPassiveFestivalDataForDay` con el
 * contexto "Default" y el bucle de `getWeatherModificationsForDate`): en sus fechas, con su condición
 * (evaluada con el estado `ctx`) y con alguna ubicación reemplazada del valle (`inValley`). La
 * condición sólo se mira en los del valle, que son los únicos que cambian el clima (el Festival del
 * desierto tiene `LOCATION_ACCESSIBLE Desert`, que el predictor no evalúa).
 */
function festivalPasivoDelValle(data: PredictData, h: Hoy, ctx: QueryContext): boolean {
  return data.festivals.passive.some(
    (p) =>
      p.inValley && p.season === h.season && h.day >= p.startDay && h.day <= p.endDay && checkConditions(p.condition, ctx),
  );
}

/**
 * `Game1.getWeatherModificationsForDate(date, guardado)` como lo llama `UpdateWeatherForNewDay`: con la
 * fecha `t` ya puesta en `Game1` (así que `date - Date` es 0 y `DaysPlayed` es el de `t`).
 */
function modificaciones(guardado: string, seed: Seed, t: Hoy, data: PredictData): string {
  let r = guardado;
  if (t.day === 1 || t.daysPlayed <= 4) r = "Sun";
  if (t.daysPlayed === 3) r = "Rain";
  if (isGreenRainDay(seed, t.year, t.season, t.day)) r = "GreenRain";
  if (t.season === 1 && t.day % 13 === 0) r = "Storm";
  if (esFestival(data, t)) r = "Festival";
  if (festivalPasivoDelValle(data, t, contexto(seed, t))) r = "Sun";
  return r;
}

/**
 * Un `Random` que no se conoce: cada `NextDouble` sale de `guion` (verdadero = 0, que cumple cualquier
 * `RANDOM`; falso o fuera del guion = casi 1, que no cumple ninguno). Cuenta cuántos se pidieron.
 */
class AzarDesconocido extends DotNetRandom {
  usados = 0;
  private readonly guion: readonly boolean[];
  constructor(guion: readonly boolean[]) {
    super(0);
    this.guion = guion;
  }
  nextDouble(): number {
    return this.guion[this.usados++] ? 0 : 0.99999999;
  }
  next(..._: number[]): number {
    throw new Error("el clima sólo pide NextDouble a Game1.random");
  }
}

/**
 * `LocationWeather.UpdateDailyWeather("Default", ...)` la mañana del día `h`: lo que puede quedar
 * guardado como clima de mañana (`WeatherForTomorrow`, sin las modificaciones). Más de un valor =
 * depende de `RANDOM`: se recorren todas las respuestas posibles de `Game1.random`.
 */
export function updateDailyWeather(seed: Seed, h: Hoy, data: PredictData): Set<string> {
  const t = manana(h);
  if (esFestival(data, t)) return new Set(["Festival"]);
  // Con la fecha de mañana distinta de hoy, mira los datos de los festivales pasivos (no los activos).
  if (festivalPasivoDelValle(data, t, contexto(seed, h))) return new Set(["Sun"]);
  const out = new Set<string>();
  const explorar = (guion: boolean[]): void => {
    const r = new AzarDesconocido(guion);
    const ctx = contexto(seed, h, r);
    const c = data.weather.find((w) => checkConditions(w.condition, ctx));
    out.add(c?.weather ?? "Sun");
    // Cada tirada que se pidió fuera del guion (y dio "no"): probar también el "sí".
    for (let j = guion.length; j < r.usados; j++) explorar([...guion, ...Array<boolean>(j - guion.length).fill(false), true]);
  };
  explorar([]);
  return out;
}

/** Junta los climas posibles de un día en uno (ver `DayWeather`). */
function juntar(climas: Set<string>): DayWeather {
  if (climas.size === 1) return { kind: tipo([...climas][0]) };
  const clave = [...climas].sort().join("+");
  if (clave === "Rain+Storm") return { kind: "rain", maybe: "storm" };
  if (clave === "Storm+Sun") return { kind: "storm", maybe: "sun" };
  if (clave === "Sun+Wind") return { kind: "sun", maybe: "wind" };
  throw new Error(`climas posibles sin forma de mostrarse: ${clave}`);
}

/**
 * El clima de mañana con lo que guardó la partida (`weatherForTomorrow`): las modificaciones de
 * `Game1.UpdateWeatherForNewDay` y, si mañana hay boda (`Game1.weddingToday`), "Wedding". Es exacto.
 */
export function weatherTomorrow(
  saved: string,
  seed: Seed,
  today: Hoy,
  data: PredictData,
  opts: { wedding?: boolean } = {},
): DayWeather {
  if (opts.wedding) return { kind: "wedding" };
  return { kind: tipo(modificaciones(saved, seed, manana(today), data)) };
}

/**
 * El clima de cada día desde mañana hasta el 28 de esta estación, sólo con la semilla: lo que decide
 * cada mañana (`updateDailyWeather`) con las modificaciones de la mañana siguiente. Con la partida, el
 * de mañana es mejor sacarlo de `weatherTomorrow` (no tiene `maybe`).
 */
export function seasonWeather(seed: Seed, today: Hoy, data: PredictData): DayWeather[] {
  const out: DayWeather[] = [];
  for (let d = today.day; d < 28; d++) {
    const h: Hoy = { ...today, day: d, daysPlayed: today.daysPlayed + (d - today.day) };
    const t = manana(h);
    out.push(juntar(new Set([...updateDailyWeather(seed, h, data)].map((g) => modificaciones(g, seed, t, data)))));
  }
  return out;
}
