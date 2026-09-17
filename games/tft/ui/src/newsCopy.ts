import type { Lang } from "./i18n";
import type { Tally, Verdict } from "./deadlockNewsData";

/**
 * Los textos de Vestigo News, en los dos idiomas.
 *
 * Viven acá y no en `i18n.ts` porque varios son **plantillas**: el titular y
 * la bajada se arman con los números de cada edición, así que salen solos en
 * los dos idiomas aunque las líneas del parche se traduzcan a mano.
 *
 * La nota de "El Analista" se sacó el 2026-09-17, a pedido de ZoTaD, para dar
 * todo el ancho a los cambios de los héroes.
 *
 * **Los bancos de titulares se agrandan de a poco** (pedido de ZoTaD del
 * 2026-09-17): cada edición elige uno con su `variant`, que es estable, así que
 * sumar opciones al final sólo cambia las ediciones cuyo índice caía fuera del
 * banco viejo.
 */

interface NewsCopy {
  masthead: string;
  tagline: string;
  issue: (n: number) => string;
  price: string;
  kicker: (title: string) => string;
  deck: (s: Tally, i: Tally) => string;
  headlines: Record<"nerfs" | "buffs" | "even" | "quiet", string[]>;
  score: Record<Verdict, string>;
  verdict: Record<Verdict, string>;
  glanceHint: string;
  hit: string;
  totals: [string, string, string];
  system: string;
  systemSub: string;
  heroes: string;
  heroesSub: (heroes: number, lines: number) => string;
  items: string;
  itemsSub: (items: number, lines: number) => string;
  base: string;
  baseSub: string;
  unparsed: string;
  pending: string;
  source: string;
  readNotes: string;
  archive: string;
  archiveLead: string;
  latest: string;
  loading: string;
  missing: string;
}

const EN: NewsCopy = {
  masthead: "Vestigo News",
  tagline: "The Deadlock numbers paper",
  issue: (n) => `Issue No. ${n}`,
  price: "Price: 1 soul",
  kicker: (title) => `${title} · Official notes`,
  deck: (s, i) =>
    `${s.nerf} heroes nerfed, ${s.buff} buffed and ${s.mixed} with mixed changes. ` +
    `${i.nerf} items trimmed and ${i.buff} improved.`,
  headlines: {
    nerfs: ["The Nerf Hammer Falls", "Valve Sharpens the Axe", "Heads Roll", "Trimmed to Size", "The Cutting Room", "No One Is Safe"],
    buffs: ["Buff Season Opens", "Gifts From Valve", "The Rising Tide", "Power to the People", "Fresh Muscle", "A Generous Hand"],
    even: ["A Patch of Two Minds", "Give and Take", "The Great Rebalance", "Winners and Losers", "Scales in Motion", "Shuffle the Deck"],
    quiet: ["Quiet Hands at Valve", "A Light Touch", "Small Print", "Minor Adjustments", "Fine Tuning", "A Gentle Nudge"],
  },
  score: { nerf: "Nerfs", buff: "Buffs", mixed: "Mixed", fix: "Fixes" },
  verdict: { nerf: "Nerf", buff: "Buff", mixed: "Mixed", fix: "Fix" },
  glanceHint: "Tap a face to jump to its changes",
  hit: "Hit hardest",
  totals: ["hero changes", "item changes", "system changes"],
  system: "Systems",
  systemSub: "What changes for everyone",
  heroes: "Heroes",
  heroesSub: (h, l) => `${h} heroes · ${l} changes`,
  items: "Items",
  itemsSub: (i, l) => `${i} items · ${l} changes`,
  base: "Hero base",
  baseSub: "Health, gun and movement",
  unparsed: "Also in the notes",
  pending: "The Spanish edition of these notes is on its way; meanwhile the changes are in English.",
  source: "Source: official notes on Steam · Numbers: Vestigo on deadlock-api",
  readNotes: "Read the official notes",
  archive: "Archive",
  archiveLead: "Every edition, newest first.",
  latest: "Latest",
  loading: "Printing the edition…",
  missing: "We couldn't find that edition. Here is the latest one.",
};

const ES: NewsCopy = {
  masthead: "Vestigo News",
  tagline: "El diario de los números de Deadlock",
  issue: (n) => `Edición Nº ${n}`,
  price: "Precio: 1 alma",
  kicker: (title) => `${title} · Notas oficiales`,
  deck: (s, i) =>
    `${s.nerf} héroes nerfeados, ${s.buff} buffeados y ${s.mixed} con cambios mixtos. ` +
    `${i.nerf} objetos recortados y ${i.buff} mejorados.`,
  headlines: {
    nerfs: ["Cae el martillo", "Valve afila el hacha", "Ruedan cabezas", "Tijera para todos", "Sala de cortes", "Nadie está a salvo"],
    buffs: ["Temporada de buffs", "Regalos de Valve", "Sube la marea", "Poder para el pueblo", "Músculo nuevo", "Mano generosa"],
    even: ["Un parche de dos caras", "Dar y quitar", "El gran reequilibrio", "Ganadores y perdedores", "La balanza se mueve", "Barajar y dar de nuevo"],
    quiet: ["Valve toca despacio", "Un toque suave", "La letra chica", "Ajustes menores", "Afinación fina", "Un empujoncito"],
  },
  score: { nerf: "Nerfs", buff: "Buffs", mixed: "Mixtos", fix: "Arreglos" },
  verdict: { nerf: "Nerf", buff: "Buff", mixed: "Mixto", fix: "Arreglo" },
  glanceHint: "Tocá una cara para ir a sus cambios",
  hit: "Los más golpeados",
  totals: ["cambios en héroes", "cambios en objetos", "de sistema"],
  system: "Sistema",
  systemSub: "Lo que cambia para todos",
  heroes: "Héroes",
  heroesSub: (h, l) => `${h} héroes · ${l} cambios`,
  items: "Objetos",
  itemsSub: (i, l) => `${i} objetos · ${l} cambios`,
  base: "Base del héroe",
  baseSub: "Vida, arma y movimiento",
  unparsed: "También en las notas",
  pending: "La edición en español de estas notas está en camino; mientras tanto, los cambios están en inglés.",
  source: "Fuente: notas oficiales en Steam · Números: Vestigo sobre deadlock-api",
  readNotes: "Ver las notas oficiales",
  archive: "Hemeroteca",
  archiveLead: "Todas las ediciones, de la más nueva a la más vieja.",
  latest: "Última",
  loading: "Imprimiendo la edición…",
  missing: "No encontramos esa edición. Esta es la última.",
};

export const NEWS_COPY: Record<Lang, NewsCopy> = { en: EN, es: ES };

/** El banco de titulares que corresponde al balance del parche. */
export function headlineBank(s: Tally): keyof NewsCopy["headlines"] {
  const moved = s.nerf + s.buff + s.mixed;
  if (moved < 4) return "quiet";
  if (s.nerf >= s.buff * 1.5) return "nerfs";
  if (s.buff >= s.nerf * 1.5) return "buffs";
  return "even";
}

/** Un índice estable a partir de un texto: el mismo que usa el pipeline. */
export function stableVariant(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

export const pickFrom = (bank: string[], variant: number) => bank[variant % bank.length];
