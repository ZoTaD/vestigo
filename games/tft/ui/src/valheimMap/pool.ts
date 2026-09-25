/**
 * Un grupo de Web Workers que reparte los pedidos del mapa: el primero libre
 * toma el siguiente de la cola. Los pedidos viejos (otra semilla, otra vista)
 * se cancelan antes de empezar.
 */
import type { RegionRequest, RegionResult } from "./worker";

type Job = { req: RegionRequest; resolve: (r: RegionResult) => void; reject: (e: unknown) => void; cancelled?: boolean };

export class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Job[] = [];
  private busy = new Map<Worker, Job>();
  private nextId = 1;

  constructor(size = Math.max(1, Math.min(8, (typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (ev: MessageEvent<RegionResult>) => this.done(w, ev.data);
      w.onerror = (ev) => {
        const job = this.busy.get(w);
        this.busy.delete(w);
        this.idle.push(w);
        job?.reject(ev.message);
        this.pump();
      };
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  get size() { return this.workers.length; }

  /** Pide un rectángulo; `priority` adelanta el pedido en la cola (lo visible primero). */
  run(req: Omit<RegionRequest, "id" | "type">, priority = false): { promise: Promise<RegionResult>; cancel: () => void } {
    let job!: Job;
    const promise = new Promise<RegionResult>((resolve, reject) => {
      job = { req: { ...req, type: "region", id: this.nextId++ }, resolve, reject };
    });
    if (priority) this.queue.unshift(job);
    else this.queue.push(job);
    this.pump();
    return { promise, cancel: () => { job.cancelled = true; } };
  }

  /** Descarta lo que está en cola (no lo que ya se está calculando). */
  clear() {
    for (const j of this.queue) j.reject("cancelado");
    this.queue = [];
  }

  destroy() {
    this.clear();
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.cancelled) {
        job.reject("cancelado");
        continue;
      }
      const w = this.idle.pop()!;
      this.busy.set(w, job);
      w.postMessage(job.req);
    }
  }

  private done(w: Worker, res: RegionResult) {
    const job = this.busy.get(w);
    this.busy.delete(w);
    this.idle.push(w);
    if (job) {
      if (job.cancelled) job.reject("cancelado");
      else if (res.error) job.reject(res.error);
      else job.resolve(res);
    }
    this.pump();
  }
}
