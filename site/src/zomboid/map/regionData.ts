/**
 * Los archivos de cada región del Mapa de Project Zomboid (2026-09-30), tal como los escribe `map.py` en
 * `games/zomboid/data/map/web/` (el contrato está en el docstring de `write_web`):
 *
 * - `regions/<id>.json`: el dibujo del mapa de papel de una región de 1.500 casillas. Se pide una vez por región, y
 *   sólo cuando la base de papel la muestra.
 * - `zones/<id>.json`: las zonas de las capas del juego de una región (Task 3). Se piden sólo para las regiones que se
 *   ven y sólo con alguna capa de zonas prendida, una vez cada una, y se leen una vez (`parseZones`).
 * - `bld/<id>.json`: los edificios de una región con sus pisos y habitaciones (Task 4). Se piden recién al tocar un
 *   edificio, sólo los de la región tocada (Louisville pesa 229 KB comprimido: no puede bajar con el mapa).
 *
 * Cada archivo es un `import()` aparte (el `import.meta.glob` sin `eager` arma un chunk por región). La lista de esos
 * cargadores (161 rutas) va en este módulo, que sólo usan el visor y las capas: así viaja en el chunk del visor y no en
 * el de la pestaña, que tiene que llegar rápido para el primer dibujo.
 */
import type { RegionDraw } from "./data";
import type { ZoneDefs } from "./layerMeta";
import { parseZones, type Zone, type ZonesFile } from "./layers";
import type { Building } from "./buildings";

const regionFiles = import.meta.glob<{ default: RegionDraw }>("@zomboid/map/web/regions/*.json");
const zoneFiles = import.meta.glob<{ default: ZonesFile }>("@zomboid/map/web/zones/*.json");
const bldFiles = import.meta.glob<{ default: Building[] }>("@zomboid/map/web/bld/*.json");

/** Por id de región ("7_6"), el cargador de su archivo. Se busca por el nombre y no por la clave del glob, que depende del alias. */
function byRegion<T>(files: Record<string, () => Promise<T>>): Map<string, () => Promise<T>> {
  return new Map(
    Object.entries(files).flatMap(([path, load]) => {
      const id = path.match(/(-?\d+_-?\d+)\.json$/)?.[1];
      return id ? [[id, load] as const] : [];
    }),
  );
}
const regionLoaders = byRegion(regionFiles);
const zoneLoaders = byRegion(zoneFiles);
const bldLoaders = byRegion(bldFiles);
const blds = new Map<string, Promise<Building[]>>();
const regions = new Map<string, Promise<RegionDraw>>();
const zones = new Map<string, Promise<Zone[]>>();
const zonesDone = new Map<string, Zone[]>();

/**
 * El dibujo de una región, pedido una sola vez. Una región sin archivo (no debería pedirse: `common.regions` dice
 * cuáles tienen `draw`) vuelve vacía. Si falla la red, la próxima llamada la vuelve a pedir.
 */
export function loadRegion(id: string): Promise<RegionDraw> {
  let p = regions.get(id);
  if (!p) {
    const load = regionLoaders.get(id);
    p = load
      ? load().then(
          (m) => m.default,
          (err) => {
            regions.delete(id);
            throw err;
          },
        )
      : Promise.resolve({});
    regions.set(id, p);
  }
  return p;
}

/**
 * Las zonas de una región, pedidas y leídas una sola vez. Una región sin archivo vuelve vacía; si falla la red, la
 * próxima llamada la vuelve a pedir. `defs` (siempre los mismos en toda la sesión: salen de common.json) deja afuera las
 * historias que el juego nunca arma, así que la lista guardada ya viene sin ellas.
 */
export function loadZones(id: string, defs: ZoneDefs): Promise<Zone[]> {
  let p = zones.get(id);
  if (!p) {
    const load = zoneLoaders.get(id);
    p = (load ? load().then((m) => parseZones(m.default, defs)) : Promise.resolve([])).then(
      (list) => {
        zonesDone.set(id, list);
        return list;
      },
      (err) => {
        zones.delete(id);
        throw err;
      },
    );
    zones.set(id, p);
  }
  return p;
}

/** Las zonas de una región si ya llegaron (para saber qué hay bajo el cursor sin pedir nada). */
export const peekZones = (id: string): Zone[] | undefined => zonesDone.get(id);

/**
 * Los edificios de una región, pedidos una sola vez. Una región sin archivo vuelve vacía; si falla la red, la próxima
 * llamada (el próximo toque) la vuelve a pedir.
 */
export function loadBuildings(id: string): Promise<Building[]> {
  let p = blds.get(id);
  if (!p) {
    const load = bldLoaders.get(id);
    p = load
      ? load().then(
          (m) => m.default,
          (err) => {
            blds.delete(id);
            throw err;
          },
        )
      : Promise.resolve([]);
    blds.set(id, p);
  }
  return p;
}
