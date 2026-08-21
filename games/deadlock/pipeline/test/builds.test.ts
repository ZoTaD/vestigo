import { describe, it, expect } from "vitest";
import {
  parseCore, groupBuilds, traitOf, damageSplit, countersFrom, chainTo, terminalsOf, collapseChains,
  MAX_SLOTS, MAX_OVERLAP, COUNTER_SWING, COUNTER_EXCESS, COUNTER_MIN_BASE, COUNTER_REACH, buyOrder,
  type Group, type CatalogItem, type CounterRow, type BuildItem,
} from "../src/buildCard";
import { unlockOrder } from "../src/abilities";

const item = (p: Partial<CatalogItem>): CatalogItem => ({
  cost: 3200, tier: 3, slot: "spirit", ...p,
});

/** Un catálogo chico: una cadena de tres y un par de sueltos. */
const catalogo = new Map<number, CatalogItem>([
  [1, item({ tier: 1, cost: 800, upgradesTo: [2], types: ["healing"] })],
  [2, item({ tier: 2, cost: 1600, upgradesFrom: [1], upgradesTo: [3], types: ["healing"] })],
  [3, item({ tier: 3, upgradesFrom: [2], types: ["healing"] })],
  [10, item({ types: ["bullet_damage"] })],
  [11, item({ types: ["tech_damage"] })],
  [12, item({ types: ["health"] })],
  [13, item({ types: ["healing"] })],
  [14, item({ types: ["healing"] })],
  [15, item({ types: ["health"] })],
  [16, item({ types: ["health"] })],
  [17, item({ types: ["health"] })],
  [18, item({ types: ["health"] })],
]);

const grupo = (p: Partial<Group>): Group => ({
  heroId: 1, damage: "spirit", ability: 0, matches: 5000, winRate: 0.52,
  core: "10:0.9,11:0.8,12:0.7,13:0.6,14:0.5,15:0.45", ...p,
});

describe("terminalsOf y chainTo", () => {
  it("sigue la cadena de mejora hacia abajo, transitivamente", () => {
    expect(terminalsOf(catalogo, 1).sort()).toEqual([2, 3]);
    expect(terminalsOf(catalogo, 3)).toEqual([]);
  });

  it("reconstruye el camino desde la raíz hasta el ítem", () => {
    // Es lo que explica por qué doce ítems son diecisiete compras.
    expect(chainTo(catalogo, 3)).toEqual([1, 2, 3]);
    expect(chainTo(catalogo, 10)).toEqual([10]);
  });
});

describe("parseCore", () => {
  it("lee el texto que devuelve SQL", () => {
    expect(parseCore("10:0.9,11:0.5")).toEqual([
      { itemId: 10, prevalence: 0.9 },
      { itemId: 11, prevalence: 0.5 },
    ]);
  });

  it("aguanta el grupo sin núcleo", () => {
    expect(parseCore(null)).toEqual([]);
  });
});

describe("groupBuilds", () => {
  it("descarta el grupo con pocas partidas", () => {
    expect(groupBuilds([grupo({ matches: 100 })])).toEqual([]);
  });

  it("descarta el grupo con un núcleo demasiado chico", () => {
    // Cinco ítems no son una build, son un puñado de ítems sueltos.
    expect(groupBuilds([grupo({ core: "10:0.9,11:0.8,12:0.7,13:0.6,14:0.5" })])).toEqual([]);
  });

  it("colapsa dos builds que son la misma con otro nombre", () => {
    // Comparten 6 de 7: Jaccard 0,75, por encima del corte.
    const a = grupo({ matches: 9000, core: "10:0.9,11:0.9,12:0.9,13:0.9,14:0.9,15:0.9" });
    const b = grupo({ matches: 8000, core: "10:0.9,11:0.9,12:0.9,13:0.9,14:0.9,16:0.9" });
    expect(groupBuilds([a, b])).toHaveLength(1);
  });

  it("publica las dos cuando de verdad se distinguen", () => {
    const a = grupo({ matches: 9000, core: "10:0.9,11:0.9,12:0.9,13:0.9,14:0.9,15:0.9" });
    const b = grupo({ matches: 8000, damage: "weapon", core: "1:0.9,2:0.9,3:0.9,16:0.9,17:0.9,18:0.9" });
    expect(groupBuilds([a, b])).toHaveLength(2);
  });

  it("nunca publica más de tres", () => {
    const cores = [
      "10:0.9,11:0.9,12:0.9,13:0.9,14:0.9,15:0.9",
      "1:0.9,2:0.9,3:0.9,16:0.9,17:0.9,18:0.9",
      "10:0.9,1:0.9,16:0.9,17:0.9,18:0.9,11:0.9",
      "12:0.9,13:0.9,14:0.9,15:0.9,2:0.9,3:0.9",
    ];
    const g = cores.map((c, i) => grupo({ core: c, matches: 9000 - i, ability: i }));
    expect(groupBuilds(g).length).toBeLessThanOrEqual(3);
  });

  it("ordena por partidas: la más jugada manda", () => {
    const a = grupo({ matches: 1000, core: "10:0.9,11:0.9,12:0.9,13:0.9,14:0.9,15:0.9" });
    const b = grupo({ matches: 9000, damage: "weapon", core: "1:0.9,2:0.9,3:0.9,16:0.9,17:0.9,18:0.9" });
    expect(groupBuilds([a, b])[0].matches).toBe(9000);
  });

  it("el corte de solapamiento es el calibrado", () => {
    // Documenta el número: con 0,7 salen tres builds en 35 de 38 héroes.
    expect(MAX_OVERLAP).toBe(0.7);
  });
});

describe("traitOf", () => {
  it("llama vampírica a la que carga curación", () => {
    const its = [13, 14, 1, 2].map((itemId) => ({ itemId }));
    expect(traitOf(its, catalogo)).toBe("vampiric");
  });

  it("llama de aguante a la que carga vida", () => {
    const its = [12, 15, 16, 17, 18].map((itemId) => ({ itemId }));
    expect(traitOf(its, catalogo)).toBe("survival");
  });

  it("cae en daño cuando no hay un rasgo claro", () => {
    expect(traitOf([{ itemId: 10 }, { itemId: 11 }], catalogo)).toBe("dps");
  });
});

describe("damageSplit", () => {
  it("reparte por la categoría de la tienda, que es única por objeto", () => {
    // Contar por `types` daba un número falso: medido sobre lo publicado, el 23%
    // de los objetos no tiene ningún type —eran invisibles— y el 30% tiene dos o
    // tres, así que se contaban repetidos.
    const s = damageSplit([{ itemId: 10 }, { itemId: 11 }, { itemId: 12 }], catalogo);
    const almas = s.weapon.souls + s.vitality.souls + s.spirit.souls;
    expect(almas).toBe(3 * 3200);
  });

  it("cuenta cada objeto exactamente una vez", () => {
    const cat = new Map<number, CatalogItem>([
      [1, item({ slot: "weapon", cost: 3200 })],
      [2, item({ slot: "weapon", cost: 3200 })],
      [3, item({ slot: "vitality", cost: 3200 })],
      [4, item({ slot: "spirit", cost: 3200 })],
    ]);
    const s = damageSplit([1, 2, 3, 4].map((itemId) => ({ itemId })), cat);
    expect(s.weapon.souls).toBe(6400);
    expect(s.vitality.souls).toBe(3200);
    expect(s.spirit.souls).toBe(3200);
  });

  /**
   * **Un objeto de 6.400 no vale lo mismo que uno de 800**, y contando objetos
   * valían igual. Medido sobre las builds publicadas, pesar por almas mueve el
   * reparto 5,6 puntos de mediana y hasta 12 — no es un ajuste cosmético.
   */
  it("pesa por almas, no por cantidad de objetos", () => {
    const cat = new Map<number, CatalogItem>([
      [1, item({ slot: "weapon", cost: 6400 })],
      [2, item({ slot: "spirit", cost: 800 })],
      [3, item({ slot: "spirit", cost: 800 })],
    ]);
    const s = damageSplit([1, 2, 3].map((itemId) => ({ itemId })), cat);
    // Por cantidad daría 33% / 67%; por almas es 6.400 contra 1.600, y lo que se
    // publica es lo que el juego da por eso: +54% de arma contra +11 de espíritu.
    expect(s.weapon.souls).toBe(6400);
    expect(s.weapon.bonus).toBe(54);
    expect(s.spirit.souls).toBe(1600);
    expect(s.spirit.bonus).toBe(11);
  });

  /**
   * El denominador son las almas de la propia build, **no las 28.800 por
   * categoría** que la wiki documenta como techo de escalado. Ese número es un
   * umbral de rendimiento decreciente, no un tope: medido, el 10,5% de las
   * categorías de una build ya lo pasa y la más cargada llega al 144%. De
   * denominador daría barras de más de 100%.
   */
  it("se topea en el último escalón cuando la build pasa las 28.800", () => {
    const cat = new Map<number, CatalogItem>([
      [1, item({ slot: "spirit", cost: 6400 })],
      [2, item({ slot: "spirit", cost: 6400 })],
      [3, item({ slot: "spirit", cost: 6400 })],
      [4, item({ slot: "spirit", cost: 6400 })],
      [5, item({ slot: "spirit", cost: 6400 })],
      [6, item({ slot: "spirit", cost: 6400 })],
      [7, item({ slot: "weapon", cost: 800 })],
    ]);
    const s = damageSplit([1, 2, 3, 4, 5, 6, 7].map((itemId) => ({ itemId })), cat);
    expect(s.spirit.souls).toBe(38400);
    // Pasó el tope de 28.800, así que el bonus se queda en el último escalón.
    expect(s.spirit.bonus).toBe(100);
  });

  it("no deja objetos afuera del reparto", () => {
    // Un objeto sin `types` antes no contaba en ninguna barra; con `slot` sí.
    const cat = new Map<number, CatalogItem>([[1, item({ slot: "spirit", cost: 3200, types: [] })]]);
    expect(damageSplit([{ itemId: 1 }], cat).spirit.souls).toBe(3200);
  });

  // Una build vacía invierte cero y el juego no le da nada. Cero es la respuesta
  // correcta acá, no una ausencia: no hay nada que no sepamos.
  it("una build vacía invierte cero y no cobra bonus", () => {
    expect(damageSplit([], catalogo)).toEqual({
      weapon: { souls: 0, bonus: 0 },
      vitality: { souls: 0, bonus: 0 },
      spirit: { souls: 0, bonus: 0 },
    });
  });
});

describe("countersFrom", () => {
  const fila = (p: Partial<CounterRow>): CounterRow => ({
    heroId: 1, itemId: 10, foeId: 2, rate: 0.05, base: 0.05, n: 3000, ...p,
  });

  /** Doce rivales, que es más parecido a los ~37 reales que cinco. */
  const contra = (tasas: number[], base: number, p: Partial<CounterRow> = {}) =>
    tasas.map((rate, i) => fila({ foeId: i + 2, rate, base, ...p }));

  it("deja core al ítem que se compra parejo contra cualquiera", () => {
    // El caso de Extra Health: salta poco contra su base, aunque salte algo.
    const rows = contra([0.21, 0.22, 0.219, 0.23, 0.225, 0.218, 0.222, 0.216], 0.219);
    expect(countersFrom(rows).get(1)).toBeUndefined();
  });

  it("marca counter al que se dispara contra alguien", () => {
    // El caso de Knockdown: base 3,9% y salta a 8,6% contra un rival concreto,
    // con muestra suficiente para que el azar no lo explique.
    const rows = contra([0.026, 0.03, 0.032, 0.035, 0.038, 0.04, 0.042, 0.086], 0.039, {
      itemId: 20, n: 20_000,
    });
    const c = countersFrom(rows).get(1)!;
    expect(c).toHaveLength(1);
    expect(c[0].relativeSwing).toBeGreaterThan(COUNTER_SWING);
    expect(c[0].excess).toBeGreaterThan(COUNTER_EXCESS);
    expect(c[0].against[0].heroId).toBe(9);
  });

  it("mantiene core a Unstoppable en Lash, que es el caso que importa", () => {
    // Medido: Lash lo compra el 24,2% y entre 37 rivales se mueve 8,7 puntos.
    const rows = contra([0.199, 0.21, 0.22, 0.24, 0.25, 0.26, 0.27, 0.287], 0.242, {
      heroId: 17, itemId: 30,
    });
    expect(countersFrom(rows).get(17)).toBeUndefined();
  });

  it("descarta el objeto que ese héroe casi nunca compra", () => {
    // Pedido de ZoTaD: un situacional tiene que ser algo que esa gente de
    // verdad se buildea. Y es donde vive el ruido: debajo del 3% de uso el azar
    // explica casi todo el salto.
    const rows = contra([0.002, 0.004, 0.006, 0.008, 0.01, 0.012, 0.02, 0.03], 0.008, {
      itemId: 40, n: 20_000,
    });
    expect(countersFrom(rows).get(1)).toBeUndefined();
    expect(COUNTER_MIN_BASE).toBe(0.03);
  });

  it("descarta el salto que el azar explica entero, aunque supere el corte de swing", () => {
    // El defecto que tenía el criterio viejo. Estas tasas dan un swing relativo
    // de 1,28 —por encima del corte— pero con sólo 300 enfrentamientos por rival
    // el azar produce un rango de ese tamaño solo. Mismo salto, muestra chica:
    // el criterio nuevo lo descarta y el viejo lo publicaba.
    const rows = contra([0.026, 0.03, 0.034, 0.038, 0.042, 0.05, 0.06, 0.076], 0.039, {
      itemId: 50, n: 300,
    });
    const solo = countersFrom(rows).get(1);
    expect(solo).toBeUndefined();

    // Y con la misma forma pero muestra de verdad, sí se publica.
    const conMuestra = contra([0.026, 0.03, 0.034, 0.038, 0.042, 0.05, 0.06, 0.076], 0.039, {
      itemId: 50, n: 30_000,
    });
    expect(countersFrom(conMuestra).get(1)).toHaveLength(1);
  });

  it("marca counter al que el héroe ya compra mucho y contra alguien compra casi siempre", () => {
    // El caso de Abrams/Phantom Strike contra Vindicta: base 38% y sube a 59,8%.
    // El swing relativo da 0,78 —lo castiga por común— y el alcance 0,35. Es el
    // emparejamiento más citado del juego y el criterio viejo lo tiraba.
    const rows = contra([0.3, 0.32, 0.35, 0.36, 0.38, 0.4, 0.44, 0.598], 0.38, {
      itemId: 70, n: 20_000,
    });
    const c = countersFrom(rows).get(1)!;
    expect(c).toHaveLength(1);
    expect(c[0].relativeSwing).toBeLessThan(COUNTER_SWING);
    expect(c[0].reach).toBeGreaterThanOrEqual(COUNTER_REACH);
    expect(c[0].against[0].heroId).toBe(9);
  });

  it("deja afuera al core muy comprado que apenas se mueve contra el peor rival", () => {
    // El caso de Sinclair/Rapid Recharge: base 79,4% y sube a 84,9%. Pasa el
    // ruido por la muestra, pero ni el swing ni el alcance lo respaldan — es lo
    // que separa "lo compra siempre" de "lo compra por quién tiene enfrente".
    const rows = contra([0.76, 0.77, 0.78, 0.79, 0.8, 0.81, 0.83, 0.849], 0.794, {
      itemId: 71, n: 40_000,
    });
    expect(countersFrom(rows).get(1)).toBeUndefined();
  });

  it("no dice nada con pocos rivales medidos", () => {
    const rows = contra([0.01, 0.9], 0.05);
    expect(countersFrom(rows).size).toBe(0);
  });

  it("ordena por exceso sobre el azar, no por el salto crudo", () => {
    const flojo = contra([0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.14], 0.08, { itemId: 60, n: 600 });
    const fuerte = contra([0.05, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08, 0.13], 0.07, { itemId: 61, n: 40_000 });
    const c = countersFrom([...flojo, ...fuerte]).get(1) ?? [];
    expect(c[0]?.itemId).toBe(61);
  });
});

describe("unlockOrder", () => {
  it("toma la primera aparición de cada habilidad en la secuencia más jugada", () => {
    const rows = [
      { abilities: [10, 10, 20, 20, 30, 10, 40], matches: 9000, wins: 4600 },
      { abilities: [40, 30, 20, 10], matches: 100, wins: 60 },
    ];
    expect(unlockOrder(rows)).toEqual([10, 20, 30, 40]);
  });

  it("devuelve vacío sin muestra suficiente, así el panel no se dibuja", () => {
    expect(unlockOrder([{ abilities: [1, 2, 3, 4], matches: 10, wins: 5 }])).toEqual([]);
  });

  it("aguanta una respuesta rota sin tirar", () => {
    expect(unlockOrder([])).toEqual([]);
  });
});

describe("los topes del juego", () => {
  it("doce ítems, que es el máximo medido y no el que dice la wiki", () => {
    expect(MAX_SLOTS).toBe(12);
  });
});

describe("collapseChains", () => {
  it("saca el escalón cuando su mejora también está en el núcleo", () => {
    // Un T1 y su T2 pueden superar el umbral del grupo los dos, porque son el
    // terminal de jugadores distintos. Sumados dan dos cuadrados para un objeto.
    const core = [
      { itemId: 1, prevalence: 0.8 },
      { itemId: 3, prevalence: 0.5 },
      { itemId: 10, prevalence: 0.4 },
    ];
    expect(collapseChains(core, catalogo).map((c) => c.itemId)).toEqual([3, 10]);
  });

  it("saca también el escalón del medio de una cadena de tres", () => {
    const core = [
      { itemId: 1, prevalence: 0.9 },
      { itemId: 2, prevalence: 0.7 },
      { itemId: 3, prevalence: 0.6 },
    ];
    expect(collapseChains(core, catalogo).map((c) => c.itemId)).toEqual([3]);
  });

  it("no toca lo que no se mejora", () => {
    const core = [10, 11, 12].map((itemId) => ({ itemId, prevalence: 0.5 }));
    expect(collapseChains(core, catalogo)).toHaveLength(3);
  });

  it("deja el escalón cuando su mejora NO está", () => {
    const core = [{ itemId: 1, prevalence: 0.8 }, { itemId: 10, prevalence: 0.4 }];
    expect(collapseChains(core, catalogo).map((c) => c.itemId)).toEqual([1, 10]);
  });
});

/**
 * **Nadie compra un tier 4 de una.** Los doce cuadrados son los ítems FINALES;
 * el jugador llega a ellos comprando el T1 y mejorándolo. Ordenar los doce
 * finales por su minuto dice cuándo queda terminado cada uno, no qué hace con
 * las almas en la mano — que es lo que el panel promete contestar.
 */
describe("buyOrder", () => {
  const conCadena = (itemId: number, chain: number[]): BuildItem => ({
    itemId, tier: 3, minute: 0, edge: 0, prevalence: 0.5, chain,
  });

  it("desarma cada ítem en sus escalones, no publica sólo el final", () => {
    const minutos = new Map([[1, 4], [2, 11], [3, 9]]);
    const orden = buyOrder(
      [conCadena(2, [1, 2]), conCadena(3, [3])],
      (id) => minutos.get(id)
    );
    // El componente 1 entra en el minuto 4, antes que el ítem suelto 3.
    expect(orden.map((p) => p.itemId)).toEqual([1, 3, 2]);
  });

  it("ordena por minuto y no por precio ni por escalón", () => {
    const minutos = new Map([[10, 20], [11, 3]]);
    const orden = buyOrder(
      [conCadena(10, [10]), conCadena(11, [11])],
      (id) => minutos.get(id)
    );
    expect(orden.map((p) => p.minute)).toEqual([3, 20]);
  });

  // Un componente compartido por dos cadenas se compra una vez. Se queda el
  // minuto más temprano, que es cuando de verdad entró.
  it("no repite un componente que está en dos cadenas", () => {
    const minutos = new Map([[1, 5], [2, 12], [3, 18]]);
    const orden = buyOrder(
      [conCadena(2, [1, 2]), conCadena(3, [1, 3])],
      (id) => minutos.get(id)
    );
    expect(orden.map((p) => p.itemId)).toEqual([1, 2, 3]);
    expect(orden.filter((p) => p.itemId === 1)).toHaveLength(1);
  });

  // Sin minuto medido no se inventa uno: el paso no entra. Un cero lo pondría
  // primero en la lista, que es la peor respuesta posible.
  it("omite el escalón que no tiene minuto medido", () => {
    const orden = buyOrder([conCadena(2, [1, 2])], (id) => (id === 2 ? 10 : undefined));
    expect(orden.map((p) => p.itemId)).toEqual([2]);
  });

  /**
   * El caso de Bebop, que es lo que motivó el desempate por cadena.
   *
   * La mediana del componente está sesgada tarde: se mide sobre TODA la gente
   * que lo compra, incluida la que lo lleva a otra mejora mucho después, y ese
   * mismo número se usa en la build que lo mejora temprano. Así, la mejora podía
   * quedar antes que aquello de lo que se arma — que como lista de compras se lee
   * al revés.
   */
  it("nunca pone una mejora antes del componente del que se arma", () => {
    // El componente (1) mide 12 y su mejora (2) mide 7: el minoto crudo los
    // ordenaría al revés.
    const minutos = new Map([[1, 12], [2, 7]]);
    const orden = buyOrder([conCadena(2, [1, 2])], (id) => minutos.get(id));
    expect(orden.map((p) => p.itemId)).toEqual([1, 2]);
  });

  it("respeta la cadena entera, no sólo el primer escalón", () => {
    const minutos = new Map([[1, 30], [2, 20], [3, 10]]);
    const orden = buyOrder([conCadena(3, [1, 2, 3])], (id) => minutos.get(id));
    expect(orden.map((p) => p.itemId)).toEqual([1, 2, 3]);
  });

  it("no atrasa lo que no depende de nada", () => {
    // El suelto (10) entra en el minuto 1 y no tiene por qué esperar a nadie,
    // aunque la cadena de al lado se haya tenido que reordenar.
    const minutos = new Map([[1, 12], [2, 7], [10, 1]]);
    const orden = buyOrder(
      [conCadena(2, [1, 2]), conCadena(10, [10])],
      (id) => minutos.get(id)
    );
    expect(orden.map((p) => p.itemId)).toEqual([10, 1, 2]);
  });

  it("encadena la dependencia al escalón anterior que sí tenga minuto", () => {
    // Si el paso del medio no se midió, la restricción NO se pierde: la mejora
    // sigue esperando a la raíz.
    const minutos = new Map([[1, 12], [3, 7]]);
    const orden = buyOrder([conCadena(3, [1, 2, 3])], (id) => minutos.get(id));
    expect(orden.map((p) => p.itemId)).toEqual([1, 3]);
  });
});
