/**
 * La red de agua (2026-10-09): contenedores, bomba, colectores, purificador con energía y su depósito, aspersor e
 * interruptor de fluidos. Fuentes: `LiquidContainer.cs`, `WaterPump.cs`, `WaterCatcher.cs`, `WaterPurifier.cs`,
 * `PoweredWaterPurifier.cs`, `Sprinkler.cs`, `FluidSwitch.cs` (RustChangelog, 2024-08-03). Plan:
 * docs/superpowers/plans/2026-10-09-rust-agua-industrial.md.
 *
 * El agua es un objeto en el inventario del contenedor (una ranura, un tipo: dulce o salada). El número del cable es el
 * caudal (`min(agua, maxOutputFlow)`), que se propaga como la energía salvo que la gravedad lo corte. Lo que mueve agua
 * de verdad es el empuje (`autofillOutputs`, cada 2 s) y el consumo de los de aguas abajo (`DeductFuel`, cada 1 s).
 */
import { BACKTRACKING, Flag, IOEntity, type Action, type Readout } from "../ioentity";
import { ElectricSwitch } from "./switches";

/** Dulce (`water`) o salada (`water.salt`): los shortname del juego. */
export type WaterKind = "water" | "water.salt";
export interface Liquid {
  kind: WaterKind;
  amount: number;
}

/** `server.waterContainersLeaveWaterBehind`: se asume falso (duda anotada en el plan). */
const LEAVE_WATER_BEHIND = false;
/** `LiquidContainer.maxPushTargets`. */
const MAX_PUSH_TARGETS = 12;

export class LiquidContainer extends IOEntity {
  liquid: Liquid | null = null;
  private currentDrainAmount = 0;
  private connectedList = new Set<IOEntity>();
  private pushTargets: LiquidContainer[] = [];
  private waterTransferStartTime = -Infinity;
  private lastOutputDrainUpdate = -Infinity;

  get maxStackSize(): number {
    return this.def.p.maxStackSize ?? 0;
  }
  get maxOutputFlow(): number {
    return this.def.p.maxOutputFlow ?? 6;
  }
  override get isGravitySource(): boolean {
    return true;
  }
  /** Con energía (`Flag_HasPower`) el agua sube: así empuja la bomba (y el depósito del purificador prendido). */
  override get disregardGravityRestrictionsOnLiquid(): boolean {
    return this.hasFlag(Flag.Reserved8);
  }
  override get blockFluidDraining(): boolean {
    return true;
  }
  override isRootEntity(): boolean {
    return true;
  }

  // ---- Inventario (`ItemContainer`, una ranura) ----

  get liquidCount(): number {
    return this.liquid?.amount ?? 0;
  }
  /** ¿Acepta este tipo? Vacío o del mismo tipo (dos tipos no comparten la ranura). */
  canAccept(kind: WaterKind): boolean {
    return !this.liquid || this.liquid.kind === kind;
  }
  /** `GetMaxTransferAmount`: lo que entra todavía de ese tipo. */
  maxTransfer(kind: WaterKind): number {
    if (!this.canAccept(kind)) return 0;
    return Math.max(0, this.maxStackSize - this.liquidCount);
  }
  /**
   * `inventory.AddItem`: crea la pila si la ranura está vacía (eso dispara `OnItemAddedOrRemoved`) o la suma a la que
   * hay. Acá: lo que no entra en la pila se pierde (en el juego no hay otra ranura).
   */
  addLiquid(kind: WaterKind, amount: number): number {
    if (amount <= 0 || !this.canAccept(kind)) return 0;
    const n = Math.min(amount, this.maxTransfer(kind));
    if (n <= 0) return 0;
    if (!this.liquid) {
      this.liquid = { kind, amount: n };
      this.onItemAddedOrRemoved(true);
    } else this.liquid.amount += n;
    return n;
  }
  /** `Item.UseItem`/`amount -=`: si se acaba, la pila se borra (y avisa). */
  useLiquid(n: number): void {
    if (!this.liquid) return;
    this.liquid.amount -= n;
    if (this.liquid.amount <= 0) {
      this.liquid = null;
      this.onItemAddedOrRemoved(false);
    }
  }
  updateOnFlag(): void {
    this.setFlag(Flag.On, this.liquidCount > 0);
  }

  override serverInit(): void {
    const start = this.cfg.water !== undefined ? this.cfg.water : (this.def.p.startingAmount ?? 0);
    if (start > 0) this.addLiquid(this.cfg.salt ? "water.salt" : "water", start);
    if (this.def.p.autofillOutputs && this.liquid) this.updatePushLiquidTargets();
  }

  override onCircuitChanged(forceUpdate: boolean): void {
    super.onCircuitChanged(forceUpdate);
    this.clearDrains();
    this.invoke("UpdateDrainAmount", () => this.updateDrainAmount(), 0.1);
    if (this.def.p.autofillOutputs && this.liquid) this.invoke("UpdatePushLiquidTargets", () => this.updatePushLiquidTargets(), 0.1);
  }

  onItemAddedOrRemoved(added: boolean): void {
    this.updateOnFlag();
    this.markDirtyForceUpdateOutputs();
    this.invoke("UpdateDrainAmount", () => this.updateDrainAmount(), 0.1);
    for (const e of [...this.connectedList]) e.sendChangedToRoot(true);
    if (this.liquid && this.def.p.autofillOutputs) this.invoke("UpdatePushLiquidTargets", () => this.updatePushLiquidTargets(), 0.1);
    if (added) this.waterTransferStartTime = this.now + 10;
  }

  private clearDrains(): void {
    for (const e of this.connectedList) e.setFuelType(null, null);
    this.connectedList.clear();
  }

  override getCurrentEnergy(): number {
    return Math.min(Math.max(this.liquidCount, 0), this.maxOutputFlow);
  }
  override calculateCurrentEnergy(inputAmount: number, inputSlot: number): number {
    if (!this.liquid) return super.calculateCurrentEnergy(inputAmount, inputSlot);
    return this.getCurrentEnergy();
  }

  /** `UpdateDrainAmount`: lo que piden los de aguas abajo, con tope en el caudal; se cobra cada 1 s. */
  updateDrainAmount(): void {
    const acc = { amount: 0 };
    if (this.liquid) {
      for (let i = 0; i < this.outputs.length; i++) {
        const e = this.outputs[i].connectedTo;
        if (e) this.calculateDrain(e, this.outY(i), BACKTRACKING * 2, acc, this, this.liquid.kind);
      }
    }
    this.currentDrainAmount = Math.min(Math.max(acc.amount, 0), this.maxOutputFlow);
    if (this.currentDrainAmount <= 0 && this.isInvoking("DeductFuel")) this.cancelInvoke("DeductFuel");
    else if (this.currentDrainAmount > 0 && !this.isInvoking("DeductFuel")) this.invokeRepeating("DeductFuel", () => this.deductFuel(), 0, 1);
  }

  private calculateDrain(ent: IOEntity, fromSlotY: number, depth: number, acc: { amount: number }, lastEntity: IOEntity, kind: WaterKind): void {
    if (ent === this || depth <= 0 || ent instanceof LiquidContainer) return;
    if (!ent.blockFluidDraining && ent.isOn()) {
      acc.amount += ent.desiredPower(0);
      ent.setFuelType(kind, this);
      this.connectedList.add(ent);
    }
    if (!ent.allowLiquidPassthrough(lastEntity, fromSlotY)) return;
    for (let i = 0; i < ent.outputs.length; i++) {
      const next = ent.outputs[i].connectedTo;
      if (next && next !== ent) this.calculateDrain(next, ent.outY(i), depth - 1, acc, ent, kind);
    }
  }

  override updateOutputs(): void {
    super.updateOutputs();
    if (!(this.now - this.lastOutputDrainUpdate < 0.2)) {
      this.lastOutputDrainUpdate = this.now;
      this.clearDrains();
      this.invoke("UpdateDrainAmount", () => this.updateDrainAmount(), 0.1);
    }
  }

  private deductFuel(): void {
    if (this.liquid) this.useLiquid(this.currentDrainAmount);
  }

  /** `UpdatePushLiquidTargets`: los contenedores aguas abajo a los que llega el agua (hasta 12). */
  updatePushLiquidTargets(): void {
    this.pushTargets = [];
    if (!this.liquid || this.isConnectedTo(this, BACKTRACKING * 2)) return;
    const seen = new Set<IOEntity>();
    for (const s of this.outputs) {
      if (s.type !== 1 || !s.connectedTo) continue;
      this.checkPushLiquid(s.connectedTo, this, BACKTRACKING * 4, seen);
    }
    if (this.pushTargets.length > 0) this.invokeRepeating("PushLiquidThroughOutputs", () => this.pushLiquidThroughOutputs(), 0, this.def.p.autofillTickRate ?? 2);
  }

  private checkPushLiquid(connected: IOEntity, fromSource: IOEntity, depth: number, seen: Set<IOEntity>): void {
    if (depth <= 0 || !this.liquid || this.liquid.amount <= 0) return;
    const g = connected.findGravitySource(BACKTRACKING * 2, true);
    if ((g && !connected.allowLiquidPassthrough(g.e, g.y)) || connected === this || this.considerConnectedTo(connected)) return;
    if (connected instanceof LiquidContainer) {
      if (!this.pushTargets.includes(connected)) this.pushTargets.push(connected);
      return;
    }
    for (let i = 0; i < connected.outputs.length; i++) {
      const next = connected.outputs[i].connectedTo;
      if (!next || next === fromSource || seen.has(next)) continue;
      seen.add(next);
      if (next.allowLiquidPassthrough(fromSource, connected.outY(i))) {
        this.checkPushLiquid(next, fromSource, depth - 1, seen);
        if (this.pushTargets.length >= MAX_PUSH_TARGETS) break;
      }
    }
  }

  private pushLiquidThroughOutputs(): void {
    if (this.waterTransferStartTime - this.now > 0) return;
    if (!this.liquid) {
      this.cancelInvoke("PushLiquidThroughOutputs");
      return;
    }
    const item = this.liquid;
    if (this.pushTargets.length > 0) {
      let num = Math.trunc(Math.min(Math.max(this.def.p.autofillTickAmount ?? 2, 0), item.amount) / this.pushTargets.length);
      if (num === 0 && item.amount > 0) num = item.amount;
      if (LEAVE_WATER_BEHIND && num === item.amount) num--;
      if (num === 0) return;
      for (const t of this.pushTargets) {
        if (!t.canAccept(item.kind)) continue;
        const n = Math.min(Math.max(num, 0), t.maxTransfer(item.kind));
        t.addLiquid(item.kind, n);
        item.amount -= n;
        if (item.amount <= 0) break;
      }
    }
    if (item.amount <= 0 || this.pushTargets.length === 0) {
      if (item.amount <= 0) {
        this.liquid = null;
        this.onItemAddedOrRemoved(false);
      }
      this.cancelInvoke("PushLiquidThroughOutputs");
    }
  }

  override readouts(): Readout[] {
    return [
      { k: "liquid", v: this.liquidCount, of: this.maxStackSize },
      { k: "kind", v: this.liquid?.kind ?? "" },
      { k: "flow", v: this.getCurrentEnergy() },
      { k: "drainWater", v: this.isInvoking("DeductFuel") ? this.currentDrainAmount : 0 },
      { k: "pushTo", v: this.isInvoking("PushLiquidThroughOutputs") ? this.pushTargets.length : 0 },
    ];
  }
  override actions(): Action[] {
    return [
      { k: "water", kind: "number", value: this.liquidCount, min: 0, max: this.maxStackSize, step: 100 },
      { k: "salt", kind: "toggle", value: this.liquid?.kind === "water.salt" || (!this.liquid && this.cfg.salt) ? 1 : 0 },
    ];
  }
  override act(key: string, value?: number): void {
    if (key === "water" && value !== undefined) {
      const kind: WaterKind = this.cfg.salt ? "water.salt" : "water";
      this.cfg.water = Math.max(0, Math.round(value));
      this.liquid = null;
      this.addLiquid(kind, this.cfg.water);
      if (!this.liquid) this.onItemAddedOrRemoved(false);
    }
    if (key === "salt") {
      this.cfg.salt = this.cfg.salt ? 0 : 1;
      if (this.liquid) this.liquid.kind = this.cfg.salt ? "water.salt" : "water";
      this.markDirtyForceUpdateOutputs();
    }
  }
}

/**
 * Bomba de agua: con energía (5) suma `AmountPerPump` (85) cada `PumpInterval` (10 s) hasta llenarse. Salada o dulce
 * según dónde está (`WaterResource.GetAtPoint`): acá un ajuste de la parte (salada por defecto, el mar).
 */
export class WaterPump extends LiquidContainer {
  override onFlagsChanged(old: number, next: number): void {
    const was = (old & Flag.Reserved8) !== 0;
    const now = (next & Flag.Reserved8) !== 0;
    if (was === now) return;
    const iv = this.def.p.PumpInterval ?? 10;
    if (now) {
      if (!this.isInvoking("CreateWater")) this.invokeRepeating("CreateWater", () => this.createWater(), iv, iv);
    } else this.cancelInvoke("CreateWater");
  }
  private createWater(): void {
    if (this.liquidCount >= this.maxStackSize && this.liquid) return;
    this.addLiquid(this.waterKind(), this.def.p.AmountPerPump ?? 0);
    this.updateOnFlag();
  }
  waterKind(): WaterKind {
    return this.cfg.fresh ? "water" : "water.salt";
  }
  override getPassthroughAmount(): number {
    return Math.min(Math.max(this.liquidCount, 0), this.maxOutputFlow);
  }
  override actions(): Action[] {
    return [{ k: "fresh", kind: "toggle", value: this.cfg.fresh ? 1 : 0 }];
  }
  override act(key: string): void {
    if (key === "fresh") this.cfg.fresh = this.cfg.fresh ? 0 : 1;
  }
  override readouts(): Readout[] {
    return [{ k: "needs", v: this.consumptionAmount() }, { k: "online", v: this.isPowered() }, ...super.readouts()];
  }
}

/**
 * Colector de agua: 1 al aparecer y cada 60 s `ceil(maxItemToCreate × (base + niebla × fogRate + lluvia × rainRate +
 * nieve × snowRate))` (afuera). Lo deja directo en el contenedor más lejano aguas abajo que tenga lugar, o en el suyo.
 */
export class WaterCatcher extends LiquidContainer {
  override serverInit(): void {
    super.serverInit();
    this.addResource(1);
    this.invokeRepeating("CollectWater", () => this.collectWater(), 60, 60);
  }
  private collectWater(): void {
    if (this.liquid && this.liquidCount >= this.maxStackSize) return;
    const p = this.def.p;
    const env = this.world.env;
    // Acá: el colector está afuera (`TestIsOutside`).
    const rate = p.rate_baseRate + env.fog * p.rate_fogRate + env.rain * p.rate_rainRate + env.snow * p.rate_snowRate;
    this.addResource(Math.ceil(p.maxItemToCreate * rate));
  }
  private addResource(n: number): void {
    if (this.outputs.length !== 0) {
      const target = this.catcherPushTarget(this.outputs[0].connectedTo, n, this, BACKTRACKING * 2);
      if (target) {
        target.addLiquid("water", n);
        return;
      }
    }
    this.addLiquid("water", n);
    this.updateOnFlag();
  }
  /** El `CheckPushLiquid` propio del colector: primero lo más lejano, después el contenedor mismo si tiene lugar. */
  private catcherPushTarget(connected: IOEntity | null, amount: number, fromSource: IOEntity, depth: number): LiquidContainer | null {
    if (depth <= 0 || !connected) return null;
    const g = connected.findGravitySource(BACKTRACKING, true);
    if (g && !connected.allowLiquidPassthrough(g.e, g.y)) return null;
    if (connected === this || this.considerConnectedTo(connected)) return null;
    for (let i = 0; i < connected.outputs.length; i++) {
      const next: IOEntity | null = connected.outputs[i].connectedTo;
      if (next && next !== fromSource && next.allowLiquidPassthrough(connected, connected.outY(i))) {
        const found = this.catcherPushTarget(next, amount, fromSource, depth - 1);
        if (found) return found;
      }
    }
    if (connected instanceof LiquidContainer && (connected.liquid?.kind === "water" || !connected.liquid) && connected.liquidCount + amount < connected.maxStackSize) return connected;
    return null;
  }
}

/**
 * Purificador con energía: con 5 de energía, cada `ConvertInterval` (5 s) procesa `waterToProcessPerMinute` (4.000 por
 * minuto) del agua que tiene y deja 1 de agua dulce cada `freshWaterRatio` (2) en su depósito, que es otra entidad con su
 * "Water Out". Prendido, el depósito empuja sin mirar la gravedad.
 */
export class PoweredWaterPurifier extends LiquidContainer {
  private dirtyWaterProcessed = 0;
  private pendingFreshWater = 0;
  get storage(): LiquidContainer | null {
    return this.child instanceof LiquidContainer ? this.child : null;
  }
  override onItemAddedOrRemoved(added: boolean): void {
    super.onItemAddedOrRemoved(added);
    const iv = this.def.p.ConvertInterval ?? 5;
    if (this.liquid) {
      if (this.hasFlag(Flag.Reserved8) && !this.isInvoking("ConvertWater")) this.invokeRepeating("ConvertWater", () => this.convertWater(), iv, iv);
    } else if (this.isInvoking("ConvertWater")) this.cancelInvoke("ConvertWater");
  }
  override onFlagsChanged(old: number, next: number): void {
    const was = (old & Flag.Reserved8) !== 0;
    const now = (next & Flag.Reserved8) !== 0;
    if (was !== now) {
      const iv = this.def.p.ConvertInterval ?? 5;
      if (now) {
        if (!this.isInvoking("ConvertWater")) this.invokeRepeating("ConvertWater", () => this.convertWater(), iv, iv);
      } else if (this.isInvoking("ConvertWater")) this.cancelInvoke("ConvertWater");
    }
    this.storage?.setFlag(Flag.Reserved8, (next & Flag.Reserved8) !== 0);
  }
  private convertWater(): void {
    if (this.liquidCount > 0) this.convert(this.def.p.ConvertInterval ?? 5);
  }
  private convert(timeCooked: number): void {
    const storage = this.storage;
    if (!storage) return;
    if (this.def.p.stopWhenOutputFull && storage.liquid && storage.liquidCount >= storage.maxStackSize) return;
    let num = timeCooked * ((this.def.p.waterToProcessPerMinute ?? 0) / 60);
    this.dirtyWaterProcessed += num;
    if (this.dirtyWaterProcessed >= 1) {
      const n = Math.min(Math.floor(this.dirtyWaterProcessed), this.liquidCount);
      num = n;
      this.useLiquid(n);
      this.dirtyWaterProcessed -= n;
    }
    this.pendingFreshWater += num / (this.def.p.freshWaterRatio ?? 1);
    if (!(this.pendingFreshWater >= 1)) return;
    const k = Math.floor(this.pendingFreshWater);
    this.pendingFreshWater -= k;
    // Si en el depósito hay otra cosa que agua dulce, se tira.
    if (storage.liquid && storage.liquid.kind !== "water") {
      storage.liquid = null;
      storage.onItemAddedOrRemoved(false);
    }
    if (!storage.liquid) storage.addLiquid("water", k);
    else storage.liquid.amount = Math.min(Math.max(storage.liquid.amount + k, 0), storage.maxStackSize);
  }
  override readouts(): Readout[] {
    return [
      { k: "needs", v: this.consumptionAmount() },
      { k: "online", v: this.isPowered() },
      { k: "liquid", v: this.liquidCount, of: this.maxStackSize },
      { k: "kind", v: this.liquid?.kind ?? "" },
      { k: "fresh", v: this.storage?.liquidCount ?? 0, of: this.storage?.maxStackSize },
    ];
  }
  override actions(): Action[] {
    return [];
  }
}

/** Aspersor: con caudal, prende y pide 2 de agua por segundo (`ConsumptionAmount`); salpica cada `SplashFrequency`. */
export class Sprinkler extends IOEntity {
  private currentFuelType: string | null = null;
  private currentFuelSource: IOEntity | null = null;
  splashes = 0;
  override get blockFluidDraining(): boolean {
    return this.currentFuelSource !== null;
  }
  override desiredPower(): number {
    return Math.min(Math.max(this.currentEnergy, 0), this.consumptionAmount());
  }
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    super.updateHasPower(inputAmount, inputSlot);
    if (inputAmount > 0) this.turnOn();
    else this.turnOff();
  }
  override calculateCurrentEnergy(inputAmount: number): number {
    return inputAmount;
  }
  private turnOn(): void {
    if (!this.isOn()) {
      this.setFlag(Flag.On, true);
      const f = this.def.p.SplashFrequency ?? 1;
      if (!this.isInvoking("DoSplash")) this.invokeRepeating("DoSplash", () => this.splashes++, f * 0.5, f);
    }
  }
  private turnOff(): void {
    if (this.isOn()) {
      this.setFlag(Flag.On, false);
      this.cancelInvoke("DoSplash");
      this.currentFuelSource = null;
      this.currentFuelType = null;
    }
  }
  override setFuelType(kind: string | null, source: IOEntity | null): void {
    this.currentFuelType = kind;
    this.currentFuelSource = source;
  }
  override readouts(): Readout[] {
    return [
      { k: "spraying", v: this.isOn() },
      { k: "kind", v: this.currentFuelType ?? "" },
      { k: "flow", v: this.currentEnergy },
    ];
  }
}

/**
 * Interruptor de fluidos: deja pasar el agua prendido. "Toggle" lo prende y apaga; con energía en "Pump Power" hace de
 * bomba (el agua sube). Es fuente de gravedad: para lo de abajo, el agua sale de acá.
 */
export class FluidSwitch extends ElectricSwitch {
  private pumpEnabled = false;
  private lastToggleInput = 0;
  override get isGravitySource(): boolean {
    return true;
  }
  override get disregardGravityRestrictionsOnLiquid(): boolean {
    return this.hasFlag(Flag.Reserved6);
  }
  override ioStateChanged(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 1 && this.lastToggleInput !== inputAmount) {
      this.lastToggleInput = inputAmount;
      this.setSwitch(inputAmount > 0);
    }
    if (inputSlot === 2) {
      const was = this.pumpEnabled;
      this.pumpEnabled = inputAmount > 0;
      if (was !== this.pumpEnabled) {
        this.lastPassthroughEnergy = -1;
        this.setFlag(Flag.Reserved6, this.pumpEnabled);
        this.sendChangedToRoot(true);
      }
    }
  }
  override setSwitch(state: boolean): void {
    super.setSwitch(state);
    this.invoke("DelayedSendChanged", () => this.sendChangedToRoot(true), 0.2);
  }
  override getPassthroughAmount(outputSlot = 0): number {
    if (outputSlot === 0) return this.isOn() ? this.getCurrentEnergy() : 0;
    return 0;
  }
  override allowLiquidPassthrough(fromSource: IOEntity, sourceY: number, forPlacement = false): boolean {
    if (!forPlacement && !this.isOn()) return false;
    return super.allowLiquidPassthrough(fromSource, sourceY);
  }
  override readouts(): Readout[] {
    return [{ k: "state", v: this.isOn() }, { k: "pump", v: this.pumpEnabled }];
  }
}
