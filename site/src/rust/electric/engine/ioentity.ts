/**
 * `IOEntity` del juego, portado línea por línea (2026-10-09). Fuente: `IOEntity.cs` del decompilado público
 * github.com/MillionthOdin16/RustChangelog (rama `release`, 2024-08-03). Cada método lleva el nombre del original en
 * camelCase y hace lo mismo, salvo lo que no existe acá (red, efectos, sonidos, industrial) y lo marcado con "Acá:".
 *
 * El modelo del juego es de **empuje**: una entidad calcula `getPassthroughAmount(slot)` con lo que le entra y se lo da
 * al vecino con `updateFromInput`. Cada cambio encola a la entidad; `World.processQueue` las procesa por cuadro, y una
 * misma entidad no actualiza sus salidas dos veces en menos de `RESPONSE_TIME` (0,1 s): eso arma los relojes y el
 * parpadeo de los circuitos realimentados.
 */
import type { ComponentDef, IOType, PartCfg, SlotDef } from "./types";
import type { World } from "./world";

/** `IOEntity.responsetime` (convar `ioentity.responsetime`, 0,1 s por defecto). */
export const RESPONSE_TIME = 0.1;
/** `IOEntity.backtracking` (8): cuánto mira hacia atrás para detectar que se alimenta a sí misma. */
export const BACKTRACKING = 8;

/** Las banderas de `BaseEntity.Flags` que usan las clases IO (los valores no importan, sólo que sean distintos). */
export const Flag = {
  On: 1 << 0,
  Open: 1 << 1,
  Busy: 1 << 2,
  Reserved1: 1 << 3,
  Reserved2: 1 << 4,
  Reserved3: 1 << 5,
  Reserved4: 1 << 6,
  Reserved5: 1 << 7,
  Reserved6: 1 << 8,
  /** `IOEntity.Flag_ShortCircuit`. */
  Reserved7: 1 << 9,
  /** `IOEntity.Flag_HasPower`. */
  Reserved8: 1 << 10,
  Reserved9: 1 << 11,
  Reserved10: 1 << 12,
} as const;

export class IOSlot {
  connectedTo: IOEntity | null = null;
  connectedToSlot = 0;
  constructor(readonly def: SlotDef) {}
  get type(): IOType {
    return this.def.t;
  }
  get mainPowerSlot(): boolean {
    return this.def.m === 1;
  }
  get niceName(): string {
    return this.def.n;
  }
  isConnected(): boolean {
    return this.connectedTo !== null && !this.connectedTo.destroyed;
  }
  clear(): void {
    this.connectedTo = null;
    this.connectedToSlot = 0;
  }
}

/** Una línea del inspector: qué es y cuánto. `k` es la clave del texto (en `explain.ts`). */
export interface Readout {
  k: string;
  v: number | string | boolean;
  /** Para cifras con tope: "11 de 50". */
  of?: number;
}

/** Algo que el usuario puede hacer en el inspector (prender, apretar, poner cuántos jugadores ve el HBHF…). */
export interface Action {
  k: string;
  /** `toggle`: botón de prender/apagar; `press`: botón; `number`: un valor con su rango. */
  kind: "toggle" | "press" | "number";
  value?: number;
  min?: number;
  max?: number;
  step?: number;
}

export class IOEntity {
  inputs: IOSlot[];
  outputs: IOSlot[];
  ioType: IOType = 0;
  flags = 0;
  currentEnergy = 0;
  lastEnergy = 0;
  lastPassthroughEnergy = 0;
  cachedOutputsUsed = 0;
  ensureOutputsUpdated = false;
  /** Acá: arranca muy atrás (en el juego el servidor lleva horas prendido), así la primera actualización no se frena. */
  lastUpdateTime = -1e9;
  lastUpdateBlockedFrame = -1;
  changedCount = 0;
  lastChangeTime = -1e9;
  destroyed = false;
  /** Acá: lo último que llegó a cada entrada y lo último que salió por cada salida (para dibujar los cables). */
  received: number[];
  sent: number[];
  /** `BaseCombatEntity.healthFraction`: el panel solar rinde menos dañado, el Tesla y el encendedor se rompen. */
  healthFraction = 1;

  constructor(
    readonly world: World,
    readonly id: string,
    readonly def: ComponentDef,
    readonly cfg: PartCfg,
  ) {
    this.inputs = def.in.map((d) => new IOSlot(d));
    this.outputs = def.out.map((d) => new IOSlot(d));
    this.received = def.in.map(() => 0);
    this.sent = def.out.map(() => 0);
  }

  /** Acá: `outputs[i].connectedTo.Get().UpdateFromInput(amount, outputs[i].connectedToSlot)`, anotando la cifra. */
  send(i: number, amount: number): void {
    const s = this.outputs[i];
    const e = s?.connectedTo;
    if (!e) return;
    this.sent[i] = amount;
    e.received[s.connectedToSlot] = amount;
    e.updateFromInput(amount, s.connectedToSlot);
  }

  // ---- Banderas y tiempo ----

  hasFlag(f: number): boolean {
    return (this.flags & f) !== 0;
  }
  setFlag(f: number, b: boolean): void {
    const old = this.flags;
    this.flags = b ? this.flags | f : this.flags & ~f;
    if (old !== this.flags) this.onFlagsChanged(old, this.flags);
  }
  onFlagsChanged(_old: number, _next: number): void {}
  isOn(): boolean {
    return this.hasFlag(Flag.On);
  }
  get now(): number {
    return this.world.time;
  }
  /** `Invoke`, `InvokeRepeating`, `CancelInvoke` e `IsInvoking` de `FacepunchBehaviour`, con el nombre del método. */
  invoke(key: string, fn: () => void, delay: number): void {
    this.world.invoke(this, key, fn, delay, null);
  }
  invokeRepeating(key: string, fn: () => void, delay: number, interval: number): void {
    this.world.invoke(this, key, fn, delay, interval);
  }
  cancelInvoke(key: string): void {
    this.world.cancelInvoke(this, key);
  }
  isInvoking(key: string): boolean {
    return this.world.isInvoking(this, key);
  }

  // ---- Lo que cada clase sobrescribe ----

  isRootEntity(): boolean {
    return false;
  }
  wantsPower(_inputIndex: number): boolean {
    return true;
  }
  wantsPassthroughPower(): boolean {
    return true;
  }
  /** Acá: el número sale de los datos (`use`), que ya tiene el campo del prefab o el valor del código. */
  consumptionAmount(): number {
    return this.def.use;
  }
  shouldDrainBattery(battery: IOEntity): boolean {
    return this.ioType === battery.ioType;
  }
  maximalPowerOutput(): number {
    return 0;
  }
  allowDrainFrom(_outputSlot: number): boolean {
    return true;
  }
  isPowered(): boolean {
    return this.hasFlag(Flag.Reserved8);
  }

  desiredPower(inputIndex = 0): number {
    if (!this.inputs[inputIndex]?.mainPowerSlot) return 0;
    const num = this.consumptionAmount();
    if (this.isFlickering()) return num;
    if (this.currentEnergy < num) return 0;
    return num;
  }

  calculateCurrentEnergy(inputAmount: number, _inputSlot: number): number {
    return inputAmount;
  }

  getCurrentEnergy(): number {
    return clamp(this.currentEnergy - this.consumptionAmount(), 0, this.currentEnergy);
  }

  getPassthroughAmount(outputSlot = 0): number {
    if (outputSlot < 0 || outputSlot >= this.outputs.length) return 0;
    const num = this.cachedOutputsUsed === 0 ? 1 : this.cachedOutputsUsed;
    return idiv(this.getCurrentEnergy(), num);
  }

  updateHasPower(inputAmount: number, _inputSlot: number): void {
    this.setFlag(Flag.Reserved8, inputAmount >= this.consumptionAmount() && inputAmount > 0);
  }

  // ---- Propagación ----

  updateUsedOutputs(): void {
    this.cachedOutputsUsed = 0;
    for (const o of this.outputs) if (o.connectedTo && !o.connectedTo.destroyed) this.cachedOutputsUsed++;
  }

  markDirty(): void {
    this.updateUsedOutputs();
    this.touchIOState();
  }

  markDirtyForceUpdateOutputs(): void {
    this.ensureOutputsUpdated = true;
    this.markDirty();
  }

  touchIOState(): void {
    this.touchInternal();
  }

  touchInternal(): void {
    const passthroughAmount = this.getPassthroughAmount();
    const changed = this.lastPassthroughEnergy !== passthroughAmount;
    this.lastPassthroughEnergy = passthroughAmount;
    if (changed) {
      this.ioStateChanged(this.currentEnergy, 0);
      this.ensureOutputsUpdated = true;
    }
    this.world.enqueue(this);
  }

  updateFromInput(inputAmount: number, inputSlot: number): void {
    const slot = this.inputs[inputSlot];
    if (!slot) return;
    if (slot.type !== this.ioType || slot.type === 4) {
      this.ioStateChanged(inputAmount, inputSlot);
      return;
    }
    this.updateHasPower(inputAmount, inputSlot);
    this.lastEnergy = this.currentEnergy;
    this.currentEnergy = this.calculateCurrentEnergy(inputAmount, inputSlot);
    const passthroughAmount = this.getPassthroughAmount();
    const changed = this.lastPassthroughEnergy !== passthroughAmount;
    this.lastPassthroughEnergy = passthroughAmount;
    if (this.currentEnergy !== this.lastEnergy || changed) {
      this.ioStateChanged(inputAmount, inputSlot);
      this.ensureOutputsUpdated = true;
    }
    this.world.enqueue(this);
  }

  isFlickering(): boolean {
    if (this.changedCount > 5) return this.now - this.lastChangeTime < 1;
    return false;
  }

  ioStateChanged(_inputAmount: number, _inputSlot: number): void {
    if (this.now - this.lastChangeTime > 1) this.changedCount = 1;
    else this.changedCount++;
    this.lastChangeTime = this.now;
  }

  onCircuitChanged(forceUpdate: boolean): void {
    if (forceUpdate) this.markDirtyForceUpdateOutputs();
  }

  sendChangedToRoot(forceUpdate: boolean): void {
    this.sendChangedToRootRecursive(forceUpdate, new Set());
  }

  sendChangedToRootRecursive(forceUpdate: boolean, existing: Set<IOEntity>): void {
    const root = this.isRootEntity();
    if (existing.has(this)) return;
    existing.add(this);
    let upstream = false;
    for (const s of this.inputs) {
      if (!s.mainPowerSlot) continue;
      const e = s.connectedTo;
      if (e && !existing.has(e)) {
        upstream = true;
        if (forceUpdate) e.ensureOutputsUpdated = true;
        e.sendChangedToRootRecursive(forceUpdate, existing);
      }
    }
    if (root) this.onCircuitChanged(forceUpdate && !upstream);
  }

  /** `ShouldUpdateOutputs`: frena a la entidad si actualizó hace menos de `responsetime`, y la vuelve a encolar. */
  shouldUpdateOutputs(): boolean {
    if (this.now - this.lastUpdateTime < RESPONSE_TIME) {
      this.lastUpdateBlockedFrame = this.world.frame;
      this.world.enqueue(this);
      return false;
    }
    this.lastUpdateTime = this.now;
    if (this.outputs.length === 0) {
      this.ensureOutputsUpdated = false;
      return false;
    }
    return true;
  }

  updateOutputs(): void {
    if (!this.shouldUpdateOutputs() || !this.ensureOutputsUpdated) return;
    this.ensureOutputsUpdated = false;
    for (let i = 0; i < this.outputs.length; i++) {
      const s = this.outputs[i];
      const e = s.connectedTo;
      if (!e) continue;
      // Acá: la gravedad del agua (`AllowLiquidPassthrough`) no se modela: esta pestaña es la red eléctrica.
      this.send(i, this.getPassthroughAmount(i));
    }
  }

  // ---- Conexiones: detectar realimentación ----

  considerConnectedTo(_entity: IOEntity): boolean {
    return false;
  }

  isConnectedToSlot(entity: IOEntity, slot: number, depth: number, defaultReturn = false): boolean {
    if (depth > 0 && slot < this.inputs.length) {
      const s = this.inputs[slot];
      if (s.mainPowerSlot) {
        const e = s.connectedTo;
        if (e) {
          if (e === entity) return true;
          if (this.considerConnectedTo(entity)) return true;
          if (e.isConnectedTo(entity, depth - 1, defaultReturn)) return true;
        }
      }
    }
    return false;
  }

  isConnectedToAnySlot(entity: IOEntity, slot: number, depth: number, defaultReturn = false): boolean {
    if (depth > 0 && slot < this.inputs.length) {
      const e = this.inputs[slot].connectedTo;
      if (e) {
        if (e === entity) return true;
        if (this.considerConnectedTo(entity)) return true;
        if (e.isConnectedTo(entity, depth - 1, defaultReturn)) return true;
      }
    }
    return false;
  }

  isConnectedTo(entity: IOEntity, depth: number, defaultReturn = false): boolean {
    if (depth > 0) {
      for (const s of this.inputs) {
        if (!s.mainPowerSlot) continue;
        const e = s.connectedTo;
        if (e) {
          if (e === entity) return true;
          if (this.considerConnectedTo(entity)) return true;
          if (e.isConnectedTo(entity, depth - 1, defaultReturn)) return true;
        }
      }
      return false;
    }
    return defaultReturn;
  }

  // ---- Ciclo de vida ----

  /** `ServerInit` de cada clase (los `Invoke` que arrancan al aparecer). */
  serverInit(): void {}

  init(): void {
    for (let i = 0; i < this.outputs.length; i++) {
      const s = this.outputs[i];
      const e = s.connectedTo;
      if (e && s.connectedToSlot >= 0 && s.connectedToSlot < e.inputs.length) {
        e.inputs[s.connectedToSlot].connectedTo = this;
        e.inputs[s.connectedToSlot].connectedToSlot = i;
      }
    }
    this.updateUsedOutputs();
    if (this.isRootEntity()) this.invoke("MarkDirtyForceUpdateOutputs", () => this.markDirtyForceUpdateOutputs(), 1);
  }

  resetIOState(): void {}

  connectTo(entity: IOEntity, outputIndex: number, inputIndex: number): void {
    const inp = entity.inputs[inputIndex];
    inp.connectedTo = this;
    inp.connectedToSlot = outputIndex;
    const out = this.outputs[outputIndex];
    out.connectedTo = entity;
    out.connectedToSlot = inputIndex;
    this.markDirtyForceUpdateOutputs();
    this.sendChangedToRoot(true);
  }

  disconnect(index: number, isInput: boolean): boolean {
    const list = isInput ? this.inputs : this.outputs;
    if (index >= list.length) return false;
    const s = list[index];
    const other = s.connectedTo;
    if (!other) return false;
    const otherSlot = isInput ? other.outputs[s.connectedToSlot] : other.inputs[s.connectedToSlot];
    if (isInput) {
      this.received[index] = 0;
      this.updateFromInput(0, index);
    } else this.send(index, 0);
    s.clear();
    otherSlot.clear();
    this.markDirtyForceUpdateOutputs();
    if (isInput) other.sendChangedToRoot(true);
    else for (const i of this.inputs) if (i.mainPowerSlot && i.connectedTo) i.connectedTo.sendChangedToRoot(true);
    return true;
  }

  clearConnections(): void {
    const downstream: IOEntity[] = [];
    for (const s of this.inputs) {
      const e = s.connectedTo;
      if (e) for (const o of e.outputs) if (o.connectedTo === this) o.clear();
      s.clear();
    }
    for (const s of this.outputs) {
      const e = s.connectedTo;
      if (e) {
        downstream.push(e);
        const slot = s.connectedToSlot;
        for (const i of e.inputs) if (i.connectedTo === this) i.clear();
        e.received[slot] = 0;
        e.updateFromInput(0, slot);
      }
      s.clear();
    }
    for (const e of downstream) e.markDirty();
    for (let k = 0; k < this.inputs.length; k++) {
      this.received[k] = 0;
      this.updateFromInput(0, k);
    }
  }

  /** `DoServerDestroy` → `Shutdown`. */
  shutdown(): void {
    this.sendChangedToRoot(true);
    this.clearConnections();
    this.world.cancelAll(this);
    this.destroyed = true;
  }

  // ---- Para el editor (no existe en el juego) ----

  readouts(): Readout[] {
    return [];
  }
  actions(): Action[] {
    return [];
  }
  act(_key: string, _value?: number): void {}
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
/** División entera de C# (trunca hacia cero). */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);
