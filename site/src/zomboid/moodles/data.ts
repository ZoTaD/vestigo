/**
 * Los datos de la pestaña Moodles de Project Zomboid (2026-09-30), tal como los escribe `games/zomboid/tools/site.py`:
 * `site/moodles.json`, los 26 moodles con su ícono y sus niveles (nombre y descripción de cada uno, en/es). El nombre
 * del moodle en sí es texto nuestro (el juego sólo nombra cada nivel): sale de `MOODLE_NAMES` en `extract.py`.
 *
 * Como en Rasgos, viajan enteros en el chunk de la pestaña (~6 KB con gzip): la lista los usa a todos y una ficha
 * también (sus vecinos de hoja). La pestaña no pasa nunca por "cargando…" y no necesita línea en `TAB_DATA`.
 */
import moodlesJson from "@zomboid/site/moodles.json";
import type { Loc } from "../items/data";
import { fold } from "../ui";
import type { FichaChange } from "../patches/data";

export interface MoodleLevel {
  /** Del 1 al 4. Muerte y Zombificación sólo tienen el 4; Movimiento restringido, sólo el 1. */
  level: number;
  name: Loc;
  desc: Loc;
}

export interface Moodle {
  id: string;
  en: string;
  es: string;
  /** El archivo del ícono en `/zomboid/moodles/` (sin `.webp`). */
  icon: string;
  levels: MoodleLevel[];
  /** Lo que le cambió en las últimas versiones que comparamos ("Qué cambió"); sin cambios, no está. */
  changes?: FichaChange[];
}

export const MOODLES = moodlesJson as Moodle[];

const byId = new Map(MOODLES.map((m) => [m.id, m]));

/** El moodle de un slug; `null` si no existe (un Map: un slug de la dirección no tropieza con el prototipo). */
export const findMoodle = (id: string | undefined): Moodle | null => (id ? (byId.get(id) ?? null) : null);

export type MoodleGroup = "needs" | "body" | "mood" | "health" | "weather" | "death";

/**
 * CRITERIO NUESTRO, no del juego: en qué hoja de la lista va cada moodle, y en qué orden (el de leerlos, no el
 * alfabético: Hambre y después Saciedad, Hipotermia al lado de Humedad). El juego los muestra todos juntos a la
 * derecha de la pantalla. Muerte y Zombificación van aparte porque sólo aparecen al morir.
 */
export const MOODLE_GROUPS: { group: MoodleGroup; ids: string[] }[] = [
  { group: "needs", ids: ["hungry", "food-eaten", "thirst", "tired"] },
  { group: "body", ids: ["endurance", "heavy-load", "restricted-movement", "drunk"] },
  { group: "mood", ids: ["panic", "stress", "unhappy", "bored", "angry", "uncomfortable"] },
  { group: "health", ids: ["bleeding", "injured", "pain", "sick", "has-a-cold", "noxious-smell"] },
  { group: "weather", ids: ["hypothermia", "hyperthermia", "wet", "windchill"] },
  { group: "death", ids: ["dead", "zombie"] },
];

const groupOf = new Map(MOODLE_GROUPS.flatMap(({ group, ids }) => ids.map((id) => [id, group] as const)));

/** La hoja de un moodle. Uno nuevo de un parche que todavía no está en `MOODLE_GROUPS` va con los de salud. */
export const moodleGroup = (id: string): MoodleGroup => groupOf.get(id) ?? "health";

/** Los moodles de una hoja, en su orden; uno sin hoja asignada, al final de la de salud (así no queda sin enlace). */
export const moodlesIn = (group: MoodleGroup): Moodle[] => {
  const listed = MOODLE_GROUPS.find((g) => g.group === group)!.ids.map((id) => byId.get(id)).filter((m): m is Moodle => !!m);
  const stray = group === "health" ? MOODLES.filter((m) => !groupOf.has(m.id)) : [];
  return [...listed, ...stray];
};

/** Los buenos: en el juego, sólo Saciedad (`Moodles.GoodBadNeutral`, FOOD_EATEN); todos los demás son malos. */
export const isGoodMoodle = (m: Moodle): boolean => m.id === "food-eaten";

/**
 * El color del círculo de un nivel, como lo pinta el juego (`MoodlesUI`): va del gris (0,5; 0,5; 0,5) al rojo puro,
 * o al verde puro en los buenos, en la fracción nivel/4. Nivel 1 es un rojo apagado; nivel 4, rojo pleno.
 */
export function moodleTint(level: number, good: boolean): string {
  const t = Math.min(4, Math.max(0, level)) / 4;
  const up = Math.round((0.5 + 0.5 * t) * 255);
  const down = Math.round((0.5 - 0.5 * t) * 255);
  return good ? `rgb(${down} ${up} ${down})` : `rgb(${up} ${down} ${down})`;
}

/** El ícono de un moodle, servido desde el sitio. */
export const moodleIcon = (m: Moodle): string => `/zomboid/moodles/${encodeURIComponent(m.icon)}.webp`;

/**
 * ¿El moodle responde a lo que se busca? Por su nombre y por el de cualquiera de sus niveles, en los dos idiomas y sin
 * tildes: en la partida se ve el nivel ("Queasy", "Náuseas"), no el moodle, y eso es lo que alguien va a escribir.
 */
export function moodleMatches(m: Moodle, query: string): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  const hay = [m.en, m.es, ...m.levels.flatMap((l) => [l.name.en, l.name.es])].join(" ");
  return fold(hay).includes(needle);
}
