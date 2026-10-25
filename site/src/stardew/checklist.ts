/**
 * Las listas para tildar de la sección Stardew Valley (2026-10-25), guardadas en el navegador: el Centro Comunitario
 * (`sdv-cc-v1`), el Museo (`sdv-museum-v1`) y la Isla (`sdv-nuts-v1`). Sin cuenta ni servidor: `localStorage`, una
 * clave por lista. Cada lectura y cada escritura va en `try/catch`: en una ventana privada o con los datos del sitio
 * bloqueados el acceso tira, y la lista tiene que andar igual (sin guardar).
 *
 * Lo guardado puede venir de otra versión del sitio: acá sólo se descarta lo que no es una marca (`true`); las claves
 * que la lista ya no tiene las ignora quien cuenta (no se borran, por si vuelven).
 */

/** Lo tildado: clave → true. Sólo hay claves tildadas. */
export type Done = Record<string, true>;
/**
 * Lo tildado cuando una fila puede quedar a medias (las nueces de caída limitada de la Isla): `true` es la fila entera
 * y un número, cuántas lleva.
 */
export type Marks = Record<string, true | number>;

/** Lo guardado con esa clave, o `{}` si no hay nada, no se puede leer o no es lo que se escribió. */
export function readDone(key: string): Done {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v === true)) as Done;
  } catch {
    return {};
  }
}

/** Como `readDone`, pero además guarda los números enteros positivos (lo que lleva una fila a medias). */
export function readMarks(key: string): Marks {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v === true || (Number.isInteger(v) && (v as number) > 0))) as Marks;
  } catch {
    return {};
  }
}

/** Guarda lo tildado; si el navegador no deja, no guarda y sigue. */
export function writeDone(key: string, d: Done | Marks): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(d));
  } catch {
    /* sin almacenamiento: el avance dura mientras la página esté abierta */
  }
}

/** Tilda o destilda una clave, sin tocar el original. */
export function toggle(d: Done, k: string): Done {
  if (d[k]) {
    const { [k]: _quitada, ...resto } = d;
    return resto;
  }
  return { ...d, [k]: true };
}
