/**
 * La ruta de una build: qué nodos, en qué orden y con qué set de armas.
 *
 * Sin DOM ni React, para poder probarlo solo. Reglas del juego que aplica:
 * - se camina desde el inicio de la clase y desde el de la ascendencia;
 * - los inicios de otras clases y las ascendencias ajenas no se atraviesan;
 * - los nodos con `uc` (el árbol de la Oráculo) piden esa ascendencia y su nodo;
 * - de una elección múltiple se toma una sola opción.
 */
import type { Tree } from "./data";
import { ascLevel, routeLevels } from "./points";

export type WeaponSet = 0 | 1 | 2;

export interface RouteEntry {
  id: string;
  ws?: WeaponSet;
}

export class Planner {
  readonly T: Tree;
  readonly adj: Record<string, string[]>;
  ci = 0;
  asc: string | null = null;
  start = "";
  ascStart: string | null = null;
  /** El árbol, en el orden en que se toma. */
  route: string[] = [];
  /** La ascendencia, en orden (sin su inicio). */
  ascRoute: string[] = [];
  ws: Record<string, WeaponSet> = {};

  constructor(T: Tree, ci = 0) {
    this.T = T;
    const adj: Record<string, string[]> = {};
    for (const id in T.nodes) adj[id] = [];
    for (const [a, b] of T.edges) {
      adj[a].push(b);
      adj[b].push(a);
    }
    this.adj = adj;
    this.setClass(ci);
  }

  setClass(ci: number): void {
    this.ci = ci;
    this.start = this.T.classes[ci].start;
    this.route = [];
    this.ws = {};
    this.setAsc(null);
  }

  setAsc(asc: string | null): void {
    this.asc = asc;
    this.ascRoute = [];
    this.ascStart = asc ? Object.keys(this.T.nodes).find((k) => this.T.nodes[k].k === "asc-start" && this.T.nodes[k].a === asc) ?? null : null;
    // lo que dependía de la ascendencia anterior (el árbol de la Oráculo) sale
    this.prune();
  }

  has(id: string): boolean {
    return id === this.start || id === this.ascStart || this.route.includes(id) || this.ascRoute.includes(id);
  }

  /** Se ve en el árbol: ni otra ascendencia ni el árbol de una ascendencia ajena. */
  visible(id: string): boolean {
    const n = this.T.nodes[id];
    if (n.k === "start") return false;
    if (n.a && n.a !== this.asc) return false;
    if (n.uc?.a && n.uc.a !== this.asc) return false;
    return true;
  }

  blocked(id: string): boolean {
    const n = this.T.nodes[id];
    if (n.k === "start") return id !== this.start;
    if (!this.visible(id)) return true;
    if (n.uc && n.uc.n.some((x) => !this.has(x))) return true;
    return false;
  }

  /** Camino más corto desde lo tomado hasta `id`, en el orden en que se toma; null si no hay. */
  path(id: string): string[] | null {
    if (this.has(id) || this.blocked(id)) return null;
    const prev = new Map<string, string | null>([[id, null]]);
    const q = [id];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      for (const nb of this.adj[cur]) {
        if (prev.has(nb) || this.blocked(nb)) continue;
        prev.set(nb, cur);
        if (this.has(nb)) {
          const out: string[] = [];
          for (let p: string | null = cur; p != null; p = prev.get(p) ?? null) out.push(p);
          return out;
        }
        q.push(nb);
      }
    }
    return null;
  }

  /** Toma `id` y el camino hasta él. Devuelve lo que se agregó. */
  take(id: string, ws: WeaponSet = 0): string[] {
    const p = this.path(id);
    if (!p) return [];
    for (const x of p) {
      const n = this.T.nodes[x];
      // una sola opción por elección múltiple
      if (n.mc) for (const o of [...this.route, ...this.ascRoute]) if (o !== x && this.T.nodes[o].mc === n.mc) this.drop(o);
      if (n.a) this.ascRoute.push(x);
      else {
        this.route.push(x);
        if (ws) this.ws[x] = ws;
      }
    }
    return p;
  }

  /** Saca `id` y todo lo que queda sin conexión al inicio. */
  drop(id: string): void {
    if (id === this.start || id === this.ascStart) return;
    this.route = this.route.filter((x) => x !== id);
    this.ascRoute = this.ascRoute.filter((x) => x !== id);
    this.prune();
  }

  /** Deja sólo lo que sigue conectado y cumple sus condiciones. */
  private prune(): void {
    for (let changed = true; changed; ) {
      changed = false;
      for (const [root, key] of [[this.start, "route"], [this.ascStart, "ascRoute"]] as const) {
        const list = this[key];
        const keep = new Set(list.filter((x) => this.visible(x)));
        const seen = new Set<string>();
        if (root) {
          seen.add(root);
          const q = [root];
          for (let i = 0; i < q.length; i++) {
            for (const nb of this.adj[q[i]]) if (keep.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); }
          }
        }
        const next = list.filter((x) => seen.has(x) && !(this.T.nodes[x].uc?.n.some((c) => !seen.has(c) && !this.has(c))));
        if (next.length !== list.length) {
          this[key] = next;
          changed = true;
        }
      }
    }
    for (const k in this.ws) if (!this.route.includes(k)) delete this.ws[k];
  }

  /** ¿Cada nodo de la lista toca el inicio o algo anterior? */
  connectedInOrder(list: string[], root: string | null): boolean {
    const got = new Set(root ? [root] : []);
    for (const id of list) {
      if (!this.adj[id].some((nb) => got.has(nb))) return false;
      got.add(id);
    }
    return true;
  }

  /** Mueve el punto `from` a la posición `to`, si la ruta sigue siendo caminable. */
  move(from: number, to: number, asc = false): boolean {
    const list = [...(asc ? this.ascRoute : this.route)];
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
    if (!this.connectedInOrder(list, asc ? this.ascStart : this.start)) return false;
    if (asc) this.ascRoute = list;
    else this.route = list;
    return true;
  }

  setWs(id: string, ws: WeaponSet): void {
    if (!this.route.includes(id)) return;
    if (ws) this.ws[id] = ws;
    else delete this.ws[id];
  }

  /**
   * Carga una lista de nodos (de un `.build` o de un link) y la ordena para que
   * cada uno quede conectado a lo anterior, respetando el orden dado cuando se
   * puede. Lo que no conecta se descarta.
   */
  load(entries: RouteEntry[]): void {
    const pend = entries.filter((e) => this.T.nodes[e.id] && e.id !== this.start && e.id !== this.ascStart && !this.has(e.id));
    // En el orden dado, el primero que ya se pueda tomar; el árbol de la Oráculo
    // espera a su nodo de ascendencia, así que se recorren los dos a la vez.
    for (;;) {
      const i = pend.findIndex((e) => !this.blocked(e.id) && this.adj[e.id].some((nb) => this.has(nb)));
      if (i < 0) break;
      const [e] = pend.splice(i, 1);
      if (this.T.nodes[e.id].a) this.ascRoute.push(e.id);
      else {
        this.route.push(e.id);
        if (e.ws) this.ws[e.id] = e.ws;
      }
    }
  }

  clear(): void {
    this.route = [];
    this.ascRoute = [];
    this.ws = {};
  }

  /** Puntos extra de los nodos de ascendencia tomados: [nivel, puntos]. */
  bonus(): [number, number][] {
    const out: [number, number][] = [];
    this.ascRoute.forEach((id, i) => {
      const pp = this.T.nodes[id].pp;
      const lv = ascLevel(i);
      if (pp && lv) out.push([lv, pp]);
    });
    return out;
  }

  /** El nivel de cada punto del árbol y de la ascendencia. */
  levels(): { main: (number | null)[]; asc: (number | null)[] } {
    return {
      main: routeLevels(this.route.map((id) => this.ws[id] ?? 0), this.bonus()),
      asc: this.ascRoute.map((_, i) => ascLevel(i)),
    };
  }
}
