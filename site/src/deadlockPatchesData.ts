import { useEffect, useState } from "react";

/**
 * El historial de parches de Deadlock.
 *
 * Sale del changelog oficial del foro, que deadlock-api republica en
 * `/v1/patches` — el mismo feed que lee un jugador. Lo escribe `build.ts`, que ya
 * lo baja para saber dónde cortar la ventana de la tier list.
 *
 * **Ojo con el título: es la fecha de la BUILD, no la de publicación.** El parche
 * que llegó a los jugadores el 2026-07-28 se llama "06-30-2026 Update". Por eso
 * la pantalla ordena y encabeza por `date`, y el título va como nombre propio.
 * Ordenar por el título pondría los parches en un orden que no es el real.
 */

export interface Patch {
  /** Cuándo llegó a los jugadores, ISO 8601 UTC. */
  date: string;
  title: string;
  link: string;
}

export interface PatchesFile {
  generatedAt: string;
  patches: Patch[];
}

/** El historial, o null mientras baja. Pesa ~2 KB y se pide al abrir la pestaña. */
export function usePatches(): PatchesFile | null {
  const [file, setFile] = useState<PatchesFile | null>(null);

  useEffect(() => {
    let alive = true;
    import("@deadlock/patches.json")
      .then((m) => {
        if (alive) setFile(m.default as unknown as PatchesFile);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return file;
}
