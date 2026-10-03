/**
 * Los textos de la pestaña Moodles de Project Zomboid (2026-09-30), en inglés y español con voseo: la lista
 * (`/moodles`) y la ficha de cada moodle. Van en un módulo propio y no en `zomboidCopy.ts`, como los de Rasgos; el
 * `<head>` sí sigue allá (`seo.moodles` y `seo.detail.moodles`): lo escribe el prerender sin bajar la pestaña.
 *
 * Todo esto es texto nuestro. Los nombres y las descripciones de los niveles salen de los datos, con la traducción
 * oficial; el "qué hacer" de cada moodle está en `advice.ts`.
 */
import { useLang } from "../../i18n";
import type { MoodleGroup } from "./data";

export interface PzMoodlesCopy {
  title: string;
  intro: (n: string, version: string) => string[];
  hand: string;
  search: string;
  searchHint: string;
  showing: (shown: string, total: string) => string;
  empty: string;
  groups: Record<MoodleGroup, string>;
  /** La nota a lápiz junto al título de algunas hojas de la lista. */
  groupNotes: Partial<Record<MoodleGroup, string>>;
  notFound: string;
  back: string;
  kicker: (version: string) => string;
  otherName: (name: string) => string;
  /** "4 niveles" / "un solo nivel", junto al grupo en la cabecera. */
  levelCount: (n: number) => string;
  good: string;
  levels: string;
  level: (n: number) => string;
  advice: string;
  related: (group: string) => string;
}

const EN: PzMoodlesCopy = {
  title: "Project Zomboid Moodles",
  intro: (n, v) => [
    `The ${n} moodles in Project Zomboid Build ${v}: the icons that show up on the right side of the screen when your character is hungry, hurt, scared, cold or soaked. Each page has every level with what it means, and what to do about it.`,
    "The redder the circle, the worse it is: it goes from grey to bright red as the level goes up (and to green for the good one, being well fed).",
  ],
  hand: "search by name or by level",
  search: "Search a moodle",
  searchHint: "queasy, sangrado, peckish…",
  showing: (shown, total) => `Showing ${shown} of ${total}`,
  empty: "Nothing by that name. Try the name of a level, or in Spanish.",
  groups: {
    needs: "Needs",
    body: "Body",
    mood: "Mood",
    health: "Wounds and illness",
    weather: "Temperature",
    death: "When you die",
  },
  groupNotes: { death: "only on the death screen" },
  notFound: "We couldn't find that moodle. Look for it in the list.",
  back: "All moodles",
  kicker: (v) => `Moodle · Build ${v}`,
  otherName: (name) => `in Spanish: ${name}`,
  levelCount: (n) => (n === 1 ? "a single level" : `${n} levels`),
  good: "a good one",
  levels: "Levels",
  level: (n) => `Level ${n}`,
  advice: "What to do",
  related: (group) => `More moodles: ${group}`,
};

const ES: PzMoodlesCopy = {
  title: "Moodles de Project Zomboid",
  intro: (n, v) => [
    `Los ${n} moodles de Project Zomboid Build ${v}: los íconos que aparecen al costado derecho de la pantalla cuando tu personaje tiene hambre, está herido, asustado, con frío o empapado. Cada ficha tiene todos sus niveles con qué significa cada uno, y qué hacer.`,
    "Cuanto más rojo el círculo, peor: pasa del gris al rojo pleno a medida que sube el nivel (y al verde en el bueno, estar bien alimentado).",
  ],
  hand: "buscá por nombre o por nivel",
  search: "Buscar un moodle",
  searchHint: "náuseas, bleeding, hambre…",
  showing: (shown, total) => `Mostrando ${shown} de ${total}`,
  empty: "Nada con ese nombre. Probá con el de un nivel, o en inglés.",
  groups: {
    needs: "Necesidades",
    body: "Cuerpo",
    mood: "Ánimo",
    health: "Heridas y enfermedades",
    weather: "Temperatura",
    death: "Al morir",
  },
  groupNotes: { death: "sólo en la pantalla de muerte" },
  notFound: "No encontramos ese moodle. Buscalo en la lista.",
  back: "Todos los moodles",
  kicker: (v) => `Moodle · Build ${v}`,
  otherName: (name) => `en inglés: ${name}`,
  levelCount: (n) => (n === 1 ? "un solo nivel" : `${n} niveles`),
  good: "de los buenos",
  levels: "Niveles",
  level: (n) => `Nivel ${n}`,
  advice: "Qué hacer",
  related: (group) => `Más moodles: ${group}`,
};

export const MOODLES_COPY: Record<"en" | "es", PzMoodlesCopy> = { en: EN, es: ES };
export const useMoodlesCopy = (): PzMoodlesCopy => MOODLES_COPY[useLang().lang];
