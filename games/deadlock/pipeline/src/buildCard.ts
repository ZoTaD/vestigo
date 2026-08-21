/**
 * El criterio de la tarjeta de build: qué es una build, cuáles se publican y
 * cuáles son counter.
 *
 * Todo lo de acá es puro y se prueba sin red, que es lo que hace que valga la
 * pena separarlo de las consultas. Mismo reparto que `matching.ts`.
 *
 * Ver `docs/design/2026-07-31-tarjeta-de-build-deadlock-design.md`.
 */

import { bonusFor, type Category } from "./investment";

/** Cuántos ítems entran en una build. Medido, no leído: el máximo real sobre
 * 166.656 jugadores de Fantasma+ es 12 exacto, y ninguno tiene 13. */
export const MAX_SLOTS = 12;

/**
 * Partidas mínimas para que un grupo sea una build publicable.
 *
 * **Era 500, y bajó a 150 el 2026-07-31 por decisión de ZoTaD.** Con el corpus
 * ranked recién estrenado, 500 dejaba **7 héroes de 38** con build y los otros 31
 * con la fila vacía. El argumento para bajarlo es la cadencia: la tarjeta se
 * recalcula **cada hora**, así que una build fina hoy se afirma sola mañana en vez
 * de quedar congelada hasta que alguien la mire.
 *
 * 150 no es cualquier número: es donde la prevalencia de un ítem —que es lo que
 * decide qué cuadrados se dibujan— tiene un error de ±4 puntos al 95%. Alcanza
 * para separar "casi todos lo llevan" de "casi nadie", que es lo único que esta
 * lista afirma. Lo que NO sostiene es el orden fino entre dos ítems parecidos.
 *
 * **Volvió a 500 el 2026-08-02, que es lo que ese párrafo pedía.** Dos cosas lo
 * habilitaron: Archetypal Analysis reemplazó a la firma hecha a mano y los grupos
 * pasaron a ser menos y más grandes, y el corpus ranked creció.
 *
 * La distribución medida antes de subirlo: mínimo 347, p25 1.493, **mediana
 * 2.227**, máximo 7.102 sobre 73 builds. Al corte de 500 se cae **una sola build
 * y ningún héroe** — a 700 se caen tres y a 1.000 se caen ocho, así que 500 es
 * donde se gana precisión sin empezar a perder cobertura.
 *
 * Ojo: desde AA el que fija el piso real ya no es esta constante sino
 * `MIN_CUOTA`, que exige que un arquetipo describa al 15% de los jugadores del
 * héroe. Esta queda como el piso absoluto para los héroes poco jugados.
 */
export const MIN_GROUP = 500;

/** Ítems de núcleo mínimos. Con menos, la "build" es un puñado de ítems sueltos. */
export const MIN_CORE = 6;

/**
 * Cuánto se pueden parecer dos builds antes de ser la misma con otro nombre.
 *
 * **0,7 de Jaccard, el mismo valor que se calibró para las familias de comps de
 * TFT**, y acá también se calibró midiendo en vez de elegirlo: con 0,7 salen tres
 * builds distinguibles en 35 de los 38 héroes, con 0,5 sólo en 23 y con 0,8 en
 * 37. El 0,5 borra variedad que existe —Ivy se juega de dos formas medidas— y el
 * 0,8 deja pasar builds que comparten casi todo.
 */
export const MAX_OVERLAP = 0.7;

export interface CatalogItem {
  cost: number;
  tier: number;
  slot: string;
  types?: string[];
  upgradesTo?: number[];
  upgradesFrom?: number[];
}

/** Todos los ítems corriente abajo de uno, transitivo. */
export function terminalsOf(items: Map<number, CatalogItem>, id: number): number[] {
  const out: number[] = [];
  const pila = [...(items.get(id)?.upgradesTo ?? [])];
  while (pila.length) {
    const x = pila.pop()!;
    if (out.includes(x)) continue;
    out.push(x);
    pila.push(...(items.get(x)?.upgradesTo ?? []));
  }
  return out;
}

/**
 * El camino de mejora hasta un ítem, de la raíz al propio ítem.
 *
 * Es lo que explica por qué una build de doce ítems son diecisiete compras: se
 * compra el T1 y se lo mejora. Va al hover, no al cuadrado.
 */
export function chainTo(items: Map<number, CatalogItem>, id: number): number[] {
  const cadena = [id];
  let actual = id;
  // Un ítem puede construirse de más de uno; se sigue el primero, que es el que
  // el juego muestra como su origen.
  for (let i = 0; i < 8; i++) {
    const padre = items.get(actual)?.upgradesFrom?.[0];
    if (padre === undefined || cadena.includes(padre)) break;
    cadena.unshift(padre);
    actual = padre;
  }
  return cadena;
}

export interface CoreItem {
  itemId: number;
  prevalence: number;
}

/**
 * Saca del núcleo los escalones cuya mejora también está.
 *
 * **Hace falta aunque cada build individual ya traiga sólo terminales.** El
 * núcleo es lo que se repite en el GRUPO, y un T1 y su T2 pueden superar el
 * umbral los dos porque son el terminal de jugadores distintos: unos se quedaron
 * en Extra Spirit y otros llegaron a Improved Spirit. Sumados dan dos cuadrados
 * para un solo objeto, y nadie sostiene los dos a la vez.
 *
 * Se conserva el más avanzado, que es adónde llega la build.
 */
export function collapseChains(core: CoreItem[], items: Map<number, CatalogItem>): CoreItem[] {
  const presentes = new Set(core.map((c) => c.itemId));
  return core.filter((c) => !terminalsOf(items, c.itemId).some((d) => presentes.has(d)));
}

/** Un grupo tal como sale de SQL: el núcleo viene como texto "id:prevalencia,…". */
export interface Group {
  heroId: number;
  damage: "weapon" | "spirit" | "vitality";
  ability: number | bigint;
  matches: number;
  winRate: number;
  core: string | null;
  /** Peso medio del arquetipo entre los suyos. Lo pone `grouping.ts`. */
  commitment?: number;
  /** Orden y paso a paso medidos sobre los miembros del arquetipo. */
  abilityOrder?: number[];
  abilityPath?: number[];
}

export interface ChosenGroup extends Omit<Group, "core"> {
  core: CoreItem[];
}

/** El núcleo, parseado del texto que devuelve SQL. */
export function parseCore(core: string | null): CoreItem[] {
  return String(core ?? "")
    .split(",")
    .filter(Boolean)
    .map((p) => {
      const [id, prev] = p.split(":");
      return { itemId: Number(id), prevalence: Number(prev) };
    })
    .filter((c) => Number.isFinite(c.itemId) && c.itemId > 0);
}

const jaccard = (a: number[], b: number[]): number => {
  const A = new Set(a);
  const B = new Set(b);
  const i = [...A].filter((x) => B.has(x)).length;
  const u = A.size + B.size - i;
  return u === 0 ? 0 : i / u;
};

/**
 * Hasta tres builds por héroe, **y sólo las que se distingan entre sí**.
 *
 * Se ordena por partidas y se va aceptando la siguiente sólo si comparte menos
 * de `MAX_OVERLAP` con todas las ya aceptadas. **Un héroe que se juega de una
 * sola forma publica una sola build**, y eso es lo correcto: tres nombres para lo
 * mismo sería inventarle variedad que no tiene.
 */
export function groupBuilds(grupos: Group[]): ChosenGroup[] {
  const out: ChosenGroup[] = [];
  const candidatos = grupos
    .map((g) => ({ ...g, core: parseCore(g.core) }))
    .filter((g) => g.matches >= MIN_GROUP && g.core.length >= MIN_CORE)
    .sort((a, b) => b.matches - a.matches);

  // La comparación se hace sobre los doce que se van a publicar, no sobre el
  // núcleo entero: dos builds son "la misma" si lo que el jugador ve es lo
  // mismo, y lo que ve son doce cuadrados.
  const publicados = (g: ChosenGroup) => g.core.slice(0, MAX_SLOTS).map((c) => c.itemId);

  for (const g of candidatos) {
    if (out.every((o) => jaccard(publicados(o), publicados(g)) < MAX_OVERLAP)) out.push(g);
    if (out.length === 3) break;
  }
  return out;
}

/** Los cuatro precios de la tienda, del más barato al más caro. */
export const TIERS = [1, 2, 3, 4] as const;

/**
 * La build partida por escalón: qué se compra en cada tier.
 *
 * **No es lo mismo que los doce cuadrados y por eso van las dos cosas.** Arriba
 * está dónde TERMINA la build; acá está por dónde se pasa para llegar. Un ítem de
 * 6400 aparece en su tier, pero su T1 y su T2 aparecen en los suyos, porque hay
 * que comprarlos y en ese momento son lo que uno tiene.
 *
 * Sale de las cadenas de mejora, que ya viajan con cada ítem.
 */
export function byTier(items: { itemId: number; chain: number[] }[], catalogo: Map<number, CatalogItem>) {
  const out = new Map<number, number[]>(TIERS.map((t) => [t, []]));
  for (const i of items) {
    for (const paso of i.chain) {
      const tier = catalogo.get(paso)?.tier;
      if (!tier) continue;
      const lista = out.get(tier);
      if (lista && !lista.includes(paso)) lista.push(paso);
    }
  }
  return out;
}

/**
 * El rasgo que define a la build, para nombrarla.
 *
 * Sale de los tipos que el catálogo ya trae, así que no hay lista a mano: si la
 * build carga curación es "vampírica", si carga vida es "de aguante", y si no,
 * es la de daño. La prosa de cada rasgo vive en `i18n.ts` en los dos idiomas —
 * son palabras nuestras, no vocabulario del juego, así que no se bajan.
 */
export type Trait = "vampiric" | "survival" | "dps";

export function traitOf(items: { itemId: number }[], catalogo: Map<number, CatalogItem>): Trait {
  const con = (t: string) =>
    items.filter((i) => (catalogo.get(i.itemId)?.types ?? []).includes(t)).length;
  if (con("healing") >= 4) return "vampiric";
  if (con("health") >= 5) return "survival";
  return "dps";
}

/** Lo invertido en una categoría, y lo que el juego da por eso. */
export interface Investment {
  /** Almas de la build que fueron a esta categoría. */
  souls: number;
  /** El escalón alcanzado: `+N` de espíritu, `+N%` de vida o de daño de arma. */
  bonus: number;
}

export interface DamageSplit {
  weapon: Investment;
  vitality: Investment;
  spirit: Investment;
}

/**
 * De qué está hecha la build: **cuántas almas puso en cada categoría y qué le da
 * el juego por eso**.
 *
 * Es la cuenta que hace la tienda. Deadlock convierte almas gastadas por
 * categoría en un bonus por escalones (ver `investment.ts`), así que una build
 * terminada se traduce a los mismos números que el jugador ve al comprar: +54%
 * de daño de arma, +38% de vida, +45 de poder espiritual.
 *
 * **Se reparte por `slot`, y no por lo que el ítem da.** Eso último se probó dos
 * veces y falla por dos motivos distintos. Primero: de 1.284 objetos publicados,
 * el **23% no tiene ningún `type`** —era invisible al reparto— y el **30% tiene
 * dos o tres**, así que se contaba repetido. Y segundo, mirando las stats reales:
 * **no son separables por categoría ni comparables entre sí**. La stat más común
 * de los ítems de espíritu es *Bonus Health* (16 de ellos), los de arma dan
 * *Spirit Power*, y las unidades no se suman —% de cadencia, vida plana, segundos
 * de duración, metros de alcance—. No hay un número por ítem que llene una barra.
 *
 * Las almas sí: cada objeto tiene exactamente un coste y exactamente una
 * categoría de tienda, así que los doce se reparten sin huecos ni repeticiones.
 */
export function damageSplit(
  items: { itemId: number }[],
  catalogo: Map<number, CatalogItem>
): DamageSplit {
  const de = (slot: Category): Investment => {
    const souls = items.reduce((a, i) => {
      const it = catalogo.get(i.itemId);
      return a + (it?.slot === slot ? it.cost ?? 0 : 0);
    }, 0);
    return { souls, bonus: bonusFor(slot, souls) };
  };
  return { weapon: de("weapon"), vitality: de("vitality"), spirit: de("spirit") };
}

/**
 * A partir de qué salto un ítem deja de ser core y pasa a ser counter.
 *
 * **Es el swing RELATIVO a su propia base, y eso es el hallazgo.** El swing crudo
 * no separa: Extra Health, que es core puro, salta 2,8 puntos según el rival y
 * Spellbreaker sólo 2,4. Dividido por su base, en cambio, quedan en mundos
 * distintos — Extra Health 13%, Mystic Reverb 20%, **Unstoppable en Lash 36%**
 * contra Metal Skin 148% y Knockdown 151%.
 *
 * El corte en 1,0 (o sea, que el salto valga tanto como la base entera) deja del
 * lado core el caso que importa: Lash compra Unstoppable pase lo que pase, así
 * que para él no es counter aunque para los demás sí.
 */
export const COUNTER_SWING = 1.0;

/**
 * Cuánto tiene que superar el salto a lo que produciría el puro azar.
 *
 * **El swing relativo solo NO alcanza, y está medido.** Con ~37 rivales, cada uno
 * medido con error de muestreo, el rango (máx − mín) crece solo aunque no haya
 * ningún efecto: para un objeto que el héroe compra el 1% de las veces, el azar
 * ya produce un swing relativo de **0,84**, casi el corte entero. Por eso el
 * criterio viejo marcaba el **43% de los objetos de uso 0-2%** y sólo el 1% de
 * los de uso alto — estaba detectando rareza, no counters.
 *
 * Con el exceso sobre el azar la separación es limpia: los counters de verdad dan
 * ×6 a ×9 —Phantom Strike contra Vindicta ×8,99, Metal Skin contra Vyper ×7,54,
 * Knockdown contra Vindicta ×6,88— y los que se colaban por ruido dan ×0,94 a
 * ×1,00.
 */
export const COUNTER_EXCESS = 2.0;

/**
 * La otra forma de ser counter: cuánto del camino que le queda a "siempre" se
 * recorre contra el peor rival — `(tasa_máxima − base) / (1 − base)`.
 *
 * **`COUNTER_SWING` divide por la base, así que castiga justo al héroe que MÁS
 * se buildea el counter**, y eso deja afuera los emparejamientos más citados del
 * juego. Medido: Abrams compra Phantom Strike el 59,8% contra Vindicta sobre una
 * base del 38% (+21,8 puntos, exceso 3,87) y su swing es 0,72; Paige compra
 * Knockdown el 75,1% contra Vindicta sobre 52,7% (+22,4 puntos) con swing 0,58.
 * Los dos se caían por comunes, no por dudosos.
 *
 * **Y no alcanza con reemplazar un corte por el otro, porque los dos falsos
 * negativos viven en extremos opuestos del uso.** Shiv/Metal Skin —un counter de
 * manual— tiene un alcance de 0,085, POR DEBAJO de ítems core como Burst Fire en
 * Drifter (0,114) o Spiritual Overflow en Wraith (0,130): con base 6,6% su señal
 * sólo se ve como swing relativo. Por eso el criterio es la unión de los dos, y
 * `COUNTER_EXCESS` sigue siendo el filtro de ruido que gobierna a ambos.
 *
 * El 0,30 cae en el único hueco ambiguo que dejan los datos: por encima está
 * Shiv/Dispel Magic (0,312, real) y por debajo Sinclair/Rapid Recharge (0,266,
 * core puro). Agrega 5 pares y **ningún objeto nuevo** — los cinco son ítems que
 * el método ya llamaba counter en otros héroes, donde el swing sí los veía.
 */
export const COUNTER_REACH = 0.3;

/**
 * Uso mínimo del objeto en ese héroe para considerarlo situacional.
 *
 * Pedido de ZoTaD: **un situacional tiene que ser algo que esa gente de verdad
 * se buildea** en ciertas partidas, no un objeto que casi nadie compra. Y es
 * también donde vive el ruido: debajo del 3% de uso el azar explica casi todo el
 * salto.
 */
export const COUNTER_MIN_BASE = 0.03;

export interface CounterRow {
  heroId: number;
  itemId: number;
  foeId: number;
  rate: number;
  base: number;
  /** Cuántos enfrentamientos respaldan esta tasa. Sin esto no se puede saber
   *  cuánto del salto es azar. */
  n: number;
}

export interface Counter {
  itemId: number;
  /** Cuánto salta contra su propia base. Publicado para poder auditar el corte. */
  relativeSwing: number;
  /** Cuánto del camino que le queda a "siempre" recorre contra el peor rival.
   *  Es la lectura que ve los counters que el héroe ya se buildea mucho. */
  reach: number;
  /** Cuántas veces el salto supera al que daría el azar. Es lo que decide. */
  excess: number;
  /** Qué fracción de las partidas de ese héroe lo lleva. */
  base: number;
  /** Contra quiénes salta, en puntos de compra. */
  against: { heroId: number; points: number }[];
}

/**
 * El rango que produciría el azar con `m` mediciones de una proporción.
 *
 * La constante de rango del control estadístico: para m entre 5 y 40 va de ~2,3
 * a ~4,1. Se interpola, que alcanza de sobra para un corte.
 */
function rangoPorAzar(rows: CounterRow[], base: number): number {
  const sd =
    rows.reduce((a, r) => a + Math.sqrt((base * (1 - base)) / Math.max(1, r.n)), 0) / rows.length;
  const d = 2.3 + 1.8 * Math.min(1, (rows.length - 5) / 35);
  return d * sd;
}

/**
 * Qué ítems son counter en cada héroe, y contra quién.
 *
 * Un ítem es counter si su compra **se dispara contra alguien** en vez de
 * mantenerse pareja contra cualquiera. Se mide por héroe a propósito: el mismo
 * ítem puede ser counter para uno y core para otro.
 */
export function countersFrom(rows: CounterRow[]): Map<number, Counter[]> {
  const porPar = new Map<string, CounterRow[]>();
  for (const r of rows) {
    const key = `${r.heroId}|${r.itemId}`;
    porPar.set(key, [...(porPar.get(key) ?? []), r]);
  }

  const out = new Map<number, Counter[]>();
  for (const [key, lista] of porPar) {
    const [heroId, itemId] = key.split("|").map(Number);
    const base = lista[0].base;
    // El objeto tiene que ser algo que ese héroe de verdad se buildea a veces.
    if (base < COUNTER_MIN_BASE || lista.length < 5) continue;

    const tasas = lista.map((r) => r.rate);
    const rango = Math.max(...tasas) - Math.min(...tasas);
    const swing = rango / base;
    const reach = (Math.max(...tasas) - base) / (1 - base);
    const azar = rangoPorAzar(lista, base);
    const excess = azar > 0 ? rango / azar : 0;
    // El azar gobierna siempre; el tamaño del salto se puede leer de dos formas
    // y basta con una, porque cada una ve la mitad del problema que la otra no.
    if (excess < COUNTER_EXCESS) continue;
    if (swing < COUNTER_SWING && reach < COUNTER_REACH) continue;

    const against = lista
      .filter((r) => r.rate > base)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map((r) => ({ heroId: r.foeId, points: Number(((r.rate - base) * 100).toFixed(1)) }));
    if (against.length === 0) continue;

    out.set(heroId, [
      ...(out.get(heroId) ?? []),
      {
        itemId,
        relativeSwing: Number(swing.toFixed(2)),
        reach: Number(reach.toFixed(3)),
        excess: Number(excess.toFixed(2)),
        base: Number(base.toFixed(4)),
        against,
      },
    ]);
  }
  // Se ordena por exceso, no por swing: el exceso es lo que dice cuál es real.
  for (const [h, lista] of out) out.set(h, lista.sort((a, b) => b.excess - a.excess));
  return out;
}

/* ── Lo que se publica ──────────────────────────────────────────────────── */

export interface BuildItem {
  itemId: number;
  tier: 1 | 2 | 3 | 4;
  /** Minuto mediano en que entra. */
  minute: number;
  /** Aporte medido contra quien llegó al mismo punto. */
  edge: number;
  /** Qué fracción de las builds del grupo lo llevan. */
  prevalence: number;
  /**
   * True cuando este objeto está entre los que **más aportan** de toda la
   * corrida, no sólo entre los más comprados.
   *
   * Existe porque el `edge` se medía y no decidía nada: los doce cuadrados salen
   * por prevalencia —o sea, son lo que la gente compra— y toda la maquinaria del
   * pareo terminaba siendo una etiqueta al costado. Marcar en vez de reordenar es
   * deliberado: **la build tiene que seguir siendo la que se juega**, y una lista
   * ordenada por aporte sería otra tier list de objetos, no una build.
   *
   * El corte se calibra sobre la distribución de la corrida entera, así que
   * significa lo mismo en la tarjeta de todos los héroes.
   */
  carries?: boolean;
  /** El camino de mejora, de la raíz al ítem. Va al hover. */
  chain: number[];
}

/** Una compra de la partida: el ítem y el minuto mediano en que entra. */
export interface Purchase {
  itemId: number;
  minute: number;
}

/**
 * La secuencia de compras de una build, **con los componentes**.
 *
 * Los doce cuadrados son los ítems FINALES, y nadie compra un tier 4 de una: se
 * arma comprando el T1 y mejorándolo. Ordenar los doce finales por su minuto
 * describe cuándo queda terminado cada uno, no qué hace el jugador con las almas
 * en la mano — que es la pregunta del panel.
 *
 * Acá va cada escalón por separado, con su propio minuto, ordenado. Sale de
 * cruzar la cadena de mejora de cada ítem contra los minutos medianos, que ya se
 * medían sobre TODAS las compras y no sólo sobre las finales.
 *
 * **El minuto solo no alcanza para ordenar, y por eso hay un segundo paso.**
 * Ordenando nada más que por la mediana, un ítem podía aparecer ANTES que el
 * componente del que se arma. Medido sobre las 102 builds publicadas: **57 casos
 * en 21 héroes**, entre ellos el que lo hizo notar (Bebop compraba Trophy
 * Collector en el paso 3 y Sprint Boots, que es de lo que se arma, en el 4).
 *
 * **No es que el juego lo prohíba** —la tienda deja comprar la mejora de una— es
 * que como lista de compras se lee al revés: este panel dice qué hacer con las
 * almas paso a paso, y mandar a comprar el componente después de la mejora que
 * alimenta no describe ninguna partida. Es lo mismo que ya evita la flecha de
 * "mejora" en la tarjeta, aplicado al orden.
 *
 * **No era un empate mal desempatado: la mediana del componente está sesgada
 * tarde.** El minuto de Sprint Boots se mide sobre toda la gente que lo compra,
 * y ahí adentro están los que lo llevan a Enduring Speed o a Veil Walker mucho
 * después; ese mismo número se usa para la build que lo lleva a Trophy Collector
 * temprano. Dos poblaciones distintas en un solo número.
 *
 * Así que la cadena manda sobre el reloj: se emite en orden de minuto, pero un
 * paso **espera a su componente**. Es la misma idea que ya usa la tarjeta cuando
 * marca con una flecha los pasos que son mejora — acá se aplica al orden.
 */
export function buyOrder(
  items: BuildItem[],
  minuteOf: (itemId: number) => number | undefined
): Purchase[] {
  const porItem = new Map<number, number>();
  /** De qué paso depende cada uno, dentro de su cadena de mejora. */
  const componente = new Map<number, number>();

  for (const it of items) {
    // Los pasos sin minuto no se pueden ubicar, así que se saltean **y la
    // dependencia se encadena al anterior que sí tenga**: si se apuntara al paso
    // ausente, la restricción se perdería en silencio.
    const conMinuto = it.chain.filter((paso) => minuteOf(paso) !== undefined);
    conMinuto.forEach((paso, i) => {
      const m = minuteOf(paso)!;
      // El mismo componente puede estar en dos cadenas; se queda el más temprano,
      // que es cuando el jugador lo compró por primera vez.
      const antes = porItem.get(paso);
      if (antes === undefined || m < antes) porItem.set(paso, m);
      if (i > 0) componente.set(paso, conMinuto[i - 1]);
    });
  }

  const pendientes = [...porItem]
    .map(([itemId, minute]) => ({ itemId, minute }))
    .sort((a, b) => a.minute - b.minute || a.itemId - b.itemId);

  const out: Purchase[] = [];
  const puestos = new Set<number>();
  while (pendientes.length > 0) {
    const listo = pendientes.findIndex((p) => {
      const dep = componente.get(p.itemId);
      return dep === undefined || puestos.has(dep);
    });
    // `-1` sólo podría pasar con un ciclo de mejoras, que el juego no tiene.
    // Aun así se emite el más temprano en vez de colgarse: una lista en orden
    // discutible es mejor que un pipeline que no termina.
    const [elegido] = pendientes.splice(listo === -1 ? 0 : listo, 1);
    out.push(elegido);
    puestos.add(elegido.itemId);
  }
  return out;
}

export interface HeroBuild {
  /** "spirit-dps" — la clave, en inglés; la prosa vive en i18n. */
  id: string;
  damage: "weapon" | "spirit" | "vitality";
  trait: Trait;
  /** La habilidad alrededor de la que gira, si gira alrededor de una. */
  aroundAbility?: number;
  matches: number;
  winRate: number;
  /**
   * Cuán puros son los jugadores de esta build: el peso medio que Archetypal
   * Analysis les asigna a su propio arquetipo, de 0 a 1.
   *
   * Con 0,9 la build describe a su gente. Con 0,45 esa gente está a mitad de
   * camino de otra, y la build es más un promedio que una forma de jugar.
   */
  commitment?: number;
  items: BuildItem[];
  /** La misma build partida por escalón: qué comprar en cada tier. */
  tiers: Record<string, number[]>;
  damageSplit: DamageSplit;
  /** Las cuatro habilidades por orden de desbloqueo. Ausente si la API falló. */
  abilityOrder?: number[];
  /**
   * La secuencia entera de subidas, con repeticiones: 15 o 16 pasos.
   *
   * Es lo que hace falta para dibujar "qué subir en cada nivel" en vez de sólo
   * "en qué orden se desbloquean". Venía en la misma respuesta de la API desde
   * siempre y se descartaba después de leerle las cuatro primeras.
   */
  abilityPath?: number[];
}

/**
 * La build que recomendamos, con la cuenta a la vista.
 *
 * `swaps` vacío es un resultado válido y **tiene que serlo**: significa que la
 * build más jugada ya es la mejor que podemos medir. Sin poder decir eso, el
 * algoritmo inventaría mejoras para justificarse.
 */
export interface RecommendedBuild {
  /** El id de la build de la que se partió. */
  from: string;
  items: BuildItem[];
  swaps: { out: number; in: number; edgeOut: number; edgeIn: number; support: number }[];
  /**
   * La secuencia de compras, con los componentes.
   *
   * Los doce cuadrados dicen **qué** comprar y esto dice **cuándo** — que es lo
   * único que hace que una recomendación se pueda seguir. Sale del mismo minuto
   * mediano que el de las builds medidas: el orden en que la gente arma esos
   * objetos no cambia porque se los recomendemos nosotros.
   */
  buyOrder: { itemId: number; minute: number }[];
}

export interface HeroEntry {
  heroId: number;
  matches: number;
  builds: HeroBuild[];
  counters: Counter[];
  recommended?: RecommendedBuild;
}

export interface BuildsFile {
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  matches: number;
  k: number;
  /**
   * True cuando la ventana **no** pudo anclarse al parche por falta de muestra y
   * abarca días de antes.
   *
   * Existe para que la tarjeta pueda decirlo. La tier list que la contiene sí
   * corta por parche siempre, así que sin este aviso la fila y su tarjeta
   * estarían describiendo dos juegos distintos sin que nada lo indique.
   */
  crossesPatch?: boolean;
  /**
   * El ajuste del mecanismo de esta corrida: cuánto vale una muerte, un alma y
   * un punto de daño relativo, en fracción de victoria.
   *
   * Se publica porque **la nota del informe de partida usa este mismo reparto**
   * y no puede pagar el pareo entero para volver a estimarlo. Opcional porque los
   * archivos escritos antes de que existiera no lo traen.
   */
  mechanism?: { damage: number; deaths: number; economy: number };
  /** Nombre e ícono de cada habilidad que aparece en algún orden. */
  abilities: Record<string, { name: { en: string; es: string }; img: string }>;
  heroes: HeroEntry[];
}
