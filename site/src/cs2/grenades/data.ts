/**
 * Los datos de la pestaña Granadas de CS2 (2026-11-04), que escribe `games/cs2/tools/lineups.py`: el índice de mapas
 * (`lineups/index.json`, liviano) y cada mapa en su archivo (`lineups/<mapa>.json`), que se baja recién al abrirlo.
 *
 * Coordenadas en píxeles del radar de 1024 × 1024 (`/cs2/radar/<mapa>.webp`); `floor` 1 es el radar de abajo (Nuke).
 */
import { once } from "../../zomboid/store";

type Mod<T> = { default: T };
export type GrenadeType = "smoke" | "molotov" | "flash" | "he";
export type Side = "t" | "ct";
/** Cómo se tira: parado, caminando o corriendo; agachado; con salto; y con qué clic. */
export type Tech = "stand" | "walk" | "run" | "crouch" | "jump" | "left" | "right" | "both";
/** Un texto en inglés y su traducción (null: sale en inglés en los dos idiomas). */
export type Txt = [string, string | null];

export interface Dest {
  id: string;
  name: Txt;
  x: number;
  y: number;
  floor: number;
}
export interface Lineup {
  id: string;
  type: GrenadeType;
  side: Side;
  title: Txt;
  /** Desde qué spawn ("T Spawn 3"), si la guía tiene una versión por spawn. */
  variant: string | null;
  desc: Txt | null;
  tech: Tech[];
  from: [number, number, number];
  to: [number, number, number];
  setpos: string;
  dest: number;
}
export interface MapLineups {
  map: string;
  name: string;
  floors: 1 | 2;
  dests: Dest[];
  lineups: Lineup[];
}
export interface MapRow {
  map: string;
  name: string;
  count: number;
  counts: Record<GrenadeType, number>;
}
export interface LineupIndex {
  source: string;
  radar: string;
  maps: MapRow[];
}

export const GRENADE_TYPES: GrenadeType[] = ["smoke", "molotov", "flash", "he"];

const index = once<LineupIndex>(() => import("@cs2/lineups/index.json") as Promise<Mod<unknown>>);
export const loadLineupIndex = () => index.load();
export const peekLineupIndex = () => index.peek() ?? undefined;

const files = import.meta.glob<Mod<MapLineups>>(["@cs2/lineups/*.json", "!@cs2/lineups/index.json"]);
/** Lo que ya llegó de cada mapa: el mapa, o `null` si la dirección nombra uno que no existe. */
const maps = new Map<string, MapLineups | null>();
const pending = new Map<string, Promise<MapLineups | null>>();
/** Un mapa (`null` si no existe). Si falla la red, la próxima llamada lo vuelve a pedir. */
export function loadMap(map: string): Promise<MapLineups | null> {
  let p = pending.get(map);
  if (!p) {
    // Se busca por el final de la clave, que depende de cómo resuelva Vite el alias.
    const key = Object.keys(files).find((k) => k.endsWith(`/lineups/${map}.json`));
    p = (key ? files[key]().then((m) => m.default) : Promise.resolve(null)).then(
      (v) => (maps.set(map, v), v),
      (err) => {
        pending.delete(map);
        throw err;
      },
    );
    pending.set(map, p);
  }
  return p;
}
/** El mapa si ya llegó (`null` si no existe), o `undefined` si todavía no. */
export const peekMap = (map: string): MapLineups | null | undefined => maps.get(map);

/** Lo que pide el prerender y la app antes de dibujar la pestaña: el índice y, con un mapa en la dirección, ese mapa. */
export async function preloadGrenades(detail: string | undefined): Promise<void> {
  await Promise.all([loadLineupIndex(), detail ? loadMap(detail) : null]);
}

/** El texto en el idioma de la página. */
export const tx = (t: Txt, lang: string): string => (lang === "es" && t[1]) || t[0];
