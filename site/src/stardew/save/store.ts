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
import { parseSave, type Player, type Save, type SaveError } from "./parse";

/** La clave del navegador. La `v` de adentro es la forma de `Save`: si cambia, subirla (ver `parse.ts`). */
const STORAGE_KEY = "sdv-save-v1";

/** Lo que se guarda: la versión del formato y la partida leída. */
interface Stored {
  v: 1;
  save: Save;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** ¿Un granjero con todo lo que leen `progress.ts` y la pantalla? (los diccionarios y las listas, uno por uno). */
function looksLikePlayer(x: unknown): x is Player {
  if (!isObj(x)) return false;
  return (
    typeof x.name === "string" &&
    typeof x.host === "boolean" &&
    Array.isArray(x.skills) &&
    x.skills.length === 6 &&
    x.skills.every(isNum) &&
    isObj(x.shipped) &&
    isObj(x.fish) &&
    Array.isArray(x.cooking) &&
    isObj(x.cooked) &&
    isObj(x.crafting) &&
    Array.isArray(x.mail) &&
    isObj(x.friends) &&
    Object.values(x.friends).every((f) => isObj(f) && isNum(f.points) && isNum(f.giftsWeek)) &&
    isObj(x.kills) &&
    Array.isArray(x.minesChests) &&
    isObj(x.inventory)
  );
}

/**
 * ¿Tiene la forma de un `Save`? Lo guardado puede venir de otra versión del sitio o estar roto, y una partida a medias
 * rompe al dibujarse: se mira cada campo que se usa, granjero por granjero. Si `Save` cambia de forma, subir `v`.
 */
function looksLikeSave(x: unknown): x is Save {
  if (!isObj(x)) return false;
  const b = x.bundles;
  return (
    typeof x.version === "string" &&
    typeof x.farm === "string" &&
    isNum(x.season) &&
    isNum(x.day) &&
    isNum(x.year) &&
    isNum(x.walnuts) &&
    typeof x.joja === "boolean" &&
    typeof x.ccComplete === "boolean" &&
    Array.isArray(x.buildings) &&
    isObj(x.items) &&
    Array.isArray(x.players) &&
    x.players.length > 0 &&
    x.players.every(looksLikePlayer) &&
    isObj(b) &&
    Array.isArray(b.defs) &&
    b.defs.every((d) => isObj(d) && typeof d.room === "string" && isNum(d.index) && Array.isArray(d.items) && isNum(d.need)) &&
    isObj(b.done) &&
    Object.values(b.done).every(Array.isArray)
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

/** "read": el navegador no pudo leer el archivo; "broken": la partida guardada no se pudo dibujar y se olvidó. */
export type ReadError = SaveError["error"] | "read" | "broken";

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
