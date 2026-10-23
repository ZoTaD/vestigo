/**
 * El Calendario de Stardew Valley (etapa 2, tarea 7): la forma de `calendar.json` (more_data.py), la estación y el día
 * que se eligen en la pestaña, cómo viajan en la dirección (`?season=fall&day=13`) y las 28 celdas del tablón.
 *
 * `calendar.json` trae, por estación, sólo los días con algo: los cumpleaños (claves de aldeano) y los festivales, con
 * su rango (`from`–`to`) repetido en cada día del rango y si es pasivo (el Mercado nocturno: el día sigue como siempre).
 */

type Pair = [en: string, es: string];

export interface Festival {
  id: string;
  name: Pair;
  from: number;
  to: number;
  /** Pasivo: se juega el día como siempre y se va cuando uno quiere (Mercado nocturno, Festival del desierto). */
  passive: boolean;
}

export interface CalendarDay {
  birthdays: string[];
  festivals: Festival[];
}

export interface CalendarData {
  seasons: { days: Record<string, CalendarDay> }[];
}

/** Las estaciones como van en la dirección, en el orden del juego. */
export const SEASON_KEYS = ["spring", "summer", "fall", "winter"] as const;
export type SeasonKey = (typeof SEASON_KEYS)[number];
/** Los días de cada estación: 4 semanas de 7, como el tablón del pueblo. */
export const SEASON_DAYS = 28;

export interface CalendarState {
  /** 0 primavera a 3 invierno. */
  season: number;
  /** El día elegido, o `null` si no se eligió ninguno. */
  day: number | null;
}

/** Se abre en primavera, sin día elegido. */
export const DEFAULT_CALENDAR_STATE: CalendarState = { season: 0, day: null };

/** El estado escrito en la dirección; una estación que no existe queda en primavera y un día fuera del 1 al 28, sin día. */
export function readCalendarState(search: string): CalendarState {
  const p = new URLSearchParams(search);
  const season = SEASON_KEYS.indexOf(p.get("season") as SeasonKey);
  const raw = p.get("day") ?? "";
  const day = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  return {
    season: season < 0 ? DEFAULT_CALENDAR_STATE.season : season,
    day: day >= 1 && day <= SEASON_DAYS ? day : null,
  };
}

/** Lo contrario: el `?…` del estado, sólo con lo que no es el valor por defecto (vacío si no cambió nada). */
export function writeCalendarState(s: CalendarState): string {
  const p = new URLSearchParams();
  if (s.season !== DEFAULT_CALENDAR_STATE.season) p.set("season", SEASON_KEYS[s.season]);
  if (s.day != null) p.set("day", String(s.day));
  const out = p.toString();
  return out ? `?${out}` : "";
}

/** Una celda del tablón: el día y lo que pasa, con dónde cae un festival dentro de su rango. */
export interface Cell {
  day: number;
  birthdays: string[];
  festivals: (Festival & {
    /** Sigue al día siguiente y en la misma semana: el tinte cruza el hueco hasta la celda de al lado. */
    joinsNext: boolean;
    /** Viene del día anterior en la misma semana: la celda pega con la de la izquierda. */
    joinsPrev: boolean;
  })[];
}

const EMPTY: CalendarDay = { birthdays: [], festivals: [] };

/** Las 28 celdas de una estación, del 1 al 28. */
export function seasonCells(data: CalendarData, season: number): Cell[] {
  const days = data.seasons[season]?.days ?? {};
  return Array.from({ length: SEASON_DAYS }, (_, i) => {
    const day = i + 1;
    const d = days[String(day)] ?? EMPTY;
    return {
      day,
      birthdays: d.birthdays,
      festivals: d.festivals.map((f) => ({ ...f, joinsNext: f.to > day && day % 7 !== 0, joinsPrev: f.from < day && day % 7 !== 1 })),
    };
  });
}

/** El rango de un festival como se escribe en el tablón y en la portada: "15–17", o el día solo. */
export const festivalRange = (from: number, to: number): string => (to > from ? `${from}–${to}` : String(from));
