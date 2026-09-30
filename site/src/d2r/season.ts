/**
 * La temporada de Clasificación en curso. El juego no la trae en sus archivos
 * (la decide el servidor): se cambia a mano cuando empieza la siguiente. La 15
 * empezó el 21-ago-2026 con el parche 3.3. La usan las pastillas de la portada
 * y la calculadora de drops (lo exclusivo de Clasificación depende de ella).
 *
 * Después de cambiarla, correr `npm run d2:drops` (scripts/d2-drops.ts) desde
 * site/: los "Dónde farmearlo" de las fichas están calculados con esta
 * temporada, y un test se pone en rojo mientras no se regeneren.
 */
export const SEASON = 15;
