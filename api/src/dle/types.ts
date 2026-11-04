/**
 * El Deadlockdle (2026-11-04): los tipos del pozo que arma
 * `site/scripts/dle-pool.mjs` y que el Worker lee de vestigo.gg.
 */

export type Mode = "heroes" | "items" | "abilities";
export const MODES: Mode[] = ["heroes", "items", "abilities"];

export type Value = number | string | string[] | null;

export type Hint = { kind: "img"; src: string; blur: boolean } | { kind: "text"; text: string };

export interface Entry {
  /** "hero:3", "item:3190916303", "ability:491391007". */
  id: string;
  /** En inglés, como en el juego. */
  name: string;
  /** Ruta del sitio: "/deadlock/game/images/…". */
  img: string;
  cols: Record<string, Value>;
  /** Las pistas propias; la del arte borroso la arma el Worker. */
  hints: [Hint, Hint];
  /** Ruta sin idioma: "deadlock/heroes/vindicta". */
  link: string;
}

export interface Pool {
  builtAt: string;
  heroes: Entry[];
  items: Entry[];
  abilities: Entry[];
}

/**
 * Las columnas de cada modo, en el orden en que se ven. `num` está cerca a
 * ±10 %, `pct` (winrate) a ±1 punto, `list` si comparte algo.
 */
export const COLUMNS: Record<Mode, { key: string; label: string; type: "exact" | "num" | "pct" | "list" }[]> = {
  heroes: [
    { key: "complexity", label: "Complexity", type: "exact" },
    { key: "health", label: "Health", type: "num" },
    { key: "moveSpeed", label: "Move speed", type: "num" },
    { key: "clip", label: "Clip", type: "num" },
    { key: "gunDps", label: "Gun DPS", type: "num" },
    { key: "winRate", label: "Win rate", type: "pct" },
  ],
  items: [
    { key: "slot", label: "Category", type: "exact" },
    { key: "tier", label: "Tier", type: "exact" },
    { key: "cost", label: "Cost", type: "num" },
    { key: "kind", label: "Kind", type: "exact" },
    { key: "upgradeOf", label: "Upgrade of", type: "exact" },
    { key: "gives", label: "Gives", type: "list" },
  ],
  abilities: [
    { key: "hero", label: "Hero", type: "exact" },
    { key: "slot", label: "Slot", type: "exact" },
    { key: "ultimate", label: "Ultimate", type: "exact" },
    { key: "cooldown", label: "Cooldown", type: "num" },
    { key: "effects", label: "Effects", type: "list" },
  ],
};
