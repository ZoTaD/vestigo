import type { Mark, Row } from "./api";
import type { DleMode } from "./modes";

const SQUARE: Record<Mark, string> = { ok: "🟩", near: "🟨", no: "🟥" };
const MODE: Record<DleMode, string> = { heroes: "Heroes", items: "Items", abilities: "Abilities" };

/**
 * El resultado para pegar en X o Discord: una línea de colores por intento, del
 * primero al último, sin nombres, así no arruina la respuesta.
 * `rows` viene como lo muestra el tablero: el último intento primero.
 */
export function shareText({ number, mode, rows, max, solved }: { number: number; mode: DleMode; rows: Row[]; max: number; solved: boolean }): string {
  const lines = [...rows].reverse().map((r) => r.cells.map((c) => SQUARE[c.mark]).join(""));
  // Como Wordle: "4/6" si se acertó, "X/6" si se acabaron los intentos.
  return [`Deadlockdle #${number} · ${MODE[mode]} · ${solved ? rows.length : "X"}/${max}`, ...lines, "vestigo.gg/deadlock/dle"].join("\n");
}
