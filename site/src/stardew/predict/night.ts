// Eventos de la noche del predictor de Stardew Valley 1.6.15: hada, bruja, meteorito, estatua del
// búho, cápsula, terremoto, el árbol del mapache y el avión de Qi. Reescribe `Utility.pickFarmEvent`;
// se valida contra el juego real con el comando `night` del oráculo
// (`test/fixtures/stardew-predict/night.json`).
//
// El juego elige al terminar la noche, ya con la fecha y `DaysPlayed` del día nuevo, con
// `Utility.CreateDaySaveRandom()` (semilla y día): saltea 10 tiradas y prueba cada evento en orden.
// Lo que depende de la partida: la despensa del Centro Comunitario y el árbol del mapache, la cápsula
// ya vista (`Got_Capsule`), el avión de Qi ya visto y la rosa de hadas madura en la granja.
//
// Lo que NO está: las noches de boda (no hay evento), los cambios del pueblo por correo de mañana
// (cuartos del Centro Comunitario o de Joja, el cine, Leo, el barco de Willy, los loros dorados) y el
// derrumbe de JojaMart en las noches de lluvia: dependen de lo que el granjero haga hoy y van antes
// que todos los de acá.
import { daySaveRandom, type Seed } from "./rng";

export type NightEvent =
  | "fairy"
  | "fairyIfRose"
  | "witch"
  | "meteorite"
  | "owl"
  | "capsule"
  | "earthquake"
  | "raccoon"
  | "qiPlane";

export interface NightOpts {
  /** La fecha del día nuevo de la primera noche (la que lleva a `fromDaysPlayed`). */
  year: number;
  season: 0 | 1 | 2 | 3;
  day: number;
  /** El anfitrión ya tiene el correo `Got_Capsule`. */
  gotCapsule: boolean;
  /** El granjero tiene el correo `ccPantry` (la despensa del Centro Comunitario). */
  ccPantry: boolean;
  /** El anfitrión ya tiene `raccoonTreeFallen` (cayó el árbol del mapache). */
  raccoonTreeFallen: boolean;
  /**
   * El granjero ya vio el avión de Qi (`sawQiPlane`). Sin dar: sí si la primera noche es después del
   * día 51 (la primera en que sale siempre); el boleto del cartel (`gotFirstBillboardPrizeTicket`) lo
   * adelanta y no está en esa cuenta.
   */
  sawQiPlane?: boolean;
  /** El granjero tiene el boleto del cartel (`gotFirstBillboardPrizeTicket`). Sin dar: no. */
  billboardTicket?: boolean;
  /**
   * Hay una rosa de hadas madura en la granja esa noche (`Farm.hasMatureFairyRoseTonight`: sube el
   * hada de 0,01 a 0,017). Sin dar: las noches en que sólo con la rosa viene el hada salen
   * `"fairyIfRose"` (y la cuenta sigue como si viniera; sin rosa, esa noche se ve con `false`).
   */
  fairyRose?: boolean;
}

/**
 * `Utility.pickFarmEvent()` para `nights` noches seguidas: la noche `i` es la que lleva al día
 * `fromDaysPlayed + i`. Lo que un evento cambia para las noches siguientes se arrastra: la cápsula marca
 * `Got_Capsule`, el mapache `raccoonTreeFallen` y el avión `sawQiPlane`. `null` = no pasa nada.
 */
export function predictNights(seed: Seed, fromDaysPlayed: number, nights: number, opts: NightOpts): (NightEvent | null)[] {
  let { year, season, day } = opts;
  let capsula = opts.gotCapsule;
  let mapache = opts.raccoonTreeFallen;
  let avion = opts.sawQiPlane ?? fromDaysPlayed > 51;

  const noche = (dp: number): NightEvent | null => {
    // `_newDayAfterFade` sólo elige evento si `DaysPlayed > 1`.
    if (dp <= 1) return null;
    const r = daySaveRandom(seed, dp);
    for (let k = 0; k < 10; k++) r.nextDouble();
    if (dp === 31) return "earthquake";
    // Con la despensa tira aunque el árbol ya esté caído.
    if (opts.ccPantry && r.nextDouble() < 0.1 && !mapache) {
      mapache = true;
      return "raccoon";
    }
    // Sin el avión visto: sale con el boleto del cartel o pasado el día 50.
    if (!avion && (opts.billboardTicket || dp > 50)) {
      avion = true;
      return "qiPlane";
    }
    // La tirada del hada se hace siempre; el invierno y el día 1 sólo la descartan.
    const hada = r.nextDouble();
    if (season !== 3 && day !== 1) {
      if (hada < 0.01) return "fairy";
      if (hada < 0.01 + 0.007 && opts.fairyRose !== false) return opts.fairyRose ? "fairy" : "fairyIfRose";
    }
    if (r.nextDouble() < 0.01 && dp > 20) return "witch";
    if (r.nextDouble() < 0.01 && dp > 5) return "meteorite";
    if (r.nextDouble() < 0.005) return "owl";
    if (r.nextDouble() < 0.008 && year > 1 && !capsula) {
      capsula = true;
      return "capsule";
    }
    return null;
  };

  const out: (NightEvent | null)[] = [];
  for (let i = 0; i < nights; i++) {
    out.push(noche(fromDaysPlayed + i));
    day++;
    if (day > 28) {
      day = 1;
      season = ((season + 1) % 4) as NightOpts["season"];
      if (season === 0) year++;
    }
  }
  return out;
}
