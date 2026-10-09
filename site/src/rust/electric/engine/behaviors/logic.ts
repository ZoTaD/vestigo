/**
 * Compuertas y lógica (2026-10-09): AND, OR, XOR, celda de memoria, contador y temporizador.
 * Fuentes: `ANDSwitch.cs`, `ORSwitch.cs`, `XORSwitch.cs`, `ElectricalDFlipFlop.cs`, `PowerCounter.cs`, `TimerSwitch.cs`
 * y `CustomTimerSwitch.cs` (RustChangelog, 2024-08-03).
 */
import { BACKTRACKING, clamp, Flag, IOEntity, type Action, type Readout } from "../ioentity";

/** Da `max(A, B)` si las dos entradas tienen energía. */
export class ANDSwitch extends IOEntity {
  input1Amount = 0;
  input2Amount = 0;
  override wantsPower(inputIndex: number): boolean {
    if (this.input1Amount === 0 || this.input2Amount === 0) return false;
    if (this.input1Amount === this.input2Amount) return inputIndex === 0;
    return inputIndex === (this.input1Amount <= this.input2Amount ? 1 : 0);
  }
  override getPassthroughAmount(): number {
    if (this.input1Amount <= 0 || this.input2Amount <= 0) return 0;
    return Math.max(this.input1Amount, this.input2Amount);
  }
  override updateHasPower(): void {
    this.setFlag(Flag.Reserved8, this.input1Amount > 0 || this.input2Amount > 0);
  }
  override updateFromInput(inputAmount: number, slot: number): void {
    if (slot === 0) this.input1Amount = inputAmount;
    else if (slot === 1) this.input2Amount = inputAmount;
    const num = this.input1Amount > 0 && this.input2Amount > 0 ? this.input1Amount + this.input2Amount : 0;
    this.setFlag(Flag.On, num > 0);
    super.updateFromInput(inputAmount, slot);
  }
}

/** Da `max(A, B)`. Una entrada que se alimenta de su propia salida cuenta como 0. */
export class ORSwitch extends IOEntity {
  input1Amount = 0;
  input2Amount = 0;
  override wantsPower(inputIndex: number): boolean {
    if (this.input1Amount === 0 && this.input2Amount === 0) return false;
    if (this.input1Amount === this.input2Amount) return inputIndex === 0;
    return inputIndex === (this.input1Amount <= this.input2Amount ? 1 : 0);
  }
  override getPassthroughAmount(): number {
    return Math.max(0, Math.max(this.input1Amount, this.input2Amount));
  }
  override updateHasPower(): void {
    this.setFlag(Flag.Reserved8, this.input1Amount > 0 || this.input2Amount > 0);
  }
  override updateFromInput(inputAmount: number, slot: number): void {
    if (this.isConnectedToSlot(this, slot, BACKTRACKING)) inputAmount = 0;
    if (slot === 0) this.input1Amount = inputAmount;
    else if (slot === 1) this.input2Amount = inputAmount;
    this.setFlag(Flag.On, this.input1Amount + this.input2Amount > 0);
    super.updateFromInput(inputAmount, slot);
  }
}

/** Da `max(A, B)` si sólo una tiene energía. Realimentada: anula esa entrada y marca corto. */
export class XORSwitch extends IOEntity {
  input1Amount = 0;
  input2Amount = 0;
  private firstRun = true;
  override wantsPower(): boolean {
    if (this.input1Amount !== 0) return this.input2Amount === 0;
    return true;
  }
  override getPassthroughAmount(): number {
    if (this.input1Amount > 0 && this.input2Amount > 0) return 0;
    return Math.max(0, Math.max(this.input1Amount, this.input2Amount));
  }
  override updateHasPower(): void {
    this.setFlag(Flag.Reserved8, this.input1Amount > 0 || this.input2Amount > 0);
  }
  override updateFromInput(inputAmount: number, slot: number): void {
    if (inputAmount > 0 && this.isConnectedToSlot(this, slot, BACKTRACKING)) {
      inputAmount = 0;
      this.setFlag(Flag.Reserved7, true);
    } else this.setFlag(Flag.Reserved7, false);
    if (slot === 0) this.input1Amount = inputAmount;
    else if (slot === 1) this.input2Amount = inputAmount;
    if (this.firstRun) {
      if (!this.isInvoking("UpdateFlags")) this.invoke("UpdateFlags", () => this.updateFlags(), 0.1);
    } else this.updateFlags();
    this.firstRun = false;
    super.updateFromInput(inputAmount, slot);
  }
  private updateFlags(): void {
    const num = this.input1Amount <= 0 || this.input2Amount <= 0 ? Math.max(this.input1Amount, this.input2Amount) : 0;
    this.setFlag(Flag.On, num > 0);
  }
}

/**
 * Celda de memoria (`ElectricalDFlipFlop`): lo que entra por "Power In" sale por "Output" si está prendida o por
 * "Inverted Output" si no. Set la prende, Reset la apaga, Set y Reset juntos la dejan prendida, Toggle la invierte.
 * Sólo cambia de estado con "Power In" alimentado.
 */
export class ElectricalDFlipFlop extends IOEntity {
  private setAmount = 0;
  private resetAmount = 0;
  private toggleAmount = 0;
  override init(): void {
    if (this.cfg.on) this.setFlag(Flag.On, true);
    super.init();
  }
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) super.updateHasPower(inputAmount, inputSlot);
  }
  getDesiredState(): boolean {
    if (this.setAmount > 0 && this.resetAmount === 0) return true;
    if (this.setAmount > 0 && this.resetAmount > 0) return true;
    if (this.setAmount === 0 && this.resetAmount > 0) return false;
    if (this.toggleAmount > 0) return !this.isOn();
    if (this.setAmount === 0 && this.resetAmount === 0) return this.isOn();
    return false;
  }
  updateState(): void {
    if (this.isPowered()) {
      const was = this.isOn();
      this.setFlag(Flag.On, this.getDesiredState());
      this.cfg.on = this.isOn() ? 1 : 0;
      if (was !== this.isOn()) this.markDirtyForceUpdateOutputs();
    }
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    let changed = false;
    switch (inputSlot) {
      case 1:
        changed = inputAmount !== this.setAmount;
        this.setAmount = inputAmount;
        break;
      case 2:
        changed = inputAmount !== this.resetAmount;
        this.resetAmount = inputAmount;
        break;
      case 3:
        changed = inputAmount !== this.toggleAmount;
        this.toggleAmount = inputAmount;
        break;
      case 0:
        super.updateFromInput(inputAmount, inputSlot);
        this.updateState();
        break;
    }
    if (changed) this.updateState();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    const result = Math.max(0, this.currentEnergy);
    if (outputSlot === -1) return result;
    if (!this.allowDrainFrom(outputSlot)) return 0;
    return result;
  }
  override updateOutputs(): void {
    if (this.shouldUpdateOutputs() && this.ensureOutputsUpdated) {
      const p = this.getPassthroughAmount(-1);
      this.send(0, this.isOn() ? p : 0);
      this.send(1, !this.isOn() ? p : 0);
    }
  }
  override allowDrainFrom(outputSlot: number): boolean {
    if (outputSlot === -1) return true;
    return this.isOn() ? outputSlot === 0 : outputSlot === 1;
  }
  override wantsPower(inputIndex: number): boolean {
    return inputIndex === 0;
  }
  override readouts(): Readout[] {
    return [{ k: "state", v: this.isOn() }];
  }
}

/**
 * Contador: cada vez que llega energía (> 0) a "Increment" suma 1, a "Decrement" resta 1 y "Reset" vuelve a 0 (de 0 a
 * 999). Deja pasar "Power In" cuando llega al objetivo, o siempre en modo "mostrar lo que pasa".
 */
export class PowerCounter extends IOEntity {
  counterNumber = this.cfg.count ?? 0;
  targetCounterNumber = this.cfg.target ?? 10;
  override init(): void {
    this.setFlag(Flag.Reserved2, !!this.cfg.passthrough);
    super.init();
  }
  displayPassthrough(): boolean {
    return this.hasFlag(Flag.Reserved2);
  }
  displayCounter(): boolean {
    return !this.displayPassthrough();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    if (this.displayPassthrough()) return this.getCurrentEnergy();
    if (this.counterNumber >= this.targetCounterNumber) return super.getPassthroughAmount(outputSlot);
    return 0;
  }
  override wantsPower(inputIndex: number): boolean {
    if (inputIndex !== 0) return false;
    if (this.displayPassthrough()) return true;
    return this.counterNumber >= this.targetCounterNumber;
  }
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) super.updateHasPower(inputAmount, inputSlot);
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    if (this.displayCounter() && inputAmount > 0 && inputSlot !== 0) {
      const was = this.counterNumber;
      if (inputSlot === 1) this.counterNumber++;
      else if (inputSlot === 2) this.counterNumber = Math.max(0, this.counterNumber - 1);
      else if (inputSlot === 3) this.counterNumber = 0;
      this.counterNumber = clamp(this.counterNumber, 0, 999);
      this.cfg.count = this.counterNumber;
      if (was !== this.counterNumber) this.markDirty();
    }
    if (inputSlot === 0) super.updateFromInput(inputAmount, inputSlot);
  }
  override readouts(): Readout[] {
    return this.displayPassthrough() ? [{ k: "passing", v: this.getCurrentEnergy() }] : [{ k: "count", v: this.counterNumber, of: this.targetCounterNumber }];
  }
  override actions(): Action[] {
    return [
      { k: "target", kind: "number", value: this.targetCounterNumber, min: 0, max: 999, step: 1 },
      { k: "passthroughMode", kind: "toggle", value: this.displayPassthrough() ? 1 : 0 },
    ];
  }
  override act(key: string, value?: number): void {
    if (key === "target" && value !== undefined) {
      this.targetCounterNumber = clamp(Math.round(value), 0, 999);
      this.cfg.target = this.targetCounterNumber;
      this.markDirty();
    }
    if (key === "passthroughMode") {
      this.setFlag(Flag.Reserved2, !this.displayPassthrough());
      this.cfg.passthrough = this.displayPassthrough() ? 1 : 0;
      this.markDirty();
    }
  }
}

/**
 * Temporizador (`CustomTimerSwitch` ← `TimerSwitch`): con "Power In" alimentado, energía en "Toggle On" (o el botón)
 * lo prende `timerLength` segundos (avanza de a 0,1 s). Si "Power In" cambia mientras corre, vuelve a empezar.
 */
export class TimerSwitch extends IOEntity {
  timerLength = this.cfg.timerLength ?? this.def.p.timerLength;
  private timePassed = -1;
  private input1Amount = 0;
  override resetIOState(): void {
    this.setFlag(Flag.On, false);
    if (this.isInvoking("AdvanceTime")) this.endTimer();
  }
  override wantsPassthroughPower(): boolean {
    return this.isPowered() ? this.isOn() : false;
  }
  override getPassthroughAmount(outputSlot = 0): number {
    if (!this.isPowered() || !this.isOn()) return 0;
    return super.getPassthroughAmount(outputSlot);
  }
  override wantsPower(inputIndex: number): boolean {
    return inputIndex === 0;
  }
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) super.updateHasPower(inputAmount, inputSlot);
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0) {
      super.updateFromInput(inputAmount, inputSlot);
      if (!this.isPowered() && this.isInvoking("AdvanceTime")) this.endTimer();
      else if (this.timePassed !== -1) {
        this.setFlag(Flag.On, false);
        this.switchPressed();
      }
    } else if (inputSlot === 1) {
      if (this.input1Amount !== inputAmount) {
        if (inputAmount > 0) this.switchPressed();
        this.input1Amount = inputAmount;
      }
    }
  }
  switchPressed(): void {
    if (!this.isOn() && this.isPowered()) {
      this.setFlag(Flag.On, true);
      this.markDirty();
      this.invokeRepeating("AdvanceTime", () => this.advanceTime(), 0, 0.1);
    }
  }
  advanceTime(): void {
    if (this.timePassed < 0) this.timePassed = 0;
    this.timePassed += 0.1;
    if (this.timePassed >= this.timerLength) this.endTimer();
  }
  endTimer(): void {
    this.cancelInvoke("AdvanceTime");
    this.timePassed = -1;
    this.setFlag(Flag.On, false);
    this.markDirty();
  }
  override readouts(): Readout[] {
    const left = this.timePassed >= 0 ? Math.max(0, this.timerLength - this.timePassed) : null;
    return [{ k: "timer", v: this.timerLength }, ...(left !== null && this.isOn() ? [{ k: "left", v: Math.round(left * 10) / 10 }] : [])];
  }
  override actions(): Action[] {
    const r = this.def.range?.timerLength ?? [0.25, 1e9];
    return [
      { k: "press", kind: "press" },
      { k: "timerLength", kind: "number", value: this.timerLength, min: r[0], max: Math.min(r[1], 86400), step: 0.25 },
    ];
  }
  override act(key: string, value?: number): void {
    if (key === "press") this.switchPressed();
    // `CanPlayerAdmin`: el tiempo sólo se cambia con el temporizador apagado.
    if (key === "timerLength" && value !== undefined && !this.isOn()) {
      const r = this.def.range?.timerLength ?? [0.25, 1e9];
      this.timerLength = clamp(value, r[0], r[1]);
      this.cfg.timerLength = this.timerLength;
    }
  }
}
