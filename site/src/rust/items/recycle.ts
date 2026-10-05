/**
 * Lo que da el reciclador de Rust por cada objeto (2026-10-05), como `Recycler.RecycleThink` del juego:
 * - cada ingrediente da `cantidad × eficiencia`: la parte entera sale segura y la parte decimal es la chance de que salga
 *   uno más (la munición de 40 mm trae 7,5 de pólvora: en la verde, al 50 %, da 3 seguros y 75 % de uno más);
 * - la chatarra fija de la receta (`scrapFromRecycle`) se escala con `eficiencia ÷ 0,5`, y lo que no llega a una unidad
 *   se acumula entre tandas: en promedio da exactamente la cuenta, y así se muestra.
 * `amount` es por objeto y al 100 % (lo escribe `extract.py`). Antes se redondeaba para arriba: daba 13 fragmentos por
 * engranaje donde el juego da 12 y una moneda al aire.
 */
export interface RecycleYield {
  /** Lo que sale seguro. */
  n: number;
  /** La probabilidad, en %, de que salga uno más (0 si no hay). */
  pct: number;
}

/** Sin el ruido de la coma flotante: 7,5 × 0,4 tiene que dar 3, no 2,9999. */
const clean = (x: number) => Math.round(x * 1e6) / 1e6;

export function recycleYield(amount: number, eff: number): RecycleYield {
  const x = clean(amount * eff);
  const n = Math.floor(x);
  // Para abajo, como las wikis: 0,625 es 62 %, no 63 %.
  return { n, pct: Math.floor(clean((x - n) * 100)) };
}

/** La chatarra fija que da reciclar un objeto, en promedio: `scrapFromRecycle × eficiencia ÷ 0,5`. */
export function recycleScrap(scrap: number, eff: number): number {
  return clean((scrap * eff) / 0.5);
}
