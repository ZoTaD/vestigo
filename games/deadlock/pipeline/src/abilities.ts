/**
 * El orden en que se suben las habilidades, y sus íconos.
 *
 * **Esto NO sale del snapshot y hay que decirlo.** Verificado: `ability_stats`
 * viene vacío (cardinalidad media 0,51 sobre 166.656 filas) y `ability_points` es
 * sólo el total de puntos, no el reparto. El orden sale de
 * `/v1/analytics/ability-order-stats`, que es la **API en vivo** de deadlock-api.
 *
 * Es una dependencia de tipo distinto a la que ya teníamos: del snapshot de
 * archivos, si se cae, seguimos publicando lo de ayer; de la API en vivo, si se
 * cae, falta un panel. Por eso **nada de acá tira**: si falla, se devuelve vacío,
 * el JSON sale sin `abilityOrder` y la tarjeta no dibuja ese panel.
 *
 * Los IDs cruzan con `items.imbued_ability_id` del snapshot, que sí es nuestro:
 * para el héroe 1 las dos fuentes dan 1593133799, 491391007 y 3516947824. Dos
 * caminos independientes que coinciden.
 */

const ANALYTICS = "https://api.deadlock-api.com/v1/analytics/ability-order-stats";
const ASSETS = "https://api.deadlock-api.com/v1/assets/items";

/** Cuántas secuencias hacen falta para creerle a la más común. */
const MIN_MATCHES = 500;

/**
 * El rango que se le pide a la API, para que el panel describa la **misma
 * población que el resto de la tarjeta**.
 *
 * La insignia vale `rango*10 + subnivel`, así que una banda de rangos 7 y 8 es
 * 70..89. Sin esto la API contesta con todos los rangos mezclados y el panel
 * diría "así se sube en cualquier lado" abajo de una build que dice otra cosa.
 * Se notó comparando contra Deadlock Labs: para Lash ellos daban
 * Ground Strike → Grapple → Flog y nosotros al revés, justamente por medir
 * poblaciones distintas.
 *
 * **Estuvo clavado en 91 (Fantasma 1) hasta el 2026-07-31**, cuando la banda
 * publicada dejó de ser siempre Fantasma+. Con el rango fijo, el panel medía una
 * población que la tarjeta ya no mostraba — y no es teórico: con Fantasma+, la
 * build de vitalidad de Lash daba Flog primero, y con su banda real da Ground
 * Strike, igual que el resto.
 */
export interface BadgeRange {
  min: number;
  max: number;
}

/** El rango de insignias que cubre una banda, de sus rangos de menor a mayor. */
export const badgeRange = (tiers: number[]): BadgeRange => ({
  min: Math.min(...tiers) * 10,
  // +9 y no +6: el subnivel llega a 6, pero un techo holgado no deja afuera
  // nada y no mete el rango siguiente, que empieza en el múltiplo de 10.
  max: Math.max(...tiers) * 10 + 9,
});

interface OrderRow {
  abilities: number[];
  matches: number;
  wins: number;
}

/**
 * El orden de las cuatro habilidades de un héroe: la primera vez que cada una
 * aparece en la secuencia más jugada.
 *
 * La secuencia cruda tiene repeticiones —se sube la misma habilidad varias
 * veces— y lo que la tarjeta muestra es en qué orden se **desbloquean**, que es
 * la primera aparición de cada una.
 *
 * **Quedarse con la secuencia más jugada y no promediar todas es suficiente, y
 * está verificado**: para Lash en Fantasma+ la API devuelve 7 secuencias sobre
 * 7.926 partidas, la más jugada tiene 2.665 (34%), y **las tres más jugadas dan
 * el mismo orden de primera aparición**. No es el resultado de haber elegido una.
 *
 * Ojo al comparar contra otros sitios: Deadlock Labs lista las habilidades de
 * Lash en otro orden, pero su lista parece ser el orden de slot del héroe y no el
 * de subida. Son dos números distintos, no un desacuerdo.
 */
export function unlockOrder(rows: OrderRow[]): number[] {
  return unlockOrder2(rows).order;
}

/** La secuencia entera y el orden de desbloqueo que sale de ella. */
export interface AbilityPath {
  /** Las cuatro habilidades por primera aparición. Es lo que ya se mostraba. */
  order: number[];
  /**
   * **La secuencia completa, paso a paso.** Son 15 o 16 subidas, con
   * repeticiones: la misma habilidad se sube hasta cuatro veces. Es lo que hace
   * falta para dibujar la grilla de "qué subir en cada nivel", y ya venía en la
   * respuesta de la API — se descartaba después de leerle las cuatro primeras.
   */
  path: number[];
}

/**
 * El orden de subida de una población, medido sobre **sus propias partidas**.
 *
 * Es el reemplazo de pedirle el orden a la API filtrando por objetos. Esa vía
 * funcionaba, pero **no sabe de arquetipos**: se le manda una lista de objetos y
 * contesta sobre todos los que la compraron, así que dos builds del mismo héroe
 * que difieren en qué maxean recibían la misma respuesta. Medido antes de este
 * cambio: las dos builds de McGinnis publicaban el orden idéntico.
 *
 * Acá la población son los miembros del arquetipo y nada más.
 *
 * **El paso a paso se arma por moda en cada posición, no quedándose con la
 * secuencia más jugada.** Con una sola secuencia se estaría describiendo a la
 * mayoría de una mayoría; por posición, cada paso lo decide toda la gente que
 * llegó hasta ahí. El largo es la mediana, para no inventar pasos que la mitad
 * no alcanza.
 *
 * El orden de las cuatro sale de la **mediana de la posición** en que cada una
 * aparece por primera vez, que es más robusto que mirar sólo el paso a paso: una
 * habilidad puede no ganar ninguna posición por moda y aparecer siempre segunda.
 */
/**
 * Cuántas veces puede aparecer una habilidad en la secuencia de un jugador.
 *
 * Se desbloquea una vez y se mejora **tres** —los escalones cuestan 1, 2 y 5
 * puntos—, así que cuatro es el tope duro del juego. Verificado contra la wiki y
 * la doc de la comunidad, y contra nuestros propios datos: la build de vitalidad
 * de McGinnis da 4/4/4/3, que suma sus 15 pasos exactos.
 *
 * **El tope existe acá porque la agregación por moda no lo respeta sola.** Cada
 * posición se resuelve independiente, así que si la mayoría sube la torreta en
 * los pasos 2 a 6, salen cinco torretas seguidas y la secuencia publicada es una
 * que ningún jugador pudo jugar. Pasó: McGinnis publicaba Mini Turret seis veces.
 */
export const MAX_NIVELES = 4;

export function unlockOrderFromSequences(secuencias: number[][]): AbilityPath {
  const usables = secuencias.filter((s) => s.length > 0);
  if (usables.length === 0) return { order: [], path: [] };

  // ── El paso a paso: moda en cada posición, RESPETANDO EL TOPE ───────────
  const largos = usables.map((s) => s.length).sort((a, b) => a - b);
  const pasos = largos[Math.floor(largos.length / 2)];
  const puestos = new Map<number, number>();
  const path: number[] = [];
  for (let i = 0; i < pasos; i++) {
    const cuenta = new Map<number, number>();
    for (const seq of usables) {
      const id = seq[i];
      if (!id) continue;
      // La que ya está al tope no puede volver a salir: el modo por posición se
      // calcula independiente en cada paso, así que sin este filtro produce una
      // secuencia que ningún jugador pudo jugar.
      if ((puestos.get(id) ?? 0) >= MAX_NIVELES) continue;
      cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    }
    if (cuenta.size === 0) break;
    // Ordenado por id ante empate, para que el resultado no dependa del orden
    // en que se recorrieron los jugadores.
    const [mejor] = [...cuenta].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    path.push(mejor[0]);
    puestos.set(mejor[0], (puestos.get(mejor[0]) ?? 0) + 1);
  }

  // ── El orden: primera aparición EN EL PASO A PASO ───────────────────────
  //
  // Sale del path y no de una cuenta aparte, y eso es lo que garantiza que la
  // grilla y el orden no se contradigan. Con dos cuentas independientes —el path
  // por moda y el orden por mediana de la primera aparición— McGinnis publicaba
  // "Muro → Specter → Torreta" mientras su propia grilla mostraba la torreta
  // segunda.
  const order: number[] = [];
  for (const id of path) if (!order.includes(id)) order.push(id);

  // Si el paso a paso mediano no llega a nombrar las cuatro, se completan con la
  // mediana de su primera aparición: es menos preciso que el path, y es cierto.
  if (order.length < 4) {
    const primeras = new Map<number, number[]>();
    for (const seq of usables) {
      const vistas = new Set<number>();
      seq.forEach((id, i) => {
        if (!id || vistas.has(id)) return;
        vistas.add(id);
        primeras.set(id, [...(primeras.get(id) ?? []), i]);
      });
    }
    const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const resto = [...primeras.entries()]
      // Se exige que la habilidad aparezca en al menos un cuarto de las partidas:
      // sin eso, una subida rarísima entraría al orden por tener mediana baja.
      .filter(([id, pos]) => !order.includes(id) && pos.length >= usables.length / 4)
      .sort((a, b) => mediana(a[1]) - mediana(b[1]) || a[0] - b[0])
      .map(([id]) => id);
    order.push(...resto);
  }

  return { order: order.slice(0, 4), path };
}

export function unlockOrder2(rows: OrderRow[]): AbilityPath {
  const usables = rows.filter((r) => Array.isArray(r.abilities) && r.matches >= MIN_MATCHES);
  if (usables.length === 0) return { order: [], path: [] };
  const mejor = usables.reduce((a, b) => (b.matches > a.matches ? b : a));
  const vistas: number[] = [];
  for (const id of mejor.abilities) {
    if (id && !vistas.includes(id)) vistas.push(id);
    if (vistas.length === 4) break;
  }
  return { order: vistas, path: mejor.abilities.filter((id) => id) };
}

/**
 * Cuántos pedidos van a la vez.
 *
 * **Medido el 2026-07-31: en serie, 76 builds tardaron 574 segundos** — 7,5 por
 * pedido, contra 1,1 en una corrida anterior. La API se pone lenta y el paso se
 * volvió el más caro del pipeline, lo que a dos corridas por hora no entra en el
 * presupuesto de CI.
 *
 * Seis y no más porque el límite de analytics es **400 pedidos por minuto por
 * IP** y las cabeceras `ratelimit-*` lo confirman: a 7,5 segundos cada uno, seis
 * en paralelo son ~48 por minuto, un octavo del techo. Subirlo más apuraría poco
 * y arriesgaría que nos corten en medio de una publicación.
 */
const A_LA_VEZ = 6;

/** Corre `fn` sobre cada elemento, de a `A_LA_VEZ`, conservando el orden. */
export async function enParalelo<T, R>(xs: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  const obrero = async () => {
    while (i < xs.length) {
      const mio = i++;
      out[mio] = await fn(xs[mio]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, xs.length) }, obrero));
  return out;
}

const traer = async (url: string): Promise<unknown | null> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

/**
 * El orden de una población: un héroe, o un héroe **entre quienes armaron ciertos
 * objetos**.
 *
 * `include_item_ids` es lo que hace posible lo segundo, y es la razón de que este
 * archivo exista en esta forma. Hasta el 2026-07-31 se pedía un orden por héroe y
 * se copiaba a sus dos o tres builds, así que las tres decían lo mismo **por
 * construcción, no por medición**. Medido en Lash sobre su banda real: la build
 * de arma sube **Flog** primero y las otras dos **Ground Strike**, con 962
 * partidas en la secuencia más jugada — el doble del mínimo que ya exigíamos.
 */
async function orderFor(heroId: number, badge: BadgeRange, items?: number[]): Promise<AbilityPath> {
  const filtro = (items ?? []).map((id) => `&include_item_ids=${id}`).join("");
  const json = await traer(
    `${ANALYTICS}?hero_id=${heroId}&min_matches=${MIN_MATCHES}` +
      `&min_average_badge=${badge.min}&max_average_badge=${badge.max}${filtro}`
  );
  if (!Array.isArray(json)) return { order: [], path: [] };
  return unlockOrder2(json as OrderRow[]);
}

/** El orden de habilidades de cada héroe. Los que fallen simplemente no están. */
export async function fetchAbilityOrder(
  heroIds: number[],
  badge: BadgeRange
): Promise<Map<number, AbilityPath>> {
  const out = new Map<number, AbilityPath>();
  const paths = await enParalelo(heroIds, (heroId) => orderFor(heroId, badge));
  heroIds.forEach((heroId, n) => {
    if (paths[n].order.length === 4) out.set(heroId, paths[n]);
  });
  return out;
}

/**
 * El orden de una build concreta, o el del héroe si esa build no tiene con qué.
 *
 * **El repliegue importa tanto como la medición.** Una build con poca muestra
 * devolvería un orden armado con un puñado de partidas, y publicar eso sería
 * inventarle una forma de jugar distinta a un héroe por ruido de muestreo — el
 * mismo error que evitamos al no ordenar las builds por winrate crudo. Si la
 * build no llega, se dice lo del héroe, que es cierto aunque sea menos preciso.
 *
 * Los ítems que se mandan son los del **núcleo**, no los doce: cuantos más se
 * exigen, más chica la población, y a partir de cierto punto se estaría midiendo
 * a los que copiaron la build exacta en vez de a los que la juegan.
 */
export async function fetchBuildAbilityOrder(
  heroId: number,
  items: number[],
  badge: BadgeRange,
  heroPath: AbilityPath | undefined
): Promise<AbilityPath | undefined> {
  const propio = await orderFor(heroId, badge, items);
  return propio.order.length === 4 ? propio : heroPath;
}

const HEROES = "https://assets.deadlock-api.com/v2/heroes";

/**
 * En qué casilla numera el juego a cada habilidad: `signature1` a `signature4`.
 *
 * **No es el orden de subida, y ésa es toda la razón por la que existe.** La
 * tarjeta mide en qué orden se **desbloquean** las habilidades, que es un dato
 * nuestro y cambia por build; el juego además las numera del 1 al 4 de forma
 * fija, y es como el jugador las conoce. Las filas de la grilla van por esta
 * numeración y la de subida se lee en las marcas — antes iban por orden de
 * subida y en Ivy salían 1, 3, 2, 4, que se lee como un error.
 *
 * Un solo pedido trae los 57 héroes, y la casilla viene por `class_name`, así que
 * el mapa es de nombre de clase a número. Los nombres de clase son únicos entre
 * héroes, así que un mapa global alcanza.
 *
 * Si falla devuelve el mapa vacío y **no pasa nada**: sin casilla, las filas
 * quedan en el orden en que venían. Es la misma regla que el resto de este
 * archivo — de la API en vivo no depende que se publique.
 */
export async function fetchAbilitySlots(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const json = await traer(`${HEROES}?language=english`);
  if (!Array.isArray(json)) return out;
  for (const hero of json as { items?: Record<string, string> }[]) {
    for (let slot = 1; slot <= 4; slot++) {
      const clase = hero.items?.[`signature${slot}`];
      if (clase) out.set(clase, slot);
    }
  }
  return out;
}

export interface AbilityAsset {
  name: { en: string; es: string };
  img: string;
  /** 1 a 4, como las numera el juego. Ausente si no se pudo averiguar. */
  slot?: number;
}

/**
 * Nombre e ícono de cada habilidad.
 *
 * Salen del **endpoint de ítems**, que es la parte que cuesta descubrir: una
 * habilidad se pide igual que un objeto y contesta con `type: "ability"`,
 * `ability_type: "signature"` e `image_webp`. Verificado: 1593133799 es
 * *Afterburn*.
 */
export async function fetchAbilityAssets(
  abilityIds: number[],
  slots: Map<string, number> = new Map()
): Promise<Record<string, AbilityAsset>> {
  const out: Record<string, AbilityAsset> = {};
  for (const id of abilityIds) {
    const [en, es] = await Promise.all([
      traer(`${ASSETS}/${id}?language=english`),
      traer(`${ASSETS}/${id}?language=spanish`),
    ]);
    const e = en as
      | { name?: string; image_webp?: string; image?: string; class_name?: string }
      | null;
    if (!e?.name) continue;
    const s = es as { name?: string } | null;
    // La casilla cruza por `class_name`, que es el mismo identificador con el que
    // el héroe declara sus cuatro habilidades.
    const slot = e.class_name ? slots.get(e.class_name) : undefined;
    out[String(id)] = {
      name: { en: e.name, es: s?.name ?? e.name },
      img: e.image_webp ?? e.image ?? "",
      ...(slot ? { slot } : {}),
    };
  }
  return out;
}
