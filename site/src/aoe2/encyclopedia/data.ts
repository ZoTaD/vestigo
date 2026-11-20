/**
 * Los datos de la enciclopedia de AoE2 (2026-11-21), generados por `games/aoe2/tools/encyclopedia.py` desde el juego.
 * Cada archivo viaja en su chunk (regla 4) y se pide una vez; `peek*` devuelve lo ya cargado para que el prerender dibuje
 * la página entera. La ayuda va partida por idioma y por id (`help/<idioma>/<id % 8>.json`) y cada civ en su archivo.
 */
import type { Lang } from "../../i18n";
import type { Fx } from "./calc";

export type Nombre = { en: string; es: string };
export type Unidad = {
  id: number;
  slug: string;
  name: Nombre;
  pic: number;
  age: number;
  building: number;
  kind: "Unit" | "UnitUpgrade" | "UniqueUnit" | "RegionalUnit";
  class: number;
  line: number[];
  trigger: number;
  hp: number;
  los: number;
  speed: number;
  range: number;
  minRange: number;
  reload: number;
  accuracy: number;
  projectiles: number;
  attacks: [number, number][];
  armors: [number, number][];
  cost: Partial<Record<Recurso, number>>;
  time: number;
  naval: boolean;
  good: number[];
  bad: number[];
  upgrades: number[];
};
export type Tecnologia = {
  id: number;
  slug: string;
  name: Nombre;
  pic: number;
  age: number;
  building: number;
  kind: "Research" | "UniqueTech" | "RegionalTech";
  cost: Partial<Record<Recurso, number>>;
  time: number;
  units: number[];
  fx: Fx[];
};
export type Edificio = { id: number; slug: string; name: Nombre; pic: number; age: number };
export type Recurso = "food" | "wood" | "gold" | "stone";
export type Unidades = { classes: Record<string, Nombre>; units: Unidad[] };
/** Estado de cada nodo por civ: "1" disponible, "2" disponible con una tecnología antes, "0" no la tiene. */
export type Arbol = { buildings: Edificio[]; nodes: string[]; civs: Record<string, string> };
export type CivFx = Record<string, { bonus: [number, Fx[]][]; team: Fx[] }>;
type Chico = { id: number; slug: string; name: Nombre; pic: number };
export type CivInfo = {
  desc: Record<Lang, { kind: string; bonuses: string[]; team: string }>;
  uu: Chico[];
  ut: Chico[];
  missU: Chico[];
  missT: Chico[];
};
export type Ayuda = { u: Record<string, string[]>; t: Record<string, string[]> };

function cache<T>(cargar: () => Promise<T>) {
  let v: T | undefined;
  let p: Promise<T> | null = null;
  return {
    load: (): Promise<T> => (p ??= cargar().then((x) => (v = x))),
    peek: (): T | undefined => v,
  };
}

export const unidades = cache(() => import("@aoe2/encyclopedia/units.json").then((m) => m.default as unknown as Unidades));
export const tecnologias = cache(() => import("@aoe2/encyclopedia/techs.json").then((m) => m.default as unknown as Tecnologia[]));
export const arbol = cache(() => import("@aoe2/encyclopedia/tree.json").then((m) => m.default as unknown as Arbol));
export const civFx = cache(() => import("@aoe2/encyclopedia/civfx.json").then((m) => m.default as unknown as CivFx));

const AYUDAS = import.meta.glob<{ default: Ayuda }>("../../../../games/aoe2/data/encyclopedia/help/*/*.json");
const CIVS = import.meta.glob<{ default: CivInfo }>("../../../../games/aoe2/data/encyclopedia/civ/*.json");
const PARTES = 8;
const ayudas = new Map<string, Ayuda | null>();
const civs = new Map<string, CivInfo | null>();
const ruta = (dir: string, nombre: string) => `../../../../games/aoe2/data/encyclopedia/${dir}/${nombre}.json`;

const parteDe = (lang: Lang, id: number) => `${lang}/${id % PARTES}`;
/** La ayuda (descripción) de una unidad o tecnología, del pedazo de su id. */
export async function loadAyuda(lang: Lang, id: number): Promise<Ayuda | null> {
  const k = parteDe(lang, id);
  if (!ayudas.has(k)) {
    const f = AYUDAS[ruta("help", k)];
    ayudas.set(k, f ? await f().then((m) => m.default).catch(() => null) : null);
  }
  return ayudas.get(k) ?? null;
}
export const peekAyuda = (lang: Lang, id: number): Ayuda | null | undefined => ayudas.get(parteDe(lang, id));

export async function loadCivInfo(slug: string): Promise<CivInfo | null> {
  if (!civs.has(slug)) {
    const f = CIVS[ruta("civ", slug)];
    civs.set(slug, f ? await f().then((m) => m.default).catch(() => null) : null);
  }
  return civs.get(slug) ?? null;
}
export const peekCivInfo = (slug: string): CivInfo | null | undefined => civs.get(slug);

/** Lo que el prerender (y el primer dibujo en el navegador) tiene que esperar para una ruta de la enciclopedia. */
export async function preloadEncyclopedia(route: { a2Section?: string; detail?: string; lang?: Lang }): Promise<void> {
  const sec = route.a2Section;
  const lang: Lang = route.lang === "es" ? "es" : "en";
  if (sec === "units" || sec === "calculator") {
    const u = await unidades.load();
    await arbol.load();
    if (sec === "calculator") await Promise.all([tecnologias.load(), civFx.load()]);
    const x = route.detail ? u.units.find((f) => f.slug === route.detail) : undefined;
    if (x) await Promise.all([loadAyuda(lang, x.id), tecnologias.load()]);
  } else if (sec === "technologies") {
    const t = await tecnologias.load();
    await Promise.all([arbol.load(), unidades.load()]);
    const x = route.detail ? t.find((f) => f.slug === route.detail) : undefined;
    if (x) await loadAyuda(lang, x.id);
  } else if (sec === "tech-tree") {
    await Promise.all([arbol.load(), unidades.load(), tecnologias.load()]);
  } else if (sec === "civilizations" && route.detail) {
    await loadCivInfo(route.detail);
  }
}

/** Las civs (slug) que tienen un nodo del árbol: `u38` (unidad), `t22` (tecnología) o `b101` (edificio). */
export function civsCon(a: Arbol, nodo: string): string[] {
  const i = a.nodes.indexOf(nodo);
  if (i < 0) return [];
  return Object.entries(a.civs)
    .filter(([, s]) => s[i] !== "0")
    .map(([c]) => c);
}

/** El estado de un nodo para una civ: "1", "2" o "0" (también "0" si el nodo no está en el árbol). */
export function estado(a: Arbol, civ: string, nodo: string): "0" | "1" | "2" {
  const i = a.nodes.indexOf(nodo);
  const s = a.civs[civ];
  return i < 0 || !s ? "0" : (s[i] as "0" | "1" | "2");
}

export const EDAD_ES = ["", "Edad Oscura", "Edad Feudal", "Edad de los Castillos", "Edad Imperial"];
export const EDAD_EN = ["", "Dark Age", "Feudal Age", "Castle Age", "Imperial Age"];
export const edad = (lang: Lang, n: number) => (lang === "es" ? EDAD_ES : EDAD_EN)[n] ?? "";
export const RECURSOS: Recurso[] = ["food", "wood", "gold", "stone"];
