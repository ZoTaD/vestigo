/**
 * Cuentas chicas de la ficha de Rust, sin React (2026-10-05): duraciones, el tiempo de fabricación en cada banco, el
 * estado al aparecer, la probabilidad y el mantenimiento. Las cifras van sin separador de miles: son chicas.
 */

/** 30 → "30 s", 1200 → "20 min", 3600 → "1 h", 9000 → "2 h 30 min". Las unidades son las mismas en los dos idiomas. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * El tiempo de fabricación en cada banco, desde el que pide la receta hasta el 3 (`ItemCrafter.GetScaledDuration`): con
 * un nivel más, la mitad; con dos o más, un cuarto. El banco 0 es "sin banco".
 */
export function craftTimes(time: number, workbench: number): { bench: number; seconds: number }[] {
  const out: { bench: number; seconds: number }[] = [];
  for (let bench = workbench; bench <= 3; bench++) {
    const d = bench - workbench;
    out.push({ bench, seconds: d === 0 ? time : d === 1 ? time * 0.5 : time * 0.25 });
  }
  return out;
}

/** 0,0123 → "1,2 %"; por debajo de 0,1 % se dice "< 0,1 %" en vez de un cero que miente. */
export function formatChance(p: number, locale: string): string {
  if (p >= 0.995) return "100 %";
  if (p < 0.001) return `< ${(0.1).toLocaleString(locale)} %`;
  const pct = p * 100;
  return `${pct.toLocaleString(locale, { maximumFractionDigits: pct < 10 ? 1 : 0 })} %`;
}

/** El estado con que aparece un objeto: [0,1, 0,2] → "10–20 %"; [1, 1] → "100 %". `pct` pone el espacio del idioma. */
export function condText([lo, hi]: [number, number], pct: (p: number) => string): string {
  const a = Math.round(lo * 100);
  const b = Math.round(hi * 100);
  return a === b ? pct(a) : `${a}–${pct(b)}`;
}

/**
 * El mantenimiento por día de un recurso, de la base más chica a la más grande (`decay.bracket_*`: el armario cobra el
 * 10 % del costo de cada pieza en una base chica y hasta el 33,3 % en una grande), para abajo como en el juego.
 */
export function upkeepRange(amount: number): [number, number] {
  return [Math.floor(amount * 0.1 + 1e-9), Math.floor(amount * 0.333 + 1e-9)];
}
