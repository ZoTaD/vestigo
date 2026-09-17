import type { Lang } from "./i18n";
import type { Analyst, Tally, Verdict } from "./deadlockNewsData";

/**
 * Los textos de Vestigo News, en los dos idiomas.
 *
 * Viven acá y no en `i18n.ts` porque son casi todos **plantillas**: el titular
 * y la nota de análisis se arman con los números de cada edición, así que salen
 * solos en los dos idiomas aunque las líneas del parche se traduzcan a mano.
 *
 * **Los bancos de titulares se agrandan de a poco** (pedido de ZoTaD del
 * 2026-09-17): cada edición elige uno con su `variant`, que es estable, así que
 * sumar opciones al final sólo cambia las ediciones cuyo índice caía fuera del
 * banco viejo. Nunca inventan cifras: las cifras las pone el cuerpo.
 */

type Kase = Analyst["case"];
type Side = "nerf" | "buff";

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
  analyst: string;
  analystKicker: string;
  analystHeads: Record<Kase, Record<Side, string[]>>;
  analystBody: (a: Analyst, hero: string, f: Fmt) => string[];
  analystVerdict: (a: Analyst) => string;
  winRate: string;
  pickRate: string;
  before: string;
  after: string;
  window15: string;
  sincePatch: string;
  movers: string;
  moversUp: string;
  moversDown: string;
  pending: string;
  source: string;
  readNotes: string;
  archive: string;
  archiveLead: string;
  latest: string;
  loading: string;
  missing: string;
}

export interface Fmt {
  pct: (n: number) => string;
  pts: (n: number) => string;
  int: (n: number) => string;
  date: (iso: string) => string;
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
  analyst: "The Analyst",
  analystKicker: "Vestigo analysis",
  analystHeads: {
    watch: {
      nerf: ["All Eyes on {hero}", "{hero} Under the Knife", "What Now for {hero}?", "{hero} in the Crosshairs", "Valve Comes for {hero}", "Is {hero}'s Run Over?"],
      buff: ["All Eyes on {hero}", "{hero} Gets the Gift", "Is {hero} Next?", "A Lift for {hero}", "Valve Bets on {hero}", "{hero} Gets a Second Look"],
    },
    landed: {
      nerf: ["The Nerf Lands on {hero}", "{hero} Feels the Cut", "{hero} Knocked Down a Peg", "{hero} Brought to Heel", "The Axe Finds {hero}", "{hero} Cools Off"],
      buff: ["{hero} Rises", "The Buff Pays Off for {hero}", "Is {hero} the New Menace?", "{hero} on the Climb", "{hero} Cashes In", "Look Out for {hero}"],
    },
    shrugged: {
      nerf: ["{hero} Shrugs Off the Nerf", "Nerfed, Yet {hero} Climbs", "The Cut Missed {hero}", "{hero} Laughs at Valve", "Still Standing: {hero}", "{hero} Didn't Get the Memo"],
      buff: ["{hero}'s Buff Falls Flat", "Buffed, Yet {hero} Slides", "No Lift for {hero}", "{hero} Still Struggling", "The Gift {hero} Couldn't Use", "{hero} Waits for More"],
    },
  },
  analystBody: (a, hero, f) => {
    if (a.case === "watch") {
      return [
        `${hero} took ${a.changes} changes, more than any other ${a.verdict === "nerf" ? "nerfed" : "buffed"} hero this patch.`,
        a.sincePatch
          ? `Since the patch, ${hero} wins ${f.pct(a.winRate)} of ${f.int(a.matches)} games, but there is no comparable stretch before it yet.`
          : `The patch doesn't have enough games to measure on its own yet. Over the last 15 days, patch included, ${hero} wins ${f.pct(a.winRate)} of ${f.int(a.matches)} games and shows up in ${f.pct(a.pickRate)} of them.`,
        "The verdict comes once the patch gathers its sample.",
      ];
    }
    return [
      `${hero} took ${a.changes} changes and went from ${f.pct(a.winRateBefore ?? a.winRate)} to ${f.pct(a.winRate)} wins (${f.pts(a.trend ?? 0)} points), over ${f.int(a.matches)} games.`,
      `Picked in ${f.pct(a.pickRate)} of games, measured from ${f.date(a.from)} to ${f.date(a.to)}.`,
    ];
  },
  analystVerdict: (a) =>
    a.case === "watch"
      ? "Verdict pending: not enough games yet"
      : a.case === "landed"
        ? a.verdict === "nerf" ? "Verdict: the nerf landed" : "Verdict: the buff paid off"
        : a.verdict === "nerf" ? "Verdict: the nerf missed" : "Verdict: the buff fell short",
  winRate: "Win rate",
  pickRate: "Pick rate",
  before: "Before",
  after: "After",
  window15: "Last 15 days",
  sincePatch: "Since patch",
  movers: "Since the patch",
  moversUp: "Rising",
  moversDown: "Falling",
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
  analyst: "El Analista",
  analystKicker: "Análisis de Vestigo",
  analystHeads: {
    watch: {
      nerf: ["Todos miran a {hero}", "{hero}, bajo el bisturí", "¿Y ahora qué, {hero}?", "{hero}, en la mira", "Valve va por {hero}", "¿Se terminó el reinado de {hero}?"],
      buff: ["Todos miran a {hero}", "{hero} recibe el regalo", "¿{hero} es la próxima?", "Una mano para {hero}", "Valve apuesta por {hero}", "Segunda oportunidad para {hero}"],
    },
    landed: {
      nerf: ["El nerf le pegó a {hero}", "{hero} siente el corte", "{hero} baja un escalón", "{hero}, domado", "El hacha encontró a {hero}", "{hero} se enfría"],
      buff: ["{hero} despega", "El buff le sirvió a {hero}", "¿{hero} es la nueva amenaza?", "{hero} en ascenso", "{hero} cobra el premio", "Cuidado con {hero}"],
    },
    shrugged: {
      nerf: ["A {hero} el nerf no le hizo nada", "Nerfeado, {hero} igual sube", "El corte no alcanzó a {hero}", "{hero} se ríe de Valve", "{hero} sigue en pie", "A {hero} no le llegó el aviso"],
      buff: ["El buff de {hero} no alcanzó", "Buffeado, {hero} igual cae", "Sin despegue para {hero}", "{hero} sigue sufriendo", "El regalo que {hero} no supo usar", "{hero} espera más"],
    },
  },
  analystBody: (a, hero, f) => {
    if (a.case === "watch") {
      return [
        `${hero} recibió ${a.changes} cambios, más que cualquier otro héroe ${a.verdict === "nerf" ? "nerfeado" : "buffeado"} en este parche.`,
        a.sincePatch
          ? `Desde el parche, ${hero} gana el ${f.pct(a.winRate)} de ${f.int(a.matches)} partidas, pero todavía no hay un tramo comparable de antes.`
          : `El parche todavía no tiene partidas suficientes para medirlo solo. En los últimos 15 días, parche incluido, ${hero} gana el ${f.pct(a.winRate)} de ${f.int(a.matches)} partidas y aparece en el ${f.pct(a.pickRate)} de ellas.`,
        "El veredicto llega cuando el parche junte su muestra.",
      ];
    }
    return [
      `${hero} recibió ${a.changes} cambios y pasó de ${f.pct(a.winRateBefore ?? a.winRate)} a ${f.pct(a.winRate)} de victorias (${f.pts(a.trend ?? 0)} puntos), sobre ${f.int(a.matches)} partidas.`,
      `Aparece en el ${f.pct(a.pickRate)} de las partidas, medido del ${f.date(a.from)} al ${f.date(a.to)}.`,
    ];
  },
  analystVerdict: (a) =>
    a.case === "watch"
      ? "Veredicto pendiente: faltan partidas"
      : a.case === "landed"
        ? a.verdict === "nerf" ? "Veredicto: el nerf pegó" : "Veredicto: el buff funcionó"
        : a.verdict === "nerf" ? "Veredicto: el nerf no alcanzó" : "Veredicto: el buff se quedó corto",
  winRate: "Victorias",
  pickRate: "Elección",
  before: "Antes",
  after: "Después",
  window15: "Últimos 15 días",
  sincePatch: "Desde el parche",
  movers: "Desde el parche",
  moversUp: "Suben",
  moversDown: "Bajan",
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
