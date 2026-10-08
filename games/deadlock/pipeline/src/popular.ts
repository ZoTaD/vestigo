import { fileURLToPath } from "node:url";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { avisar, heroesEnPartidas, isPlayable } from "./catalog";

/**
 * Los "objetos populares" de cada héroe, tal como los muestra la tienda del juego.
 *
 *   npm run build:popular
 *
 * Desde City Never Sleeps (2026-09-29) la tienda dice, para cada objeto, en qué
 * fase lo compra la gente con ese héroe ("Adquirido durante la fase media en el
 * 30 % de las partidas"). deadlock-api publica ese mismo dato en los assets de
 * héroes, campo `popular_items`, y **es del juego, no una medición nuestra**:
 * no hay que cruzarlo con el snapshot ni recalcularlo, sólo limpiarlo.
 *
 * Medido el 2026-09-29 sobre la respuesta real (65 héroes):
 *
 * - Lo traen **los 38 jugables y ninguno más**. Los seis nuevos (78, 84–88) llegan
 *   con `player_selectable: false` y sin el campo. Igual se filtra por
 *   `isPlayable`: el día que la API le ponga el dato a uno en pruebas, la ficha
 *   no tiene que aparecer.
 * - `pick_pct` y `winrate_pct` vienen **en 0–100**: pick entre 5,004 y 92,75
 *   (2.762 entradas; nada por debajo de 5, así que la API corta en 5 %) y
 *   winrate entre 39,5 y 70,4. Cada fase suma más de 100 porque es "en qué parte
 *   de las partidas se compró", no un reparto. Se publica en 0–1 como todas las
 *   tasas del sitio.
 * - Cada fase viene **en orden alfabético de `class_name`**, no por pick (las
 *   114 fases): el orden hay que ponerlo acá.
 * - El mismo `timestamp` en los 38 (1790702781 = 17:26:21 UTC) y ningún objeto
 *   repetido dentro de una fase. Un objeto sí aparece en varias fases: 20 de los
 *   40 de Infernus.
 * - Ningún objeto fuera de la tienda (los 156 del catálogo), pero se filtra
 *   igual: un objeto de Street Brawl (coste 9999) dibujaría una fila sin ficha.
 *
 * Dos salidas, con la misma lógica que el kit de héroes (`heroKit.ts`):
 *
 * - `data/popular/<id>.json`: un héroe. Cada página mira uno solo.
 * - `data/popular.json`: el índice chico. El guardián de publicación sólo compara
 *   los JSON de la raíz de `data/`, y es su `updatedAt` el que le avisa que la
 *   API recalculó.
 */

/**
 * De dónde se bajan los héroes, en orden de preferencia. Los mismos respaldos
 * que `heroKit.ts`: el 2026-09-22 `assets.deadlock-api.com` dejó de resolver por
 * DNS mientras `api.deadlock-api.com/v1/assets` contestaba lo mismo (y el
 * 2026-09-29 seguía sin resolver desde esta máquina).
 */
const HERO_URLS = ["https://assets.deadlock-api.com/v2/heroes", "https://api.deadlock-api.com/v1/assets/heroes"];
const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/popular.json`;
const OUT_HEROES = `${OUT_DIR}/popular`;
const CATALOG = `${OUT_DIR}/catalog.json`;

// ---------------------------------------------------------------- lo que manda la API

export interface RawPopularEntry {
  item_id: number;
  class_name?: string;
  pick_pct: number;
  winrate_pct: number;
}

export interface RawPopularItems {
  /** Segundos Unix de cuándo la API calculó la tabla. */
  timestamp?: number;
  early_game?: RawPopularEntry[];
  mid_game?: RawPopularEntry[];
  late_game?: RawPopularEntry[];
}

export interface RawPopularHero {
  id: number;
  name: string;
  player_selectable?: boolean;
  disabled?: boolean;
  in_development?: boolean;
  popular_items?: RawPopularItems | null;
}

// ---------------------------------------------------------------- lo que se publica

export type Phase = "early" | "mid" | "late";

export interface PopularEntry {
  itemId: number;
  /** En qué parte de las partidas con este héroe se compró en esta fase, 0–1. */
  pick: number;
  /** Cuánto ganaron esas partidas, 0–1. */
  winrate: number;
}

export interface PopularHero {
  heroId: number;
  /** Cuándo calculó la API la tabla (su `timestamp`), no cuándo la bajamos. */
  updatedAt: string;
  phases: Record<Phase, PopularEntry[]>;
}

export interface PopularIndex {
  generatedAt: string;
  /** El `updatedAt` más nuevo de los héroes. */
  updatedAt: string;
  heroes: number[];
}

const FASES: [Phase, Exclude<keyof RawPopularItems, "timestamp">][] = [
  ["early", "early_game"],
  ["mid", "mid_game"],
  ["late", "late_game"],
];

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * 100 si la respuesta viene en porcentaje, 1 si ya viene en fracción.
 *
 * Se decide sobre la respuesta entera y no entrada por entrada: la API corta en
 * 5 % (ver arriba), así que en 0–100 **todo** valor pasa de 1 y en 0–1 ninguno.
 * Mirar una entrada suelta confundiría un 0,9 % con un 90 %.
 */
const escala = (valores: number[]): number => (valores.some((v) => v > 1) ? 100 : 1);

/** Las entradas de todas las fases de todos los héroes, para medir la escala. */
const todas = (heroes: RawPopularHero[]): RawPopularEntry[] =>
  heroes.flatMap((h) => FASES.flatMap(([, k]) => h.popular_items?.[k] ?? []));

/**
 * Los objetos populares de cada héroe jugable, limpios y ordenados.
 *
 * Separado del `main` para que se pueda probar sin red. Un héroe sin `timestamp`
 * válido o al que la tienda le deja las tres fases vacías no se publica: una
 * ficha sin fecha o sin filas no dice nada.
 */
export function buildPopular(
  heroes: RawPopularHero[],
  shopItemIds: ReadonlySet<number>,
  enPartidas: ReadonlySet<number> = new Set()
): PopularHero[] {
  const jugables = heroes.filter((h) => isPlayable(h, enPartidas) && h.popular_items);
  const entradas = todas(jugables);
  const escPick = escala(entradas.map((e) => e.pick_pct));
  const escWin = escala(entradas.map((e) => e.winrate_pct));

  const out: PopularHero[] = [];
  for (const h of jugables) {
    const p = h.popular_items!;
    if (typeof p.timestamp !== "number" || !(p.timestamp > 0)) continue;
    const phases = Object.fromEntries(
      FASES.map(([fase, k]) => [
        fase,
        (p[k] ?? [])
          .filter((e) => shopItemIds.has(e.item_id) && Number.isFinite(e.pick_pct))
          // Por pick crudo y no por el redondeado, y el id desempata para que
          // dos corridas con los mismos números escriban el mismo archivo.
          .sort((a, b) => b.pick_pct - a.pick_pct || a.item_id - b.item_id)
          .map((e) => ({ itemId: e.item_id, pick: r3(e.pick_pct / escPick), winrate: r3(e.winrate_pct / escWin) })),
      ])
    ) as Record<Phase, PopularEntry[]>;
    if (FASES.every(([fase]) => phases[fase].length === 0)) continue;
    out.push({ heroId: h.id, updatedAt: new Date(p.timestamp * 1000).toISOString(), phases });
  }
  return out.sort((a, b) => a.heroId - b.heroId);
}

/** El índice: qué héroes tienen archivo y de cuándo es el dato más nuevo. */
export function popularIndex(heroes: PopularHero[], generatedAt: string): PopularIndex {
  return {
    generatedAt,
    // ISO en UTC con el mismo largo: el orden de texto es el orden de fecha.
    updatedAt: heroes.reduce((max, h) => (h.updatedAt > max ? h.updatedAt : max), ""),
    heroes: heroes.map((h) => h.heroId),
  };
}

async function fetchHeroes(): Promise<RawPopularHero[]> {
  let ultimo = "";
  for (const url of HERO_URLS) {
    try {
      // En inglés: los ids y los números son los mismos en los dos idiomas
      // (comparado el 2026-09-29) y acá no se publica ningún texto.
      const res = await fetch(`${url}?language=english`, { redirect: "follow" });
      if (res.ok) return (await res.json()) as RawPopularHero[];
      ultimo = `${url} contestó ${res.status}`;
    } catch (e) {
      ultimo = `${url}: ${e instanceof Error ? e.message : e}`;
    }
  }
  throw new Error(`no se pudieron bajar los héroes: ${ultimo}`);
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { items: Record<string, unknown> };
  const shop = new Set(Object.keys(catalog.items).map(Number));

  console.log("bajando los héroes de deadlock-api (popular_items)...");
  const heroes = await fetchHeroes();
  const popular = buildPopular(heroes, shop, heroesEnPartidas());
  // Sin datos no se borra lo publicado: si la API deja de mandar el campo, la
  // ficha se queda con lo último que hubo en vez de quedar vacía.
  if (popular.length === 0) throw new Error("la API no trajo popular_items para ningún héroe jugable");

  mkdirSync(OUT_HEROES, { recursive: true });
  // Un héroe que deja de ser jugable no debe dejar su archivo viejo servido.
  for (const f of readdirSync(OUT_HEROES)) rmSync(`${OUT_HEROES}/${f}`);
  for (const h of popular) writeFileSync(`${OUT_HEROES}/${h.heroId}.json`, JSON.stringify(h));
  const index = popularIndex(popular, new Date().toISOString());
  writeFileSync(OUT, JSON.stringify(index));

  const filas = popular.reduce((n, h) => n + h.phases.early.length + h.phases.mid.length + h.phases.late.length, 0);
  console.log(`  ${popular.length} héroes, ${filas} entradas, datos de ${index.updatedAt} → ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    avisar(`objetos populares: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
