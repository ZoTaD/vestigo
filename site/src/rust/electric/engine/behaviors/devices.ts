/**
 * Consumidores con lógica propia (2026-10-09): torreta, SAM, bobina Tesla, encendedor, controlador de puerta, blanco
 * reactivo y rocola/boombox. Fuentes: `AutoTurret.cs`, `SamSite.cs`, `TeslaCoil.cs`, `Igniter.cs`,
 * `DoorManipulator.cs`, `CustomDoorManipulator.cs`, `ReactiveTarget.cs`, `DeployableBoomBox.cs` (RustChangelog,
 * 2024-08-03). Lo que no tienen (luces, heladera, calefactor…) usa `IOEntity` tal cual.
 */
import { Flag, IOEntity, type Action, type Readout } from "../ioentity";

/** Lo de todos los consumidores en el inspector: cuánto piden y si les alcanza. */
export class Consumer extends IOEntity {
  override readouts(): Readout[] {
    return [{ k: "needs", v: this.consumptionAmount() }, { k: "gets", v: this.currentEnergy }];
  }
}

/**
 * Torreta: se prende con 10. Sus salidas de estado ("Has Target", "Low Ammo", "No Ammo") dan `min(1, lo que entra − 10)`:
 * con 10 justos se prende pero las salidas dan 0; hacen falta 11.
 */
export class AutoTurret extends Consumer {
  override init(): void {
    super.init();
  }
  hasTarget(): boolean {
    return !!this.cfg.target && this.isOn();
  }
  get totalAmmo(): number {
    return this.cfg.ammo ?? 100;
  }
  override getPassthroughAmount(outputSlot = 0): number {
    const result = Math.min(1, this.getCurrentEnergy());
    switch (outputSlot) {
      case 0:
        return this.hasTarget() ? result : 0;
      case 1:
        return this.totalAmmo > 50 ? 0 : result;
      case 2:
        return this.totalAmmo !== 0 ? 0 : result;
      default:
        return 0;
    }
  }
  override ioStateChanged(inputAmount: number, inputSlot: number): void {
    super.ioStateChanged(inputAmount, inputSlot);
    // `InitiateStartup` / `InitiateShutdown`: acá sin la demora del arranque.
    if (this.isPowered() && !this.isOn()) this.setFlag(Flag.On, true);
    else if (!this.isPowered() && this.isOn()) this.setFlag(Flag.On, false);
  }
  override readouts(): Readout[] {
    return [...super.readouts(), { k: "online", v: this.isOn() }];
  }
  override actions(): Action[] {
    return [
      { k: "target", kind: "toggle", value: this.cfg.target ? 1 : 0 },
      { k: "ammo", kind: "number", value: this.totalAmmo, min: 0, max: 1000, step: 1 },
    ];
  }
  override act(key: string, value?: number): void {
    if (key === "target") this.cfg.target = this.cfg.target ? 0 : 1;
    if (key === "ammo" && value !== undefined) this.cfg.ammo = Math.max(0, Math.round(value));
    this.markDirtyForceUpdateOutputs();
  }
}

/** SAM: 25. Salidas de estado como la torreta; "Passthrough" deja pasar lo que sobra. "Invert Mode" cambia el modo. */
export class SamSite extends AutoTurret {
  private input1Amount = 0;
  override get totalAmmo(): number {
    return this.cfg.ammo ?? 100;
  }
  override hasTarget(): boolean {
    return !!this.cfg.target && this.isPowered();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    const result = Math.min(1, this.getCurrentEnergy());
    switch (outputSlot) {
      case 0:
        return this.hasTarget() ? result : 0;
      case 1:
        return this.totalAmmo > 0 && this.totalAmmo < this.def.p.lowAmmoThreshold ? result : 0;
      case 2:
        return this.totalAmmo > 0 ? 0 : result;
      default:
        return this.getCurrentEnergy();
    }
  }
  override ioStateChanged(inputAmount: number, inputSlot: number): void {
    IOEntity.prototype.ioStateChanged.call(this, inputAmount, inputSlot);
  }
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) super.updateHasPower(inputAmount, inputSlot);
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) super.updateFromInput(inputAmount, inputSlot);
    else if (inputSlot === 1) {
      if (this.input1Amount !== inputAmount) this.setFlag(Flag.Reserved9, inputAmount === 0 ? !!this.cfg.manualMode : !this.cfg.manualMode);
      this.input1Amount = inputAmount;
    }
  }
  override readouts(): Readout[] {
    return [{ k: "needs", v: this.consumptionAmount() }, { k: "gets", v: this.currentEnergy }, { k: "online", v: this.isPowered() }];
  }
}

/** Bobina Tesla: pide hasta 25 (35 de daño ÷ 1,4); hace daño según lo que le llega y se va rompiendo. */
export class TeslaCoil extends Consumer {
  override desiredPower(): number {
    if (!this.canDischarge()) return 0;
    return Math.min(Math.max(this.currentEnergy, 0), this.consumptionAmount());
  }
  canDischarge(): boolean {
    return this.healthFraction >= 0.1;
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    super.updateFromInput(inputAmount, inputSlot);
    const on = inputAmount > 0 && this.canDischarge();
    this.setFlag(Flag.Reserved1, on && inputAmount < this.def.p.powerForHeavyShorting);
    this.setFlag(Flag.Reserved2, on && inputAmount >= this.def.p.powerForHeavyShorting);
    this.setFlag(Flag.On, on);
  }
  /** Daño por segundo: `clamp(energía × 1,4, 0, 35)`. */
  dps(): number {
    return Math.min(Math.max(this.currentEnergy * this.def.p.powerToDamageRatio, 0), this.def.p.maxDamageOutput);
  }
  override readouts(): Readout[] {
    return [...super.readouts(), { k: "dps", v: Math.round(this.dps() * 10) / 10 }];
  }
}

/** Encendedor: 2; prende hornos y fogatas cerca mientras tiene energía. */
export class Igniter extends Consumer {
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    super.updateFromInput(inputAmount, inputSlot);
    this.setFlag(Flag.On, inputAmount > 0 && this.healthFraction >= 0.1);
  }
}

/**
 * Controlador de puerta (`CustomDoorManipulator`): al llegar energía a "Power In" abre la puerta (o la cierra si
 * "Close" tiene energía), al cortarse la cierra (salvo que "Open" siga con energía). "Open" y "Close" mueven la puerta
 * si "Power In" está alimentado. Acá: la puerta se mueve al instante (en el juego tarda en abrirse).
 */
export class CustomDoorManipulator extends Consumer {
  private inputOpenAmount = 0;
  private inputCloseAmount = 0;
  doorOpen = !!this.cfg.open;
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) super.updateHasPower(inputAmount, inputSlot);
  }
  override ioStateChanged(): void {}
  private setOpen(open: boolean): void {
    this.doorOpen = open;
    this.cfg.open = open ? 1 : 0;
    this.setFlag(Flag.Open, open);
  }
  doAction(action: "open" | "close"): void {
    this.setOpen(action === "open");
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) {
      const had = this.currentEnergy !== 0;
      super.updateFromInput(inputAmount, inputSlot);
      if (inputAmount === 0 && had && this.inputOpenAmount === 0) this.doAction("close");
      else if (inputAmount > 0 && !had) {
        this.inputCloseAmount = this.powerAtInput(2);
        this.doAction(this.inputCloseAmount === 0 ? "open" : "close");
      }
    }
    if (inputSlot === 1 && this.inputOpenAmount !== inputAmount) {
      if (inputAmount > 0 && this.isPowered()) this.doAction("open");
      this.inputOpenAmount = inputAmount;
    } else if (inputSlot === 2 && this.inputCloseAmount !== inputAmount) {
      if (inputAmount > 0 && this.isPowered()) this.doAction("close");
      this.inputCloseAmount = inputAmount;
    }
  }
  private powerAtInput(slot: number): number {
    const s = this.inputs[slot];
    if (!s?.connectedTo) return 0;
    return s.connectedTo.getPassthroughAmount(s.connectedToSlot);
  }
  override readouts(): Readout[] {
    return [...super.readouts(), { k: "door", v: this.doorOpen }];
  }
}

/** Blanco reactivo: al voltearlo da un pulso de 0,5 s con 1; si "Power In" tiene energía, la deja pasar mientras está caído. */
export class ReactiveTarget extends Consumer {
  private lastToggleTime = -Infinity;
  private knockdownHealth = 100;
  private inputAmountReset = 0;
  private inputAmountLower = 0;
  override init(): void {
    this.setFlag(Flag.On, true);
    super.init();
  }
  override isRootEntity(): boolean {
    return true;
  }
  isLowered(): boolean {
    return !this.hasFlag(Flag.On);
  }
  isKnockedDown(): boolean {
    return this.isLowered() && this.hasFlag(Flag.Reserved1);
  }
  canToggle(): boolean {
    return this.now > this.lastToggleTime + (this.inputAmountReset > 0 ? 0.25 : 1);
  }
  canLower(): boolean {
    return this.inputAmountLower <= this.inputAmountReset ? this.inputAmountReset === 0 : true;
  }
  canReset(): boolean {
    return this.inputAmountReset <= this.inputAmountLower ? this.inputAmountLower === 0 : true;
  }
  knockDown(): void {
    if (this.isKnockedDown() || this.isLowered()) return;
    this.knockdownHealth = 0;
    this.setFlag(Flag.On, false);
    this.setFlag(Flag.Reserved1, true);
    this.queueReset();
    this.sendPowerBurst();
  }
  queueReset(): void {
    this.invoke("ResetTarget", () => this.resetTarget(), this.inputAmountReset > 0 ? 0.25 : 6);
  }
  resetTarget(): void {
    if (this.isLowered() && this.canToggle() && this.canReset()) {
      this.cancelInvoke("ResetTarget");
      this.setFlag(Flag.On, true);
      this.setFlag(Flag.Reserved1, false);
      this.knockdownHealth = 100;
      this.sendPowerBurst();
    }
  }
  private lowerTarget(): void {
    if (!this.isKnockedDown() && this.canToggle() && this.canLower()) {
      this.setFlag(Flag.On, false);
      this.sendPowerBurst();
    }
  }
  private sendPowerBurst(): void {
    this.lastToggleTime = this.now;
    this.markDirtyForceUpdateOutputs();
    this.invoke("MarkDirtyForceUpdateOutputs2", () => this.markDirtyForceUpdateOutputs(), this.def.p.activationPowerTime * 1.01);
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) super.updateFromInput(inputAmount, inputSlot);
    else if (inputSlot === 1) {
      this.inputAmountReset = inputAmount;
      if (inputAmount > 0) this.resetTarget();
    } else if (inputSlot === 2) {
      this.inputAmountLower = inputAmount;
      if (inputAmount > 0) this.lowerTarget();
    }
  }
  override getPassthroughAmount(): number {
    if (this.isLowered()) {
      if (this.isPowered()) return super.getPassthroughAmount();
      if (this.isKnockedDown() && this.now < this.lastToggleTime + this.def.p.activationPowerTime) return this.def.p.activationPowerAmount;
    }
    return 0;
  }
  override readouts(): Readout[] {
    return [{ k: "knocked", v: this.isLowered() }];
  }
  override actions(): Action[] {
    return [{ k: "knock", kind: "press" }];
  }
  override act(key: string): void {
    if (key === "knock") this.knockDown();
  }
}

/** Rocola y boombox: `ConsumptionAmount` 10, pero sólo piden (`DesiredPower`) mientras suenan. */
export class DeployableBoomBox extends Consumer {
  override init(): void {
    if (this.cfg.on) this.setFlag(Flag.On, true);
    super.init();
  }
  override desiredPower(inputIndex = 0): number {
    if (!this.isOn() || inputIndex !== 0) return 0;
    return this.def.p.PowerUsageWhilePlaying;
  }
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) {
      super.updateHasPower(inputAmount, inputSlot);
      if (!this.isPowered() && this.isOn()) this.setPlay(false);
    } else if (this.isPowered() && !this.isConnectedToAnySlot(this, inputSlot, 8)) this.setPlay(inputAmount > 0);
  }
  private setPlay(on: boolean): void {
    this.setFlag(Flag.On, on);
    this.cfg.on = on ? 1 : 0;
    this.markDirty();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    if (!this.isOn()) return 0;
    return super.getPassthroughAmount(outputSlot);
  }
  override calculateCurrentEnergy(inputAmount: number, inputSlot: number): number {
    return inputSlot !== 0 ? this.currentEnergy : inputAmount;
  }
  override readouts(): Readout[] {
    return [...super.readouts(), { k: "playing", v: this.isOn() }];
  }
  override actions(): Action[] {
    return [{ k: "play", kind: "toggle", value: this.isOn() ? 1 : 0 }];
  }
  override act(key: string): void {
    if (key === "play" && (this.isPowered() || this.isOn())) this.setPlay(!this.isOn());
  }
}
