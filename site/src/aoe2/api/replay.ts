/**
 * Lector mínimo de grabaciones de AoE2: DE (2026-11-20), el mismo que `games/aoe2/tools/replay.py`: sólo encolar,
 * investigar y construir de cada jugador, con su tiempo de juego (segundos). Formato según `mgz` (happyleavesaoc/aoc-mgz,
 * MIT): largo del encabezado, metadatos y operaciones (1 acción, 2 sincronización, 3 vista, 4 chat, 6 resumen final).
 * El encabezado (el mapa, ~5 MB) no se lee. Sin dependencias: corre en la función de Netlify.
 */
export type Accion = { t: number; kind: "queue" | "research" | "build"; id: number; player: number; amount?: number };
/** Una grabación leída: las acciones que interesan, cuántas acciones hizo cada jugador (todas, para el APM) y hasta dónde
 * se leyó, en segundos de juego. */
export type Lectura = { acciones: Accion[]; cuenta: Record<number, number>; fin: number };

const RESEARCH = 101;
const BUILD = 102;
const DE_QUEUE = 129;
const JUGADORES = 8;
const VALORES = 11;

function meta(v: DataView, i: number): number {
  const primero = v.getUint32(i, true);
  i += 4;
  if (primero !== 500) i += 4;
  i += 20;
  const a = v.getUint32(i, true);
  const b = v.getUint32(i + 4, true);
  i += 12;
  if (a !== 0) i -= 12;
  if (b === 2) i -= 8;
  return i;
}

function accion(tipo: number, v: DataView, ini: number, fin: number): Omit<Accion, "t"> | null {
  if (fin - ini < 3) return null;
  const jugador = v.getInt8(ini);
  const largo = v.getInt16(ini + 1, true);
  if (fin - ini !== largo + 3) return null;
  const p = ini + 3;
  if (tipo === DE_QUEUE && fin - p >= 12) return { kind: "queue", id: v.getInt16(p + 8, true), player: jugador, amount: Math.max(1, v.getInt16(p + 10, true)) };
  if (tipo === RESEARCH && fin - p >= 8) return { kind: "research", id: v.getInt16(p + 6, true), player: jugador };
  if (tipo === BUILD && fin - p >= 16) return { kind: "build", id: v.getUint32(p + 12, true), player: jugador };
  return null;
}

/** Las acciones de los primeros `hasta` segundos de juego. Una grabación rota devuelve lo que se pudo leer. */
export function readActions(data: Uint8Array, hasta = 25 * 60): Accion[] {
  return leer(data, hasta).acciones;
}

/** La grabación entera (o hasta `hasta` segundos de juego): ver `Lectura`. */
export function leer(data: Uint8Array, hasta = Infinity): Lectura {
  const out: Accion[] = [];
  const cuenta: Record<number, number> = {};
  let ms = 0;
  try {
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let i = meta(v, v.getUint32(0, true));
    while (i + 4 <= v.byteLength) {
      const op = v.getUint32(i, true);
      i += 4;
      if (op === 1) {
        const largo = v.getUint32(i, true);
        const tipo = v.getUint8(i + 4);
        const a = accion(tipo, v, i + 5, i + 4 + largo);
        // Formato nuevo: jugador (1 byte) y largo (2) al principio de cada acción.
        if (largo >= 4 && v.getInt16(i + 6, true) === largo - 4) {
          const j = v.getInt8(i + 5);
          cuenta[j] = (cuenta[j] ?? 0) + 1;
        }
        i += 4 + largo + 4;
        if (a) out.push({ t: ms / 1000, ...a });
      } else if (op === 2) {
        const inc = v.getUint32(i, true);
        const marca = v.getUint32(i + 4, true);
        i += 8;
        if (marca) i -= 4;
        else if (!v.getUint32(i + 12, true)) i += 24;
        else i += 4 * JUGADORES * VALORES + 4;
        ms += inc;
        if (ms > hasta * 1000) break;
      } else if (op === 3) i += 12;
      else if (op === 4) i += 8 + v.getUint32(i + 4, true);
      else break; // 6 = resumen final; cualquier otra cosa, se corta acá
    }
  } catch {
    // Se pasó del final: queda lo leído.
  }
  return { acciones: out, cuenta, fin: Math.min(ms / 1000, hasta) };
}
