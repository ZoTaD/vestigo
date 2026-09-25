/**
 * El lector de partidas de Valheim (1.0 y anteriores): la carpeta del mundo
 * (o su zip) y los personajes. Todo sin DOM, para correr en un Web Worker;
 * lo que no se entiende va a `warnings` y no corta la lectura.
 *
 * - `readWorld(files)`: los archivos de una carpeta de mundo.
 * - `readCharacter(file)`: un `.fch`.
 * - `unzip(data)`: un zip a archivos sueltos.
 */
export * from "./contract";
export { readWorld } from "./world";
export { readCharacter } from "./character";
export { unzip } from "./zip";
export { exploredFraction, MAP_PIXEL_SIZE } from "./mapData";
