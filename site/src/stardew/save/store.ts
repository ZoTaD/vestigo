/**
 * Lo que el Lector de partida (etapa 3, tarea 5) guarda y lee en el navegador. El archivo de la partida nunca sale de
 * acá: se lee con `File.text()`, se pasa por `parseSave` y se guarda sólo el `Save` ya leído (ni el XML ni nada que no
 * use la pantalla), en `localStorage` con la clave `sdv-save-v1`. Cada lectura y cada escritura va en `try/catch`: en
 * una ventana privada, con el almacenamiento lleno o bloqueado, la pantalla anda igual y sólo no recuerda la partida.
 *
 * También arma, desde la partida, los casilleros tildados del checklist del Centro Comunitario (`bundles/progress.ts`,
 * su misma clave `sdv-cc-v1`).
 */
import type { Room } from "../data";
import { doneKey, readDone, writeDone, type Done } from "../bundles/progress";
import { parseSave, type Save, type SaveError } from "./parse";

const STORAGE_KEY = "sdv-save-v1";

/** Lo que se guarda: la versión del formato y la partida leída. */
interface Stored {
  v: 1;
  save: Save;
}

/** ¿Tiene la forma de un `Save`? Lo guardado puede venir de otra versión del sitio o estar roto. */
function looksLikeSave(x: unknown): x is Save {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<Save>;
  return (
    typeof s.version === "string" &&
    typeof s.farm === "string" &&
    typeof s.day === "number" &&
    Array.isArray(s.players) &&
    s.players.length > 0 &&
    typeof s.players[0]?.name === "string" &&
    !!s.bundles &&
    Array.isArray(s.bundles.defs) &&
    !!s.items &&
    typeof s.items === "object"
  );
}

/** La partida guardada, o null si no hay, no se puede leer o no es lo que se escribió. */
export function readStoredSave(): Save | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return parsed?.v === 1 && looksLikeSave(parsed.save) ? parsed.save : null;
  } catch {
    return null;
  }
}

/** Guarda la partida leída; si el navegador no deja (lleno, bloqueado), no guarda y sigue. */
export function storeSave(save: Save): void {
  try {
    const out: Stored = { v: 1, save };
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* sin almacenamiento: la partida dura mientras la página esté abierta */
  }
}

/** "Olvidar esta partida". */
export function forgetSave(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* nada que borrar */
  }
}

export type ReadError = SaveError["error"] | "read";

/** Lee el archivo elegido en el navegador. "read" si el navegador no pudo leerlo (permiso, archivo movido). */
export async function readSaveFile(file: Blob): Promise<Save | { error: ReadError }> {
  let xml: string;
  try {
    xml = await file.text();
  } catch {
    return { error: "read" };
  }
  try {
    return parseSave(xml);
  } catch {
    return { error: "not-xml" };
  }
}

/**
 * ¿La partida es de antes de la 1.6? La perfección de la 1.6 suma partes que antes no estaban (nueces, obeliscos de la
 * isla), así que su cifra puede no coincidir con la del juego. Las versiones viejas sin número salen como "1.4", "1.3"
 * o "<1.3" (`parseSave`).
 */
export function isOldVersion(version: string): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version);
  if (!m) return true;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major < 1 || (major === 1 && minor < 6);
}

/**
 * Lo entregado en la partida, como casilleros del checklist del Centro Comunitario. El checklist dibuja los paquetes
 * de `bundles.json` y su clave es "Sala/índice:posición". Un paquete terminado en la partida tilda todo su paquete del
 * checklist (la sala y el índice son los mismos aunque esté remezclado); uno a medias tilda, por cada objeto entregado,
 * el primer casillero del checklist con ese mismo objeto que no esté tomado. Un objeto remezclado que el checklist no
 * tiene no se puede tildar: se saltea. Con la ruta Joja no hay nada que pasar; con el Centro terminado, todo.
 */
export function checklistFromSave(save: Save, rooms: readonly Room[]): Done {
  const out: Done = {};
  const tickAll = (room: string, index: number, n: number) => {
    for (let i = 0; i < n; i++) out[doneKey(room, index, i)] = true;
  };
  if (save.joja) return out;
  if (save.ccComplete) {
    for (const r of rooms) for (const b of r.bundles) tickAll(r.room, b.index, b.items.length);
    return out;
  }
  // Las definiciones de la partida; si no trae (antes de la 1.5), las de bundles.json, que son las mismas.
  const defs = save.bundles.defs.length
    ? save.bundles.defs
    : rooms.flatMap((r) => r.bundles.map((b) => ({ room: r.room, index: b.index, items: b.items, need: b.need })));
  for (const d of defs) {
    const room = rooms.find((r) => r.room === d.room);
    const target = room?.bundles.find((b) => b.index === d.index);
    if (!room || !target) continue;
    const got = save.bundles.done[d.index] ?? [];
    const delivered = d.items.filter((_, i) => got[i]);
    if ((got.length > 0 && got.every(Boolean)) || (delivered.length > 0 && delivered.length >= d.need)) {
      tickAll(room.room, target.index, target.items.length);
      continue;
    }
    const taken = new Set<number>();
    for (const [id] of delivered) {
      const pos = target.items.findIndex(([tid], i) => tid === id && !taken.has(i));
      if (pos < 0) continue;
      taken.add(pos);
      out[doneKey(room.room, target.index, pos)] = true;
    }
  }
  return out;
}

/**
 * Pasa lo hecho en la partida al checklist, sin destildar nada de lo que ya estaba tildado a mano. Devuelve cuántos
 * casilleros quedaron tildados de nuevo.
 */
export function syncChecklist(save: Save, rooms: readonly Room[]): number {
  const before = readDone();
  const add = checklistFromSave(save, rooms);
  const fresh = Object.keys(add).filter((k) => !before[k]).length;
  writeDone({ ...before, ...add });
  return fresh;
}
