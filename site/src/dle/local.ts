import type { Hint, Revealed, Row } from "./api";
import type { DleMode } from "./modes";

/**
 * La partida de quien juega sin cuenta: vive en el navegador, con las filas que
 * ya devolvió el Worker. No entra al ranking (el reloj lo mide el servidor sólo
 * con cuenta). Sin `localStorage` (privado, bloqueado) se juega igual, sin
 * recordar la partida.
 */
export interface LocalGame {
  date: string;
  rows: Row[];
  hints: Hint[];
  solved: boolean;
  /** Sin intentos y sin acertar (desde el 4/11 hay tope). Las partidas viejas no lo traen. */
  lost?: boolean;
  answer?: Revealed;
}

const key = (mode: DleMode, date: string) => `vg_dle_${mode}_${date}`;

export function loadLocal(mode: DleMode, date: string): LocalGame | null {
  try {
    const raw = localStorage.getItem(key(mode, date));
    return raw ? (JSON.parse(raw) as LocalGame) : null;
  } catch {
    return null;
  }
}

export function saveLocal(mode: DleMode, game: LocalGame): void {
  try {
    localStorage.setItem(key(mode, game.date), JSON.stringify(game));
  } catch {
    /* sin almacenamiento: la partida dura lo que dura la pestaña */
  }
}
