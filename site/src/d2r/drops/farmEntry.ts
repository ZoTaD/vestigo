/**
 * Cómo se calcula cada "Dónde farmearlo" de las fichas de la wiki (2026-09-29). Lo usan `scripts/d2-drops.ts`, que escribe
 * `games/d2r/data/drops/computed/`, y el test que recalcula unas entradas para ver que el JSON no quedó viejo: los dos tienen
 * que hacer exactamente lo mismo, por eso vive acá y no en el script. Carga el motor: las fichas no lo importan, sólo leen el JSON.
 */
import type { Indexed } from "./data";
import { parsePlaceKey, type FarmEntry, type FarmFile, type PlaceNames } from "./farm";
import { bestPlaces, NO_TZ } from "./places";
import { ladderOk } from "./rules";
import type { Target } from "./types";

/** Los valores de siempre de los bloques: 1 jugador y 300% de hallazgo mágico, sin Zonas de Terror, en las tres dificultades. */
const MF = 300;

/**
 * Nueve cifras significativas. Con cuatro, el "1 en N" de la ficha se leía distinto del de la calculadora con las mismas opciones
 * en 680 de 2.259 números (Mefisto: "1 en 755" en la ficha contra "1 en 754" en la calculadora); con seis, todavía en 139 (áreas
 * con N de 40.000 para arriba). Con nueve, en ninguno.
 */
export const farmRound = (p: number): number => Number(p.toPrecision(9));

/** Los tres mejores jefes y la mejor área de un ítem. */
export function farmEntry(D: Indexed, target: Target, season: number, lad?: [number, number]): FarmEntry {
  // Lo exclusivo de Clasificación en esta temporada se calcula ahí: afuera no cae y su ficha quedaría vacía.
  const ladder = !ladderOk(lad, false, season);
  const { bosses, areas } = bestPlaces(D, target, { mf: MF, players: 1, party: 1, ladder, season }, NO_TZ, [0, 1, 2], 3);
  return {
    b: bosses.map((r) => [r.key, farmRound(r.p)]),
    a: areas.slice(0, 1).map((r) => [r.key, r.cat, farmRound(r.p[r.cat])]),
    ...(ladder ? { l: 1 as const } : {}),
  };
}

/** Los tres archivos de bloques (únicos, piezas y runas) y los nombres de los lugares que nombran. */
export function farmFiles(D: Indexed, season: number): { u: FarmFile; s: FarmFile; r: FarmFile; names: PlaceNames } {
  const u: FarmFile = {};
  const s: FarmFile = {};
  const r: FarmFile = {};
  for (const x of D.uniques) u[x.id] = farmEntry(D, { k: "u", id: x.id }, season, x.lad);
  for (const x of D.sets) s[x.id] = farmEntry(D, { k: "s", id: x.id }, season, x.lad);
  for (const code of Object.keys(D.bases).filter((c) => /^r\d\d$/.test(c))) r[code] = farmEntry(D, { k: "b", code }, season);
  // Sólo los nombres de los lugares que aparecen en algún bloque: el archivo va entero a cada ficha de la wiki, y los demás jefes
  // y áreas no se muestran nunca.
  const used = { s: new Set<string>(), a: new Set<string>() };
  for (const e of [...Object.values(u), ...Object.values(s), ...Object.values(r)]) {
    for (const [key] of e.b) used.s.add(parsePlaceKey(key).id);
    for (const [key] of e.a) used.a.add(parsePlaceKey(key).id);
  }
  const names: PlaceNames = {
    s: Object.fromEntries(D.sources.filter((x) => used.s.has(x.id)).map((x) => [x.id, x.n])),
    a: Object.fromEntries(D.areas.filter((x) => used.a.has(String(x.id))).map((x) => [String(x.id), x.n])),
  };
  return { u, s, r, names };
}
