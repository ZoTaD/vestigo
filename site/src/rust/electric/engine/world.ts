/**
 * El mundo del simulador (2026-10-09): las entidades de un circuito, la cola de IO del juego por cuadro y los `Invoke`
 * con tiempo simulado. Plan: docs/superpowers/plans/2026-10-09-rust-electricidad.md.
 *
 * Un cuadro es 1/30 s (servidor a 30 cuadros por segundo; el tope de milisegundos por cola del juego,
 * `IOEntity.frameBudgetElectric*`, no se emula: se procesa toda la cola, con un tope de seguridad). En cada cuadro
 * corren primero los `Invoke` vencidos y después `IOEntity.ProcessQueue`. Determinista: `InvokeRandomized` usa el
 * intervalo sin azar.
 */
import { IOEntity } from "./ioentity";
import type { Env } from "./types";
import { DEFAULT_ENV } from "./types";

export const FRAME = 1 / 30;
/** Tope de entidades procesadas por cuadro: un circuito que no se calma no cuelga la página. */
const QUEUE_LIMIT = 20000;

interface Inv {
  ent: IOEntity;
  key: string;
  fn: () => void;
  at: number;
  interval: number | null;
  seq: number;
}

export class World {
  time = 0;
  frame = 0;
  env: Env = { ...DEFAULT_ENV };
  /** Se pasó del tope de la cola en el último cuadro: hay un lazo que no se calma. */
  overloaded = false;
  readonly entities = new Map<string, IOEntity>();
  private queue: IOEntity[] = [];
  private head = 0;
  private invokes: Inv[] = [];
  private seq = 0;
  /** `RFManager`: emisores prendidos por frecuencia. */
  readonly rf = new Map<number, Set<IOEntity>>();

  // ---- Cola ----

  enqueue(e: IOEntity): void {
    this.queue.push(e);
  }

  queueLength(): number {
    return this.queue.length - this.head;
  }

  processQueue(): void {
    let n = 0;
    this.overloaded = false;
    while (this.head < this.queue.length && this.queue[this.head].lastUpdateBlockedFrame !== this.frame) {
      if (++n > QUEUE_LIMIT) {
        this.overloaded = true;
        break;
      }
      const e = this.queue[this.head++];
      if (!e.destroyed) e.updateOutputs();
    }
    if (this.head > 4096) {
      this.queue = this.queue.slice(this.head);
      this.head = 0;
    }
  }

  // ---- Invoke ----

  invoke(ent: IOEntity, key: string, fn: () => void, delay: number, interval: number | null): void {
    // Acá: un `Invoke` con el mismo método reemplaza al anterior (no se apilan dos iguales).
    this.cancelInvoke(ent, key);
    this.invokes.push({ ent, key, fn, at: this.time + delay, interval, seq: this.seq++ });
  }

  cancelInvoke(ent: IOEntity, key: string): void {
    this.invokes = this.invokes.filter((i) => !(i.ent === ent && i.key === key));
  }

  cancelAll(ent: IOEntity): void {
    this.invokes = this.invokes.filter((i) => i.ent !== ent);
  }

  isInvoking(ent: IOEntity, key: string): boolean {
    return this.invokes.some((i) => i.ent === ent && i.key === key);
  }

  /** Cuánto falta para un `Invoke` (para el inspector: "se apaga en 3 s"). */
  invokeIn(ent: IOEntity, key: string): number | null {
    const i = this.invokes.find((x) => x.ent === ent && x.key === key);
    return i ? Math.max(0, i.at - this.time) : null;
  }

  private runInvokes(): void {
    for (let guard = 0; guard < 10000; guard++) {
      let next: Inv | null = null;
      for (const i of this.invokes) if (i.at <= this.time + 1e-9 && (!next || i.at < next.at || (i.at === next.at && i.seq < next.seq))) next = i;
      if (!next) return;
      if (next.interval === null) this.invokes.splice(this.invokes.indexOf(next), 1);
      else {
        next.at += next.interval;
        next.seq = this.seq++;
      }
      if (!next.ent.destroyed) next.fn();
    }
  }

  // ---- Tiempo ----

  /** Un cuadro del servidor. */
  step(): void {
    this.frame++;
    this.time += FRAME;
    this.runInvokes();
    this.processQueue();
  }

  /** Avanza `dt` segundos de juego. */
  tick(dt: number): void {
    const frames = Math.round(dt / FRAME);
    for (let i = 0; i < frames; i++) this.step();
  }

  // ---- Entidades ----

  get(id: string): IOEntity | undefined {
    return this.entities.get(id);
  }
}
