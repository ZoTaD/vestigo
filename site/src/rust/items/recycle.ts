/**
 * Lo que da el reciclador de Rust por cada objeto (2026-10-05), como `Recycler.RecycleThink` del juego: un ingrediente
 * con más de 1 por objeto sale entero, redondeado para arriba (`ceil(cantidad × eficiencia)`); uno con 1 o menos sale
 * de a uno, con probabilidad `cantidad × eficiencia`. `amount` es por objeto y al 100 % (lo escribe `extract.py`).
 */
export type RecycleYield = { kind: "fixed"; n: number } | { kind: "chance"; pct: number };

export function recycleYield(amount: number, eff: number): RecycleYield {
  if (amount > 1) return { kind: "fixed", n: Math.ceil(amount * eff - 1e-9) };
  return { kind: "chance", pct: Math.round(amount * eff * 100) };
}
