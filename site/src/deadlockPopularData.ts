import { createContext, useContext, useEffect, useReducer } from "react";

/**
 * Los "objetos populares" de cada héroe, los de la tienda del juego (2026-09-29).
 *
 * Desde City Never Sleeps la tienda dice, para cada objeto, en qué fase lo
 * compra la gente con ese héroe: "Adquirido durante la fase media en el 30 % de
 * las partidas". El pipeline (`popular.ts`) baja ese mismo dato de deadlock-api
 * y lo publica en `popular/<id>.json`, un archivo por héroe porque cada ficha
 * mira uno solo.
 *
 * Es un dato del juego, no una medición nuestra: acá sólo se carga y se ordena.
 */

// ---------------------------------------------------------------- tipos publicados

export type PopularPhase = "early" | "mid" | "late";

export interface PopularEntry {
  itemId: number;
  /** En qué parte de las partidas con este héroe se compró en esta fase, 0–1. */
  pick: number;
  /** Cuánto ganaron esas partidas, 0–1. */
  winrate: number;
}

export interface PopularHero {
  heroId: number;
  /** Cuándo calculó la API la tabla, no cuándo la bajamos. */
  updatedAt: string;
  /** Cada fase ordenada por `pick`, de mayor a menor. */
  phases: Record<PopularPhase, PopularEntry[]>;
}

export interface PopularIndex {
  generatedAt: string;
  updatedAt: string;
  heroes: number[];
}

/** La fase en la que más se compra un objeto, para la línea verde de la ficha. */
export interface PopularOf {
  phase: PopularPhase;
  pick: number;
}

const FASES: readonly PopularPhase[] = ["early", "mid", "late"];

// ---------------------------------------------------------------- cargas

/**
 * Un archivo por héroe, con la ruta relativa y no con el alias: `import.meta.glob`
 * necesita ver el directorio para partirlo en un chunk por archivo (igual que
 * `hero-kit/` en `deadlockHeroKitData.ts`).
 */
const FILES = import.meta.glob<{ default: PopularHero }>("../../games/deadlock/data/popular/*.json");
const cargados = new Map<number, PopularHero | null>();
const pidiendo = new Map<number, Promise<PopularHero | null>>();
/** `bestPhases` de cada héroe cargado, armado la primera vez que se pregunta. */
const mejores = new Map<number, Map<number, PopularOf>>();

export function loadPopular(heroId: number): Promise<PopularHero | null> {
  const hit = pidiendo.get(heroId);
  if (hit) return hit;
  const key = Object.keys(FILES).find((k) => k.endsWith(`/popular/${heroId}.json`));
  const p = (key ? FILES[key]().then((m) => m.default).catch(() => null) : Promise.resolve(null)).then((h) => {
    cargados.set(heroId, h);
    return h;
  });
  pidiendo.set(heroId, p);
  return p;
}

/**
 * Los objetos populares de un héroe: `undefined` mientras baja, `null` si no
 * hay héroe o ese héroe no tiene archivo.
 */
export function usePopular(heroId: number | null): PopularHero | null | undefined {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const listo = heroId === null || cargados.has(heroId);
  useEffect(() => {
    if (listo || heroId === null) return;
    let alive = true;
    loadPopular(heroId).then(() => {
      if (alive) bump();
    });
    return () => {
      alive = false;
    };
  }, [heroId, listo]);
  if (heroId === null) return null;
  return cargados.has(heroId) ? cargados.get(heroId) : undefined;
}

// ---------------------------------------------------------------- lectura

/**
 * Para cada objeto, la fase en la que más se compra.
 *
 * Un objeto aparece en varias fases (20 de los 40 de Infernus el 2026-09-29):
 * la Extensión Arcana se compra en el 7 % de las partidas en la fase temprana y
 * en el 53 % en la media, y la línea de la ficha tiene que decir "media". En un
 * empate gana la fase más temprana, que es cuando se compra primero.
 */
export function bestPhases(hero: PopularHero): Map<number, PopularOf> {
  const out = new Map<number, PopularOf>();
  for (const phase of FASES) {
    for (const e of hero.phases[phase] ?? []) {
      const prev = out.get(e.itemId);
      if (!prev || e.pick > prev.pick) out.set(e.itemId, { phase, pick: e.pick });
    }
  }
  return out;
}

/**
 * La fase donde un objeto tiene más pick para ese héroe, o `null` si el héroe
 * no está cargado (ver `usePopular`) o el objeto no figura entre sus populares.
 */
export function popularOf(heroId: number, itemId: number): PopularOf | null {
  const hero = cargados.get(heroId);
  if (!hero) return null;
  let m = mejores.get(heroId);
  if (!m) mejores.set(heroId, (m = bestPhases(hero)));
  return m.get(itemId) ?? null;
}

/**
 * El héroe de la página, para que la ficha de un objeto diga cuánto lo compra
 * ese héroe (la línea verde del juego). Lo ponen la página de build y la ficha
 * del héroe; los portales de React lo heredan, así que llega también a la
 * ficha flotante.
 */
export const PopularHeroContext = createContext<number | null>(null);

/** La fase y el pick del objeto para el héroe de la página, o null. */
export function usePopularOf(itemId: number): PopularOf | null {
  const heroId = useContext(PopularHeroContext);
  const hero = usePopular(heroId);
  return heroId !== null && hero ? popularOf(heroId, itemId) : null;
}
