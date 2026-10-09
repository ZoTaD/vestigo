/**
 * El estado de la calculadora de genética en el link (2026-10-09), como la de raideo (`?o=`): `?p=hemp&c=GGGYYY&n=YYYXXX-GGGGGG`
 * y el buscador con `&t=GGGYYY&h=GGGXXX-XXXYYY`. Los genes van tal cual se escriben en el juego; lo que no es un gen
 * válido se descarta al leer. Sin React, para probarlo sin navegador.
 */
import { MAX_NEIGHBOURS, parseGenes } from "./genetics";

export const MAX_OWNED = 10;
export const CALC_KEYS = ["p", "c", "n", "t", "h"] as const;

export interface CalcState {
  plant: string | null;
  center: string;
  neighbours: string[];
  target: string;
  owned: string[];
}

export const EMPTY_STATE: CalcState = { plant: null, center: "", neighbours: ["", ""], target: "", owned: [] };

const genes = (s: string | null): string => {
  const g = s ? parseGenes(s) : null;
  return g ? g.join("") : "";
};
const list = (s: string | null, max: number): string[] =>
  (s ?? "").split(/[-,\s]+/).map((x) => genes(x)).filter(Boolean).slice(0, max);

export function parseCalc(search: string, plants: string[]): CalcState {
  const q = new URLSearchParams(search);
  const plant = q.get("p");
  const neighbours = list(q.get("n"), MAX_NEIGHBOURS);
  return {
    plant: plant && plants.includes(plant) ? plant : null,
    center: genes(q.get("c")),
    neighbours: neighbours.length ? neighbours : EMPTY_STATE.neighbours,
    target: genes(q.get("t")),
    owned: list(q.get("h"), MAX_OWNED),
  };
}

/** Los parámetros del estado, sin los vacíos. Los demás parámetros del link (utm…) los conserva quien escribe. */
export function formatCalc(s: CalcState): string {
  const q: string[] = [];
  if (s.plant) q.push(`p=${encodeURIComponent(s.plant)}`);
  const c = genes(s.center);
  if (c) q.push(`c=${c}`);
  const n = s.neighbours.map((x) => genes(x)).filter(Boolean);
  if (n.length) q.push(`n=${n.join("-")}`);
  const t = genes(s.target);
  if (t) q.push(`t=${t}`);
  const h = s.owned.map((x) => genes(x)).filter(Boolean);
  if (h.length) q.push(`h=${h.join("-")}`);
  return q.join("&");
}

/** El texto de "esquejes que tenés" a lista: uno por renglón o separados por comas; los inválidos se saltean. */
export const parseOwned = (text: string): string[] => list(text, MAX_OWNED);
