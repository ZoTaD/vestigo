/**
 * Sensores (2026-10-09): HBHF, láser, placa de presión, sensor sísmico y monitor de almacenamiento.
 * Fuentes: `BaseDetector.cs`, `HBHFSensor.cs`, `LaserDetector.cs`, `PressurePad.cs`, `SeismicSensor.cs`,
 * `StorageMonitor.cs` (RustChangelog, 2024-08-03). No hay mundo: lo que detectan lo pone el usuario en el inspector.
 */
import { Flag, IOEntity, type Action, type Readout } from "../ioentity";

/** `BaseDetector`: con algo adentro (`Flag_HasContents`) deja pasar lo que entra, menos su consumo. */
export class BaseDetector extends IOEntity {
  shouldTrigger(): boolean {
    return this.isPowered();
  }
  onObjects(): void {
    this.setFlag(Flag.Reserved1, true);
    if (this.shouldTrigger()) {
      this.onDetectorTriggered();
      this.markDirty();
    }
  }
  onEmpty(): void {
    this.setFlag(Flag.Reserved1, false);
    if (this.shouldTrigger()) {
      this.onDetectorReleased();
      this.markDirty();
    }
  }
  onDetectorTriggered(): void {}
  onDetectorReleased(): void {}
  override getPassthroughAmount(): number {
    if (!this.hasFlag(Flag.Reserved1)) return 0;
    return super.getPassthroughAmount();
  }
  /** Acá: el usuario dice si hay algo en el sensor. */
  setDetecting(on: boolean): void {
    this.cfg.detect = on ? 1 : 0;
    if (on) this.onObjects();
    else this.onEmpty();
  }
  override init(): void {
    super.init();
    if (this.cfg.detect) this.invoke("Detect", () => this.setDetecting(true), 1.5);
  }
  override readouts(): Readout[] {
    return [{ k: "detecting", v: this.hasFlag(Flag.Reserved1) }];
  }
  override actions(): Action[] {
    return [{ k: "detect", kind: "toggle", value: this.hasFlag(Flag.Reserved1) ? 1 : 0 }];
  }
  override act(key: string): void {
    if (key === "detect") this.setDetecting(!this.hasFlag(Flag.Reserved1));
  }
}

/** HBHF: deja pasar tantos de energía como jugadores ve (sin pasarse de lo que le entra menos 1). */
export class HBHFSensor extends BaseDetector {
  private detectedPlayers = 0;
  override getPassthroughAmount(): number {
    return Math.min(this.detectedPlayers, this.getCurrentEnergy());
  }
  override onObjects(): void {
    super.onObjects();
    this.updatePassthroughAmount();
    this.invokeRepeating("UpdatePassthroughAmount", () => this.updatePassthroughAmount(), 0, 1);
  }
  override onEmpty(): void {
    super.onEmpty();
    this.updatePassthroughAmount();
    this.cancelInvoke("UpdatePassthroughAmount");
  }
  updatePassthroughAmount(): void {
    const was = this.detectedPlayers;
    this.detectedPlayers = this.hasFlag(Flag.Reserved1) ? (this.cfg.players ?? 0) : 0;
    if (was !== this.detectedPlayers && this.isPowered()) this.markDirty();
  }
  override init(): void {
    IOEntity.prototype.init.call(this);
    if (this.cfg.players) this.invoke("Detect", () => this.setPlayers(this.cfg.players ?? 0), 1.5);
  }
  setPlayers(n: number): void {
    this.cfg.players = Math.max(0, Math.round(n));
    if (this.cfg.players > 0 && !this.hasFlag(Flag.Reserved1)) this.onObjects();
    else if (this.cfg.players === 0 && this.hasFlag(Flag.Reserved1)) this.onEmpty();
    else this.updatePassthroughAmount();
  }
  override readouts(): Readout[] {
    return [{ k: "players", v: this.detectedPlayers }];
  }
  override actions(): Action[] {
    return [{ k: "players", kind: "number", value: this.cfg.players ?? 0, min: 0, max: 20, step: 1 }];
  }
  override act(key: string, value?: number): void {
    if (key === "players" && value !== undefined) this.setPlayers(value);
  }
}

/** Láser: igual al detector base (algo corta el rayo). */
export class LaserDetector extends BaseDetector {}

/**
 * Placa de presión: al pisarla da un pulso de `pressPowerTime` (0,5 s) con al menos `pressPowerAmount` (1) aunque no
 * tenga energía; con "Power In" alimentado deja pasar lo que entra mientras esté pisada.
 */
export class PressurePad extends BaseDetector {
  override isRootEntity(): boolean {
    return true;
  }
  override shouldTrigger(): boolean {
    return true;
  }
  override onDetectorTriggered(): void {
    this.invoke("UnpowerTime", () => this.unpowerTime(), this.def.p.pressPowerTime);
    this.setFlag(Flag.Reserved3, true);
  }
  override onDetectorReleased(): void {
    this.setFlag(Flag.Reserved3, false);
  }
  unpowerTime(): void {
    this.setFlag(Flag.Reserved3, false);
    this.markDirty();
  }
  override getPassthroughAmount(): number {
    if (this.hasFlag(Flag.Reserved1)) {
      const p = IOEntity.prototype.getPassthroughAmount.call(this, 0);
      if (this.hasFlag(Flag.Reserved3)) return Math.max(this.def.p.pressPowerAmount, p);
      if (this.isPowered()) return p;
    }
    return 0;
  }
}

/** Sensor sísmico: da el nivel de vibración (si tiene energía) y lo sostiene 3 s después de la última. */
export class SeismicSensor extends IOEntity {
  range = this.cfg.range ?? this.def.p.range;
  private vibrationLevel = 0;
  setVibrationLevel(value: number): void {
    if (value <= 0) {
      this.setOff();
      return;
    }
    if (value > this.vibrationLevel) {
      this.vibrationLevel = Math.round(value);
      this.setFlag(Flag.On, true);
      this.markDirty();
    }
    this.cancelInvoke("SetOff");
    this.invoke("SetOff", () => this.setOff(), 3);
  }
  private setOff(): void {
    if (this.vibrationLevel !== 0) {
      this.vibrationLevel = 0;
      this.setFlag(Flag.On, false);
      this.markDirty();
    }
  }
  override updateHasPower(inputAmount: number, inputSlot: number): void {
    super.updateHasPower(inputAmount, inputSlot);
    if (inputAmount === 0) this.resetIOState();
  }
  override getPassthroughAmount(): number {
    return this.isPowered() ? this.vibrationLevel : 0;
  }
  override resetIOState(): void {
    this.vibrationLevel = 0;
    this.setFlag(Flag.On, false);
  }
  override readouts(): Readout[] {
    return [{ k: "vibration", v: this.vibrationLevel }];
  }
  override actions(): Action[] {
    return [
      { k: "vibrate", kind: "number", value: this.cfg.vibration ?? 1, min: 1, max: 100, step: 1 },
      { k: "shake", kind: "press" },
    ];
  }
  override act(key: string, value?: number): void {
    if (key === "vibrate" && value !== undefined) this.cfg.vibration = Math.max(1, Math.round(value));
    if (key === "shake") this.setVibrationLevel(this.cfg.vibration ?? 1);
  }
}

/** Monitor de almacenamiento: al cambiar el contenido de la caja deja pasar lo que entra durante 0,5 s. */
export class StorageMonitor extends IOEntity {
  override getPassthroughAmount(): number {
    return this.isOn() ? this.getCurrentEnergy() : 0;
  }
  onContainerChanged(): void {
    if (this.hasFlag(Flag.Reserved8)) {
      this.invoke("ResetSwitch", () => this.resetSwitch(), 0.5);
      if (!this.isOn()) {
        this.setFlag(Flag.On, true);
        this.markDirty();
      }
    }
  }
  private resetSwitch(): void {
    this.setFlag(Flag.On, false);
    this.markDirty();
  }
  override readouts(): Readout[] {
    return [{ k: "pulse", v: this.isOn() }];
  }
  override actions(): Action[] {
    return [{ k: "itemChange", kind: "press" }];
  }
  override act(key: string): void {
    if (key === "itemChange") this.onContainerChanged();
  }
}
