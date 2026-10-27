/**
 * Los ciclos día/noche de los mundos abiertos de Warframe (2026-10-27), calculados en el navegador: no necesitan red,
 * así la portada los muestra siempre aunque la API en vivo (`live.ts`) esté caída.
 *
 * Las duraciones y la fórmula salen del código abierto de warframestat, el paquete `warframe-worldstate-parser`
 * (licencia MIT, versión 5.5.10, `lib/models/CetusCycle.ts`, `VallisCycle.ts` y `CambionCycle.ts`):
 *  - Cetus: el ciclo dura 150 min, 100 de día y 50 de noche (`maximums = { day: 6e6, night: 3e6 }` ms).
 *  - Valle de Orbis: 1600 s en total (`loopTime = 16e5`); los últimos 1200 s (`coldTime = 12e5`) son frío y los primeros
 *    400 s, calor. Su época es `lStart` del parser, 2026-02-04T19:46:48Z.
 *  - Deriva Cambion: no tiene fórmula propia. El parser la copia de Cetus (`CambionCycle` toma la actividad y el
 *    vencimiento del ciclo de Cetus): Fass es el día de Cetus y Vome su noche.
 *
 * Una diferencia con el parser: el de Cetus no trae época fija, parte del fin de las bounties de los Ostron que lee del
 * worldstate en vivo. Acá la época es un inicio de día observado en la API (`activation` del 2026-10-27 en
 * `cetusCycle`), y de ahí el ciclo sigue exacto de a 150 min. `test/warframeLive.test.ts` lo compara con tres tomas de
 * la API (`test/fixtures/warframe-cycles.json`). La API redondea el vencimiento al minuto: por eso la tolerancia.
 */

const CETUS_EPOCH = Date.UTC(2026, 9, 27, 11, 11, 0);
const CETUS_DAY = 6_000_000;
const CETUS_LOOP = 9_000_000;

const VALLIS_EPOCH = Date.UTC(2026, 1, 4, 19, 46, 48);
const VALLIS_LOOP = 1_600_000;
const VALLIS_COLD = 1_200_000;

export type CycleState<S extends string> = { state: S; endsAt: number };

/** Cetus (y la Llanura de Eidolon): `day` o `night`, y cuándo termina. */
export function cetus(now: number): CycleState<"day" | "night"> {
  const p = (((now - CETUS_EPOCH) % CETUS_LOOP) + CETUS_LOOP) % CETUS_LOOP;
  return p < CETUS_DAY ? { state: "day", endsAt: now + CETUS_DAY - p } : { state: "night", endsAt: now + CETUS_LOOP - p };
}

/** El Valle de Orbis: `warm` o `cold`. */
export function vallis(now: number): CycleState<"warm" | "cold"> {
  const p = (((now - VALLIS_EPOCH) % VALLIS_LOOP) + VALLIS_LOOP) % VALLIS_LOOP;
  const left = VALLIS_LOOP - p;
  return left > VALLIS_COLD ? { state: "warm", endsAt: now + left - VALLIS_COLD } : { state: "cold", endsAt: now + left };
}

/** La Deriva Cambion: Fass de día en Cetus, Vome de noche. */
export function cambion(now: number): CycleState<"fass" | "vome"> {
  const c = cetus(now);
  return { state: c.state === "day" ? "fass" : "vome", endsAt: c.endsAt };
}
