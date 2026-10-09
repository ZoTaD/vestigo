/**
 * Reparto de energía (2026-10-09): splitter, rama, combinador, bloqueador, interruptor aleatorio y túnel de cables.
 * Fuentes: `Splitter.cs`, `ElectricalBranch.cs`, `ElectricalCombiner.cs`, `ElectricalBlocker.cs`, `RANDSwitch.cs`,
 * `CableTunnel.cs` (RustChangelog, 2024-08-03).
 */
import { BACKTRACKING, clamp, Flag, idiv, IOEntity, type Action, type Readout } from "../ioentity";

/** Reparte en partes iguales entre las salidas conectadas; el resto, de a 1, a las primeras. No mira lo que piden. */
export class Splitter extends IOEntity {
  override get blockFluidDraining(): boolean {
    return true;
  }
  override isRootEntity(): boolean {
    return true;
  }
  override getPassthroughAmount(outputSlot = 0): number {
    if (outputSlot < 0 || outputSlot >= this.outputs.length) return 0;
    const e = this.outputs[outputSlot].connectedTo;
    if (!e || e.destroyed) return 0;
    const num = this.cachedOutputsUsed === 0 ? 1 : this.cachedOutputsUsed;
    const num2 = this.getCurrentEnergy();
    const num3 = idiv(num2, num);
    let num4 = 0;
    for (let i = 0; i < this.outputs.length; i++) {
      const o = this.outputs[i].connectedTo;
      if (!o || o.destroyed) continue;
      if (outputSlot === i) return num4 < num2 % num ? num3 + 1 : num3;
      num4++;
    }
    return 0;
  }
  override onCircuitChanged(): void {
    this.markDirtyForceUpdateOutputs();
  }
  override readouts(): Readout[] {
    return [{ k: "input", v: this.currentEnergy }, { k: "outputsUsed", v: this.cachedOutputsUsed }];
  }
}

/** "Branch Out" da `branchAmount` (o lo que haya); "Power Out", el resto. */
export class ElectricalBranch extends IOEntity {
  branchAmount = this.cfg.branchAmount ?? this.def.p.branchAmount;
  setBranchOffPower(power: number): void {
    this.branchAmount = clamp(Math.round(power), 1, 10000000);
    this.cfg.branchAmount = this.branchAmount;
    this.markDirtyForceUpdateOutputs();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    const e = this.getCurrentEnergy();
    if (outputSlot === 0) return clamp(e - this.branchAmount, 0, e);
    if (outputSlot === 1) return Math.min(e, this.branchAmount);
    return 0;
  }
  override readouts(): Readout[] {
    return [{ k: "input", v: this.currentEnergy }];
  }
  override actions(): Action[] {
    return [{ k: "branchAmount", kind: "number", value: this.branchAmount, min: 1, max: 10000000, step: 1 }];
  }
  override act(key: string, value?: number): void {
    if (key === "branchAmount" && value !== undefined) this.setBranchOffPower(value);
  }
}

/** Suma sus entradas. Si una entrada se alimenta de su propia salida, la anula y marca corto (`Flag_ShortCircuit`). */
export class ElectricalCombiner extends IOEntity {
  input1Amount = 0;
  input2Amount = 0;
  input3Amount = 0;
  override get blockFluidDraining(): boolean {
    return true;
  }
  override isRootEntity(): boolean {
    return true;
  }
  override getPassthroughAmount(): number {
    return this.input1Amount + this.input2Amount + this.input3Amount;
  }
  override updateHasPower(): void {
    this.setFlag(Flag.Reserved8, this.input1Amount > 0 || this.input2Amount > 0);
  }
  override updateFromInput(inputAmount: number, slot: number): void {
    if (inputAmount > 0 && this.isConnectedToSlot(this, slot, BACKTRACKING * 2, true)) {
      inputAmount = 0;
      this.setFlag(Flag.Reserved7, true);
    } else this.setFlag(Flag.Reserved7, false);
    if (slot === 0) this.input1Amount = inputAmount;
    else if (slot === 1) this.input2Amount = inputAmount;
    else if (slot === 2) this.input3Amount = inputAmount;
    const num = this.input1Amount + this.input2Amount + this.input3Amount;
    this.setFlag(Flag.On, num > 0);
    super.updateFromInput(num, slot);
  }
  override readouts(): Readout[] {
    return [{ k: "output", v: this.getPassthroughAmount() }];
  }
}

/** Pasa "Power In" (menos su consumo) salvo que "Block Passthrough" tenga energía. */
export class ElectricalBlocker extends IOEntity {
  input1Amount = 0;
  input2Amount = 0;
  override getPassthroughAmount(outputSlot = 0): number {
    return super.getPassthroughAmount(outputSlot) * (this.isOn() ? 0 : 1);
  }
  override wantsPower(inputIndex: number): boolean {
    if (inputIndex !== 0 || !this.isFlickering()) return !this.isOn();
    return true;
  }
  override updateHasPower(): void {
    this.setFlag(Flag.Reserved8, this.input2Amount > 0);
  }
  updateBlocked(): void {
    const was = this.isOn();
    this.setFlag(Flag.On, this.input1Amount > 0);
    if (was !== this.isOn()) this.markDirty();
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 1) {
      this.input1Amount = inputAmount;
      this.updateBlocked();
    } else if (inputSlot === 0) {
      this.input2Amount = inputAmount;
      super.updateFromInput(inputAmount, inputSlot);
    }
  }
  override readouts(): Readout[] {
    return [{ k: "blocked", v: this.isOn() }];
  }
}

/** `RANDSwitch`: con energía en "Set" tira una moneda (50 %); "Reset" la apaga. Pasa todo lo que entra si salió cara. */
export class RANDSwitch extends ElectricalBlocker {
  private rand = false;
  /** Acá: la moneda se puede fijar para los tests; en la página es `Math.random`. */
  roll: () => boolean = () => Math.random() < 0.5;
  override getPassthroughAmount(): number {
    return this.getCurrentEnergy() * (this.isOn() ? 1 : 0);
  }
  override wantsPower(inputIndex: number): boolean {
    return inputIndex === 0 ? this.isOn() : false;
  }
  override updateBlocked(): void {
    const was = this.isOn();
    this.setFlag(Flag.On, this.rand);
    this.setFlag(Flag.Reserved8, this.rand);
    this.updateHasPower();
    if (was !== this.isOn()) this.markDirty();
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 1 && inputAmount > 0) {
      this.input1Amount = inputAmount;
      this.rand = this.roll();
      this.updateBlocked();
    }
    if (inputSlot === 2) {
      if (inputAmount > 0) {
        this.rand = false;
        this.updateBlocked();
      }
    } else super.updateFromInput(inputAmount, inputSlot);
  }
  override readouts(): Readout[] {
    return [{ k: "passing", v: this.isOn() }];
  }
}

/** Cuatro canales independientes: cada salida da lo que entró por su entrada. */
export class CableTunnel extends IOEntity {
  private inputAmounts = [0, 0, 0, 0];
  override wantsPower(): boolean {
    return true;
  }
  override ioStateChanged(inputAmount: number, inputSlot: number): void {
    const was = this.inputAmounts[inputSlot];
    this.inputAmounts[inputSlot] = inputAmount;
    if (inputAmount !== was) this.ensureOutputsUpdated = true;
    super.ioStateChanged(inputAmount, inputSlot);
  }
  override updateOutputs(): void {
    if (!this.shouldUpdateOutputs() || !this.ensureOutputsUpdated) return;
    for (let i = 0; i < 4; i++) this.send(i, this.inputAmounts[i]);
  }
}
