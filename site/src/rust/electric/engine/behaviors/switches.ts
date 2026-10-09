/**
 * Interruptores (2026-10-09): interruptor, interruptor inteligente, botón, emisor y receptor de RF.
 * Fuentes: `ElectricSwitch.cs`, `SmartSwitch.cs`, `PressButton.cs`, `RFBroadcaster.cs`, `RFReceiver.cs`
 * (RustChangelog, 2024-08-03). `RFManager` se reduce a "hay un emisor prendido en la frecuencia" (alcance 100.000 m).
 */
import { Flag, IOEntity, type Action, type Readout } from "../ioentity";

/** Pasa todo lo que entra por "Power In" si está prendido. "Switch On"/"Switch Off" lo prenden y lo apagan. */
export class ElectricSwitch extends IOEntity {
  override init(): void {
    if (this.cfg.on) this.setFlag(Flag.On, true);
    super.init();
  }
  override wantsPower(inputIndex: number): boolean {
    return inputIndex === 0 ? this.isOn() : false;
  }
  override resetIOState(): void {
    this.setFlag(Flag.On, false);
  }
  override getPassthroughAmount(): number {
    return this.isOn() ? this.getCurrentEnergy() : 0;
  }
  override calculateCurrentEnergy(inputAmount: number, inputSlot: number): number {
    return inputSlot !== 0 ? this.currentEnergy : super.calculateCurrentEnergy(inputAmount, inputSlot);
  }
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 1 && inputAmount > 0) this.setSwitch(true);
    if (inputSlot === 2 && inputAmount > 0) this.setSwitch(false);
    if (inputSlot === 0) super.updateHasPower(inputAmount, inputSlot);
  }
  setSwitch(state: boolean): void {
    if (state !== this.isOn()) {
      this.setFlag(Flag.On, state);
      this.cfg.on = state ? 1 : 0;
      this.setFlag(Flag.Busy, true);
      this.invoke("UnBusy", () => this.setFlag(Flag.Busy, false), 0.5);
      this.markDirty();
    }
  }
  override readouts(): Readout[] {
    return [{ k: "state", v: this.isOn() }];
  }
  override actions(): Action[] {
    return [{ k: "power", kind: "toggle", value: this.isOn() ? 1 : 0 }];
  }
  override act(key: string): void {
    if (key === "power") this.setSwitch(!this.isOn());
  }
}

/** Igual al interruptor (se prende desde la app); en el juego avisa a Rust+. */
export class SmartSwitch extends ElectricSwitch {}

/**
 * Botón: al apretarlo da un pulso de `pressPowerTime` (0,5 s) con lo que entra o al menos `pressPowerAmount` (2), aunque
 * no le entre nada. Queda hundido `pressDuration` (1 s): no se puede volver a apretar antes.
 */
export class PressButton extends IOEntity {
  override getPassthroughAmount(): number {
    if (this.isOn()) {
      // `sourceItem != null || smallBurst`: el botón que coloca un jugador viene de un objeto, así que da un pulso de
      // `pressPowerTime` y después 0 hasta soltarse (el `return base.GetPassthroughAmount()` es el de los monumentos).
      if (this.hasFlag(Flag.Reserved3)) return Math.max(this.def.p.pressPowerAmount, super.getPassthroughAmount());
      return 0;
    }
    return 0;
  }
  override resetIOState(): void {
    this.setFlag(Flag.On, false);
    this.setFlag(Flag.Reserved3, false);
    this.cancelInvoke("Unpress");
    this.cancelInvoke("UnpowerTime");
  }
  unpowerTime(): void {
    this.setFlag(Flag.Reserved3, false);
    this.markDirty();
  }
  press(): void {
    if (!this.isOn()) {
      this.setFlag(Flag.On, true);
      this.invoke("UnpowerTime", () => this.unpowerTime(), this.def.p.pressPowerTime);
      this.setFlag(Flag.Reserved3, true);
      this.markDirty();
      this.invoke("Unpress", () => this.unpress(), this.def.p.pressDuration);
    }
  }
  unpress(): void {
    this.setFlag(Flag.On, false);
    this.markDirty();
  }
  override readouts(): Readout[] {
    return [{ k: "pressed", v: this.isOn() }];
  }
  override actions(): Action[] {
    return [{ k: "press", kind: "press" }];
  }
  override act(key: string): void {
    if (key === "press") this.press();
  }
}

/** Emisor de RF: mientras le entra energía, su frecuencia queda "al aire"; al cortarse deja de emitir en ≤ 1 s. */
export class RFBroadcaster extends IOEntity {
  frequency = this.cfg.frequency ?? 0;
  private nextStopTime = 0;
  override wantsPower(): boolean {
    return true;
  }
  override ioStateChanged(inputAmount: number, inputSlot: number): void {
    if (inputAmount > 0) {
      this.cancelInvoke("StopBroadcasting");
      rfAdd(this.world, this.frequency, this);
      this.setFlag(Flag.Reserved3, true);
      this.nextStopTime = this.now + 1;
    } else this.invoke("StopBroadcasting", () => this.stopBroadcasting(), Math.min(1, Math.max(0, this.nextStopTime - this.now)));
    super.ioStateChanged(inputAmount, inputSlot);
  }
  stopBroadcasting(): void {
    this.setFlag(Flag.Reserved3, false);
    rfRemove(this.world, this.frequency, this);
  }
  override shutdown(): void {
    rfRemove(this.world, this.frequency, this);
    super.shutdown();
  }
  override readouts(): Readout[] {
    return [{ k: "broadcasting", v: this.hasFlag(Flag.Reserved3) }];
  }
  override actions(): Action[] {
    return [{ k: "frequency", kind: "number", value: this.frequency, min: 1, max: 9999, step: 1 }];
  }
  override act(key: string, value?: number): void {
    if (key === "frequency" && value !== undefined) {
      const on = this.hasFlag(Flag.Reserved3);
      if (on) rfRemove(this.world, this.frequency, this);
      this.frequency = Math.round(value);
      this.cfg.frequency = this.frequency;
      if (on) rfAdd(this.world, this.frequency, this);
    }
  }
}

/** Receptor de RF: deja pasar lo que entra (menos 1) mientras haya un emisor prendido en su frecuencia. */
export class RFReceiver extends IOEntity {
  frequency = this.cfg.frequency ?? 0;
  override wantsPower(): boolean {
    return this.isOn();
  }
  override resetIOState(): void {
    this.setFlag(Flag.On, false);
  }
  override getPassthroughAmount(): number {
    return this.isOn() ? this.getCurrentEnergy() : 0;
  }
  override init(): void {
    super.init();
    this.rfSignalUpdate((this.world.rf.get(this.frequency)?.size ?? 0) > 0);
  }
  rfSignalUpdate(on: boolean): void {
    if (!this.destroyed && this.isOn() !== on) {
      this.setFlag(Flag.On, on);
      this.markDirty();
    }
  }
  override readouts(): Readout[] {
    return [{ k: "receiving", v: this.isOn() }];
  }
  override actions(): Action[] {
    return [{ k: "frequency", kind: "number", value: this.frequency, min: 1, max: 9999, step: 1 }];
  }
  override act(key: string, value?: number): void {
    if (key === "frequency" && value !== undefined) {
      this.frequency = Math.round(value);
      this.cfg.frequency = this.frequency;
      this.rfSignalUpdate((this.world.rf.get(this.frequency)?.size ?? 0) > 0);
    }
  }
}

function rfAdd(world: IOEntity["world"], freq: number, b: IOEntity): void {
  let set = world.rf.get(freq);
  if (!set) world.rf.set(freq, (set = new Set()));
  const had = set.size > 0;
  set.add(b);
  if (!had) rfNotify(world, freq);
}

function rfRemove(world: IOEntity["world"], freq: number, b: IOEntity): void {
  const set = world.rf.get(freq);
  if (!set?.delete(b)) return;
  if (set.size === 0) rfNotify(world, freq);
}

function rfNotify(world: IOEntity["world"], freq: number): void {
  const on = (world.rf.get(freq)?.size ?? 0) > 0;
  for (const e of world.entities.values()) if (e instanceof RFReceiver && e.frequency === freq) e.rfSignalUpdate(on);
}
