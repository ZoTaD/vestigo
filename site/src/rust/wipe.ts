/**
 * El wipe forzado de Rust (2026-10-05). Es el primer jueves de cada mes, cuando Facepunch saca la actualización
 * mensual, a las 14:00 de Nueva York; la hora UTC cambia con el horario de verano de allá (18:00 o 19:00). Es la hora
 * oficial aproximada: la actualización puede salir unos minutos antes o después, y la portada lo dice.
 */

/**
 * Los minutos que Nueva York está corrida de UTC el jueves `day` de `month` (−240 con horario de verano, −300 sin).
 * La regla de EE. UU. a mano, sin `Intl` (`shortOffset` tira RangeError en Safari < 15.4): el horario de verano va del
 * segundo domingo de marzo al primer domingo de noviembre. El wipe es jueves y el cambio es domingo, así que nunca
 * caen el mismo día y alcanza con comparar fechas.
 */
function newYorkOffset(year: number, month: number, day: number): number {
  const firstSunday = (m: number) => 1 + ((7 - new Date(Date.UTC(year, m, 1)).getUTCDay()) % 7);
  if (month > 2 && month < 10) return -240;
  if (month === 2) return day > firstSunday(2) + 7 ? -240 : -300;
  if (month === 10) return day < firstSunday(10) ? -240 : -300;
  return -300;
}

/** El wipe forzado de un mes (`month` de 0 a 11, como `Date`). */
export function forcedWipe(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const day = 1 + ((4 - first.getUTCDay() + 7) % 7); // 4 = jueves
  const offset = newYorkOffset(year, month, day);
  return new Date(Date.UTC(year, month, day, 14) - offset * 60_000);
}

/** El próximo wipe forzado desde `now`: el de este mes si todavía no pasó, y si no el del mes que viene. */
export function nextForcedWipe(now: Date): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const thisMonth = forcedWipe(y, m);
  if (now.getTime() < thisMonth.getTime()) return thisMonth;
  return m === 11 ? forcedWipe(y + 1, 0) : forcedWipe(y, m + 1);
}
