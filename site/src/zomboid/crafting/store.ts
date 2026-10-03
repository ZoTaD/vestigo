/**
 * Lo que elegiste en el Planificador de fabricación (2026-10-02): en la dirección, para compartirlo, y en este navegador,
 * para encontrarlo al volver. El mismo trato que el Planificador de Valheim (`valheimPlannerStore.ts`); Personaje, en
 * cambio, vive sólo en la dirección (`?b=`).
 *
 * **Servidor y navegador.** El prerender escribe la página sin nada elegido (la que lee Google), y la hidratación tiene
 * que coincidir: en el servidor y en el primer render, `EMPTY`. Al montarse, antes de pintar (`useLayoutEffect`, así no
 * se ve la hoja vacía un instante), se lee lo guardado y se le suma lo que trae la dirección (`startState`): un botón
 * "Planificá…" de otra pestaña o un link compartido agregan, nunca borran la lista. Todo pasa por `sanitize`: un link
 * viejo (de otro parche) o tocado a mano queda con lo que todavía existe, sin romper la página.
 *
 * Cada cambio reescribe la dirección con `history.replaceState`, sin recargar ni sumar pasos al Atrás.
 */
import { useEffect, useState } from "react";
import { useIsoLayoutEffect } from "../ui";
import { parseRoute } from "../../route";
import { withForeign } from "../foreignQuery";
import type { CraftData } from "./data";
import { EMPTY, encodeState, startState, type CraftState } from "./state";

export const KEY = "vestigo:zomboid:crafting";
/** Las claves de la dirección que son del planificador (`encodeState`); las demás (`utm_…`) se conservan. */
const CRAFT_KEYS = ["q", "r", "o", "x", "f", "t", "b"];

/** Escribe el estado en la dirección (si seguimos en la pestaña) y en este navegador. */
function save(st: CraftState): void {
  const qs = encodeState(st);
  try {
    if (qs) localStorage.setItem(KEY, qs);
    else localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): la lista vive en la dirección y nada más.
  }
  if (parseRoute(window.location.pathname).pzSection !== "crafting") return;
  const url = window.location.pathname + withForeign(window.location.search, CRAFT_KEYS, qs) + window.location.hash;
  window.history.replaceState(window.history.state, "", url);
}

/** Lo que vino en la dirección sumado a lo que quedó guardado (`startState`). */
function read(d: CraftData): CraftState {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Sin almacenamiento: sólo cuenta la dirección.
  }
  return startState(d, window.location.search, saved);
}

/**
 * El estado del planificador y cómo cambiarlo. `path` es la dirección de la página (sin la query): al cambiar de idioma
 * la pestaña sigue montada pero la dirección nueva llega limpia, y hay que volver a escribirle el link.
 */
export function useCraft(d: CraftData, path?: string): [CraftState, (next: CraftState) => void] {
  const [st, setSt] = useState<CraftState>(EMPTY);
  const [ready, setReady] = useState(false);
  useIsoLayoutEffect(() => {
    const s = read(d);
    setSt(s);
    setReady(true);
    save(s);
    // Sólo al montarse (o si cambian los datos): después cada cambio se escribe solo.
  }, [d]);
  useEffect(() => {
    if (ready) save(st);
    // Sólo cuando cambia la dirección (el idioma): los cambios de estado ya se guardan en `set`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const set = (next: CraftState) => {
    setSt(next);
    save(next);
  };
  return [st, set];
}
