import { useEffect, useReducer } from "react";
import catalogJson from "@deadlock/catalog.json";
import heroesJson from "@deadlock/heroes.json";
import { useLang, type Lang } from "./i18n";
import { text, type Localized } from "./catalog";

/**
 * La capa de datos de Deadlock: la tier list de héroes, por banda y por idioma.
 *
 * Mismo reparto que en TFT (`data.ts`) y por los mismos motivos, así que conviene
 * leerlo con eso al lado:
 *
 * - La banda por defecto viaja en el bundle con un import estático, para que el
 *   primer dibujo no necesite ninguna vuelta a la red. Las otras cuatro son
 *   `import()` y Vite las emite como chunks aparte — sólo se baja la que se mira.
 * - Los nombres se resuelven **en tiempo de render**, no de import. Resolverlos
 *   al importar es exactamente el bug que dejó el catálogo de TFT en inglés
 *   mientras el resto del sitio cambiaba de idioma.
 */

export type BandId = "phantom-above" | "archon-oracle" | "ritualist-emissary" | "arcanist-below";

/**
 * La tabla de bandas, copia de la del pipeline
 * (`games/deadlock/pipeline/src/bands.ts`), igual que `bands.ts` copia la de TFT.
 * `test/deadlock.test.ts` la compara contra la del pipeline, así que no pueden
 * divergir en silencio.
 */
export const BANDS: { id: BandId; tiers: number[] }[] = [
  { id: "phantom-above", tiers: [9, 10, 11] },
  { id: "archon-oracle", tiers: [7, 8] },
  { id: "ritualist-emissary", tiers: [5, 6] },
  { id: "arcanist-below", tiers: [0, 1, 2, 3, 4] },
];

/** Fantasma para arriba: donde empieza el juego que vale la pena mirar. */
export const PREFERRED_BAND: BandId = "phantom-above";

/**
 * La banda que la última corrida publicó sin sufijo — la que se ve sin elegir.
 *
 * **Se lee del archivo, no se asume.** Desde el reset de rangos del 2026-07-30 el
 * pipeline elige la banda por defecto según la muestra (`defaultBandFor`), porque
 * Fantasma+ quedó en cero partidas: el ladder nuevo topea la colocación en Oráculo
 * 6 y hay que escalar. Clavar "phantom-above" acá haría que el bundle registre los
 * datos de Arcón/Oráculo bajo la clave equivocada y la página abriría vacía.
 */
export const PUBLISHED_BAND: BandId = (heroesJson as unknown as HeroesFile).band as BandId;

/** True mientras lo publicado no sea todavía la banda que queremos. */
export const ON_FALLBACK_BAND = PUBLISHED_BAND !== PREFERRED_BAND;

interface RawHero {
  heroId: number;
  /** El denominador del pickrate. No se muestra: diría lo mismo sin normalizar. */
  matches: number;
  /** El estimado, encogido hacia 50% según cuánta muestra lo respalda. */
  winRate: number;
  /** Lo que midió sin encoger. */
  winRateRaw: number;
  pickRate: number;
  /** Cuánto mejor rinde arriba que abajo, en puntos. Positivo = premia saberlo. */
  skillGap?: number;
  /** Cuánto movió el parche su winrate, en puntos. */
  trend?: number;
  /** Cómo estaba antes del parche, para dibujar el "de → a". */
  winRateBefore?: number;
  pickRateBefore?: number;
  thinData?: boolean;
}

export interface HeroesFile {
  generatedAt: string;
  band: string;
  /** El parche que describe esta medición. */
  patch: { date: string; title: string; link: string };
  /** True cuando el parche es tan reciente que la muestra todavía es fina. */
  provisional?: boolean;
  matches: number;
  boards: number;
  from: string;
  to: string;
  heroes: RawHero[];
}

interface CatalogFile {
  heroes: Record<
    string,
    {
      name: Localized;
      img: string;
      card: string;
      /**
       * El color con el que el juego pinta a este héroe. Cadena vacía si el
       * catálogo publicado es anterior a que lo guardáramos, así que **siempre
       * hay que darle un color de respaldo** al usarlo.
       */
      color?: string;
    }
  >;
  ranks: {
    tier: number;
    name: Localized;
    img: string;
    /** Las seis insignias de subrango, de la I a la estrella. Indexadas desde 0. */
    subranks: string[];
    color: string;
  }[];
}

export const catalog = catalogJson as unknown as CatalogFile;

/**
 * Cuándo la brecha merece una etiqueta, en puntos de winrate.
 *
 * **La regla no es el número: es "cortar en el cuartil superior de la
 * distribución real".** Que la mayoría no tenga etiqueta es lo que hace que la
 * etiqueta signifique algo; un umbral más bajo pone un cartel en casi toda la
 * lista y el ojo deja de verlos.
 *
 * - **2026-07-29, ±2**: mediana +0,3, cuartiles −0,8 / +2,1, extremos +6,1
 *   (Vyper) y −4,1 (Paige). Etiquetaba 17 de 38.
 * - **2026-08-16, ±2,7**: la distribución se abrió con la muestra —mediana +0,5,
 *   cuartiles **−2 / +2,7**, extremos +5,3 y −9,2— y con el ±2 viejo la etiqueta
 *   se iba a **22 de 38, o sea la mayoría**, que es exactamente lo que el umbral
 *   existe para evitar. Con ±2,7 quedan **16 de 38**, el mismo 42% con el que se
 *   diseñó.
 *
 * **Hay un test que lo fija** (`deja sin etiqueta a la mayoría de la lista`), y
 * fue el que avisó: se puso en rojo solo cuando el dato nuevo cruzó la línea. Si
 * vuelve a fallar, **re-derivar el umbral del cuartil, no aflojar el test.**
 */
const DIFFICULTY_POINTS = 2.7;

/**
 * Cuándo la tendencia merece una etiqueta.
 *
 * ±1 punto, y con la misma lógica: la mediana del movimiento es 0 y los
 * cuartiles están en ±0,5, así que este corte marca **9 de 38**. Son los que de
 * verdad se movieron; el resto está donde estaba.
 */
const MOMENTUM_POINTS = 1;

/** Qué tan castigado está jugar mal a este héroe. `null` = ni una cosa ni la otra. */
export type Difficulty = "hard" | "easy" | null;

/** Hacia dónde va. `null` = se quedó donde estaba. */
export type Momentum = "up" | "down" | null;

/**
 * De la brecha al rótulo.
 *
 * Positivo significa que el héroe rinde mucho mejor arriba que abajo, y eso se
 * lee como **difícil**: hay algo que aprender y hasta que no lo aprendés no te
 * rinde. Negativo es lo inverso — funciona sin saber, y deja de funcionar cuando
 * el rival sí sabe.
 *
 * Es una lectura de la brecha, no la brecha misma, y por eso el número sigue en
 * el archivo y la explicación completa vive en el tooltip. La etiqueta simplifica
 * a propósito: quien mira una tier list quiere decidir a quién jugar, no
 * interpretar una resta.
 */
export const difficultyOf = (skillGap: number | undefined): Difficulty => {
  if (skillGap === undefined) return null;
  if (skillGap >= DIFFICULTY_POINTS) return "hard";
  if (skillGap <= -DIFFICULTY_POINTS) return "easy";
  return null;
};

/** De la tendencia al rótulo, con el mismo criterio. */
export const momentumOf = (trend: number | undefined): Momentum => {
  if (trend === undefined) return null;
  if (trend >= MOMENTUM_POINTS) return "up";
  if (trend <= -MOMENTUM_POINTS) return "down";
  return null;
};

/** Un héroe listo para dibujar: los números del pipeline más nombre e imagen. */
export interface Hero extends RawHero {
  name: string;
  img: string;
  card: string;
  /**
   * El color con el que el JUEGO pinta a este héroe, para teñir su tarjeta.
   *
   * Cadena vacía cuando el catálogo publicado todavía no lo trae, y las vistas
   * tienen que tratarlo como "usá el color del tema": es lo que hace que la
   * página no se rompa entre que sale este código y corre el catálogo.
   */
  color: string;
  /** "hard" / "easy" / null — la lectura de `skillGap` que va en pantalla. */
  difficulty: Difficulty;
  /** "up" / "down" / null — la lectura de `trend`. */
  momentum: Momentum;
  /**
   * La letra de tier. Sale de umbrales de winrate y no de cortar la lista en
   * quintiles: con 38 héroes, un corte por posición pondría en tiers distintos a
   * dos que están separados por dos décimas, y juntaría a otros dos separados
   * por cinco puntos.
   */
  tier: string;
}

/**
 * De winrate a letra.
 *
 * Los cortes son absolutos porque en un juego de dos equipos el winrate medio es
 * 50% por construcción: no hay que estimar dónde está el centro, se sabe. Un
 * héroe al 53% gana una partida más cada 33 que uno al 50%, y eso es lo que
 * separa a un S de un C.
 */
export function tierOf(winRate: number): string {
  if (winRate >= 0.53) return "S";
  if (winRate >= 0.515) return "A";
  if (winRate >= 0.5) return "B";
  if (winRate >= 0.485) return "C";
  return "D";
}

const files = new Map<BandId, HeroesFile>([[PUBLISHED_BAND, heroesJson as unknown as HeroesFile]]);

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  "phantom-above": () => import("@deadlock/heroes.phantom-above.json"),
  "archon-oracle": () => import("@deadlock/heroes.archon-oracle.json"),
  "ritualist-emissary": () => import("@deadlock/heroes.ritualist-emissary.json"),
  "arcanist-below": () => import("@deadlock/heroes.arcanist-below.json"),
};

export async function loadBand(band: BandId): Promise<void> {
  if (files.has(band)) return;
  const mod = await LOADERS[band]();
  files.set(band, mod.default as HeroesFile);
}

const cache = new Map<string, Hero[]>();

/** La tier list de una banda, con todo resuelto al idioma pedido. */
export function buildHeroes(band: BandId, lang: Lang): Hero[] {
  const efectiva = files.has(band) ? band : PUBLISHED_BAND;
  const key = `${efectiva}|${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const file = files.get(efectiva)!;
  const built = file.heroes.map((h) => {
    const entry = catalog.heroes[String(h.heroId)];
    return {
      ...h,
      // Sin entrada en el catálogo queda el id: es feo, pero es honesto y sólo
      // puede pasar si el juego suma un héroe entre dos corridas del catálogo.
      name: text(entry?.name, lang, `#${h.heroId}`),
      img: entry?.img ?? "",
      card: entry?.card ?? "",
      color: entry?.color ?? "",
      difficulty: difficultyOf(h.skillGap),
      momentum: momentumOf(h.trend),
      tier: tierOf(h.winRate),
    };
  });
  cache.set(key, built);
  return built;
}

export interface BandMeta {
  band: BandId;
  heroes: Hero[];
  file: HeroesFile;
}

/**
 * Los héroes que el parche movió más, para arriba y para abajo.
 *
 * Se ordena por cuánto se movió y no por winrate: la pregunta de esta sección es
 * "¿qué cambió?", que es distinta de "¿quién es mejor?" — la lista de arriba ya
 * contesta la segunda. Un héroe que estaba al 43% y subió tres puntos sigue
 * siendo malo, y aun así es la noticia del parche.
 */
export function patchMovers(heroes: Hero[], top = 5): { up: Hero[]; down: Hero[] } {
  const conCambio = heroes.filter((h) => h.trend !== undefined);
  const porCambio = [...conCambio].sort((a, b) => b.trend! - a.trend!);
  return {
    up: porCambio.filter((h) => h.trend! > 0).slice(0, top),
    down: porCambio.filter((h) => h.trend! < 0).reverse().slice(0, top),
  };
}

/** La tier list de una banda, o null mientras se está bajando. */
export function useHeroes(band: BandId): BandMeta | null {
  const { lang } = useLang();
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (files.has(band)) return;
    let alive = true;
    loadBand(band)
      .catch(() => undefined)
      .then(() => {
        if (alive) bump();
      });
    return () => {
      alive = false;
    };
  }, [band]);

  if (!files.has(band)) return null;
  return { band, heroes: buildHeroes(band, lang), file: files.get(band)! };
}

/** El nombre del rango tope de una banda, que es como se la etiqueta. */
export function bandRankName(band: BandId, lang: Lang): string {
  const tiers = BANDS.find((b) => b.id === band)?.tiers ?? [];
  const menor = Math.min(...tiers);
  const rank = catalog.ranks.find((r) => r.tier === menor);
  return text(rank?.name, lang, String(menor));
}

/** La insignia del rango más bajo de la banda, para dibujar el selector. */
export function bandBadge(band: BandId): { img: string; color: string } {
  const tiers = BANDS.find((b) => b.id === band)?.tiers ?? [];
  const rank = catalog.ranks.find((r) => r.tier === Math.min(...tiers));
  return { img: rank?.img ?? "", color: rank?.color ?? "" };
}

export interface BandCrest {
  badges: { img: string; name: Localized; color: string }[];
  /** "+" cuando la banda se abre hacia arriba, "−" cuando lo hace hacia abajo. */
  suffix: "+" | "−" | "";
}

/**
 * Cómo se dibuja una banda al lado de la letra de tier: con las insignias del
 * juego en vez de su nombre escrito.
 *
 * Una insignia se reconoce de un vistazo y el nombre hay que leerlo — y encima
 * "Fantasma+" no le dice nada a alguien que juega en inglés ni al revés. Las
 * bandas de dos rangos muestran las dos; las que se abren hacia un lado muestran
 * la del borde más un signo, porque cinco insignias en fila serían una cinta y
 * no un encabezado.
 *
 * El nombre viaja igual en el `alt` y en el `title`, así que no se pierde para
 * quien pasa el mouse ni para un lector de pantalla.
 */
export function bandCrest(band: BandId): BandCrest {
  const tiers = [...(BANDS.find((b) => b.id === band)?.tiers ?? [])].sort((a, b) => a - b);
  const rankAt = (t: number) => catalog.ranks.find((r) => r.tier === t);
  const crest = (t: number) => {
    const r = rankAt(t);
    return { img: r?.img ?? "", name: r?.name ?? { en: String(t), es: String(t) }, color: r?.color ?? "" };
  };

  if (tiers.length <= 2) return { badges: tiers.map(crest), suffix: "" };
  // Más de dos: la banda es un extremo abierto. Se muestra el borde por el que
  // se entra y un signo que dice para dónde sigue.
  const arriba = tiers[tiers.length - 1] === 11;
  return arriba
    ? { badges: [crest(tiers[0])], suffix: "+" }
    : { badges: [crest(tiers[tiers.length - 1])], suffix: "−" };
}
