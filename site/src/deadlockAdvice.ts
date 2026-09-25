import type { MatchPlayer, ParsedMatch, Purchase } from "./deadlockMatch";

/**
 * El motor del informe: la nota de cada jugador y los consejos de una partida.
 *
 * **Acá no hay ni una regla escrita a mano, y ese es el punto.** Lo que se
 * programa son *familias* de consejo —una plantilla y un disparador— y todos los
 * umbrales salen de `report.json`, que mide qué hicieron los que ganaron desde
 * la misma situación. "Tarde" no es "después del minuto 20": es tanto después de
 * la mediana de los ganadores. Cuando Valve parchee, los números se mueven solos
 * en la próxima corrida del pipeline.
 *
 * Puro y sin React ni fetch: la partida y la referencia entran como argumentos.
 * Devuelve **id y números, sin prosa** — la copia vive en `i18n.ts`, igual que
 * los Player Tags de TFT. Un consejo sin el número que lo respalda es un
 * horóscopo, así que cada uno viaja con el suyo.
 *
 * Diseño: `docs/design/2026-08-11-informe-de-partida-deadlock-design.md`.
 */

/** Lo que publica `build:report`. Espejo del tipo del pipeline. */
export interface ReportFile {
  generatedAt: string;
  band: string;
  window: { from: string; to: string; matches: number; players: number };
  crossesPatch: boolean;
  patch: { title: string; date: string } | null;
  profileCuts: [number, number];
  durationCuts: [number, number];
  weights: number[];
  signals: string[];
  overlap: number;
  resist: { spirit: number[]; weapon: number[] };
  heroes: Record<string, HeroReport>;
}

export interface HeroReport {
  n: number;
  grade: Record<string, number[]>;
  norm: Record<string, [number, number][]>;
  buys: Record<string, Record<string, [number, number]>>;
  split: [number, number, number];
  imbue: number;
  souls: number;
  slots: number;
  sold: Record<string, number>;
}

/** Lo que el motor necesita saber de un objeto. Sale del catálogo. */
export interface ItemMeta {
  cost: number;
  slot: string;
  upgradesTo?: number[];
}

export type Items = Map<number, ItemMeta>;

/** De peor a mejor. Los cortes de `report.json` las separan en este orden. */
export const LETTERS = ["D", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

/** Una señal de la nota, con lo que hace falta para poder explicarla. */
export interface Signal {
  /** `souls`, `damage` o `deaths`. */
  id: string;
  /** La cuota del jugador sobre el total de su equipo. */
  share: number;
  /** La cuota típica de ese héroe en partidas así de largas. */
  typical: number;
  /** A cuántos desvíos de lo típico quedó. Negativo es por debajo. */
  z: number;
  /**
   * Cuánto sumó o restó esta señal a la nota: el desvío por su peso.
   *
   * **Negativo es lo que costó**, y sirve para las tres por igual: en muertes el
   * peso es negativo, así que morir de más también da un número negativo. Con
   * esto la página puede decir *qué* pesó en contra en vez de mostrar tres
   * barras y dejar que el lector adivine cuál mirar.
   */
  impact: number;
  /** True cuando estar por encima es peor: morir más no es un logro. */
  lowerIsBetter: boolean;
}

export interface Grade {
  /** La letra, de "D" a "A+". */
  letter: string;
  /** Su lugar en `LETTERS`, para pintarla de oro a bronce sin parsear el texto. */
  index: number;
  /**
   * De qué está hecha la letra.
   *
   * **Va siempre, no sólo en un tooltip.** Una nota sin desglose es el *grade* de
   * Statlocker, que es exactamente lo que este producto no quiere ser; y medido
   * sobre partidas reales, hay muchas donde no hay ni un consejo de compras que
   * dar y el desglose es lo único que contesta "¿por qué C+?".
   */
  signals: Signal[];
}

/** En qué tramo de duración cae una partida. */
export const durationBucket = (durationS: number, cuts: [number, number]): number =>
  durationS < cuts[0] ? 0 : durationS < cuts[1] ? 1 : 2;

/**
 * Cuánto gastó un jugador en cada categoría de tienda, contando **lo que le
 * quedó en la mano**.
 *
 * Es la misma cuenta que hace `damageSplit` en el pipeline y por el mismo
 * motivo: cada objeto tiene exactamente un coste y exactamente una categoría, y
 * repartir por lo que el ítem *da* no cierra —el 23% de los objetos no declara
 * tipo y el 30% declara dos—.
 */
export function spendOf(p: MatchPlayer, items: Items): { weapon: number; vitality: number; spirit: number } {
  const out = { weapon: 0, vitality: 0, spirit: 0 };
  for (const id of keptItems(p, items)) {
    const m = items.get(id)!;
    if (m.slot === "weapon") out.weapon += m.cost;
    else if (m.slot === "vitality") out.vitality += m.cost;
    else if (m.slot === "spirit") out.spirit += m.cost;
  }
  return out;
}

/**
 * Los objetos con los que terminó: comprados, no vendidos y **de la tienda**.
 *
 * **Mejorar cuenta como vender** en los datos del juego —el escalón anterior
 * queda con hora de venta— así que esto ya deja afuera los T1 que se
 * convirtieron en T2, que es justo lo que hay que hacer para contar la mano
 * final.
 *
 * **El filtro por catálogo no es una precaución, arregla un número que se veía
 * mal.** El array `items` de una partida trae también habilidades y objetos que
 * no se compran: sin filtrar, un jugador terminaba con "16 objetos" cuando el
 * tope real del juego es 12, y la familia que compara contra los ganadores
 * comparaba peras con manzanas. El catálogo tiene los 156 de tienda.
 */
export const keptItems = (p: MatchPlayer, items: Items): number[] => [
  ...new Set(p.purchases.filter((x) => x.soldS === 0 && items.has(x.itemId)).map((x) => x.itemId)),
];

/**
 * Las compras de tienda en el orden en que las hizo, sin repetir.
 *
 * Un objeto revendido y recomprado aparece dos veces en los datos; lo que
 * describe la partida es cuándo entró la primera vez.
 */
export function buyOrder(p: MatchPlayer, items: Items): Purchase[] {
  const visto = new Set<number>();
  const out: Purchase[] = [];
  for (const c of [...p.purchases].sort((a, b) => a.buyS - b.buyS)) {
    if (!items.has(c.itemId) || visto.has(c.itemId)) continue;
    visto.add(c.itemId);
    out.push(c);
  }
  return out;
}

/**
 * De qué está hecho el gasto de un equipo: la cuota de espíritu del daño.
 *
 * Se calcula igual que en el pipeline —almas de espíritu sobre almas de espíritu
 * más las de arma— porque de esta cuota sale el perfil con el que se busca en la
 * tabla. Si las dos formas de contarla se separaran, el navegador buscaría en una
 * celda distinta de la que el pipeline midió.
 */
export function spiritShare(players: MatchPlayer[], items: Items): number {
  let s = 0;
  let w = 0;
  for (const p of players) {
    const g = spendOf(p, items);
    s += g.spirit;
    w += g.weapon;
  }
  return s + w === 0 ? 0.5 : s / (s + w);
}

/** El perfil del rival: 0 de bala, 1 mezclado, 2 de espíritu. */
export function profileOf(share: number, cuts: [number, number]): number {
  return share < cuts[0] ? 0 : share < cuts[1] ? 1 : 2;
}

const rivals = (m: ParsedMatch, p: MatchPlayer): MatchPlayer[] => m.players.filter((x) => x.team !== p.team);
const mates = (m: ParsedMatch, p: MatchPlayer): MatchPlayer[] => m.players.filter((x) => x.team === p.team);

/**
 * La nota de un jugador.
 *
 * Las tres señales son **cuota del propio equipo** y no números por minuto, y esa
 * decisión es la que hace que la letra signifique algo: medido sobre 632.952
 * jugadores, con almas y daño por minuto los rangos intercuartiles de ganadores y
 * perdedores **no se solapaban** —la nota era el marcador con otro nombre—.
 * Dividiendo por el total del equipo, la suerte del equipo se cancela.
 *
 * Los pesos vienen del mecanismo medido sobre compras pareadas (morir pesa el
 * triple que pegar), y el corte en letras sale de los percentiles reales de ese
 * héroe en ese tramo de duración.
 *
 * Devuelve `null` cuando no hay muestra. Un hueco es honesto; una letra inventada
 * no.
 */
export function gradeOf(p: MatchPlayer, m: ParsedMatch, report: ReportFile): Grade | null {
  const hero = report.heroes[String(p.heroId)];
  if (!hero) return null;
  const dur = String(durationBucket(m.durationS, report.durationCuts));
  const cuts = hero.grade[dur];
  const norm = hero.norm[dur];
  if (!cuts || !norm) return null;

  const equipo = mates(m, p);
  const total = (f: (x: MatchPlayer) => number) => equipo.reduce((a, x) => a + f(x), 0);
  const cuota = (v: number, t: number) => (t === 0 ? 1 / equipo.length : v / t);

  const cuotas = [
    cuota(p.netWorth, total((x) => x.netWorth)),
    cuota(p.damage, total((x) => x.damage)),
    cuota(p.deaths, total((x) => x.deaths)),
  ];
  const signals: Signal[] = cuotas.map((share, i) => {
    const [media, sd] = norm[i] ?? [0, 0];
    const z = sd === 0 ? 0 : (share - media) / sd;
    return {
      id: report.signals[i] ?? String(i),
      share,
      typical: media,
      z,
      impact: (report.weights[i] ?? 0) * z,
      // El signo del peso ya dice para qué lado es bueno cada señal, así que no
      // hay una segunda lista que mantener: si el pipeline algún día mide que
      // morir suma, esto lo sigue solo.
      lowerIsBetter: (report.weights[i] ?? 0) < 0,
    };
  });

  const c = signals.reduce((a, s, i) => a + (report.weights[i] ?? 0) * s.z, 0);
  const index = cuts.filter((corte) => c >= corte).length;
  return { letter: LETTERS[index], index, signals };
}

export type FamilyId =
  | "resist"
  | "skipped"
  | "late"
  | "unupgraded"
  | "souls"
  | "slots"
  | "split"
  | "imbue"
  | "sold";

export interface Finding {
  id: FamilyId;
  /**
   * Cuánto pesa, de 0 a 1, para ordenar los consejos entre sí.
   *
   * Es siempre **la fracción de ganadores que hizo lo que vos no** (o al revés),
   * a veces escalada por cuánto te apartaste. Una sola unidad para las nueve
   * familias: sin eso, "12 minutos tarde" y "el 93% lo compró" no se pueden
   * ordenar y el informe muestra tres consejos al azar.
   */
  strength: number;
  /** El objeto del que habla, cuando habla de uno. */
  itemId?: number;
  /** Los números que la frase imprime. Sin prosa: la copia vive en `i18n.ts`. */
  n: Record<string, number>;
}

/**
 * Debajo de esto no se dice nada.
 *
 * Medio es "la mitad de los que ganaron lo hizo": abajo de ahí no es un consejo,
 * es una preferencia. Que el informe pueda devolver cero es lo acordado y es lo
 * que hace que los que aparecen se lean.
 */
export const MIN_STRENGTH = 0.5;

/** Cuántos consejos se muestran como mucho. */
export const MAX_FINDINGS = 3;

/** Cuánto tiene que pasarse del minuto mediano para que "tarde" signifique algo. */
const LATE_FACTOR = 0.5;

/**
 * Los consejos de una partida para un jugador.
 *
 * Nueve familias, todas leyendo la misma tabla medida. Se ordenan por peso y se
 * cortan en tres; si ninguna llega al umbral devuelve una lista vacía, y la
 * página dice que la partida se compró bien en vez de rellenar.
 */
export function adviceFor(
  p: MatchPlayer,
  m: ParsedMatch,
  report: ReportFile,
  items: Items
): Finding[] {
  const hero = report.heroes[String(p.heroId)];
  if (!hero) return [];

  const enemigos = rivals(m, p);
  const share = spiritShare(enemigos, items);
  const prof = profileOf(share, report.profileCuts);
  const buys = hero.buys[String(prof)] ?? {};
  const tuyos = new Set(keptItems(p, items));
  const out: Finding[] = [];

  // ── 1. La resistencia que no compraste ────────────────────────────────
  //
  // El tipo de daño no sale del `damage_matrix`: se midió y su `stat_type` no
  // clasifica —los tipos 0, 3 y 4 traen los mismos nombres de fuente—. Sale de
  // cruzar **cuánto daño te hizo cada rival** con **en qué gastó ese rival**, que
  // es la misma cuenta que usa el resto del informe.
  const daño = enemigos.map((e) => ({ e, d: p.damageFrom.get(e.slot) ?? 0 }));
  const totalDaño = daño.reduce((a, x) => a + x.d, 0);
  if (totalDaño > 0) {
    const cuotaEspiritu =
      daño.reduce((a, x) => a + x.d * spiritShare([x.e], items), 0) / totalDaño;
    for (const [tipo, cuota] of [
      ["spirit", cuotaEspiritu],
      ["weapon", 1 - cuotaEspiritu],
    ] as const) {
      const set = report.resist[tipo];
      if (set.some((id) => tuyos.has(id))) continue;
      // Cuánto compran los ganadores ALGUNA de esas resistencias, en esta
      // situación. Se toma la más comprada y no la suma: sumar tasas de ítems
      // que se llevan juntos daría más de 1.
      const tasa = Math.max(0, ...set.map((id) => buys[String(id)]?.[0] ?? 0));
      const exceso = Math.min(1, Math.max(0, (cuota - 0.5) * 2));
      const strength = tasa * exceso;
      if (strength >= MIN_STRENGTH) {
        const mejor = set
          .map((id) => [id, buys[String(id)]?.[0] ?? 0] as const)
          .sort((a, b) => b[1] - a[1])[0];
        out.push({
          id: "resist",
          strength,
          itemId: mejor?.[0],
          // `spirit` viaja como número porque `n` es un registro de números: la
          // frase cambia de "espíritu" a "bala" y sin esto habría que deducirlo
          // buscando el ítem en las dos listas.
          n: { share: cuota, rate: tasa, spirit: tipo === "spirit" ? 1 : 0 },
        });
      }
    }
  }

  // ── 2 y 3. Lo que no compraste, y lo que compraste tarde ──────────────
  const primera = new Map<number, number>();
  for (const c of p.purchases) {
    const antes = primera.get(c.itemId);
    if (antes === undefined || c.buyS < antes) primera.set(c.itemId, c.buyS);
  }

  for (const [id, [tasa, minuto]] of Object.entries(buys)) {
    const itemId = Number(id);
    if (!tuyos.has(itemId)) {
      // Un objeto que casi todos los ganadores terminan teniendo y vos no.
      if (tasa >= MIN_STRENGTH) out.push({ id: "skipped", strength: tasa, itemId, n: { rate: tasa } });
      continue;
    }
    const tuyo = primera.get(itemId);
    if (tuyo === undefined || minuto <= 0) continue;
    const tarde = tuyo / 60 - minuto;
    if (tarde <= 0) continue;
    const strength = tasa * Math.min(1, tarde / (minuto * LATE_FACTOR));
    if (strength >= MIN_STRENGTH) {
      out.push({ id: "late", strength, itemId, n: { rate: tasa, mine: tuyo / 60, theirs: minuto } });
    }
  }

  // ── 4. El escalón que dejaste sin mejorar ─────────────────────────────
  //
  // Se mira sobre lo que quedó en la mano: si terminaste con el T1 y la mejora la
  // tiene medio mundo, ese es el consejo. Sale del catálogo, no de una lista.
  for (const id of tuyos) {
    for (const arriba of items.get(id)?.upgradesTo ?? []) {
      if (tuyos.has(arriba)) continue;
      const tasa = buys[String(arriba)]?.[0] ?? 0;
      if (tasa >= MIN_STRENGTH) {
        out.push({ id: "unupgraded", strength: tasa, itemId: arriba, n: { rate: tasa, from: id } });
      }
    }
  }

  // ── 5. Las almas que te quedaste ──────────────────────────────────────
  const gasto = spendOf(p, items);
  const sinGastar = Math.max(0, p.netWorth - (gasto.weapon + gasto.vitality + gasto.spirit));
  if (hero.souls > 0 && sinGastar > hero.souls) {
    const strength = Math.min(1, (sinGastar - hero.souls) / hero.souls);
    if (strength >= MIN_STRENGTH) {
      out.push({ id: "souls", strength, n: { mine: sinGastar, theirs: hero.souls } });
    }
  }

  // ── 6. Los espacios vacíos ────────────────────────────────────────────
  if (hero.slots > 0 && tuyos.size < hero.slots) {
    const strength = (hero.slots - tuyos.size) / hero.slots;
    if (strength >= MIN_STRENGTH) {
      out.push({ id: "slots", strength, n: { mine: tuyos.size, theirs: hero.slots } });
    }
  }

  // ── 7. El reparto de las almas ────────────────────────────────────────
  //
  // La distancia es la mitad de la suma de las diferencias absolutas entre los
  // dos repartos normalizados: 0 es idéntico y 1 es no compartir nada. Es la
  // distancia de variación total, que para tres categorías se lee sola.
  const mio = [gasto.weapon, gasto.vitality, gasto.spirit];
  const suyo = hero.split;
  const tm = mio.reduce((a, x) => a + x, 0);
  const ts = suyo.reduce((a, x) => a + x, 0);
  if (tm > 0 && ts > 0) {
    const strength = mio.reduce((a, x, i) => a + Math.abs(x / tm - suyo[i] / ts), 0) / 2;
    if (strength >= MIN_STRENGTH) {
      out.push({
        id: "split",
        strength,
        n: {
          weapon: mio[0] / tm,
          vitality: mio[1] / tm,
          spirit: mio[2] / tm,
          // El reparto de los ganadores viaja al lado del tuyo: la frase compara
          // dos repartos, así que mandar sólo el propio obligaría a la vista a
          // volver a abrir el archivo para completar la otra mitad.
          theirWeapon: suyo[0] / ts,
          theirVitality: suyo[1] / ts,
          theirSpirit: suyo[2] / ts,
        },
      });
    }
  }

  // ── 8. La habilidad que no imbuiste ───────────────────────────────────
  if (p.purchases.every((c) => c.imbued === 0) && hero.imbue >= MIN_STRENGTH) {
    out.push({ id: "imbue", strength: hero.imbue, n: { rate: hero.imbue } });
  }

  // ── 9. Lo que vendiste y nadie vende ──────────────────────────────────
  //
  // La tasa de venta está medida **descontando las mejoras**: en crudo, mejorar
  // un objeto lo deja anotado como vendido y el 79% de los ganadores "vendía"
  // Compress Cooldown.
  for (const c of p.purchases) {
    if (c.soldS === 0) continue;
    if ((items.get(c.itemId)?.upgradesTo ?? []).some((up) => tuyos.has(up))) continue;
    const tasa = hero.sold[String(c.itemId)];
    if (tasa === undefined) continue;
    const strength = 1 - tasa;
    if (strength >= MIN_STRENGTH) {
      out.push({ id: "sold", strength, itemId: c.itemId, n: { rate: tasa, soldAt: c.soldS / 60 } });
    }
  }

  // Un mismo objeto puede disparar dos familias —no lo compraste Y su mejora
  // falta—: se queda la más fuerte, porque decir dos veces lo mismo con dos
  // frases distintas se lee como dos problemas.
  const porObjeto = new Map<string, Finding>();
  const sueltos: Finding[] = [];
  for (const f of out) {
    if (f.itemId === undefined) {
      sueltos.push(f);
      continue;
    }
    const clave = String(f.itemId);
    const antes = porObjeto.get(clave);
    if (!antes || f.strength > antes.strength) porObjeto.set(clave, f);
  }

  /**
   * **Una sola por familia.** Visto en una partida real: los tres consejos
   * salieron "vendiste X", "vendiste Y" y uno más — o sea un consejo repetido
   * tres veces. Con tres lugares, tres familias distintas dicen tres cosas
   * distintas, y la más fuerte de cada una alcanza para señalar el hábito.
   */
  const porFamilia = new Map<FamilyId, Finding>();
  for (const f of [...porObjeto.values(), ...sueltos].sort(
    (a, b) => b.strength - a.strength || a.id.localeCompare(b.id)
  )) {
    if (!porFamilia.has(f.id)) porFamilia.set(f.id, f);
  }

  return [...porFamilia.values()]
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
    .slice(0, MAX_FINDINGS);
}
