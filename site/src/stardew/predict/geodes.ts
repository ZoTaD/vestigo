// Geodas y cajas misteriosas del predictor de Stardew Valley 1.6.15: lo que da cada una de las
// próximas aperturas en el yunque de Clint. Reescribe `Utility.getTreasureFromGeode` y lo que
// `GeodeMenu` hace alrededor; se valida contra el juego real con el comando `geodes` del oráculo
// (`test/fixtures/stardew-predict/geodes.json`).
//
// Cada apertura siembra su propio `Random` con el contador (`GeodesCracked`, o
// `MysteryBoxesOpened` en las cajas), la partida y el granjero, así que la i-ésima apertura sólo
// depende del estado que dejaron las anteriores (contadores y correo).
//
// Lo único que no se puede saber: la cosecha de baja calidad de las cajas
// (`Crop.getRandomLowGradeCropForThisSeason` tira con `Game1.random`). Ahí `Drop.oneOf` dice
// entre cuáles elige el juego; la cantidad sí es exacta.
import { createRandom, type DotNetRandom, type Seed } from "./rng";
import { checkConditions, resolveSpawnItem, type PredictData, type QueryContext } from "./query";

/** Lo que se abre en el yunque: geodas (`535` común, `536` helada, `537` de magma, `749` omni), `275` cofre de artefactos, `791` coco dorado y las cajas. */
export type GeodeKind = "535" | "536" | "537" | "749" | "275" | "791" | "MysteryBox" | "GoldenMysteryBox";

/** El estado del granjero que mira `getTreasureFromGeode`, antes de la próxima apertura. */
export interface GeodeState {
  seed: Seed;
  /** `(int)UniqueMultiplayerID / 2` del granjero que abre (ver `uidHalf` de `save/parse.ts`). */
  uidHalf: number;
  /** `stats.GeodesCracked` (cuenta también las cajas). */
  geodesCracked: number;
  /** `stats.Get("MysteryBoxesOpened")`. */
  mysteryBoxesOpened: number;
  deepestMineLevel: number;
  /** Nivel de pesca sin bonos (`GetUnmodifiedSkillLevel(1)`). */
  fishingLevel: number;
  /** `Game1.season`: 0 primavera ... 3 invierno. */
  season: 0 | 1 | 2 | 3;
  /**
   * `Game1.dayOfMonth`: decide la semilla del mapache de la caja dorada (pasado el día 23 de la
   * primavera o el 20 de las otras, la de la estación siguiente). Sin él, esa semilla sale en `oneOf`.
   */
  day?: number;
  /** El correo del granjero (recibido, en el buzón o para mañana): `artifactFound`, `goldenCoconutHat`, `GotMysteryBook`... */
  mail: string[];
  /** `stats.Get("mastery_0")`: con maestría de cultivo la caja dorada puede dar la galleta de oro. */
  mastery0: number;
  /** `stats.Get("Book_Mystery")`: no cambia lo que sale del yunque (es de `Utility.tryRollMysteryBox`). */
  bookMystery: number;
  /** Encargo especial de Qi en curso con la regla `DROP_QI_BEANS`. */
  qiBeans: boolean;
  /**
   * `netWorldState.GoldenCoconutCracked`: si ya se abrió algún coco dorado en la partida. Sin
   * abrir (o sin dar, como en una partida nueva) el primer coco da una nuez dorada.
   */
  goldenCoconutCracked?: boolean;
}

/** Un premio. */
export interface Drop {
  /** Id calificado, p. ej. `"(O)74"`. Si hay `oneOf`, es sólo el primero de la lista. */
  id: string;
  qty: number;
  /** Si está, el juego elige uno de estos con `Game1.random` y no se puede saber cuál. */
  oneOf?: string[];
}

/** `OrderBy(Precedence)` de LINQ: estable. */
function porPrecedencia<T extends { precedence: number }>(xs: readonly T[]): T[] {
  return xs.map((x, i) => [x, i] as const).sort((a, b) => a[0].precedence - b[0].precedence || a[1] - b[1]).map((p) => p[0]);
}

/** Estado que cambia entre aperturas (copia del de entrada). */
interface Vivo {
  st: GeodeState;
  data: PredictData;
  geodas: number;
  cajas: number;
  correo: Set<string>;
  coco: boolean;
  tipos: Map<string, [categoria: number, tipo: string]>;
}

const d = (id: string, qty = 1): Drop => ({ id, qty });

function contexto(v: Vivo): QueryContext {
  return {
    stat(name) {
      const k = name.toLowerCase();
      if (k === "geodescracked") return v.geodas;
      if (k === "mysteryboxesopened") return v.cajas;
      if (k === "mastery_0") return v.st.mastery0;
      if (k === "book_mystery") return v.st.bookMystery;
      throw new Error(`estadística que el predictor no sabe: ${name}`);
    },
    hasMail: (id) => v.correo.has(id),
  };
}

/** `Crop.getRandomLowGradeCropForThisSeason` (con `Game1.random`): las opciones posibles. En invierno elige antes otra estación. */
function cosechaBaja(v: Vivo, qty: number): Drop {
  const c = v.data.lowGradeCrops;
  const ids = v.st.season === 0 ? c.spring : v.st.season === 1 ? c.summer : v.st.season === 2 ? c.fall : [...c.spring, ...c.summer, ...c.fall];
  const oneOf = [...new Set(ids)].map((x) => "(O)" + x);
  return { id: oneOf[0], qty, oneOf };
}

/** `Utility.getRaccoonSeedForCurrentTimeOfYear(player, random, 8)`: la cantidad es fija y lo que tira después no importa. */
function semillaMapache(v: Vivo, r: DotNetRandom): Drop {
  r.next(2, 4); // cantidad, pisada por el 8
  const { seeds, lastDay } = v.data.raccoonSeeds;
  const est = v.st.season;
  const sig = (est + 1) % 4;
  if (v.st.day === undefined) {
    const oneOf = [...new Set([seeds[est], seeds[sig]])].map((x) => "(O)" + x);
    return { id: oneOf[0], qty: 8, oneOf };
  }
  return d("(O)" + seeds[v.st.day > lastDay[est] ? sig : est], 8);
}

/** `Utility.getRandomIntWithExceptions`. */
function enteroSalvo(r: DotNetRandom, min: number, max: number, salvo: number[]): number {
  let n = r.next(min, max);
  while (salvo.includes(n)) n = r.next(min, max);
  return n;
}

/** La parte de las cajas misteriosas de `Utility.getTreasureFromGeode`. */
function caja(v: Vivo, dorada: boolean, r: DotNetRandom): Drop {
  const st = v.st;
  if (v.cajas > 10 || dorada) {
    const m = dorada ? 2 : 1;
    if (dorada) {
      if (st.mastery0 !== 0 && r.nextBool(0.005)) return d("(O)GoldenAnimalCracker");
      if (r.nextBool(0.005)) return d("(BC)272");
    }
    if (r.nextBool(0.002 * m)) return d("(O)279");
    if (r.nextBool(0.004 * m)) return d("(O)74");
    if (r.nextBool(0.008 * m)) return d("(O)166");
    const libro = v.correo.has("GotMysteryBook");
    if (r.nextBool(0.01 * m + (libro ? 0 : 0.0004 * v.cajas))) {
      if (!libro) {
        v.correo.add("GotMysteryBook"); // lo marca getTreasureFromGeode, no la recogida
        return d("(O)Book_Mystery");
      }
      return d(r.choose("(O)PurpleBook", "(O)Book_Mystery"));
    }
    if (r.nextBool(0.01 * m)) return d(r.choose("(O)797", "(O)373"));
    if (r.nextBool(0.01 * m)) return d("(H)MysteryHat");
    if (r.nextBool(0.01 * m)) return d("(S)MysteryShirt");
    if (r.nextBool(0.01 * m)) return d("(WP)MoreWalls:11");
    if (r.nextBool(0.1) || dorada) {
      switch (r.next(15)) {
        case 0:
          return d("(O)288", 5);
        case 1:
          return d("(O)253", 3);
        case 2:
          if (st.fishingLevel >= 6 && r.nextBool()) return d(r.choose("(O)687", "(O)695"));
          return d("(O)242", 2);
        case 3:
          return d("(O)204", 2);
        case 4:
          return d("(O)369", 20);
        case 5:
          return d("(O)466", 20);
        case 6:
          return d("(O)773", 2);
        case 7:
          return d("(O)688", 3);
        case 8:
          return d("(O)" + r.next(628, 634));
        case 9:
          return cosechaBaja(v, 20);
        case 10:
          if (r.nextBool()) return d("(W)60");
          return d(r.choose("(O)533", "(O)534"));
        case 11:
          return d("(O)621");
        case 12:
          return d("(O)MysteryBox", r.next(3, 5));
        case 13:
          return d("(O)SkillBook_" + r.next(5));
        case 14:
          return semillaMapache(v, r);
      }
    }
  }
  switch (r.next(14)) {
    case 0:
      return d("(O)395", 3);
    case 1:
      return d("(O)287", 5);
    case 2:
      return cosechaBaja(v, 8);
    case 3:
      return d("(O)" + r.next(727, 734));
    case 4:
      return d("(O)" + enteroSalvo(r, 194, 240, [217]));
    case 5:
      return d("(O)709", 10);
    case 6:
      return d("(O)369", 10);
    case 7:
      return d("(O)466", 10);
    case 8:
      return d("(O)688");
    case 9:
      return d("(O)689");
    case 10:
      return d("(O)770", 10);
    case 11:
      return d("(O)MixedFlowerSeeds", 10);
    case 12:
      if (r.nextBool(0.4)) {
        switch (r.next(4)) {
          case 0:
            return d("(O)525");
          case 1:
            return d("(O)529");
          case 2:
            return d("(O)888");
          default:
            return d("(O)" + r.next(531, 533));
        }
      }
      return d("(O)MysteryBox", 2);
    default:
      return d("(O)690");
  }
}

/** `Utility.getTreasureFromGeode`. Devuelve también el correo que marca el premio al recogerlo. */
function tesoro(kind: GeodeKind, v: Vivo): { drop: Drop; flag?: string } {
  const st = v.st;
  const esCaja = kind === "MysteryBox" || kind === "GoldenMysteryBox";
  const r = createRandom(st.seed.legacy, esCaja ? v.cajas : v.geodas, Math.floor(st.seed.gameId / 2), st.uidHalf);
  for (let k = 0; k < 2; k++) {
    const n = r.next(1, 10);
    for (let i = 0; i < n; i++) r.nextDouble();
  }
  if (esCaja) return { drop: caja(v, kind === "GoldenMysteryBox", r) };

  if (r.nextBool(0.1) && st.qiBeans) return { drop: d("(O)890", !r.nextBool(0.25) ? 1 : 5) };
  const geoda = v.data.geodes[kind];
  if (geoda && geoda.drops.length > 0 && (!geoda.defaultItems || r.nextBool())) {
    const ctx = contexto(v);
    for (const p of porPrecedencia(geoda.drops)) {
      if (!r.nextBool(p.chance) || (p.condition !== undefined && !checkConditions(p.condition, ctx))) continue;
      const item = resolveSpawnItem(p, r, ctx);
      if (item) return { drop: d(item.id, item.qty), flag: p.setFlagOnPickup };
    }
  }

  let n3 = r.next(3) * 2 + 1;
  if (r.nextBool(0.1)) n3 = 10;
  if (r.nextBool(0.01)) n3 = 20;
  if (r.nextBool()) {
    switch (r.next(4)) {
      case 0:
      case 1:
        return { drop: d("(O)390", n3) };
      case 2:
        return { drop: d("(O)330") };
      default:
        if (kind === "749") return { drop: d("(O)" + (82 + r.next(3) * 2)) };
        if (kind === "535") return { drop: d("(O)86") };
        if (kind === "536") return { drop: d("(O)84") };
        return { drop: d("(O)82") };
    }
  }
  if (kind === "535") {
    switch (r.next(3)) {
      case 0:
        return { drop: d("(O)378", n3) };
      case 1:
        return { drop: d(st.deepestMineLevel > 25 ? "(O)380" : "(O)378", n3) };
      default:
        return { drop: d("(O)382", n3) };
    }
  }
  if (kind === "536") {
    switch (r.next(4)) {
      case 0:
        return { drop: d("(O)378", n3) };
      case 1:
        return { drop: d("(O)380", n3) };
      case 2:
        return { drop: d("(O)382", n3) };
      default:
        return { drop: d(st.deepestMineLevel > 75 ? "(O)384" : "(O)380", n3) };
    }
  }
  switch (r.next(5)) {
    case 0:
      return { drop: d("(O)378", n3) };
    case 1:
      return { drop: d("(O)380", n3) };
    case 2:
      return { drop: d("(O)382", n3) };
    case 3:
      return { drop: d("(O)384", n3) };
    default:
      return { drop: d("(O)386", Math.trunc(n3 / 2) + 1) };
  }
}

/**
 * Las próximas `count` aperturas de `kind` en el yunque de Clint, en orden: el `i`-ésimo es la
 * apertura `i + 1` desde ahora. Repite el flujo de `GeodeMenu`:
 * - `GeodeMenu.update` suma 1 a `GeodesCracked` (y a `MysteryBoxesOpened` en las cajas) ANTES de tirar;
 * - el primer coco dorado de la partida da una nuez (`GeodeMenu.receiveLeftClick`, `geodeTreasureOverride`);
 * - un artefacto (`Arch`) sin el correo `artifactFound` se cambia por 5 piedras, salvo en el cofre de artefactos;
 * - al recibir el premio (`Farmer.OnItemReceived`): `SetFlagOnPickup` marca su correo (el sombrero del coco sale
 *   una vez), y un mineral (`foundMineral`) o un artefacto (`foundArtifact`) marcan `artifactFound`. Para el
 *   artefacto se supone que el correo falta sólo si el granjero no encontró ninguno (así lo deja el juego).
 */
export function predictGeodes(kind: GeodeKind, st: GeodeState, data: PredictData, count: number): Drop[] {
  const v: Vivo = {
    st,
    data,
    geodas: st.geodesCracked,
    cajas: st.mysteryBoxesOpened,
    correo: new Set(st.mail),
    coco: st.goldenCoconutCracked ?? false,
    tipos: new Map(data.objects.map((o) => ["(O)" + o[0], [o[1], o[2]]])),
  };
  const esCaja = kind === "MysteryBox" || kind === "GoldenMysteryBox";
  const out: Drop[] = [];
  for (let i = 0; i < count; i++) {
    v.geodas++;
    if (esCaja) v.cajas++;
    let drop: Drop;
    let flag: string | undefined;
    if (kind === "791" && !v.coco) drop = d("(O)73");
    else ({ drop, flag } = tesoro(kind, v));
    const tipo = v.tipos.get(drop.id);
    if (kind !== "275" && tipo && tipo[1] !== "Minerals" && tipo[1] === "Arch" && !v.correo.has("artifactFound")) {
      drop = d("(O)390", 5);
      flag = undefined;
    }
    out.push(drop);
    // Farmer.OnItemReceived
    if (drop.id === "(O)73") v.coco = true;
    if (flag !== undefined) v.correo.add(flag);
    const t = drop.oneOf ? undefined : v.tipos.get(drop.id);
    if (t && (t[0] === -2 || t[1] === "Minerals" || t[1] === "Arch")) v.correo.add("artifactFound");
  }
  return out;
}
