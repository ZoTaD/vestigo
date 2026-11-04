/**
 * Los modos del Deadlockdle (2026-11-04), que viajan como detalle de la pestaña:
 * `/deadlock/dle` es Heroes; `/dle/items`, `/dle/abilities` y `/dle/ranking`.
 */
export type DleMode = "heroes" | "items" | "abilities";
export type DleView = DleMode | "ranking";

export const DLE_MODES: DleMode[] = ["heroes", "items", "abilities"];
export const DLE_VIEWS: DleView[] = [...DLE_MODES, "ranking"];

/**
 * El ranking queda en construcción hasta que haya jugadores de verdad (ZoTaD,
 * 4/11): la pestaña se ve gris y no se puede abrir, y su dirección abre Heroes.
 * Las partidas y los puestos se guardan igual; abrirlo es cambiar esto a `true`.
 */
export const DLE_RANKING_OPEN = false;

export function dleMode(detail: string | undefined): DleView {
  if (detail === "ranking" && !DLE_RANKING_OPEN) return "heroes";
  return (DLE_VIEWS as string[]).includes(detail ?? "") ? (detail as DleView) : "heroes";
}

/** El detalle de la dirección para un modo: Heroes no lleva. */
export const dleDetail = (view: DleView): string | undefined => (view === "heroes" ? undefined : view);

/**
 * Las columnas de cada modo, igual que `COLUMNS` de `api/src/dle/types.ts`: el
 * prerender dibuja la cabecera del tablero antes de preguntarle nada al Worker.
 */
export const DLE_COLUMNS: Record<DleMode, string[]> = {
  heroes: ["complexity", "health", "moveSpeed", "clip", "gunDps", "winRate"],
  items: ["slot", "tier", "cost", "kind", "upgradeOf", "gives"],
  abilities: ["hero", "slot", "ultimate", "cooldown", "effects"],
};

/** Con cuántos intentos se abre cada pista (igual que `HINT_AT` del Worker). */
export const DLE_HINT_AT = [4, 6, 8];

/** La cookie que deja el login: dice que hay sesión sin preguntarle al Worker. */
export const hasSession = (): boolean => typeof document !== "undefined" && /(?:^|;\s*)vg_in=1/.test(document.cookie);
