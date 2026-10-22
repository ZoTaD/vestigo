/**
 * El avance del Centro Comunitario (2026-10-22): qué casilleros tildó el jugador, guardado en el navegador. Sin cuenta
 * ni servidor: `localStorage` con la clave `sdv-cc-v1`. Cada lectura y cada escritura va en `try/catch`: en una
 * ventana privada o con los datos del sitio bloqueados el acceso tira, y la lista tiene que andar igual (sin guardar).
 */
import type { Bundle, Room } from "../data";

/** Los casilleros tildados: clave `"Sala/índice:posición"` ("Pantry/1:0") → true. Sólo hay claves tildadas. */
export type Done = Record<string, true>;

const STORAGE_KEY = "sdv-cc-v1";

export const doneKey = (room: string, index: number, pos: number): string => `${room}/${index}:${pos}`;

/** Lo guardado, o `{}` si no hay nada, no se puede leer o no es lo que se escribió. */
export function readDone(): Done {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v === true)) as Done;
  } catch {
    return {};
  }
}

/** Guarda lo tildado; si el navegador no deja, no guarda y sigue. */
export function writeDone(d: Done): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* sin almacenamiento: el avance dura mientras la página esté abierta */
  }
}

/** Tilda o destilda una clave, sin tocar el original. */
export function toggle(d: Done, key: string): Done {
  if (d[key]) {
    const { [key]: _quitada, ...resto } = d;
    return resto;
  }
  return { ...d, [key]: true };
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
