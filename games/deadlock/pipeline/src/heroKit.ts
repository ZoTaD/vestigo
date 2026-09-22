import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isPlayable, parseLoc, unidad, type TextSpan } from "./catalog";

/**
 * El kit de cada héroe: sus atributos base, su arma y sus cuatro habilidades,
 * tal como los publica el juego.
 *
 *   npm run build:hero-kit
 *
 * Alimenta la pestaña Héroes (la tabla que se ordena por columna) y la página
 * de cada héroe. **Nada de acá es una medición nuestra ni un texto nuestro**:
 * las cifras son los valores base del cliente, los textos son los del juego en
 * cada idioma y el agrupamiento de cada habilidad es el de su propia tarjeta
 * (`tooltip_details`). Es la misma regla que el catálogo de ítems — ver
 * `catalog.ts` — y por eso reusa su parser de texto.
 *
 * Dos salidas:
 *
 * - `data/hero-kit.json`: una fila por héroe con los números de la tabla. Chico
 *   (~15 KB) porque la tabla necesita los 38 a la vez.
 * - `data/hero-kit/<id>.json`: la página de un héroe (arte, textos, habilidades
 *   en los dos idiomas). Uno por héroe porque cada página mira uno solo: con un
 *   archivo único, abrir a Dínamo bajaría las habilidades de los otros 37.
 *
 * La fila lleva el `hash` de su archivo de detalle. El guardián de publicación
 * sólo compara los JSON de la raíz de `data/`, así que sin esto un cambio de
 * texto en una habilidad nunca se publicaría.
 */

/**
 * De dónde se bajan los assets, en orden de preferencia.
 *
 * El 2026-09-22 `assets.deadlock-api.com` dejó de resolver por DNS desde una
 * máquina mientras `api.deadlock-api.com/v1/assets` contestaba lo mismo. Probar
 * los dos cuesta un pedido fallido y evita que un problema de DNS deje la
 * pestaña sin actualizar.
 */
const ASSET_BASES = [
  { heroes: "https://assets.deadlock-api.com/v2/heroes", items: "https://assets.deadlock-api.com/v2/items" },
  { heroes: "https://api.deadlock-api.com/v1/assets/heroes", items: "https://api.deadlock-api.com/v1/assets/items" },
];
const LANGS = { en: "english", es: "spanish" } as const;
const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/hero-kit.json`;
const OUT_HEROES = `${OUT_DIR}/hero-kit`;

type Lang = keyof typeof LANGS;

// ---------------------------------------------------------------- lo que manda la API

interface RawStat {
  value?: number | string;
}

export interface RawHeroKit {
  id: number;
  name: string;
  player_selectable?: boolean;
  disabled?: boolean;
  in_development?: boolean;
  complexity?: number;
  tags?: string[];
  description?: { lore?: string; role?: string; playstyle?: string };
  images?: Record<string, string>;
  items?: Record<string, string>;
  starting_stats?: Record<string, RawStat>;
  standard_level_up_upgrades?: Record<string, number>;
}

export interface RawKitProperty {
  value?: number | string;
  label?: string;
  postfix?: string;
  icon?: string;
  css_class?: string;
  scale_function?: { specific_stat_scale_type?: string; stat_scale?: number };
}

interface RawKitPropertyRef {
  important_property?: string;
  status_effect_value?: string;
  important_property_icon?: string;
}

export interface RawAbility {
  id: number;
  class_name: string;
  name: string;
  type?: string;
  ability_type?: string;
  image?: string;
  image_webp?: string;
  videos?: { mp4?: string; webm?: string };
  description?: Record<string, string | undefined>;
  properties?: Record<string, RawKitProperty>;
  tooltip_details?: {
    info_sections?: {
      loc_string?: string;
      properties_block?: { loc_string?: string; properties?: RawKitPropertyRef[] }[];
      basic_properties?: string[];
    }[];
  };
  upgrades?: { property_upgrades?: { name: string; bonus: number | string }[] }[];
  weapon_info?: Record<string, number | undefined>;
}

// ---------------------------------------------------------------- lo que se publica

/** Una cifra de una habilidad, con la etiqueta y la unidad del juego. */
export interface KitStat {
  label: string;
  value: string;
  unit: string;
  /** URL del ícono con el que el juego acompaña esta cifra. */
  icon?: string;
  /**
   * Cuánto crece por cada punto de poder espiritual (`stat_scale`), cuando el
   * juego dice que escala con él. Pulsación Cinética: 115 de daño, ×1,55.
   */
  spirit?: number;
}

/** Un grupo de cifras con el rótulo que le pone el juego ("Al impactar:", "Pasiva:"). */
export interface KitGroup {
  label?: string;
  /** True cuando el juego rotula el grupo como pasivo. */
  passive?: true;
  stats: KitStat[];
}

/** Un bloque de la tarjeta de la habilidad: una frase, sus cifras y las básicas. */
export interface KitSection {
  text: TextSpan[];
  groups: KitGroup[];
  /** Alcance, radio, duración… las que el juego pone chicas abajo. */
  basics: KitStat[];
}

export interface KitAbility {
  id: number;
  /** 1 a 4, como las numera el juego. */
  slot: number;
  ultimate: boolean;
  name: string;
  img: string;
  video?: { mp4?: string; webm?: string };
  quip: TextSpan[];
  sections: KitSection[];
  cooldown?: KitStat;
  charges?: KitStat;
  /** Las tres mejoras, en orden. Una lista vacía si el juego no la describe. */
  upgrades: TextSpan[][];
}

export interface HeroText {
  role: string;
  playstyle: string;
  lore: string;
  tags: string[];
}

export interface HeroKitDetail {
  heroId: number;
  art: { card?: string; background?: string; vertical?: string };
  text: Record<Lang, HeroText>;
  abilities: Record<Lang, KitAbility[]>;
  /** Íconos de los atributos que nombra el texto, por clave (ver `parseLoc`). */
  icons: Record<string, string>;
}

export interface HeroWeapon {
  bulletDamage: number;
  /** Proyectiles por disparo: 1 en casi todos, 9 en una escopeta. */
  pellets: number;
  /** Disparos por segundo. */
  fireRate: number;
  dps: number;
  /** DPS contando la recarga. */
  sustainedDps: number;
  clip: number;
  reload: number;
  magazineDamage: number;
}

export interface HeroBaseStats {
  health: number;
  healthRegen: number;
  moveSpeed: number;
  sprintSpeed: number;
  stamina: number;
  lightMelee: number;
  heavyMelee: number;
  /** Lo que gana en cada bendición (subida de nivel). */
  perBoon: { bulletDamage: number; health: number; spiritPower: number; meleeDamage: number };
  weapon?: HeroWeapon;
}

export interface HeroKitRow {
  heroId: number;
  complexity?: number;
  stats: HeroBaseStats;
  /** Huella del archivo de detalle, para que el guardián vea sus cambios. */
  hash: string;
}

export interface HeroKitFile {
  generatedAt: string;
  heroes: Record<string, HeroKitRow>;
}

// ---------------------------------------------------------------- armado

const num = (v: number | string | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Redondeo para publicar: la API manda 62.973760932944614 y nadie lee eso. */
const r = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;

/** Un valor que no aporta nada: ausente, vacío o cero. */
const esCero = (v: number | string | undefined): boolean =>
  v === undefined || v === null || String(v).trim() === "" || parseFloat(String(v)) === 0;

/** Los atributos base y el arma. Lo que la tabla ordena. */
export function buildBaseStats(hero: RawHeroKit, weapon: RawAbility | undefined): HeroBaseStats {
  const s = hero.starting_stats ?? {};
  const up = hero.standard_level_up_upgrades ?? {};
  const w = weapon?.weapon_info;
  return {
    health: num(s.max_health?.value),
    healthRegen: num(s.base_health_regen?.value),
    moveSpeed: num(s.max_move_speed?.value),
    sprintSpeed: num(s.sprint_speed?.value),
    stamina: num(s.stamina?.value),
    lightMelee: num(s.light_melee_damage?.value),
    heavyMelee: num(s.heavy_melee_damage?.value),
    perBoon: {
      bulletDamage: r(num(up.MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL), 3),
      health: num(up.MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL),
      spiritPower: num(up.MODIFIER_VALUE_TECH_POWER),
      meleeDamage: r(num(up.MODIFIER_VALUE_BASE_MELEE_DAMAGE_FROM_LEVEL), 3),
    },
    ...(w && num(w.bullet_damage) > 0
      ? {
          weapon: {
            bulletDamage: r(num(w.bullet_damage)),
            pellets: num(w.bullets) || 1,
            fireRate: r(num(w.shots_per_second)),
            dps: r(num(w.damage_per_second), 1),
            sustainedDps: r(num(w.damage_per_second_with_reload), 1),
            clip: num(w.clip_size),
            reload: r(num(w.reload_duration)),
            magazineDamage: r(num(w.damage_per_magazine), 1),
          },
        }
      : {}),
  };
}

/** Una cifra de la tarjeta, o nada si el juego no la muestra o vale cero. */
export function kitStat(
  props: Record<string, RawKitProperty>,
  key: string,
  ref: RawKitPropertyRef = {}
): KitStat | undefined {
  // Los efectos de estado ("StatusEffectStun") no son una propiedad: apuntan a
  // la que tiene su duración. Si no hay ninguna, el efecto ya está nombrado en
  // la frase y una cifra sin número no dice nada.
  const p = props[key] ?? (ref.status_effect_value ? props[ref.status_effect_value] : undefined);
  if (!p || esCero(p.value)) return undefined;
  const label = (p.label ?? "").replace(/<[^>]*>/g, "").trim();
  if (!label) return undefined;
  const scale = p.scale_function;
  return {
    label,
    ...unidad(String(p.value), p.postfix),
    ...(ref.important_property_icon || p.icon ? { icon: ref.important_property_icon ?? p.icon } : {}),
    ...(scale?.specific_stat_scale_type === "ETechPower" && scale.stat_scale
      ? { spirit: scale.stat_scale }
      : {}),
  };
}

/**
 * El texto de una mejora.
 *
 * El juego la describe con una frase (`t1_desc`) en 63 de las 152 habilidades.
 * En las demás sólo manda qué propiedad cambia y cuánto, y la frase se arma con
 * **la etiqueta de esa propiedad en ese idioma**: "+6m Cast Range",
 * "+6m Alcance de lanzamiento". Una propiedad sin etiqueta se saltea en vez de
 * inventarle nombre.
 */
export function upgradeText(
  ability: RawAbility,
  tier: number,
  icons: Map<string, string>
): TextSpan[] {
  const frase = ability.description?.[`t${tier + 1}_desc`];
  if (frase) return parseLoc(frase, icons);

  const props = ability.properties ?? {};
  const partes = (ability.upgrades?.[tier]?.property_upgrades ?? []).flatMap(({ name, bonus }) => {
    const p = props[name];
    const label = (p?.label ?? "").replace(/<[^>]*>/g, "").trim();
    if (!p || !label || esCero(bonus)) return [];
    const { value, unit } = unidad(String(bonus), p.postfix);
    const signo = value.startsWith("-") ? "" : "+";
    return [`${signo}${value}${unit} ${label}`];
  });
  return partes.length > 0 ? [{ t: partes.join(" · "), hi: true }] : [];
}

/**
 * Una habilidad armada como su tarjeta.
 *
 * `rotulosEn` son los rótulos de grupo en inglés, para marcar la pasiva en el
 * idioma que sea: el español dice "Pasiva:" y el inglés "Passive:", y comparar
 * contra una palabra por idioma sería mantener un diccionario a mano.
 */
export function buildAbility(
  ability: RawAbility,
  slot: number,
  icons: Map<string, string>,
  rotulosEn?: (string | undefined)[][]
): KitAbility {
  const props = ability.properties ?? {};
  const sections: KitSection[] = (ability.tooltip_details?.info_sections ?? []).map((sec, si) => {
    const groups: KitGroup[] = (sec.properties_block ?? [])
      .map((block, bi) => {
        const stats = (block.properties ?? []).flatMap((ref) => {
          const st = ref.important_property ? kitStat(props, ref.important_property, ref) : undefined;
          return st ? [st] : [];
        });
        const label = block.loc_string?.trim() || undefined;
        const en = rotulosEn?.[si]?.[bi] ?? block.loc_string;
        return {
          ...(label ? { label } : {}),
          ...(en && /passive/i.test(en) ? { passive: true as const } : {}),
          stats,
        };
      })
      // Un grupo sin cifras es un rótulo solo: "Al impactar:" de Pulsación
      // Cinética no tiene nada hasta la mejora T2, que lo cuenta en su texto.
      .filter((g) => g.stats.length > 0);
    const basics = (sec.basic_properties ?? []).flatMap((k) => {
      const st = kitStat(props, k);
      return st ? [st] : [];
    });
    return { text: parseLoc(sinTeclaDibujada(sec.loc_string), icons), groups, basics };
  });

  const cooldown = kitStat(props, "AbilityCooldown");
  const charges = kitStat(props, "AbilityCharges");
  const img = ability.image_webp ?? ability.image ?? "";
  return {
    id: ability.id,
    slot,
    ultimate: ability.ability_type === "ultimate",
    name: ability.name,
    img,
    ...(ability.videos?.mp4 || ability.videos?.webm
      ? { video: { ...(ability.videos.mp4 ? { mp4: ability.videos.mp4 } : {}), ...(ability.videos.webm ? { webm: ability.videos.webm } : {}) } }
      : {}),
    quip: parseLoc(ability.description?.quip, icons),
    sections: sections.filter((s) => s.text.length > 0 || s.groups.length > 0 || s.basics.length > 0),
    ...(cooldown ? { cooldown } : {}),
    // Una sola carga es lo normal; sólo se dice cuando hay más de una.
    ...(charges && num(charges.value) > 1 ? { charges } : {}),
    upgrades: [0, 1, 2].map((t) => upgradeText(ability, t, icons)),
  };
}

/**
 * Saca el ícono de tecla que el juego dibuja adentro de la frase.
 *
 * Entrelazamiento Cuántico dice "[ícono]: Llévate contigo a los aliados": el
 * ícono es un `<svg>` suelto dentro de un resaltado y no hay texto que lo
 * reemplace, así que al descartarlo quedaba ": Llévate…" colgando. Se va el
 * ícono con sus dos puntos. Medido: es la única frase de las 152 que lo hace.
 */
export const sinTeclaDibujada = (raw: string | undefined): string | undefined =>
  raw?.replace(/<span class="highlight">\s*<svg[\s\S]*?<\/svg>\s*<\/span>\s*:?\s*/g, "");

const rotulos = (a: RawAbility): (string | undefined)[][] =>
  (a.tooltip_details?.info_sections ?? []).map((s) => (s.properties_block ?? []).map((b) => b.loc_string));

const textoDe = (h: RawHeroKit): HeroText => ({
  role: (h.description?.role ?? "").trim(),
  playstyle: (h.description?.playstyle ?? "").trim(),
  lore: (h.description?.lore ?? "").replace(/\r/g, "").trim(),
  tags: h.tags ?? [],
});

const huella = (x: unknown): string => createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 12);

/**
 * Cruza las cuatro descargas (héroes e ítems en dos idiomas).
 *
 * Separado del `main` para que se pueda probar sin red.
 */
export function buildHeroKit(
  heroes: Record<Lang, RawHeroKit[]>,
  items: Record<Lang, RawAbility[]>,
  generatedAt: string
): { file: HeroKitFile; details: HeroKitDetail[] } {
  const porClase = {
    en: new Map(items.en.map((i) => [i.class_name, i])),
    es: new Map(items.es.map((i) => [i.class_name, i])),
  };
  const esHero = new Map(heroes.es.map((h) => [h.id, h]));

  const rows: Record<string, HeroKitRow> = {};
  const details: HeroKitDetail[] = [];

  for (const h of heroes.en.filter(isPlayable)) {
    const hEs = esHero.get(h.id) ?? h;
    const icons = new Map<string, string>();
    const abilities: Record<Lang, KitAbility[]> = { en: [], es: [] };

    for (let slot = 1; slot <= 4; slot++) {
      const clase = h.items?.[`signature${slot}`];
      const en = clase ? porClase.en.get(clase) : undefined;
      if (!en) continue;
      const es = porClase.es.get(clase!) ?? en;
      abilities.en.push(buildAbility(en, slot, icons));
      abilities.es.push(buildAbility(es, slot, icons, rotulos(en)));
    }

    const img = h.images ?? {};
    const detail: HeroKitDetail = {
      heroId: h.id,
      art: {
        ...(img.icon_hero_card_webp || img.icon_hero_card ? { card: img.icon_hero_card_webp ?? img.icon_hero_card } : {}),
        ...(img.background_image_webp || img.background_image
          ? { background: img.background_image_webp ?? img.background_image }
          : {}),
        ...(img.top_bar_vertical_image_webp || img.top_bar_vertical_image
          ? { vertical: img.top_bar_vertical_image_webp ?? img.top_bar_vertical_image }
          : {}),
      },
      text: { en: textoDe(h), es: textoDe(hEs) },
      abilities,
      icons: Object.fromEntries(icons),
    };
    const weapon = h.items?.weapon_primary ? porClase.en.get(h.items.weapon_primary) : undefined;
    rows[String(h.id)] = {
      heroId: h.id,
      ...(h.complexity ? { complexity: h.complexity } : {}),
      stats: buildBaseStats(h, weapon),
      hash: huella(detail),
    };
    details.push(detail);
  }

  return { file: { generatedAt, heroes: rows }, details };
}

async function fetchAssets<T>(kind: "heroes" | "items", lang: Lang): Promise<T> {
  let ultimo = "";
  for (const base of ASSET_BASES) {
    try {
      const res = await fetch(`${base[kind]}?language=${LANGS[lang]}`, { redirect: "follow" });
      if (res.ok) return (await res.json()) as T;
      ultimo = `${base[kind]} contestó ${res.status}`;
    } catch (e) {
      ultimo = `${base[kind]}: ${e instanceof Error ? e.message : e}`;
    }
  }
  throw new Error(`no se pudieron bajar los ${kind} (${lang}): ${ultimo}`);
}

async function main() {
  console.log("bajando héroes e ítems de deadlock-api (english, spanish)...");
  const [hEn, hEs, iEn, iEs] = await Promise.all([
    fetchAssets<RawHeroKit[]>("heroes", "en"),
    fetchAssets<RawHeroKit[]>("heroes", "es"),
    fetchAssets<RawAbility[]>("items", "en"),
    fetchAssets<RawAbility[]>("items", "es"),
  ]);
  const { file, details } = buildHeroKit({ en: hEn, es: hEs }, { en: iEn, es: iEs }, new Date().toISOString());

  mkdirSync(OUT_HEROES, { recursive: true });
  // Un héroe que deja de ser jugable no debe dejar su página vieja servida.
  for (const f of readdirSync(OUT_HEROES)) rmSync(`${OUT_HEROES}/${f}`);
  for (const d of details) writeFileSync(`${OUT_HEROES}/${d.heroId}.json`, JSON.stringify(d));
  writeFileSync(OUT, JSON.stringify(file));

  const habilidades = details.flatMap((d) => d.abilities.en);
  const sinMejora = habilidades.filter((a) => a.upgrades.some((u) => u.length === 0)).length;
  console.log(
    `  ${details.length} héroes, ${habilidades.length} habilidades ` +
      `(${habilidades.filter((a) => a.video).length} con video, ${sinMejora} con alguna mejora sin texto) → ${OUT}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
