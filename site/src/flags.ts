/**
 * La bandera de un país, servida desde el sitio (2026-09-25).
 *
 * Se pedían a flagcdn.com; ahora están en `public/flags/` (las baja
 * `games/deadlock/tools/flags.py`), en los dos tamaños que se usan: 32x24 y
 * 64x48 para pantallas de densidad 2. `code` es el de dos letras que da Steam.
 */
export const flagUrl = (code: string, size: "32x24" | "64x48" = "32x24"): string =>
  `/flags/${size}/${code.toLowerCase()}.png`;
