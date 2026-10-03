/**
 * Los slugs en español de Objetos para los enlaces del Mapa (2026-10-02): la hoja de un escondite (`StashCard`) y "Qué
 * hay" en la hoja de un edificio (`RoomLoot`) enlazan a fichas, y en español la dirección lleva el slug en español
 * (`/objetos/tazon`). Son los de las 3.826 fichas (el mismo chunk que baja la pestaña Objetos): se piden recién al abrir
 * una hoja, con un `import()` aparte, así no entran ni al chunk del Mapa ni al de la hoja del edificio.
 */
import { registerPzSlugs } from "../../route";

let slugsEs: Promise<void> | null = null;

/** Pide los slugs una vez y los registra; con un fallo (un corte de red), la próxima llamada los vuelve a pedir. */
export const loadItemSlugsEs = (): Promise<void> =>
  (slugsEs ??= import("virtual:pz-slugs-es/items").then(
    (m) => registerPzSlugs(m.default),
    (err) => {
      slugsEs = null;
      throw err;
    },
  ));
