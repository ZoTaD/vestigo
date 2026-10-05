/**
 * El wipe forzado de Rust (2026-10-05). Es el primer jueves de cada mes, cuando Facepunch saca la actualización
 * mensual, a las 14:00 de Nueva York; la hora UTC cambia con el horario de verano de allá (18:00 o 19:00). Es la hora
 * oficial aproximada: la actualización puede salir unos minutos antes o después, y la portada lo dice.
 */

/** Los minutos que Nueva York está corrida de UTC en un instante (−240 con horario de verano, −300 sin). */
function newYorkOffset(at: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part ? /GMT([+-])(\d+)(?::(\d+))?/.exec(part) : null;
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
}

/** El wipe forzado de un mes (`month` de 0 a 11, como `Date`). */
export function forcedWipe(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const day = 1 + ((4 - first.getUTCDay() + 7) % 7); // 4 = jueves
  // El corrimiento se mide a la hora del wipe: el cambio de horario de allá es un domingo a la madrugada, nunca un jueves.
  const offset = newYorkOffset(new Date(Date.UTC(year, month, day, 19)));
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
