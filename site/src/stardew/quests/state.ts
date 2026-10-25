/**
 * Las Misiones de Stardew Valley (etapa 4, tarea 9): la forma de `quests.json` (`games/stardew/tools/quests_data.py`),
 * la vista que se elige en la pestaña y cómo viaja en la dirección (`?v=story`), las cadenas de las misiones de la
 * historia y las cuentas de los pedidos especiales.
 *
 * El ancla de cada fila es su slug: el de un pedido es su clave en minúsculas (`#willy`), el de una misión su número
 * (`#101`). No se pisan: las claves de las misiones son todas números y las de los pedidos, nombres.
 */

type Pair = [en: string, es: string];
/** Un objeto nombrado, igual que `Ref` de data.ts: slug, slug en español, nombres y tamaño del sprite. */
type Ref = [slug: string, slugEs: string, en: string, es: string, w: number, h: number];

/** Una misión de la historia (`Data/Quests`). */
export interface Quest {
  key: string;
  slug: string;
  /** El tipo del juego (`ItemDelivery`, `Basic`, `Monster`…). */
  type: string;
  title: Pair;
  desc: Pair;
  goal: Pair;
  /** El oro que paga; 0 si no paga. */
  money: number;
  /** Campo del juego que ninguna misión usa: siempre null. No se muestra. */
  reward: null;
  /** Las misiones que abre al terminarla (la 6 abre la 7 y la 8; la 8 tiene dos padres, la 6 y la 132). */
  next: string[];
  /** Quien la da, si es un aldeano (las de entrega y las de objetos perdidos). */
  from: string | null;
  /** El objeto que hay que entregar, cosechar o fabricar, y cuántos. */
  item: string | null;
  n: number;
  /** Las del collar: cuánta amistad suma. */
  friendship?: number;
}

/** Un premio de un pedido especial. `max`: el oro que depende del elemento al azar va de `n` a `max`. */
export type OrderReward =
  | { k: "money"; n: number; max?: number }
  | { k: "item"; id: string; n: number }
  /**
   * Lo que llega por carta: una receta, un regalo, algo que se empieza a vender o un canal de la tele (sin `id`). Un
   * mueble no tiene ficha: trae el tamaño de su dibujo (`rewards/`).
   */
  | { k: "mail"; id?: string; text: Pair; sprite?: [w: number, h: number] }
  | { k: "friendship"; n: number };

/** Un pedido especial del tablero del pueblo o del desierto (`Data/SpecialOrders`, sin los de Qi). */
export interface Order {
  key: string;
  slug: string;
  /** Quien lo pide: una clave de `people`. */
  who: string;
  name: Pair;
  /** Lo que dice el cartel. */
  text: Pair;
  goals: Pair[];
  /** Los objetos que pide, y cuántos de cada uno. */
  items: { id: string; n: number }[];
  days: number;
  repeat: boolean;
  rewards: OrderReward[];
  board: "town" | "desert";
}

export interface Person {
  name: Pair;
  slug: string | null;
  slugEs: string | null;
}

export interface QuestsData {
  story: Quest[];
  orders: Order[];
  refs: Record<string, Ref>;
  /**
   * Quienes piden o dan: el nombre y el slug de su ficha de Aldeanos (inglés y español). Gunther y Marlon no tienen
   * ficha: `slug` null.
   */
  people: Record<string, Person>;
}

// --- La vista y la dirección ------------------------------------------------------------------------------------

export const QUEST_VIEWS = ["orders", "story"] as const;
export type QuestView = (typeof QUEST_VIEWS)[number];
export const DEFAULT_QUEST_VIEW: QuestView = "orders";

/** La vista escrita en la dirección (`?v=story`); lo que no se conoce, los Pedidos especiales. */
export function readQuestView(search: string): QuestView {
  const v = new URLSearchParams(search).get("v");
  return (QUEST_VIEWS as readonly string[]).includes(v ?? "") ? (v as QuestView) : DEFAULT_QUEST_VIEW;
}
/** Lo contrario: `?v=…`, vacío en la vista por defecto. */
export const writeQuestView = (v: QuestView): string => (v === DEFAULT_QUEST_VIEW ? "" : `?v=${v}`);

/**
 * La vista que se abre al cargar: la de `?v=` si la dirección la trae; si no, la del ancla (`#101` es una misión),
 * aunque haya otros parámetros (`?utm_source=…`); si tampoco, los Pedidos.
 */
export function initialQuestView(data: QuestsData, search: string, anchor: string): QuestView {
  if (new URLSearchParams(search).has("v")) return readQuestView(search);
  return viewOfAnchor(data, anchor) ?? DEFAULT_QUEST_VIEW;
}

/** La vista donde está un ancla, para un enlace que llega sin `?v=` (la ficha de un objeto); null si no es de ninguna. */
export function viewOfAnchor(data: QuestsData, anchor: string): QuestView | null {
  if (!anchor) return null;
  if (data.orders.some((o) => o.slug === anchor)) return "orders";
  if (data.story.some((q) => q.slug === anchor)) return "story";
  return null;
}

// --- Las cadenas de la historia ---------------------------------------------------------------------------------

/** Las claves de las misiones en orden de número (el del juego). */
const byKey = (a: Quest, b: Quest) => Number(a.key) - Number(b.key) || a.key.localeCompare(b.key);

/**
 * El padre de cada misión que abre otra: el primero en orden de clave. La 8 la abren la 6 y la 132; queda con la 6, y
 * en la 132 se nombra "sigue en…".
 */
export function questParents(data: QuestsData): Map<string, string> {
  const keys = new Set(data.story.map((q) => q.key));
  const parent = new Map<string, string>();
  for (const q of [...data.story].sort(byKey)) for (const n of q.next) if (keys.has(n) && n !== q.key && !parent.has(n)) parent.set(n, q.key);
  return parent;
}

/**
 * Las misiones de la historia en cadenas: cada una empieza en una sin padre y sigue por `next` (primero en profundidad,
 * en el orden de `next`), así la 6 da [6, 7, 8]. Cada misión aparece una sola vez, en la cadena de su primer padre; las
 * sueltas son cadenas de una. Las cadenas van en el orden de la clave con que empiezan.
 */
export function questChains(data: QuestsData): Quest[][] {
  const parent = questParents(data);
  const of = new Map(data.story.map((q) => [q.key, q]));
  const seen = new Set<string>();
  const walk = (q: Quest, out: Quest[]) => {
    if (seen.has(q.key)) return;
    seen.add(q.key);
    out.push(q);
    for (const n of q.next) {
      const c = of.get(n);
      if (c && parent.get(n) === q.key) walk(c, out);
    }
  };
  const chains: Quest[][] = [];
  for (const q of [...data.story].sort(byKey)) {
    if (parent.has(q.key)) continue;
    const chain: Quest[] = [];
    walk(q, chain);
    chains.push(chain);
  }
  // Un ciclo sin raíz (no hay en el juego) no se pierde: cada misión que quedó afuera arranca su propia cadena.
  for (const q of [...data.story].sort(byKey))
    if (!seen.has(q.key)) {
      const chain: Quest[] = [];
      walk(q, chain);
      chains.push(chain);
    }
  return chains;
}

/**
 * Las que abre una misión y están en otra cadena (su primer padre es otro): se nombran "sigue en…" con su ancla. La
 * vista pasa los padres ya calculados (`questParents`, una vez por dibujo).
 */
export function nextElsewhere(data: QuestsData, q: Quest, parent: Map<string, string> = questParents(data)): Quest[] {
  return q.next.filter((n) => parent.get(n) !== q.key).flatMap((n) => data.story.filter((s) => s.key === n));
}

// --- Los pedidos ------------------------------------------------------------------------------------------------

/**
 * ¿Pide todo lo de la lista o una de las opciones? El juego elige al azar al poner el pedido en el tablero (madera o
 * piedra; uno de 18 cultivos): esos traen más objetos que objetivos. Los de Emily (cinco gemas, una por objetivo) o los
 * peces de Willy piden todo.
 */
export const orderPick = (o: Order): "all" | "one" => (o.items.length > o.goals.length ? "one" : "all");

/** Desde cuántas opciones la lista va en casilleros y el texto del cartel se pliega (los de Lewis y Demetrius). */
export const LONG_PICK = 6;
export const isLongPick = (o: Order): boolean => orderPick(o) === "one" && o.items.length > LONG_PICK;

/**
 * Un objetivo sin la lista larga de opciones ("Pesca 10 pez sol, sardina, … o bacalao largo."): el tramo que va del
 * nombre de la primera opción hasta el final del de la última se cambia por `instead` ("de una de las opciones de
 * abajo"). En inglés el juego escribe el plural ("Potatoes"), así que el nombre se busca como comienzo de palabra y se
 * estira hasta donde termina. Si no encuentra los dos nombres, deja el texto como estaba.
 */
export function shortGoal(text: string, first: string, last: string, instead: string): string {
  const low = text.toLowerCase();
  const i = low.indexOf(first.toLowerCase());
  const j = low.lastIndexOf(last.toLowerCase());
  if (i < 0 || j <= i) return text;
  let end = j + last.length;
  while (end < text.length && /\p{L}/u.test(text[end])) end++;
  return text.slice(0, i) + instead + text.slice(end);
}

/**
 * Quiénes piden o dan, para el filtro: en el orden en que aparecen, sin repetir. En la historia, las misiones sin
 * aldeano no cuentan (el filtro "Todos" las muestra).
 */
export function requesters(data: QuestsData, view: QuestView): string[] {
  const keys = view === "orders" ? data.orders.map((o) => o.who) : [...data.story].sort(byKey).flatMap((q) => (q.from ? [q.from] : []));
  return [...new Set(keys)];
}

/** El retrato de quien pide (`/stardew/portraits/<clave>.png`, 64×64). */
export const portraitSrc = (who: string): string => `/stardew/portraits/${who.toLowerCase()}.png`;
