import { useEffect, useReducer } from "react";
import { useLang, type Lang } from "./i18n";
import { text, type Localized } from "./catalog";
import { catalog, type BandId } from "./deadlockData";
import type { Item } from "./deadlockItemsData";

/**
 * La capa de datos de las builds por héroe.
 *
 * **El archivo NO viaja en el bundle**, y ahí se separa de héroes e ítems. Allá
 * el import estático existe para que el primer dibujo no pida red; acá nadie ve
 * una build sin antes apretar un héroe, así que se baja en ese click. Medido con
 * la versión anterior: con import estático el bundle principal pasaba de 1.280 a
 * 1.726 KB, y eso lo paga todo el que entra al sitio.
 *
 * Los nombres se resuelven **en tiempo de render**, no de import — resolverlos al
 * importar es el bug que dejó el catálogo de TFT en inglés durante meses.
 */

export interface RawBuildItem {
  itemId: number;
  tier: 1 | 2 | 3 | 4;
  /** Minuto mediano en que entra. */
  minute: number;
  /** Aporte medido contra quien llegó al mismo punto de la partida. */
  edge: number;
  /** Qué fracción de las builds del grupo lo lleva. */
  prevalence: number;
  /**
   * True cuando su aporte está entre el cuarto más alto de toda la corrida.
   *
   * Los doce cuadrados salen por prevalencia —lo que la gente compra—, así que
   * esta marca es lo único que distingue **lo que carga la build** de lo que va
   * de paseo. Se marca en vez de reordenar a propósito: una build ordenada por
   * aporte dejaría de ser la build que se juega.
   */
  carries?: boolean;
  /** El camino de mejora, de la raíz al ítem. */
  chain: number[];
}

export interface RawBuild {
  id: string;
  damage: "weapon" | "spirit" | "vitality";
  trait: "vampiric" | "survival" | "dps";
  aroundAbility?: number;
  matches: number;
  winRate: number;
  /** Peso medio del arquetipo entre su gente, de 0 a 1. */
  commitment?: number;
  items: RawBuildItem[];
  /** La misma build partida por escalón: qué comprar en cada tier. */
  tiers: Record<string, number[]>;
  /**
   * Lo invertido en cada categoría y lo que el juego da por eso. `souls` es lo
   * que la build gastó ahí; `bonus` es el escalón alcanzado en la escalera de
   * inversión de la tienda (+N% de arma, +N% de vida, +N de espíritu).
   */
  damageSplit: Record<"weapon" | "vitality" | "spirit", { souls: number; bonus: number }>;
  /** Ausente si la API de orden falló: el panel no se dibuja. */
  abilityOrder?: number[];
  /** La secuencia entera de subidas, con repeticiones. 15-16 pasos. */
  abilityPath?: number[];
  /** En qué orden se compra de verdad, con los componentes. */
  buyOrder: { itemId: number; minute: number }[];
}

export interface Counter {
  itemId: number;
  relativeSwing: number;
  /** Cuánto del camino que le queda a "siempre" recorre contra el peor rival.
   *  Basta con esto o con `relativeSwing`: ver `COUNTER_REACH` en el pipeline. */
  reach: number;
  /** Cuántas veces el salto supera al que daría el azar. Es lo que lo publica. */
  excess: number;
  /** Qué fracción de las partidas de ese héroe lo lleva. */
  base: number;
  against: { heroId: number; points: number }[];
}

export interface RawRecommended {
  from: string;
  items: RawBuildItem[];
  swaps: { out: number; in: number; edgeOut: number; edgeIn: number; support: number }[];
  buyOrder: { itemId: number; minute: number }[];
}

export interface RawHeroBuilds {
  heroId: number;
  matches: number;
  recommended?: RawRecommended;
  builds: RawBuild[];
  counters: Counter[];
}

export interface BuildsFile {
  /** True si la ventana no pudo anclarse al parche y abarca días de antes. */
  crossesPatch?: boolean;
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  matches: number;
  k: number;
  abilities: Record<string, { name: Localized; img: string; slot?: number }>;
  heroes: RawHeroBuilds[];
}

interface FullCatalog {
  items: Record<string, { name: Localized; img: string; cost: number; slot: string; tier?: number }>;
  heroes: Record<string, { name: Localized; img: string }>;
}

const full = catalog as unknown as FullCatalog;

/* ── La carga, una sola vez y en el primer click ────────────────────────── */

let file: BuildsFile | null = null;
let pidiendo: Promise<void> | null = null;

export function loadBuilds(): Promise<void> {
  if (file) return Promise.resolve();
  pidiendo ??= import("@deadlock/builds.json").then((m) => {
    file = m.default as unknown as BuildsFile;
  });
  return pidiendo;
}

/* ── Lo que la tarjeta dibuja ───────────────────────────────────────────── */

export interface BuildItemView extends RawBuildItem {
  name: string;
  img: string;
  cost: number;
  slot: string;
  /** Los escalones anteriores, ya resueltos. Vacío si el ítem no se mejora. */
  steps: { itemId: number; name: string; img: string }[];
}

export interface CounterView extends Counter, ItemRef {
  /** Contra quiénes salta, con nombre. */
  foes: string[];
}

/** Qué distingue a una build de las otras dos del mismo héroe. */
export type BuildBadge = "played" | "winrate";

/**
 * Cuántos errores estándar tiene que sacarle una build a **todas** las demás para
 * que se la marque como la que mejor rinde.
 *
 * **Dos, y sin esto la etiqueta sería un adorno sobre ruido.** Medido el
 * 2026-08-02 sobre los 34 héroes con más de una build: la de mayor winrate le
 * gana a la más jugada por más de dos errores estándar en **5**. En los otros 29
 * la diferencia no se distingue de una moneda — Lady Geist tiene 50,8% contra
 * 50,0% con errores de 2,2 y 1,2 puntos.
 *
 * El winrate de una build se mide sobre 200 a 500 partidas, o sea ±2 a ±3,5
 * puntos cada uno. Es la misma regla que ya usan `skillGap`, `trend`, el boost de
 * maestría y la tabla de lados del mapa: la ausencia dice "no sé", y una etiqueta
 * que está siempre deja de significar algo.
 *
 * **Se compara el winrate crudo y no uno encogido**, a propósito: encoger hacia
 * 50% y además exigir dos sigmas sería contar la misma incertidumbre dos veces.
 * El portón ES el tratamiento de la incertidumbre.
 */
export const WINRATE_SIGMAS = 2;

/** El error estándar de un winrate, en la misma escala que el winrate. */
const seOf = (matches: number): number => (matches > 0 ? 0.5 / Math.sqrt(matches) : Infinity);

/**
 * Qué etiqueta lleva cada build, en el mismo orden en que vienen.
 *
 * Las builds llegan ordenadas por partidas, así que la primera es la más jugada.
 * La de mejor winrate se marca **sólo si le gana a todas las demás** por el
 * margen de arriba: si le saca mucho a una y empata con otra, no hay "la mejor",
 * hay dos parecidas.
 *
 * **Con una sola build no se etiqueta nada.** Llamar "la más jugada" a la única
 * que hay no distingue nada de nada. Son cuatro héroes hoy, y se resuelve solo:
 * cuando el corpus ranked crezca les va a aparecer una segunda.
 */
export function badgesFor(builds: { winRate: number; matches: number }[]): BuildBadge[][] {
  const out: BuildBadge[][] = builds.map(() => []);
  if (builds.length < 2) return out;

  out[0].push("played");

  let mejor = 0;
  builds.forEach((b, i) => {
    if (b.winRate > builds[mejor].winRate) mejor = i;
  });

  const gana = builds.every((b, i) => {
    if (i === mejor) return true;
    const margen = Math.sqrt(seOf(builds[mejor].matches) ** 2 + seOf(b.matches) ** 2);
    return builds[mejor].winRate - b.winRate > WINRATE_SIGMAS * margen;
  });
  if (gana) out[mejor].push("winrate");

  return out;
}

export interface AbilityView {
  id: number;
  name: string;
  img: string;
  /** 1 a 4, como las numera el juego. Ausente en datos viejos. */
  slot?: number;
}

/**
 * Las cuatro habilidades **en el orden en que el juego las numera**, no en el que
 * se suben.
 *
 * `abilityOrder` es orden de desbloqueo, que es lo que medimos y cambia por
 * build. Como fila de la grilla eso confunde: en Ivy salía 1, 3, 2, 4 y se lee
 * como un error de la página, no como un dato. La grilla sigue diciendo en qué
 * orden se suben — está en qué columna cae la primera marca de cada fila.
 *
 * **El orden se mantiene cuando no hay casilla**, que es lo que pasa con los
 * archivos publicados antes de que existiera: `sort` es estable en todos los
 * motores que nos importan, así que sin `slot` las filas quedan como venían y el
 * panel viejo de "orden de desbloqueo" sigue numerando bien.
 */
export const bySlot = (abilities: AbilityView[]): AbilityView[] =>
  [...abilities].sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity));

/**
 * Lo mínimo para dibujar un ítem Y poder abrir su ficha.
 *
 * `cost` y `slot` no son decorativos: la ficha del juego los necesita para el
 * encabezado y para elegir la textura de la categoría. Por eso los llevan también
 * los escalones y los situacionales, que antes sólo tenían nombre e imagen y por
 * eso eran los únicos ítems de la tarjeta sin ficha al pasar el mouse.
 */
export interface ItemRef {
  itemId: number;
  name: string;
  img: string;
  cost: number;
  slot: string;
  /**
   * 1 a 4, el escalón con el que el juego numera al ítem en la tienda.
   *
   * **Se lee del catálogo y no se deduce del precio**, aunque hoy sean lo mismo:
   * el catálogo guarda los dos justamente para que el día que Valve mueva un
   * precio, el escalón siga diciendo de qué grupo era.
   */
  tier?: number;
}

/**
 * Debajo de qué convicción una build se avisa como mezclada.
 *
 * `commitment` es el peso medio que Archetypal Analysis le da a su propio
 * arquetipo entre su gente. Con 0,85 la build describe a sus jugadores; con 0,55
 * esos jugadores están a mitad de camino de otra, y la build es más un promedio
 * que una forma de jugar.
 *
 * **El corte tiene lectura absoluta, y eso es a propósito**: debajo de 0,60 más
 * del 40% de lo que hace esa gente pertenece a otra build. Un umbral así
 * significa lo mismo en cualquier corrida.
 *
 * La alternativa —cortar por cuantil— se descartó porque el umbral se movería
 * con los datos y la etiqueta diría "el 10% más mezclado de hoy" en vez de algo
 * sobre la build. **Y el riesgo es real, no teórico**: la primera versión usaba
 * 0,65 calibrado sobre una corrida donde marcaba 5 de 73, y en la siguiente
 * marcaba 18 de 79 — de rareza a una de cada cuatro sin que cambiara nada del
 * criterio.
 *
 * Con 0,60, sobre 79 builds que van de 0,513 a 1,00 (mediana 0,752), se marcan
 * **nueve**. Que la mayoría no lleve etiqueta es lo que hace que la etiqueta se
 * vea, igual que en las de dificultad y tendencia de la tier list.
 *
 * Ojo: un héroe con una sola build da 1,00 por construcción —no hay otra en la
 * que estar— así que ese valor no es una medida de nada.
 */
export const MIN_CONVICCION = 0.6;

/** Un escalón de la build: el precio y qué se compra ahí. */
export interface TierStep {
  tier: number;
  cost: number;
  items: ItemRef[];
}

export interface BuildView extends Omit<RawBuild, "items" | "tiers"> {
  items: BuildItemView[];
  /** Los cuatro escalones, del más barato al más caro. Sin los vacíos. */
  steps: TierStep[];
  abilities: AbilityView[];
  /**
   * La secuencia entera de subidas, en ids. Cruzada contra `abilities` da la
   * grilla de "qué subir en cada paso" — 15 o 16 celdas por habilidad.
   */
  path: number[];
  /** Las compras en orden, con los componentes y no sólo los doce finales. */
  buys: BuyView[];
}

/**
 * Una compra de la secuencia, lista para dibujar.
 *
 * `edge` viene sólo en la compra que **termina** un objeto marcado como
 * determinante. El aporte se midió sobre el objeto terminado, así que atribuirlo
 * también a los escalones que llevan hasta él diría que un componente de 800
 * almas gana partidas por su cuenta.
 */
export type BuyView = ItemRef & { minute: number; upgrade: boolean; edge?: number };

/** Los tres tramos de la partida en los que se parte la secuencia de compras. */
export type Phase = "early" | "mid" | "late";

/**
 * Dónde corta cada tramo, en minutos.
 *
 * **Son los del formato que copiamos y se validaron contra nuestros datos antes
 * de adoptarlos**: sobre las 102 builds publicadas, con estos cortes **ninguna
 * deja un tramo vacío**, y las medianas quedan en 6, 7 y 5 compras. No hizo falta
 * inventar cortes propios.
 *
 * El minuto del corte pertenece al tramo de arriba: los rótulos dicen 0-12 y
 * 12-22, así que el 12 tiene que estar en uno solo de los dos.
 */
export const PHASE_CUTS = { mid: 12, late: 22 } as const;

export interface PhaseGroup {
  phase: Phase;
  buys: BuyView[];
}

const ORDEN: Phase[] = ["early", "mid", "late"];

const phaseOf = (minute: number): Phase =>
  minute < PHASE_CUTS.mid ? "early" : minute < PHASE_CUTS.late ? "mid" : "late";

/**
 * La secuencia de compras partida en early / mid / late.
 *
 * **No reordena nada adentro de cada tramo**, y eso importa: las compras llegan
 * del pipeline con la cadena de mejora respetada —un componente nunca después de
 * lo que arma— y reordenar acá desharía ese arreglo.
 *
 * **Un tramo vacío no se devuelve** en vez de devolverse vacío: así la pantalla
 * no dibuja un encabezado con nada debajo. Hoy no pasa en ninguna de las 102
 * builds, pero una build corta de un héroe nuevo lo haría.
 */
export function byPhase(buys: BuyView[]): PhaseGroup[] {
  const porTramo = new Map<Phase, BuyView[]>();
  for (const b of buys) {
    const p = phaseOf(b.minute);
    const lista = porTramo.get(p) ?? [];
    lista.push(b);
    porTramo.set(p, lista);
  }
  return ORDEN.filter((p) => porTramo.has(p)).map((phase) => ({ phase, buys: porTramo.get(phase)! }));
}

/**
 * La build que recomendamos, lista para dibujar.
 *
 * `swaps` vacío significa que la build más jugada ya es la mejor que podemos
 * medir. **Ese resultado tiene que poder mostrarse**, o el algoritmo estaría
 * obligado a inventar mejoras para justificar su pestaña.
 */
export interface RecommendedView {
  from: string;
  items: BuildItemView[];
  /** Las compras en orden, igual que en las medidas: sin esto no se puede seguir. */
  buys: BuyView[];
  swaps: {
    out: ItemRef;
    in: ItemRef;
    edgeOut: number;
    edgeIn: number;
    /** Partidas donde el entrante convive con todo lo que ya se aceptó. */
    support: number;
  }[];
}

export interface HeroBuildsView {
  heroId: number;
  /**
   * La banda que midió estas builds, sacada del archivo.
   *
   * El pie de la tarjeta la nombra, y estaba clavado en "Fantasma y arriba":
   * desde que el defecto lo elige la muestra (2026-07-31) eso decía Fantasma+
   * mientras la página mostraba Emisario/Oráculo.
   */
  band: BandId;
  builds: BuildView[];
  counters: CounterView[];
  /** La ventana y la muestra, para el pie de la tarjeta. */
  from: string;
  to: string;
  /** True si esa ventana abarca días de antes del parche vigente. */
  crossesPatch?: boolean;
  /** La cuarta pestaña: lo que recomendamos nosotros. */
  recommended?: RecommendedView;
}

const cache = new Map<string, HeroBuildsView | null>();

/**
 * De la secuencia cruda a las compras que dibuja el panel.
 *
 * Vive acá y no adentro del armado de cada build porque **la recomendada usa
 * exactamente la misma**: si fueran dos copias, el día que una cambie la otra
 * queda distinta sin que nada avise.
 */
function buysDe(
  buyOrder: { itemId: number; minute: number }[],
  items: RawBuildItem[],
  lang: Lang
): BuyView[] {
  return (buyOrder ?? []).flatMap((p) => {
    const base = itemView(p.itemId, lang);
    if (!base) return [];
    const esMejora = items.some((x) => x.chain.indexOf(p.itemId) > 0);
    // Sólo la compra que COMPLETA un objeto marcado lleva su aporte: es el
    // objeto terminado el que se midió, no el escalón que lleva hasta él.
    const clave = items.find((x) => x.itemId === p.itemId && x.carries);
    return [{ ...p, ...base, upgrade: esMejora, ...(clave ? { edge: clave.edge } : {}) }];
  });
}

const itemView = (itemId: number, lang: Lang) => {
  const e = full.items[String(itemId)];
  return e
    ? {
        itemId,
        name: text(e.name, lang, `#${itemId}`),
        img: e.img,
        cost: e.cost,
        slot: e.slot,
        tier: e.tier,
      }
    : null;
};

/** La tarjeta de un héroe, o null si ese héroe no tiene builds publicadas. */
export function buildsOf(heroId: number, lang: Lang): HeroBuildsView | null {
  if (!file) return null;
  const key = `${heroId}|${lang}`;
  if (cache.has(key)) return cache.get(key)!;

  /**
   * **Un héroe que no está en el archivo NO es un archivo que no llegó.**
   *
   * `null` significa "todavía se está bajando" y la tarjeta dibuja "Cargando…"
   * mientras tanto. Devolver `null` también para un héroe ausente dejaba ese
   * cartel girando para siempre — el archivo ya estaba, simplemente no tenía
   * nada que decir de ese héroe.
   *
   * Estuvo latente desde el primer día y no se notaba porque los 38 héroes
   * entraban siempre. Al pasar el corpus a ranked el 2026-07-31 la muestra
   * arrancó de cero y sólo 7 llegaron al mínimo de un grupo, así que 31 de 38
   * filas se abrían a un "Cargando…" eterno.
   *
   * Con `builds: []` la tarjeta cae en su rama de "no hay", que ya existía y ya
   * tenía la frase correcta ("todavía no hay suficientes partidas con este
   * héroe"). Se va sola a medida que llega muestra.
   */
  const h = file.heroes.find((x) => x.heroId === heroId);
  if (!h) {
    const vacio: HeroBuildsView = {
      heroId, band: file.band as BandId, from: file.from, to: file.to, builds: [], counters: [],
    };
    cache.set(key, vacio);
    return vacio;
  }

  const view: HeroBuildsView = {
    heroId,
    band: file.band as BandId,
    from: file.from,
    to: file.to,
    ...(file.crossesPatch ? { crossesPatch: true } : {}),
    ...(h.recommended
      ? {
          recommended: {
            from: h.recommended.from,
            items: h.recommended.items.flatMap((i) => {
              const b = itemView(i.itemId, lang);
              if (!b) return [];
              // La cadena termina en el propio ítem; los escalones son lo anterior.
              const steps = i.chain.slice(0, -1).flatMap((s) => {
                const v = itemView(s, lang);
                return v ? [{ itemId: s, name: v.name, img: v.img }] : [];
              });
              return [{ ...i, ...b, tier: i.tier, steps }];
            }),
            buys: buysDe(h.recommended.buyOrder, h.recommended.items, lang),
            swaps: h.recommended.swaps.flatMap((s) => {
              const sale = itemView(s.out, lang);
              const entra = itemView(s.in, lang);
              // Sin nombre ni imagen el cambio no se puede dibujar, y mostrarlo
              // a medias sería peor que omitirlo.
              return sale && entra
                ? [{ out: sale, in: entra, edgeOut: s.edgeOut, edgeIn: s.edgeIn, support: s.support }]
                : [];
            }),
          },
        }
      : {}),
    builds: h.builds.map((b) => ({
      ...b,
      items: b.items.flatMap((i) => {
        const base = itemView(i.itemId, lang);
        // Sin entrada en el catálogo no hay nombre ni imagen: se omite el
        // cuadrado en vez de dibujarlo roto. Sólo puede pasar si el juego suma
        // un ítem entre dos corridas del catálogo.
        if (!base) return [];
        return [{
          ...i,
          ...base,
          // El escalón del ítem de la build manda sobre el del catálogo: son el
          // mismo número, pero acá viene garantizado 1-4 y allá es opcional.
          tier: i.tier,
          // La cadena termina en el propio ítem; los escalones son lo anterior.
          steps: i.chain.slice(0, -1).flatMap((s) => {
            const v = itemView(s, lang);
            return v ? [{ itemId: s, name: v.name, img: v.img }] : [];
          }),
        }];
      }),
      // Los cuatro escalones, del más barato al más caro y sin los vacíos: es el
      // orden en que se compra, que es para lo que existe este panel.
      steps: [1, 2, 3, 4].flatMap((tier) => {
        const its = (b.tiers?.[String(tier)] ?? []).flatMap((id) => {
          const v = itemView(id, lang);
          return v ? [v] : [];
        });
        return its.length ? [{ tier, cost: [0, 800, 1600, 3200, 6400][tier], items: its }] : [];
      }),
      abilities: (b.abilityOrder ?? []).flatMap((id) => {
        const a = file!.abilities[String(id)];
        return a
          ? [{ id, name: text(a.name, lang, `#${id}`), img: a.img, ...(a.slot ? { slot: a.slot } : {}) }]
          : [];
      }),
      // La senda cruda: sólo los ids, que la grilla cruza contra `abilities`.
      path: b.abilityPath ?? [],
      /**
       * La secuencia de compras, resuelta.
       *
       * `upgrade` marca los escalones que NO son una compra desde cero sino la
       * mejora de algo que ya estaba: el jugador no vuelve a pagar el precio
       * entero. Sale de mirar si el ítem aparece en la cadena de otro como paso
       * previo — es decir, si algo lo tiene como raíz.
       */
      buys: buysDe(b.buyOrder, b.items, lang),
    })),
    counters: h.counters.flatMap((c) => {
      const base = itemView(c.itemId, lang);
      if (!base) return [];
      return [{
        ...c,
        ...base,
        foes: c.against.map((a) => text(full.heroes[String(a.heroId)]?.name, lang, `#${a.heroId}`)),
      }];
    }),
  };
  cache.set(key, view);
  return view;
}

/**
 * Las builds de un héroe, o null mientras se bajan.
 *
 * Un solo hook para toda la lista y no uno por fila: son 38 filas, y 38 efectos
 * esperando el mismo archivo serían 38 suscripciones para el mismo dato. El que
 * abre dispara la carga y avisa cuando llegó. Es el mismo reparto que
 * `useItemDetail`.
 */
export function useHeroBuilds(heroId: number | null): HeroBuildsView | null {
  const { lang } = useLang();
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (heroId === null || file) return;
    let alive = true;
    loadBuilds()
      .catch(() => undefined)
      .then(() => {
        if (alive) bump();
      });
    return () => {
      alive = false;
    };
  }, [heroId]);

  return heroId === null ? null : buildsOf(heroId, lang);
}

/**
 * El ítem tal como lo espera la tarjeta compartida con la pestaña de objetos.
 *
 * La ficha vive en `DeadlockItemCard` y toma el `Item` de `deadlockItemsData`;
 * acá se arma el mínimo que esa ficha usa. Es más barato que duplicar la ficha,
 * que era la otra opción, y garantiza que las dos pantallas muestren lo mismo.
 */
export function asItem(i: ItemRef): Item {
  return {
    itemId: i.itemId,
    n: 0,
    delta: 0,
    winRateRaw: 0,
    pickRate: 0,
    buyMinute: 0,
    name: i.name,
    img: i.img,
    cost: i.cost,
    slot: i.slot as Item["slot"],
    types: [],
    upgradesTo: [],
    upgradesFrom: [],
    tier: "",
  };
}
