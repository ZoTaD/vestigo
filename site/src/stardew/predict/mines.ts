// Minas del predictor de Stardew Valley 1.6.15: qué pisos del 1 al 119 salen infestados de monstruos,
// de babas, de cantera o con el mapa de hongos cada día. Reescribe la parte de `MineShaft.loadLevel`
// que lo decide; se valida contra el juego real con el comando `mines` del oráculo, que llama a
// `loadLevel` de verdad (`test/fixtures/stardew-predict/mines.json`).
//
// Todo sale de `Utility.CreateDaySaveRandom` (semilla y día): el mapa especial con
// `1293857 + piso * 400` y la infestación con `piso * 100`. Lo que depende de la partida: el piso más
// hondo (con 120 aparecen los mapas especiales, y los de hongos no se infestan), la cantera (correo
// `ccCraftsRoom` y `VisitedQuarryMine`) y el Aceite de ajo (buff "23"), que apaga la infestación y
// con eso cambia qué pisos salen de cantera.
//
// Lo que NO está: la Caverna Calavera (su mapa sale de `mineRandom = new Random()`, sin semilla) y las
// Minas peligrosas del encargo de Qi (`GetAdditionalDifficulty`, que cambia el efecto del ajo).
import { daySaveRandom, type Seed } from "./rng";

export interface MineDay {
  daysPlayed: number;
  /** Pisos infestados de monstruos (`isMonsterArea`). */
  infested: number[];
  /** Pisos infestados de babas (`isSlimeArea`). */
  slime: number[];
  /** Pisos de cantera (`isQuarryArea`). */
  quarry: number[];
  /** Pisos con el mapa de hongos (40, 47, 50 o 51 de `Maps/Mines`). */
  mushroom: number[];
}

export interface MineOpts {
  /** `MineShaft.lowestLevelReached` (el piso más hondo de la partida). */
  lowestMineLevel: number;
  /** El anfitrión tiene el correo `ccCraftsRoom` (y no sólo para mañana) y `VisitedQuarryMine`. */
  quarry: boolean;
  /** Algún granjero conectado tomó Aceite de ajo (buff "23"). Sin dar: no. */
  garlicOil?: boolean;
}

/** `MineShaft.getMineArea(piso)` para los pisos 1 a 120 (sin cantera). */
function zona(piso: number): number {
  if (piso >= 80) return 80;
  if (piso >= 40) return 40;
  // Sí: el juego compara el piso de la mina (`mineLevel < 30`), que acá es el mismo.
  if (piso > 10 && piso < 30) return 10;
  return 0;
}

const HONGOS = [40, 47, 50, 51];

/** El mapa que `loadLevel` le pone al piso y si es uno de hongos (`flag`). */
function mapa(seed: Seed, dia: number, piso: number, hondo: number): { num: number; hongo: boolean } {
  let num = piso % 40 % 20 === 0 && piso % 40 !== 0 ? 20 : piso % 10 === 0 ? 10 : piso;
  num %= 40;
  if (piso === 120) num = 120;
  let hongo = false;
  if (hondo >= 120 && num !== 10 && num % 5 !== 0 && piso > 1) {
    const r = daySaveRandom(seed, dia, 1293857 + piso * 400);
    // `num3 = 0.06` (sólo suma pasando el 120).
    if (r.nextDouble() < 0.06) {
      num = r.next(40, 61);
      if (HONGOS.includes(num) && r.nextDouble() < 0.75) num = r.next(40, 61);
      if (num === 53) num = r.next(52, 61); // la zona nunca es 121 acá
      if (num === 40 && zona(piso) !== 0 && zona(piso) !== 80) num = r.next(52, 61);
      hongo = HONGOS.includes(num);
    }
  }
  return { num, hongo };
}

/**
 * `MineShaft.loadLevel` para los pisos 1 a 119, en cada uno de `days` días desde `daysPlayed`. Por
 * piso: el mapa (`mapa`), y con `CreateDaySaveRandom(piso * 100)` la infestación (0,044; la mitad de
 * monstruos y la mitad de babas) o, si no, la cantera (otra tirada de 0,044). Un piso de cantera
 * nunca queda infestado (el juego lo apaga después).
 */
export function predictMines(seed: Seed, daysPlayed: number, days: number, opts: MineOpts): MineDay[] {
  const out: MineDay[] = [];
  for (let k = 0; k < days; k++) {
    const dia = daysPlayed + k;
    const d: MineDay = { daysPlayed: dia, infested: [], slime: [], quarry: [], mushroom: [] };
    for (let piso = 1; piso <= 119; piso++) {
      const { num, hongo } = mapa(seed, dia, piso, opts.lowestMineLevel);
      if (hongo) d.mushroom.push(piso);
      const r = daySaveRandom(seed, dia, piso * 100);
      const m = num % 40;
      // El orden de las comparaciones importa: el ajo corta antes de tirar.
      if (!opts.garlicOil && r.nextDouble() < 0.044 && num % 5 !== 0 && m > 5 && m < 30 && m !== 19 && !hongo) {
        (r.nextBool() ? d.infested : d.slime).push(piso);
      } else if (r.nextDouble() < 0.044 && opts.quarry && m > 1 && num % 5 !== 0) {
        d.quarry.push(piso);
      }
    }
    out.push(d);
  }
  return out;
}
