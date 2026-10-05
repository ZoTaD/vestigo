/**
 * Cuentas chicas de la ficha de Rust, sin React (2026-10-05): duraciones, el tiempo de fabricación en cada banco y, más
 * adelante, el estado al aparecer y el mantenimiento. Las cifras van sin separador de miles: son chicas.
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
