/**
 * La cuenta del Planificador de personaje de Project Zomboid (2026-09-30), pura: sin React ni navegador, así se prueba
 * con los datos reales (`test/zomboidPlanner.test.ts`). Un personaje es una profesión y los rasgos que elegiste; todo lo
 * demás (puntos, rasgos gratis, niveles, multiplicadores, recetas) sale de acá.
 *
 * Todo lo que sigue repite lo que hace el juego (42.21), leído en su código y no en una wiki:
 *
 * **Puntos** — `CharacterCreationProfession:PointToSpend()` (media/lua/client/OptionScreens/CharacterCreationProfession.lua):
 *
 *     PointToSpend = pointToSpend + cost + SandboxVars.CharacterFreePoints − offset
 *
 * - `pointToSpend` arranca en 0 (`create`), `addTrait` le resta `trait:getCost()` y `removeTrait` se lo devuelve: un
 *   rasgo positivo de costo 4 saca 4, uno negativo de costo −2 da 2.
 * - `cost` es `profession:getCost()` (`onSelectProf`): Desempleado 8, Ladrón −6.
 * - Los rasgos que trae la profesión entran a la lista de elegidos con `addUniqueItem` en `onSelectProf`, sin pasar por
 *   `addTrait`: no cuestan. Lo mismo los que trae un rasgo (`GrantedTraits`, dentro de `addTrait`).
 * - `CharacterFreePoints` es 0 en los cinco presets del juego (media/lua/shared/Sandbox/*.lua). `NegativeTraitsPenalty`
 *   es 1 (sin `offset`, ver `negativeTraitOffset`) en Apocalypse, Extinction, Outbreak y Rising; SixMonthsLater y
 *   SandboxVars.lua no lo definen y queda el valor por defecto de Java, que no está en el Lua (no lo pudimos leer; la
 *   cuenta usa 1, que es el de los demás). Un servidor puede cambiarlos; el planificador usa los de siempre.
 * - Con menos de 0 el botón de jugar se apaga (`render`: `PointToSpend() < 0` → `playButton:setEnable(false)`).
 *
 * **Qué rasgos se eligen** — `populateTraitList`/`populateBadTraitList`: los que no son `isFree()` (que devuelve
 * `isProfessionTrait`, el `professionOnly` de los datos), positivos si su costo es > 0 y negativos si es < 0. Un rasgo se
 * apaga si ya está en la lista de elegidos o si `isMutuallyExclusive` con alguno de ellos (`isTraitExcluded`), y en esa
 * lista están también los gratis de la profesión y los que trae otro rasgo. `CharacterTraitDefinition.isMutuallyExclusive`
 * mira las exclusiones del rasgo y las de los que trae: Metabolismo lento se apaga con Atlético porque trae Sobrepeso.
 * Al cambiar de profesión, `onSelectProf` saca los elegidos que no se combinan con los gratis de la nueva.
 * (`isTraitEnabled` apaga tres rasgos de sueño sólo en un servidor sin sueño: no aplica.)
 *
 * **Niveles** — `IsoGameCharacter.applyTraits`: un mapa que arranca con Fitness 5 y Strength 5, suma las `XPBoosts` de
 * todos los rasgos de la lista (elegidos y gratis: `addLuaTrait` de cada uno) y las de la profesión, recorta cada total a
 * 0–10 y guarda como bonificación `Math.min(3, nivel)` (el `boostCap` de meta.json).
 *
 * **Multiplicador de XP** — `IsoGameCharacter$XP.AddXP`: la tabla de la bonificación (`boost` de cada habilidad en
 * data/skills.json, o `boostMultipliers` de meta.json) y, encima, el `mult` de cada rasgo (`xpMult` de traits.json) que
 * nombra la habilidad. Sin entrada en el mapa cuenta igual que una bonificación 0. Ver pj-1-report.md.
 *
 * **Recetas** — las `GrantedRecipes` de la profesión (`applyProfessionRecipes`) y las de cada rasgo de la lista.
 */
import { DEFAULT_PROF, findProfession, findTrait, pickable, PROFESSIONS, type Loc, type Profession, type Ref, type Trait } from "../traits/data";

// `pickable` y `DEFAULT_PROF` viven en traits/data.ts (la ficha de un rasgo los necesita sin traer las habilidades de acá);
// se reexportan para que el planificador y los tests sigan importándolos de `build`.
export { DEFAULT_PROF, pickable };

/** Un personaje: la profesión y los rasgos que elegiste (sin los gratis), por su slug de ficha. */
export type Build = { prof: string; traits: string[] };

export const DEFAULT_BUILD: Build = { prof: DEFAULT_PROF, traits: [] };

/** La query de la dirección: `?b=burglar.clumsy.inconspicuous`. */
export const B_PARAM = "b";

// ---------- Rasgos ----------

/** La profesión de un personaje: si el slug no existe, Desempleado (como al abrir la pantalla). */
export const professionOf = (b: Build): Profession => findProfession(b.prof) ?? findProfession(DEFAULT_PROF)!;

/**
 * De dónde viene un rasgo del personaje: lo elegiste, lo trae la profesión (gratis) o lo trae otro rasgo que elegiste
 * (gratis también: Metabolismo lento trae Sobrepeso).
 */
export type Origin = { kind: "picked" } | { kind: "profession"; id: string } | { kind: "trait"; id: string };
export interface Held {
  trait: Trait;
  from: Origin;
}

/** Los rasgos elegidos que valen: existen, se eligen, no están repetidos y la profesión no los trae ya. */
function picked(b: Build): Trait[] {
  const prof = professionOf(b);
  const free = new Set(prof.traits.map((r) => r.id));
  const seen = new Set<string>();
  const out: Trait[] = [];
  for (const id of b.traits) {
    const t = findTrait(id);
    if (!t || !pickable(t) || free.has(t.id) || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/**
 * Todos los rasgos del personaje, como la lista de elegidos del juego: los gratis de la profesión, los que elegiste y
 * los que traen esos (una sola vez cada uno).
 */
export function held(b: Build): Held[] {
  const prof = professionOf(b);
  const out = new Map<string, Held>();
  const add = (t: Trait | null, from: Origin) => {
    if (t && !out.has(t.id)) out.set(t.id, { trait: t, from });
  };
  for (const r of prof.traits) add(findTrait(r.id), { kind: "profession", id: prof.id });
  const mine = picked(b);
  for (const t of mine) add(t, { kind: "picked" });
  for (const t of mine) for (const g of t.grants) add(findTrait(g.id), { kind: "trait", id: t.id });
  return [...out.values()];
}

/** ¿`a` y `b` no se combinan? Las exclusiones de los datos son simétricas (lo arma `setMutualExclusive`). */
const excludes = (a: Trait, b: Trait): boolean => a.exclusive.some((r) => r.id === b.id) || b.exclusive.some((r) => r.id === a.id);

/**
 * Por qué un rasgo está apagado, o `null` si se puede elegir (o ya está elegido: se puede sacar).
 * - `excludes`: no se combina con `by`, un rasgo del personaje (que viene de `from`).
 * - `brings`: trae `via` (Metabolismo lento → Sobrepeso), y `via` no se combina con `by`.
 * - `given`: ya lo tiene el personaje gratis.
 */
export type Blocker =
  | { kind: "excludes"; by: Trait; from: Origin }
  | { kind: "brings"; via: Trait; by: Trait; from: Origin }
  | { kind: "given"; from: Origin };

export function blocker(b: Build, id: string): Blocker | null {
  const t = findTrait(id);
  if (!t) return null;
  const all = held(b);
  const mine = all.find((h) => h.trait.id === t.id);
  if (mine) return mine.from.kind === "picked" ? null : { kind: "given", from: mine.from };
  for (const h of all) if (excludes(t, h.trait)) return { kind: "excludes", by: h.trait, from: h.from };
  for (const g of t.grants) {
    const via = findTrait(g.id);
    if (!via) continue;
    for (const h of all) if (excludes(via, h.trait)) return { kind: "brings", via, by: h.trait, from: h.from };
  }
  return null;
}

/** Los pares de rasgos del personaje que no se combinan (un link armado a mano puede traerlos). */
export function conflicts(b: Build): [Held, Held][] {
  const all = held(b);
  const out: [Held, Held][] = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (excludes(all[i].trait, all[j].trait)) out.push([all[i], all[j]]);
  return out;
}

// ---------- La cuenta ----------

/** Los puntos para gastar, con el signo del juego: la profesión menos el costo de cada rasgo elegido. */
export const points = (b: Build): number => professionOf(b).cost - picked(b).reduce((sum, t) => sum + t.cost, 0);
/** Lo que suman los rasgos elegidos (sin la profesión): −4 si elegiste Valiente. */
export const traitPointsOf = (b: Build): number => -picked(b).reduce((sum, t) => sum + t.cost, 0);

/** ¿El juego te deja empezar? Una profesión que existe, puntos ≥ 0 y ningún par de rasgos que no se combine. */
export const valid = (b: Build): boolean => !!findProfession(b.prof) && points(b) >= 0 && conflicts(b).length === 0;

/** Las recetas que sabés al empezar: las de la profesión y las de cada rasgo del personaje, una vez cada una. */
export function recipes(b: Build): Ref[] {
  const out = new Map<string, Ref>();
  for (const r of professionOf(b).recipes) out.set(r.id, r);
  for (const h of held(b)) for (const r of h.trait.recipes) if (!out.has(r.id)) out.set(r.id, r);
  return [...out.values()];
}

/**
 * Lo que sabés al empezar y no es una receta con ficha (la mecánica de autos de Mecánico, las temporadas de cultivo de
 * Granjero y Jardinero, los remedios herbales): de la profesión y de cada rasgo, una vez cada uno (por su nombre en
 * inglés, que es la clave del juego). Las fichas de rasgo y de profesión lo muestran igual, como texto.
 */
export function knownNotRecipes(b: Build): Loc[] {
  const out = new Map<string, Loc>();
  for (const k of professionOf(b).known ?? []) out.set(k.en, k);
  for (const h of held(b)) for (const k of h.trait.known ?? []) if (!out.has(k.en)) out.set(k.en, k);
  return [...out.values()];
}

// ---------- Cambios ----------

/**
 * Suma o saca un rasgo elegido. No suma uno que no se elige (de profesión, o que no existe): la UI los apaga, esto es
 * para que ningún camino los cuele.
 */
export function toggleTrait(b: Build, id: string): Build {
  if (b.traits.includes(id)) return { ...b, traits: b.traits.filter((x) => x !== id) };
  const t = findTrait(id);
  if (!t || !pickable(t)) return b;
  return { ...b, traits: [...b.traits, id] };
}

/**
 * Cambia la profesión y saca los rasgos elegidos que no se combinan con los que trae la nueva (o que ya trae), como
 * `onSelectProf`. Devuelve también cuáles sacó, para decirlo.
 */
export function pickProfession(b: Build, prof: string): { build: Build; dropped: string[] } {
  const next = findProfession(prof);
  if (!next) return { build: b, dropped: [] };
  const free = next.traits.map((r) => findTrait(r.id)).filter((t): t is Trait => !!t);
  const keep = b.traits.filter((id) => {
    const t = findTrait(id);
    return !t || !free.some((f) => f.id === t.id || excludes(f, t));
  });
  return { build: { prof: next.id, traits: keep }, dropped: b.traits.filter((id) => !keep.includes(id)) };
}

// ---------- La dirección ----------

/**
 * `?b=` corto y estable: el slug de la profesión y los de los rasgos elegidos, en orden alfabético y separados por un
 * punto (que la query no escapa y que ningún slug tiene). Slugs y no posiciones en una lista: un parche que agregue un
 * rasgo no le cambia el personaje a un link viejo.
 */
export const encode = (b: Build): string => [b.prof, ...[...new Set(b.traits)].sort()].join(".");

/**
 * El personaje de un `?b=`, o `null` si no se reconoce nada. Lo que no se conoce se descarta sin tirar el resto: una
 * profesión que no existe vuelve a Desempleado, y los rasgos que no existen, que no se eligen o que están repetidos no
 * entran. Los que no se combinan sí (el planificador lo avisa: el link dice qué armó alguien).
 */
export function decode(s: string): Build | null {
  const [head = "", ...rest] = s.trim().toLowerCase().split(".");
  const prof = findProfession(head);
  const traits = [...new Set(rest.filter((id) => !!findTrait(id)))].sort();
  const b = picked({ prof: prof?.id ?? DEFAULT_PROF, traits });
  if (!prof && !b.length) return null;
  return { prof: prof?.id ?? DEFAULT_PROF, traits: b.map((t) => t.id).sort() };
}

/** ¿Es el personaje de entrada? Ahí la dirección va limpia, sin `?b=`. */
export const isDefault = (b: Build): boolean => b.prof === DEFAULT_PROF && b.traits.length === 0;

/** Las profesiones como las lista el juego: Desempleado primero y el resto por nombre. */
export const professionsInOrder = (lang: "en" | "es", collator: Intl.Collator): Profession[] =>
  [...PROFESSIONS].sort((a, b) => (a.id === DEFAULT_PROF ? -1 : b.id === DEFAULT_PROF ? 1 : collator.compare(a[lang], b[lang])));

