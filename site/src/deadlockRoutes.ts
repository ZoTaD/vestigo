import { MAP, campHealthAt, campSoulsAt, isUpAt, type MapKindId } from "./deadlockMapData";

/**
 * Las rutas de farmeo sobre el mapa: qué paradas hay, cuánto se tarda entre una
 * y otra con cada héroe, y qué ruta conviene.
 *
 * **Los tiempos son una estimación, no un cronómetro**, y la página lo dice:
 *
 * - *Caminar* es la distancia en línea recta por `PATH_FACTOR` (paredes,
 *   escaleras y rodeos), a la velocidad de carrera del héroe. No se lee la malla
 *   de navegación del juego ni se cuentan tirolesas.
 * - *Limpiar* es la vida de la parada dividida por un daño por segundo. De
 *   entrada es el del arma base del héroe, recarga incluida; el jugador puede
 *   poner el suyo, que es como se vuelve real a mitad de partida.
 *
 * Sirve para comparar rutas y héroes entre sí con la misma vara.
 */

/** Unidades del mundo por metro (una unidad de Source es una pulgada). */
const UNITS_PER_METER = 39.37;
/** Cuánto más largo es el camino real que la línea recta. */
export const PATH_FACTOR = 1.35;
/** Segundos que se pierden en cada parada: llegar, apuntar, juntar las almas. */
export const STOP_OVERHEAD_S = 1.5;
/** Cuántas paradas tiene una ruta sugerida. */
export const SUGGESTED_STOPS = 6;

/** Los tipos que pueden ser parada de una ruta, con la letra que los nombra en la dirección. */
export const STOP_PREFIX: Partial<Record<MapKindId, string>> = { crate: "k", statue: "s", health: "h", buff: "b" };

export interface Stop {
  /** `c12` es el campamento 12; `k45`, la caja 45. Es lo que viaja en la dirección. */
  id: string;
  kind: MapKindId;
  x: number;
  y: number;
  /** El grupo de reaparición, en los rompibles. */
  group: number;
  camp?: number;
}

export interface RouteHero {
  /** Metros por segundo corriendo (velocidad más carrera). */
  speed: number;
  /** Daño por segundo con el que limpia. */
  dps: number;
}

/** Todas las paradas posibles, en un orden estable. */
export function allStops(): Stop[] {
  const out: Stop[] = MAP.camps.map((c, i) => ({ id: `c${i}`, kind: c.kind, x: c.x, y: c.y, group: 0, camp: i }));
  for (const [kind, prefix] of Object.entries(STOP_PREFIX) as [MapKindId, string][]) {
    (MAP.points[kind] ?? []).forEach(([x, y, group], i) => out.push({ id: `${prefix}${i}`, kind, x, y, group: group ?? 0 }));
  }
  return out;
}

const STOPS = new Map(allStops().map((s) => [s.id, s]));
export const stopById = (id: string): Stop | undefined => STOPS.get(id);

/** `c3.k12.c7` → las paradas, sin las que ya no existan. */
export const parseRoute = (text: string): Stop[] =>
  text
    .split(".")
    .map((id) => STOPS.get(id))
    .filter((s): s is Stop => s !== undefined);

export const formatRoute = (stops: Stop[]): string => stops.map((s) => s.id).join(".");

/** Los metros entre dos puntos del mapa, por el camino estimado. */
export function distanceM(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const units = Math.hypot(a.x - b.x, a.y - b.y) * 2 * MAP.bound;
  return (units / UNITS_PER_METER) * PATH_FACTOR;
}

/** Las almas que deja una parada al minuto `minute`. Una caja, lo que da en promedio. */
export function stopSouls(stop: Stop, minute: number): number {
  if (stop.camp !== undefined) return campSoulsAt(MAP.camps[stop.camp], minute);
  if (stop.kind === "crate") {
    const k = MAP.kinds.crate;
    return ((k.souls ?? 0) + (k.soulsPerMinute ?? 0) * minute) * (k.dropChance ?? 1);
  }
  return 0;
}

/** La vida que hay que bajar en una parada. Lo que no es un campamento se rompe de un golpe. */
export const stopHealth = (stop: Stop, minute: number): number =>
  stop.camp !== undefined ? campHealthAt(MAP.camps[stop.camp], minute) : 0;

export const stopIsUp = (stop: Stop, minute: number): boolean => isUpAt(MAP.kinds[stop.kind], minute * 60, stop.group);

export interface Leg {
  stop: Stop;
  /** Segundos caminando desde la parada anterior (0 en la primera). */
  travel: number;
  /** Segundos limpiando. */
  clear: number;
  souls: number;
  up: boolean;
}

export interface RouteTotals {
  legs: Leg[];
  travel: number;
  clear: number;
  total: number;
  souls: number;
  /** Almas por minuto de la ruta entera. 0 si no dura nada. */
  soulsPerMin: number;
}

export function routeTotals(stops: Stop[], hero: RouteHero, minute: number): RouteTotals {
  const speed = Math.max(0.1, hero.speed);
  const dps = Math.max(1, hero.dps);
  const legs: Leg[] = stops.map((stop, i) => ({
    stop,
    travel: i === 0 ? 0 : distanceM(stops[i - 1], stop) / speed,
    clear: stopHealth(stop, minute) / dps + STOP_OVERHEAD_S,
    souls: stopSouls(stop, minute),
    up: stopIsUp(stop, minute),
  }));
  const travel = legs.reduce((a, l) => a + l.travel, 0);
  const clear = legs.reduce((a, l) => a + l.clear, 0);
  const souls = legs.reduce((a, l) => a + l.souls, 0);
  const total = travel + clear;
  return { legs, travel, clear, total, souls, soulsPerMin: total > 0 ? souls / (total / 60) : 0 };
}

/** De qué lado es la jungla: Hidden King tiene la base abajo; Archmother, arriba. */
export type Side = "amber" | "sapphire";
/** Qué mitad de esa jungla, mirando el mapa. */
export type Wing = "west" | "east";

export const inSide = (p: { y: number }, side: Side): boolean => (side === "amber" ? p.y > 0.5 : p.y < 0.5);
export const inWing = (p: { x: number }, wing: Wing): boolean => (wing === "west" ? p.x < 0.5 : p.x >= 0.5);

/**
 * La ruta sugerida para un lado y una mitad de la jungla.
 *
 * Sale de los campamentos que ya aparecieron a ese minuto (las cajas no
 * entran: dan poco y hay cientos). Desde cada campamento como arranque se arma
 * una ruta golosa —la próxima parada es la que deja mejor la cuenta de almas por
 * minuto— y se devuelve la mejor de todas. No es el óptimo matemático: es una
 * buena ruta, medida con la misma estimación que cualquier otra.
 */
export function suggestRoute(side: Side, wing: Wing, hero: RouteHero, minute: number, max = SUGGESTED_STOPS): Stop[] {
  const pool = allStops().filter(
    (s) => s.camp !== undefined && s.kind !== "midboss" && inSide(s, side) && inWing(s, wing) && stopIsUp(s, minute)
  );
  let best: Stop[] = [];
  let bestRate = 0;
  for (const start of pool) {
    const route = [start];
    while (route.length < Math.min(max, pool.length)) {
      let pick: Stop | null = null;
      let pickRate = -1;
      for (const s of pool) {
        if (route.includes(s)) continue;
        const rate = routeTotals([...route, s], hero, minute).soulsPerMin;
        if (rate > pickRate) {
          pick = s;
          pickRate = rate;
        }
      }
      if (!pick) break;
      route.push(pick);
    }
    const rate = routeTotals(route, hero, minute).soulsPerMin;
    if (rate > bestRate) {
      best = route;
      bestRate = rate;
    }
  }
  return best;
}
