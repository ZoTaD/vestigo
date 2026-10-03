/**
 * La cuenta de los cortes de agua y luz de Project Zomboid (2026-10-02), pura: la usan la calculadora
 * (`/servidor/cortes-de-agua-y-luz`, `Shutoff.tsx`) y la línea "se corta el …" del generador. Todos los números salen de
 * `server.json` (`SERVER.rules`, `startHours`, `dayLengthMinutes` y `shutoff`), que escribe `server.py` leyendo el
 * bytecode del juego (y que corta si un parche cambia la cuenta: `world_age_guard`).
 *
 * Lo que hace el juego (42.21):
 * - la edad del mundo, en horas, es `nightsSurvived × 24 + (hora ≥ 7 ? hora − 7 : hora + 17)`, y `nightsSurvived` sube
 *   cuando el reloj pasa de una hora <= 7:00 a una > 7:00 (`GameTime.update`: `prev <= 7 && now > 7`): se cuenta
 *   desde las 7:00 del día de arranque, o del anterior si la partida arranca a las 7:00 o antes. Una que arranca justo
 *   a las 7:00 suma una noche en el primer tick: su edad salta de 0 a 24 horas apenas empieza;
 * - en días: `horas / 24 + (TimeSinceApo − 1) × 30`;
 * - no hay agua de la red cuando esa edad es `>= WaterShutModifier` (`IsoObject.isWaterInfinite`), y no hay luz cuando
 *   es `> ElecShutModifier` (`SandboxOptions.doesPowerGridExist`): justo en el borde, el agua ya se cortó y la luz no;
 * - el calendario es el gregoriano **con el año elegido** (`SandboxOptions.applySettings` pone `getFirstYear() +
 *   StartYear − 1`, y `GameTime.daysInMonth` mira `PZCalendar.isLeapYear` de ese año). Por eso acá va `Date.UTC` con
 *   ese año: el 1993 fijo de `syncStartDay` es sólo de la lista de días del menú.
 *
 * Se llama `shutoffCalc.ts` y no `shutoff.ts` (como decía el plan): en Windows los nombres no distinguen mayúsculas, y
 * `import "./Shutoff"` encontraba este archivo antes que `Shutoff.tsx`.
 *
 * Las fechas son `Date` en UTC: la hora del juego, sin zona horaria. Se muestran con `timeZone: "UTC"`.
 */
import { SERVER, type Value } from "./data";

const H = 3_600_000;

export type Cut =
  | { kind: "never" }
  /** Ya no hay al empezar la partida. */
  | { kind: "start" }
  /** `date` en UTC (la hora del juego); `afterStartHours`, cuántas horas del juego después de empezar. */
  | { kind: "at"; date: Date; afterStartHours: number };

/** Lo que importa para los cortes, con los valores de las opciones tal cual (`month` 1–12; los enum, desde 1). */
export interface World {
  year: number;
  month: number;
  day: number;
  /** `StartTime`, 1–9. */
  startTime: number;
  /** `TimeSinceApo`, 1–13: 1 es "0 meses". */
  timeSinceApo: number;
  /** `DayLength`, 1–27. */
  dayLength: number;
}

/** Las opciones de sandbox que mueven los cortes: las que pide la calculadora. */
export const SHUTOFF_KEYS = [
  "StartMonth",
  "StartDay",
  "StartYear",
  "StartTime",
  "TimeSinceApo",
  "DayLength",
  "WaterShut",
  "ElecShut",
  "WaterShutModifier",
  "ElecShutModifier",
] as const;

const int = (v: Value | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** El mundo de una configuración de sandbox (las 269): el año de verdad sale de `StartYear` (1 = 1993). */
export const worldOf = (sandbox: Record<string, Value>): World => ({
  year: SERVER.rules.firstYear + int(sandbox.StartYear, 1) - 1,
  month: int(sandbox.StartMonth, 7),
  day: int(sandbox.StartDay, 9),
  startTime: int(sandbox.StartTime, 2),
  timeSinceApo: int(sandbox.TimeSinceApo, 1),
  dayLength: int(sandbox.DayLength, 4),
});

/** La hora de arranque (0–23) de `StartTime`. */
export const startHour = (w: World): number => SERVER.startHours[w.startTime - 1] ?? SERVER.startHours[0];

/** El momento en que arranca la partida (UTC, la hora del juego). */
export const startDate = (w: World): Date => new Date(Date.UTC(w.year, w.month - 1, w.day, startHour(w)));

/**
 * El corte con el modificador `m` (días), como lo cuenta el juego: no hay agua cuando la edad del mundo es `>= m`, no hay
 * luz cuando es `> m`. Con `m` = 2147483647 ("Deshabilitado"), nunca.
 */
export function cutAt(w: World, m: number, what: "water" | "power"): Cut {
  if (m >= SERVER.shutoff.never) return { kind: "never" };
  const hour = startHour(w);
  const start = Date.UTC(w.year, w.month - 1, w.day, hour);
  // La edad del mundo se cuenta desde las 7:00; si la partida arranca a las 7:00 o antes, desde las 7:00 del día
  // anterior. Con `<=` y no `<`: el juego suma la noche cuando la hora previa al tick es <= 7 y la nueva > 7, así que una
  // partida que arranca justo a las 7:00 la suma en su primer tick (el corte de 14 días cae el 22/7, no el 23/7).
  const ref = Date.UTC(w.year, w.month - 1, w.day - (hour <= SERVER.rules.dayStartHour ? 1 : 0), SERVER.rules.dayStartHour);
  const ageAtStart = (start - ref) / H;
  // En horas de edad del mundo: cada mes desde el apocalipsis (`TimeSinceApo` − 1) ya cuenta 30 días.
  const cutAge = 24 * (m - (w.timeSinceApo - 1) * SERVER.rules.monthDays);
  // Agua: corta con edad >= m. Luz: con edad > m. Al empezar sólo importa si ya pasó (o si es justo ahí, para el agua).
  if (what === "water" ? cutAge <= ageAtStart : cutAge < ageAtStart) return { kind: "start" };
  return { kind: "at", date: new Date(ref + cutAge * H), afterStartHours: cutAge - ageAtStart };
}

/**
 * Lo que puede tocar en una partida de un jugador: al crearla, el juego sortea el modificador entre `[a, b]` según la
 * opción de `WaterShut` / `ElecShut` (1–9). `server.json` ya trae el rango real: `Rand.Next(a, b)` da de a a b − 1, así
 * que "0-30 días" es [0, 29].
 */
export function cutRange(w: World, option: number, what: "water" | "power"): { from: Cut; to: Cut } {
  const table = what === "water" ? SERVER.shutoff.water : SERVER.shutoff.elec;
  const [a, b] = table[option - 1] ?? table[0];
  return { from: cutAt(w, a, what), to: cutAt(w, b, what) };
}

/** Minutos reales que duran `hours` horas del juego con la duración del día de `w`. */
export const realTime = (w: World, hours: number): number =>
  (hours / 24) * (SERVER.dayLengthMinutes[w.dayLength - 1] ?? SERVER.dayLengthMinutes[3]);

/** Los minutos reales de un día del juego. */
export const dayMinutes = (w: World): number => realTime(w, 24);
