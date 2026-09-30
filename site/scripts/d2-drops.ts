/**
 * Los "Dónde farmearlo" de las fichas de la wiki (2026-09-29): los mejores
 * lugares de cada único, pieza y runa con los valores de siempre (1 jugador,
 * 300% de hallazgo mágico, sin Zonas de Terror; en Clasificación sólo lo que
 * esta temporada no cae afuera), calculados con el mismo motor
 * que la calculadora y guardados como datos, así el build no calcula nada.
 * La cuenta de cada bloque vive en `src/d2r/drops/farmEntry.ts`, que comparte
 * con el test que revisa que estos archivos no hayan quedado viejos.
 *
 * Uso (desde site/, después de drops.py y cada vez que cambie `SEASON`):
 *   npm run d2:drops
 * que es:
 *   npx vite-node -c scripts/node.config.ts scripts/d2-drops.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dropData } from "../src/d2r/drops/data";
import { farmFiles } from "../src/d2r/drops/farmEntry";
import { SEASON } from "../src/d2r/season";

const OUT = fileURLToPath(new URL("../../games/d2r/data/drops/computed/", import.meta.url));

const t0 = Date.now();
const { u, s, r, names } = farmFiles(dropData(), SEASON);

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(OUT + name, JSON.stringify(data) + "\n");
write("farm-u.json", u);
write("farm-s.json", s);
write("farm-r.json", r);
write("places.json", names);
console.log(
  `d2-drops: ${Object.keys(u).length} únicos · ${Object.keys(s).length} piezas · ${Object.keys(r).length} runas · ` +
    `${Object.keys(names.s).length} jefes y ${Object.keys(names.a).length} áreas con nombre · ${Math.round((Date.now() - t0) / 1000)} s`,
);
