/**
 * Los renglones de números de la ficha de un objeto de Project Zomboid (2026-09-30): qué campos del juego se muestran
 * según el tipo (arma, ropa, contenedor, comida, libro) y cómo se escriben en cada idioma.
 *
 * No se muestran todos los campos que trae el script del juego: muchos son internos (`attachmentType`, `vehicleType`,
 * `mechanicsItem`) y no le dicen nada a quien juega. Cada renglón sale sólo si el objeto tiene su campo, así "lo demás"
 * (una linterna, una radio, una mira) lleva los que tenga sin una lista aparte por tipo.
 *
 * Un cero que no dice nada no se anota, como en el juego: su cartel esconde el hambre, la sed y el ánimo cuando no
 * cambian (un cigarrillo no dice "Hambre 0"), y acá tampoco van "Daño a árboles 0" en una brújula ni "0 min" de
 * cocción.
 */
import skillsJson from "@zomboid/skills.json";
import type { PzItemsCopy, PzStatId } from "../../zomboidCopy";
import type { Loc, Ref, SkillBook, ItemVariant } from "./data";
import { numbers } from "./numbers";

export { numbers };

export interface StatRow {
  id: PzStatId;
  label: string;
  value: string;
  /** El renglón es otro objeto (la bala, el cargador): la ficha lo dibuja como enlace a su ficha. */
  ref?: Ref;
}

/** Lo que la ficha sabe además de la variante: el libro de habilidad, y la bala y el cargador ya resueltos a fichas. */
export interface StatExtra {
  book?: SkillBook;
  ammo?: Ref;
  magazine?: Ref;
}

type Lang = "en" | "es";
type S = Record<string, unknown>;

/** Los nombres de las habilidades en los dos idiomas. El archivo trae también la tabla de XP (6 KB crudo, 1 KB con gzip: viaja con la pestaña). */
const SKILLS = skillsJson as Record<string, Loc>;
/** La categoría de arma del juego → la habilidad que la sube. `improvised` y `unarmed` no son habilidades. */
const WEAPON_SKILL: Record<string, string> = {
  axe: "Axe", blunt: "Blunt", smallblunt: "SmallBlunt", longblade: "LongBlade", smallblade: "SmallBlade", spear: "Spear",
};

const numOf = (s: S, k: string): number | null => (typeof s[k] === "number" ? (s[k] as number) : null);

const WEIGHTS = new Map<string, Intl.NumberFormat>();
/**
 * El peso, igual en la lista y en la ficha: hasta tres decimales y sin ceros de más. Con dos, una gema (0,001) decía
 * "0" en la ficha y "0,001" en la lista, y otros 15 objetos no coincidían entre una y otra.
 */
export function weightText(w: number, locale: string): string {
  let f = WEIGHTS.get(locale);
  if (!f) WEIGHTS.set(locale, (f = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 })));
  return f.format(w);
}

/**
 * Un lugar del cuerpo sin traducción en el juego (no pasa en la 42.21: los 102 la tienen): el código más legible,
 * "calf_left" → "Calf left".
 */
const humanize = (code: string): string => {
  const s = code.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

type Ctx = { s: S; v: ItemVariant; t: PzItemsCopy; lang: Lang; n: ReturnType<typeof numbers>; x: StatExtra };
/** Un renglón: devuelve el valor ya escrito, o `null` si el objeto no tiene el campo (o si no dice nada). */
type Fmt = (c: Ctx) => string | { value: string; ref?: Ref } | null;

const isFirearm = (s: S) => s.ranged === true || s.isAimedFirearm === true || s.subCategory === "Firearm";
const plain = (k: string, how: "num" | "signed" | "pct" | "frac" | "mult" = "num"): Fmt => ({ s, n }) => {
  const x = numOf(s, k);
  return x === null ? null : n[how](x);
};
/** Como `plain`, pero sin el renglón si vale 0: ahí el juego no lo muestra, o no dice nada ("Daño a árboles 0"). */
const nonZero = (k: string, how: "num" | "signed" | "pct" | "frac" = "num"): Fmt => (c) => (numOf(c.s, k) === 0 ? null : plain(k, how)(c));
/** Un objeto de otra ficha (la bala, el cargador), como enlace. */
const link = (ref: Ref | undefined, lang: Lang) => (ref ? { value: ref[lang], ref } : null);
/** Visión o audición: el juego dibuja cuánto se pierde (1 − el modificador), y nada si el modificador es 1. */
const impairment = (k: string): Fmt => ({ s, n }) => {
  const m = numOf(s, k);
  return m === null || m === 1 ? null : n.frac(1 - m);
};

const FMT: Record<PzStatId, Fmt> = {
  skill: ({ s, t, lang }) => {
    const cats = Array.isArray(s.categories) ? (s.categories as string[]) : [];
    const keys = isFirearm(s) ? ["Aiming"] : cats.map((c) => WEAPON_SKILL[c]).filter(Boolean);
    const names = keys.map((k) => SKILLS[k]?.[lang] ?? k);
    if (!names.length) return null;
    return cats.includes("improvised") ? `${names.join(", ")} (${t.improvised})` : names.join(", ");
  },
  damage: ({ s, n }) => {
    const a = numOf(s, "minDamage");
    const b = numOf(s, "maxDamage");
    // Una bomba casera trae daño 0–0: su daño es la explosión, que va en sus propios renglones.
    return a === null || b === null || b <= 0 ? null : n.range(a, b);
  },
  range: ({ s, n }) => {
    const b = numOf(s, "maxRange");
    if (b === null) return null;
    const a = numOf(s, "minRange");
    return a === null ? n.num(b) : n.range(a, b);
  },
  speed: plain("baseSpeed", "mult"),
  crit: ({ s, n }) => {
    const c = numOf(s, "criticalChance");
    if (c === null || c === 0) return null;
    const m = numOf(s, "critDmgMultiplier");
    return m === null ? n.pct(c) : `${n.pct(c)} ${n.mult(m)}`;
  },
  // El filo de una hoja nueva (el juego lo dibuja como una barra que baja con el uso): 1 en la 42.21 es "100 %".
  sharpness: plain("sharpness", "frac"),
  hits: ({ s, n, t }) => {
    const h = numOf(s, "maxHitcount");
    return h === null || h <= 0 || isFirearm(s) ? null : t.upTo(n.num(h));
  },
  twoHanded: ({ s, t }) => (s.twoHandWeapon === true || s.requiresEquippedBothHands === true ? t.yes : null),
  durability: ({ s, n, t }) => {
    const max = numOf(s, "conditionMax");
    if (max === null) return null;
    const oneIn = numOf(s, "conditionLowerChanceOneIn");
    return t.wear(n.num(max), oneIn === null ? null : n.num(oneIn));
  },
  pushBack: nonZero("pushBackMod"),
  door: nonZero("doorDamage"),
  tree: nonZero("treeDamage"),
  // Las armas de fuego: la bala (`ammoItem` resuelto por site.py a su ficha) y el cargador, como enlaces, y cuántas
  // balas entran. `maxAmmo` es lo que entra en el cargador si el arma lo usa, o en el arma misma si no (un revólver,
  // una escopeta), y en un cargador suelto, lo que entra en él.
  ammoRef: ({ s, x, lang }) => (typeof s.ammoType === "string" ? link(x.ammo, lang) : null),
  magRef: ({ s, x, lang }) => (typeof s.magazineType === "string" ? link(x.magazine, lang) : null),
  magCap: ({ s, n }) => (isFirearm(s) && typeof s.magazineType === "string" && numOf(s, "maxAmmo") !== null ? n.num(numOf(s, "maxAmmo")!) : null),
  rounds: ({ s, n }) => {
    const max = numOf(s, "maxAmmo");
    if (max === null || typeof s.ammoType !== "string") return null;
    return isFirearm(s) && typeof s.magazineType === "string" ? null : n.num(max);
  },
  hitChance: ({ s, n }) => (numOf(s, "hitChance") === null ? null : n.pct(numOf(s, "hitChance")!)),
  aim: plain("aimingtime"),
  reload: plain("reloadtime"),
  recoil: plain("recoilDelay"),
  noise: plain("soundRadius"),
  blast: plain("explosionPower"),
  blastRange: plain("explosionRange"),
  fireRange: nonZero("fireRange"),
  smokeRange: plain("smokeRange"),
  noiseRange: plain("noiseRange"),
  timer: plain("explosionTimer"),
  sensor: plain("sensorRange"),
  // El lugar del cuerpo que ocupa (dos prendas del mismo lugar no van juntas), con el nombre que le da el juego en la
  // pantalla de ropa (extract.py lo trae de UI_ClothingType_*): "Chaleco protector" y no `torsoextravestbullet`. Si
  // faltara el español, el inglés.
  body: ({ s, lang }) => {
    if (typeof s.bodyLocation !== "string") return null;
    const name = s.bodyLocationName as Loc | undefined;
    return name ? name[lang] || name.en : humanize(s.bodyLocation);
  },
  bite: plain("biteDefense", "pct"),
  scratch: plain("scratchDefense", "pct"),
  bullet: plain("bulletDefense", "pct"),
  insulation: plain("insulation", "frac"),
  wind: plain("windResistance", "frac"),
  water: plain("waterResistance", "frac"),
  vision: impairment("visionModifier"),
  hearing: impairment("hearingModifier"),
  runSpeed: plain("runSpeedModifier", "mult"),
  combatSpeed: plain("combatSpeedModifier", "mult"),
  fabric: ({ s, t }) => (typeof s.fabricType === "string" ? t.fabrics[s.fabricType] ?? s.fabricType : null),
  capacity: plain("capacity"),
  weightReduction: plain("weightReduction", "pct"),
  hunger: nonZero("hungerChange", "signed"),
  thirst: nonZero("thirstChange", "signed"),
  calories: plain("calories"),
  carbs: ({ s, n }) => (numOf(s, "carbohydrates") === null ? null : `${n.num(numOf(s, "carbohydrates")!)} g`),
  fats: ({ s, n }) => (numOf(s, "lipids") === null ? null : `${n.num(numOf(s, "lipids")!)} g`),
  proteins: ({ s, n }) => (numOf(s, "proteins") === null ? null : `${n.num(numOf(s, "proteins")!)} g`),
  fresh: ({ s, n, t }) => {
    const d = numOf(s, "daysFresh");
    return d === null || d === 0 ? null : t.days(d, n.num(d));
  },
  rotten: ({ s, n, t }) => {
    const d = numOf(s, "daysTotallyRotten");
    return d === null || d === 0 ? null : t.days(d, n.num(d));
  },
  cook: ({ s, n, t }) => {
    if (s.isCookable !== true) return null;
    const m = numOf(s, "minutesToCook");
    return m === null || m === 0 ? t.yes : `${t.yes} · ${n.num(m)} min`;
  },
  raw: ({ s, t }) => (s.dangerousUncooked === true ? t.dangerous : null),
  unhappy: nonZero("unhappyChange", "signed"),
  boredom: nonZero("boredomChange", "signed"),
  stress: nonZero("stressChange", "signed"),
  fatigue: nonZero("fatigueChange", "signed"),
  pain: nonZero("painReduction"),
  bookSkill: ({ x, lang }) => (x.book ? x.book.skill[lang] : null),
  bookLevels: ({ x, n }) => (x.book ? n.range(x.book.from, x.book.from + x.book.levels - 1) : null),
  bookMult: ({ x, n }) => (x.book ? n.mult(x.book.mult) : null),
  pages: plain("numberOfPages"),
  fluid: ({ s, n }) => {
    const f = s.fluid as { capacity?: unknown } | undefined;
    return typeof f?.capacity === "number" ? `${n.num(f.capacity)} L` : null;
  },
  /**
   * "Usos" sólo donde un uso es una acción: un pedazo de cinta, un fósforo, una pasada de pintura. El juego guarda en
   * todo "drenable" cuánto le queda (de 0 a 1) y cada `Use()` le resta `UseDelta`, así que 1/UseDelta es la cantidad de
   * usos… pero en muchos no los gasta quien juega, sino el tiempo o algo enchufado (verificado en los scripts y en
   * DrainableComboItem.update de la 42.21):
   *
   * - `ActivatedItem` (linternas, encendedores): se gastan un uso cada 10 minutos del juego mientras están prendidos en
   *   la mano o colgados;
   * - `UseWhileUnequipped` (la vela encendida): se consume sola, sin que la tengas en la mano;
   * - `cantBeConsolided` (el juego no deja juntar dos a medio usar): guardan un nivel que otro va gastando de a poco,
   *   la carga de la batería del auto (UseDelta 0,00001: "100.000 usos"), el gas del tanque de propano (5.000), la
   *   mecha de la vela (333), la carga de una pila (143), el filtro de la máscara de gas (100).
   *
   * Lo que el juego sí deja juntar (cinta, pegamento, fósforos, hilo, pintura, remedios) se gasta de a un uso por
   * acción, y ahí "Usos" es verdad. Unos pocos que no se juntan también se gastan por acción (el soplete, el matafuego,
   * el empapelado): quedan sin el renglón antes que con uno falso.
   */
  uses: ({ s, v, n }) => {
    const d = numOf(s, "useDelta");
    if (v.type !== "drainable" || d === null || d <= 0) return null;
    if (s.activatedItem === true || s.useWhileUnequipped === true || s.cantBeConsolided === true) return null;
    return n.num(Math.round(1 / d));
  },
  light: plain("lightDistance"),
  bandage: plain("bandagePower"),
  alcohol: plain("alcoholPower"),
  alcoholic: ({ s, t }) => (s.alcoholic === true ? t.yes : null),
  transmit: nonZero("transmitRange"),
  battery: ({ s, t }) => (s.usesBattery === true ? t.yes : null),
  hitChanceMod: plain("hitChanceModifier", "signed"),
  aimMod: plain("aimingTimeModifier", "signed"),
  recoilMod: plain("recoilDelayModifier", "signed"),
  reloadMod: plain("reloadTimeModifier", "signed"),
  rangeMod: plain("maxRangeModifier", "signed"),
};

const MELEE: PzStatId[] = [
  "skill", "damage", "range", "speed", "crit", "sharpness", "hits", "twoHanded", "durability", "pushBack", "door", "tree",
];
const FIREARM: PzStatId[] = [
  "skill", "damage", "range", "ammoRef", "magRef", "magCap", "rounds", "hitChance", "crit", "aim", "reload", "recoil",
  "noise", "durability",
];
const EXPLOSIVE: PzStatId[] = ["blast", "blastRange", "fireRange", "smokeRange", "noiseRange", "timer", "sensor"];
const CLOTHING: PzStatId[] = [
  "body", "bite", "scratch", "bullet", "insulation", "wind", "water", "vision", "hearing", "runSpeed", "combatSpeed", "fabric",
];
const CONTAINER: PzStatId[] = ["capacity", "weightReduction", "runSpeed"];
const FOOD: PzStatId[] = ["hunger", "thirst", "calories", "carbs", "fats", "proteins", "fresh", "rotten", "cook", "raw"];
const MOOD: PzStatId[] = ["unhappy", "boredom", "stress", "fatigue", "pain"];
const BOOK: PzStatId[] = ["bookSkill", "bookLevels", "bookMult", "pages"];
/** Lo que puede tener cualquier objeto, después de lo de su tipo. */
const REST: PzStatId[] = [
  "durability", "sharpness", "ammoRef", "rounds", "fluid", "uses", "light", "bandage", "alcohol", "alcoholic", "noise",
  "transmit", "battery", "hitChanceMod", "aimMod", "recoilMod", "reloadMod", "rangeMod",
];

function order(v: ItemVariant): PzStatId[] {
  const s = v.stats;
  const first: PzStatId[] =
    v.type === "weapon"
      ? [...(isFirearm(s) ? FIREARM : MELEE), ...EXPLOSIVE]
      : v.type === "clothing" || v.type === "alarmclockclothing"
        ? CLOTHING
        : v.type === "container"
          ? [...CONTAINER, ...CLOTHING]
          : v.type === "food"
            ? [...FOOD, ...MOOD]
            : v.type === "literature"
              ? [...BOOK, ...MOOD]
              : [...FOOD, ...MOOD];
  return [...new Set([...first, ...REST])];
}

/** Los renglones de números de una variante, en el orden de su tipo, sólo los que tiene. */
export function statRows(v: ItemVariant, t: PzItemsCopy, lang: Lang, locale: string, extra: StatExtra = {}): StatRow[] {
  const ctx: Ctx = { s: v.stats ?? {}, v, t, lang, n: numbers(locale), x: extra };
  const rows: StatRow[] = [];
  for (const id of order(v)) {
    const out = FMT[id](ctx);
    if (out === null) continue;
    rows.push(typeof out === "string" ? { id, label: t.stats[id], value: out } : { id, label: t.stats[id], ...out });
  }
  return rows;
}

/**
 * Lo que cambia entre las variantes: los renglones cuyo valor no es el mismo en todas. Una palanca y su versión forjada
 * sólo cambian de aspecto; una chaqueta de cuero negra y una marrón, a veces de abrigo.
 */
export function variantDiffs(perVariant: StatRow[][]): PzStatId[] {
  const ids = new Set(perVariant.flatMap((rows) => rows.map((r) => r.id)));
  const valueOf = (rows: StatRow[], id: PzStatId) => rows.find((r) => r.id === id)?.value ?? "";
  return [...ids].filter((id) => new Set(perVariant.map((rows) => valueOf(rows, id))).size > 1);
}
