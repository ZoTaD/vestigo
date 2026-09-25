/**
 * Datos del árbol de pasivas de PoE2 (2026-09-25).
 *
 * `games/poe2/data/tree/` lo escribe `games/poe2/pipeline/tree.py` con el export
 * oficial de GGG y los textos del juego. La geometría es la misma en los dos
 * idiomas; los nombres y efectos van aparte y se pide sólo el del idioma.
 * Todo se pide al abrir la pestaña: son ~1,5 MB que el resto del sitio no usa.
 */
import type { Lang } from "../i18n";

export type Kind = "start" | "asc-start" | "keystone" | "jewel" | "notable" | "attr" | "small";

export interface TreeNode {
  x: number;
  y: number;
  k: Kind;
  /** Grupo y órbita: dos nodos del mismo grupo y órbita se unen con un arco. */
  g: number;
  o: number;
  /** Id de texto del export, el que usa el `.build` del juego. */
  gid: string;
  ic?: string;
  /** Ascendencia a la que pertenece. */
  a?: string;
  /** Puntos de pasiva que da al tomarlo (algunas ascendencias). */
  pp?: number;
  /** Índices de clase del export que empiezan acá. */
  cs?: number[];
  /** Sólo se toma con esa ascendencia y esos nodos (el árbol de la Oráculo). */
  uc?: { a: string | null; n: string[] };
  /** Opción de una elección múltiple: el id del padre. */
  mc?: string;
  /** La conexión no se dibuja. */
  hc?: 1;
}

export interface Sheet {
  file: string;
  w: number;
  h: number;
  scale: number;
  frames: Record<string, [number, number, number, number]>;
}

export interface AscInfo {
  id: string;
  /** Cuadro del arte de la clase (`Class1`…). */
  art: number;
  /** Centro y radio del círculo; sin esto, la ascendencia todavía no salió. */
  c?: [number, number, number];
}

export interface ClassInfo {
  en: string;
  start: string;
  asc: AscInfo[];
  attr: [number, number, number];
}

export interface Tree {
  version: string;
  export: string;
  bounds: [number, number, number, number];
  classes: ClassInfo[];
  groups: Record<string, [number, number]>;
  /** Dibujo de fondo de un grupo: [x, y, grupo, cuadro de `mastery-effect-*`]. */
  masteries: [number, number, number, string][];
  nodes: Record<string, TreeNode>;
  edges: [string, string][];
  sprites: Record<string, Sheet>;
}

export interface Texts {
  /** id → [nombre, efectos] */
  nodes: Record<string, [string, string[]]>;
  /** Clases y ascendencias por id ("Ranger", "Ranger1"). */
  names: Record<string, string>;
}

const files = import.meta.glob<{ default: unknown }>("@poe2/tree/*.json");
const pending = new Map<string, Promise<unknown>>();

function load<T>(name: string): Promise<T> {
  let p = pending.get(name);
  if (!p) {
    const key = Object.keys(files).find((k) => k.endsWith(`/${name}.json`));
    if (!key) return Promise.reject(new Error(`sin ${name}`));
    p = files[key]().then((m) => m.default);
    pending.set(name, p);
  }
  return p as Promise<T>;
}

export const loadTree = () => load<Tree>("tree");
export const loadTexts = (lang: Lang) => load<Texts>(`tree.${lang}`);
/** slug de la enciclopedia → id de metadata de la gema. */
export const loadGemIds = () => load<Record<string, string>>("gems");

/** Dónde se sirven los sprites (los copia el pipeline a `public/poe2/tree/`). */
export const spriteUrl = (file: string) => `/poe2/tree/${file}`;
