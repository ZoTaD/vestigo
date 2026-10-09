/**
 * El estado del editor (2026-10-09): el circuito (lo que se guarda), el mundo que lo simula, el deshacer/rehacer y el
 * reloj. Sin React: los componentes se suscriben con `useSyncExternalStore` (`subscribe` + `version`).
 *
 * Los cambios de estructura (agregar, borrar, cablear) se aplican al mundo vivo con `live`, así una batería no pierde
 * su carga cuando se agrega una luz. Deshacer, rehacer y cargar otro circuito rearman el mundo de cero.
 */
import { buildWorld, live, wireError, type Catalog } from "../engine";
import type { Circuit, Env, Part, PartCfg, Wire } from "../engine/types";
import { DEFAULT_ENV } from "../engine/types";
import type { World } from "../engine/world";

const HISTORY = 100;
/** Lo máximo que avanza la simulación por cuadro de la pantalla (una pestaña que vuelve de segundo plano no corre horas). */
const MAX_STEP = 2;

export type Selection = { kind: "part"; ids: string[] } | { kind: "wire"; key: string } | null;

export const wireKey = (w: Wire): string => `${w.from[0]}.${w.from[1]}>${w.to[0]}.${w.to[1]}`;

const clone = (c: Circuit): Circuit => JSON.parse(JSON.stringify(c)) as Circuit;

export class EditorStore {
  circuit: Circuit;
  world: World;
  selection: Selection = null;
  running = true;
  speed = 1;
  version = 0;
  private past: string[] = [];
  private future: string[] = [];
  private listeners = new Set<() => void>();
  private changeListeners = new Set<() => void>();
  private nextId = 0;

  constructor(
    readonly cat: Catalog,
    circuit: Circuit,
  ) {
    this.circuit = clone(circuit);
    this.circuit.env = { ...DEFAULT_ENV, ...circuit.env };
    this.world = buildWorld(cat, this.circuit);
    this.syncIds();
  }

  // ---- Suscripción ----

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;
  /** Cambió el circuito (para guardarlo en el link). */
  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }
  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
  private changed(): void {
    for (const fn of this.changeListeners) fn();
    this.emit();
  }

  // ---- Historia ----

  private snapshot(): void {
    this.past.push(JSON.stringify(this.circuit));
    if (this.past.length > HISTORY) this.past.shift();
    this.future = [];
  }
  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }
  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(JSON.stringify(this.circuit));
    this.restore(JSON.parse(prev) as Circuit);
  }
  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(JSON.stringify(this.circuit));
    this.restore(JSON.parse(next) as Circuit);
  }
  private restore(c: Circuit): void {
    this.circuit = c;
    this.world = buildWorld(this.cat, this.circuit);
    this.selection = null;
    this.syncIds();
    this.changed();
  }
  /** Otro circuito entero (un link, un circuito listo): sin historia. */
  load(c: Circuit): void {
    this.past = [];
    this.future = [];
    this.restore({ ...clone(c), env: { ...DEFAULT_ENV, ...c.env } });
  }
  /** Arranca la simulación de cero con el mismo circuito (las baterías vuelven a su carga guardada). */
  restart(): void {
    this.world = buildWorld(this.cat, this.circuit);
    this.emit();
  }

  // ---- Edición ----

  private syncIds(): void {
    for (const p of this.circuit.parts) {
      const m = /^p(\d+)$/.exec(p.id);
      if (m) this.nextId = Math.max(this.nextId, Number(m[1]) + 1);
    }
  }
  private newId(): string {
    while (this.circuit.parts.some((p) => p.id === `p${this.nextId}`)) this.nextId++;
    return `p${this.nextId++}`;
  }

  addPart(type: string, x: number, y: number, cfg?: PartCfg): string | null {
    if (!this.cat.get(type)) return null;
    this.snapshot();
    const p: Part = { id: this.newId(), type, x: Math.round(x), y: Math.round(y), ...(cfg ? { cfg: { ...cfg } } : {}) };
    this.circuit.parts.push(p);
    live.addPart(this.cat, this.world, p);
    this.selection = { kind: "part", ids: [p.id] };
    this.changed();
    return p.id;
  }

  /** Mover no rearma nada: sólo cambia la posición guardada. `record` en false para los pasos intermedios del arrastre. */
  moveParts(moves: { id: string; x: number; y: number }[], record: boolean): void {
    if (record) this.snapshot();
    for (const m of moves) {
      const p = this.circuit.parts.find((x) => x.id === m.id);
      if (p) {
        p.x = Math.round(m.x);
        p.y = Math.round(m.y);
      }
    }
    if (record) this.changed();
  }

  removeParts(ids: string[]): void {
    if (!ids.length) return;
    this.snapshot();
    const set = new Set(ids);
    for (const w of this.circuit.wires.filter((w) => set.has(w.from[0]) || set.has(w.to[0]))) live.disconnect(this.world, w);
    this.circuit.wires = this.circuit.wires.filter((w) => !set.has(w.from[0]) && !set.has(w.to[0]));
    this.circuit.parts = this.circuit.parts.filter((p) => !set.has(p.id));
    for (const id of ids) live.removePart(this.world, id);
    this.selection = null;
    this.changed();
  }

  duplicate(ids: string[]): void {
    const src = this.circuit.parts.filter((p) => ids.includes(p.id));
    if (!src.length) return;
    this.snapshot();
    const map = new Map<string, string>();
    for (const p of src) {
      const q: Part = { ...clone({ parts: [p], wires: [] }).parts[0], id: this.newId(), x: p.x + 40, y: p.y + 40 };
      map.set(p.id, q.id);
      this.circuit.parts.push(q);
      live.addPart(this.cat, this.world, q);
    }
    // Los cables entre las copias se copian también.
    for (const w of this.circuit.wires.filter((w) => map.has(w.from[0]) && map.has(w.to[0]))) {
      const nw: Wire = { from: [map.get(w.from[0])!, w.from[1]], to: [map.get(w.to[0])!, w.to[1]] };
      this.circuit.wires.push(nw);
      live.connect(this.world, nw);
    }
    this.selection = { kind: "part", ids: [...map.values()] };
    this.changed();
  }

  /** Tiende un cable. Si la entrada o la salida ya tenían uno, lo reemplaza (como en el juego). */
  connect(w: Wire): ReturnType<typeof wireError> {
    const probe: Circuit = { ...this.circuit, wires: this.circuit.wires.filter((x) => !sameEnd(x, w)) };
    const err = wireError(this.cat, probe, w);
    if (err) return err;
    this.snapshot();
    for (const old of this.circuit.wires.filter((x) => sameEnd(x, w))) live.disconnect(this.world, old);
    this.circuit.wires = [...probe.wires, w];
    live.connect(this.world, w);
    this.selection = { kind: "wire", key: wireKey(w) };
    this.changed();
    return null;
  }

  disconnect(key: string): void {
    const w = this.circuit.wires.find((x) => wireKey(x) === key);
    if (!w) return;
    this.snapshot();
    live.disconnect(this.world, w);
    this.circuit.wires = this.circuit.wires.filter((x) => x !== w);
    if (this.selection?.kind === "wire" && this.selection.key === key) this.selection = null;
    this.changed();
  }

  clear(): void {
    if (!this.circuit.parts.length) return;
    this.snapshot();
    this.circuit = { parts: [], wires: [], env: this.circuit.env };
    this.world = buildWorld(this.cat, this.circuit);
    this.selection = null;
    this.changed();
  }

  /** Una acción del inspector (prender, apretar, fijar un número). La configuración queda guardada en la parte. */
  act(id: string, key: string, value?: number): void {
    const e = this.world.get(id);
    if (!e) return;
    e.act(key, value);
    this.changed();
  }

  select(sel: Selection): void {
    this.selection = sel;
    this.emit();
  }

  setEnv(env: Partial<Env>): void {
    this.circuit.env = { ...DEFAULT_ENV, ...this.circuit.env, ...env };
    this.world.env = { ...this.world.env, ...env };
    this.changed();
  }

  // ---- Reloj ----

  setRunning(on: boolean): void {
    this.running = on;
    this.emit();
  }
  setSpeed(s: number): void {
    this.speed = s;
    this.emit();
  }
  /** Avanza `dt` segundos de pantalla (por la velocidad elegida). */
  advance(dt: number): void {
    if (!this.running) return;
    this.world.tick(Math.min(dt, MAX_STEP / this.speed) * this.speed);
    // Se dibuja hasta 10 veces por segundo: alcanza para leer las cifras y no recalcula la página en cada cuadro.
    const now = Date.now();
    if (now - this.lastEmit >= 100) {
      this.lastEmit = now;
      this.emit();
    }
  }
  private lastEmit = 0;
}

/** Dos cables que comparten la entrada o la salida. */
function sameEnd(a: Wire, b: Wire): boolean {
  return (a.to[0] === b.to[0] && a.to[1] === b.to[1]) || (a.from[0] === b.from[0] && a.from[1] === b.from[1]);
}
