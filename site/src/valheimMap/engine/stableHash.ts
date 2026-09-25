// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Seeds/StableHash.cs
/**
 * `StringExtensionMethods.GetStableHashCode` del juego: convierte el texto de
 * la semilla en el int32 del mundo. La misma función nombra los prefabs (los
 * lugares la usan para sembrar su propio Random).
 *
 * Todo es int32 con desborde: `| 0` y `Math.imul`. Los caracteres son unidades
 * UTF-16, igual que `str[i]` en C# (`charCodeAt`).
 */

/** Las dos "vías" arrancan en 5381; la impar se multiplica por esto al final. */
const LANE_SEED = 5381;
const LANE_COMBINER = 1566083941; // 0x5D588B65

/** `GetStableHashCode(str)`, carácter por carácter como el descompilado. */
export function stableHashCode(str: string): number {
  let num = LANE_SEED;
  let num2 = LANE_SEED;
  const n = str.length;
  // Un NUL corta la cadena (el `str[i] != 0` y el `str[i + 1] == '\0'` del juego).
  for (let i = 0; i < n && str.charCodeAt(i) !== 0; i += 2) {
    num = (((num << 5) + num) | 0) ^ str.charCodeAt(i);
    if (i === n - 1 || str.charCodeAt(i + 1) === 0) break;
    num2 = (((num2 << 5) + num2) | 0) ^ str.charCodeAt(i + 1);
  }
  return (num + Math.imul(num2, LANE_COMBINER)) | 0;
}

/**
 * Las dos vías por separado, como uint: `hash == even + 1566083941 * odd`.
 * La usa la tabla de lugares de SeedLab para agrupar prefabs.
 */
export function stableHashLanes(str: string): { even: number; odd: number } {
  let num = LANE_SEED;
  let num2 = LANE_SEED;
  const n = str.length;
  for (let i = 0; i < n && str.charCodeAt(i) !== 0; i += 2) {
    num = (((num << 5) + num) | 0) ^ str.charCodeAt(i);
    if (i === n - 1 || str.charCodeAt(i + 1) === 0) break;
    num2 = (((num2 << 5) + num2) | 0) ^ str.charCodeAt(i + 1);
  }
  return { even: num >>> 0, odd: num2 >>> 0 };
}

/**
 * La semilla int32 de un texto, con la regla aparte de `World..ctor`: el texto
 * vacío es el mundo 0 (su hash crudo sería 371857150, otro mundo).
 */
export function stableSeed(seedText: string): number {
  return seedText !== "" ? stableHashCode(seedText) : 0;
}
