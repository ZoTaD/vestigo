/**
 * Lo que se saca de una grabación de AoE2 para cada jugador (2026-11-26): apertura, APM, cuándo hizo clic para pasar de
 * edad y qué unidades entrenó. Tiempos y APM en tiempo de juego (el reloj que ve el jugador, más rápido que el real).
 *
 * - APM: todas sus acciones (mover, juntar, encolar…) por minuto de juego.
 * - Edades: el último clic de cada una (si canceló y volvió a hacer clic, cuenta el que quedó). Es el clic, no cuando
 *   llegó: el tiempo de investigación cambia por civ (los malayos pasan más rápido) y eso no está en los datos.
 * - Unidades: lo encolado (con cantidad); lo que se canceló cuenta igual, como en otros analizadores.
 */
import { openings, type Opening } from "./openings";
import { leer, type Lectura } from "./replay";

export const EDADES = [101, 102, 103] as const;

export type Analisis = {
  opening: Opening | null;
  apm: number | null;
  /** Clic a Feudal, Castillos e Imperial, en segundos de juego (null si no llegó a hacerlo). */
  ages: [number | null, number | null, number | null];
  /** `[unidad, cuántas]`, de la más entrenada a la menos. */
  units: [number, number][];
};

const APERTURA_HASTA = 25 * 60;

export function analizar(l: Lectura): Record<number, Analisis> {
  const ops = openings(l.acciones.filter((a) => a.t <= APERTURA_HASTA));
  const jugadores = new Set<number>([...Object.keys(l.cuenta).map(Number), ...l.acciones.map((a) => a.player)].filter((j) => j > 0));
  const minutos = l.fin / 60;
  const out: Record<number, Analisis> = {};
  for (const j of jugadores) {
    const mias = l.acciones.filter((a) => a.player === j);
    const ages = EDADES.map((e) => {
      const clics = mias.filter((a) => a.kind === "research" && a.id === e);
      return clics.length ? Math.round(clics[clics.length - 1].t) : null;
    }) as Analisis["ages"];
    const u = new Map<number, number>();
    for (const a of mias) if (a.kind === "queue") u.set(a.id, (u.get(a.id) ?? 0) + (a.amount ?? 1));
    out[j] = {
      opening: ops[j] ?? null,
      apm: minutos >= 2 ? Math.round((l.cuenta[j] ?? 0) / minutos) : null,
      ages,
      units: [...u].sort((a, b) => b[1] - a[1] || a[0] - b[0]),
    };
  }
  return out;
}

export const analizarGrabacion = (data: Uint8Array): Record<number, Analisis> => analizar(leer(data));
