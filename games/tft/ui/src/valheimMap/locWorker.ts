/**
 * El Web Worker que ubica los lugares de una semilla con el algoritmo del
 * juego (`engine/locations`). Tarda varios segundos: por eso va aparte del que
 * pinta el terreno, y avisa el progreso.
 */
import locations from "@valheimMap/locations.json";
import altbiomes from "@valheimMap/altbiomes.json";
import meta from "@valheimMap/meta.json";
import { placeForSeed } from "./engine/locations";

self.onmessage = (ev: MessageEvent<{ seed: string }>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  try {
    let last = 0;
    const result = placeForSeed(ev.data.seed, { locations, altbiomes, meta }, (done, total) => {
      const p = total ? done / total : 0;
      // No más de un aviso por cada 2 %: el hilo principal no necesita más.
      if (p - last >= 0.02) { last = p; post({ progress: p }); }
    });
    post({ result });
  } catch (e) {
    post({ error: String(e) });
  }
};
