/**
 * El avance del Centro Comunitario (2026-10-22): qué casilleros tildó el jugador, guardado en el navegador con la clave
 * `sdv-cc-v1`. Leer, guardar y tildar es lo de `checklist.ts`, que comparten las otras listas (Museo, Isla).
 */
import type { Bundle, Room } from "../data";
import * as checklist from "../checklist";

/** Los casilleros tildados: clave `"Sala/índice:posición"` ("Pantry/1:0") → true. Sólo hay claves tildadas. */
export type Done = checklist.Done;

const STORAGE_KEY = "sdv-cc-v1";

export const doneKey = (room: string, index: number, pos: number): string => `${room}/${index}:${pos}`;

/** Lo guardado, o `{}` si no hay nada, no se puede leer o no es lo que se escribió. */
export const readDone = (): Done => checklist.readDone(STORAGE_KEY);

/** Guarda lo tildado; si el navegador no deja, no guarda y sigue. */
export const writeDone = (d: Done): void => checklist.writeDone(STORAGE_KEY, d);

/** Tilda o destilda una clave, sin tocar el original. */
export const toggle = checklist.toggle;

/**
 * Tilda o destilda partiendo del estado que se está mostrando (no de lo guardado: sin almacenamiento eso sería siempre
 * `{}`), y después intenta guardarlo. Devuelve el estado nuevo.
 */
export function tick(d: Done, key: string): Done {
  const next = toggle(d, key);
  writeDone(next);
  return next;
}

/** Un paquete con la sala a la que pertenece (en los datos la sala lo contiene, el paquete no la nombra). */
export type RoomBundle = Pick<Bundle, "index" | "items" | "need"> & { room: string };

/** Cuántos casilleros tiene tildados un paquete, cuántos pide y si ya está completo (con los requeridos alcanza). */
export function bundleState(b: RoomBundle, done: Done): { have: number; need: number; complete: boolean } {
  const have = b.items.reduce((n, _, i) => n + (done[doneKey(b.room, b.index, i)] ? 1 : 0), 0);
  return { have, need: b.need, complete: have >= b.need };
}

/** Cuántos paquetes de la sala están completos, de cuántos. */
export function roomState(room: Pick<Room, "room"> & { bundles: Pick<Bundle, "index" | "items" | "need">[] }, done: Done): { done: number; total: number } {
  return { done: room.bundles.filter((b) => bundleState({ ...b, room: room.room }, done).complete).length, total: room.bundles.length };
}

/** ¿El objeto se consigue en esa estación? Si no se sabe cuáles (o no se eligió ninguna), sí: queda visible. */
export function inSeason(seasons: Record<string, number[]>, id: string, season: number | null): boolean {
  const s = seasons[id];
  return season === null || !s || s.includes(season);
}

/** El ancla de una sala en la página: `Abandoned Joja Mart` → `abandoned-joja-mart`. */
export const roomAnchor = (room: string): string => room.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** La calidad de los datos del juego (0, 1, 2 y 4 iridio) como índice de `QUALITIES` (0 a 3). */
export const qualityIndex = (q: number): number => (q >= 4 ? 3 : q);
