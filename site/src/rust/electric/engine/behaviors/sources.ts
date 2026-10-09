/**
 * Las fuentes (2026-10-09): panel solar, molino, rueda de agua, generador a combustible y generador de prueba.
 * Fuentes: `SolarPanel.cs`, `ElectricWindmill.cs`, `FuelGenerator.cs`, `ElectricGenerator.cs` (RustChangelog, 2024-08-03).
 * La rueda de agua (`ElectricWaterWheel`) es posterior al decompilado: se modela como fuente fija con
 * `maxPowerGenerationFromWater` (duda anotada en el plan).
 */
import { Flag, IOEntity, type Action, type Readout } from "../ioentity";

const inverseLerp = (a: number, b: number, v: number): number => (a === b ? 0 : Math.min(1, Math.max(0, (v - a) / (b - a))));
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Acá: el sol del juego (`TOD_Sky`) se reemplaza por la hora: de 6 a 18 es de día y la altura del sol es
 * `sin(π·(h − 6)/12)`, que se usa como el `dot` entre el frente del panel (bien orientado) y el sol. Aproximado.
 */
export function sunDot(hour: number): number | null {
  const h = ((hour % 24) + 24) % 24;
  if (h < 6 || h >= 18) return null;
  return Math.sin((Math.PI * (h - 6)) / 12);
}

export class SolarPanel extends IOEntity {
  override isRootEntity(): boolean {
    return true;
  }
  override maximalPowerOutput(): number {
    return this.def.p.maximalPowerOutput;
  }
  override serverInit(): void {
    this.invokeRepeating("SunUpdate", () => this.sunUpdate(), 1, 5);
  }
  sunUpdate(): void {
    let num = this.currentEnergy;
    const dot = sunDot(this.world.env.hour);
    if (dot === null) num = 0;
    else {
      const f = inverseLerp(this.def.p.dot_minimum, this.def.p.dot_maximum, dot);
      num = Math.floor(this.def.p.maximalPowerOutput * f * this.healthFraction);
    }
    const changed = this.currentEnergy !== num;
    this.currentEnergy = num;
    if (changed) this.markDirty();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    return outputSlot !== 0 ? 0 : this.currentEnergy;
  }
  override readouts(): Readout[] {
    return [{ k: "generating", v: this.currentEnergy, of: this.def.p.maximalPowerOutput }];
  }
}

export class ElectricWindmill extends IOEntity {
  override isRootEntity(): boolean {
    return true;
  }
  override maximalPowerOutput(): number {
    return this.def.p.maxPowerGeneration;
  }
  /** `GetWindSpeedScale`: la altura sobre el terreno (hasta 50 m da medio viento) más el ruido Perlin (acá, "ráfaga"). */
  windScale(): number {
    const { height, gust } = this.world.env;
    return clamp01(inverseLerp(0, 50, Math.max(0, height)) * 0.5 + gust);
  }
  override serverInit(): void {
    this.invokeRepeating("WindUpdate", () => this.windUpdate(), 1, 20);
  }
  windUpdate(): void {
    const num = Math.floor(this.def.p.maxPowerGeneration * this.windScale());
    const changed = this.currentEnergy !== num;
    this.currentEnergy = num;
    if (changed) this.markDirty();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    return outputSlot !== 0 ? 0 : this.currentEnergy;
  }
  override readouts(): Readout[] {
    return [{ k: "generating", v: this.currentEnergy, of: this.def.p.maxPowerGeneration }];
  }
}

/** Sin código en el decompilado: fuente fija mientras está en el agua. */
export class ElectricWaterWheel extends IOEntity {
  override isRootEntity(): boolean {
    return true;
  }
  override maximalPowerOutput(): number {
    return this.def.p.maxPowerGenerationFromWater;
  }
  override serverInit(): void {
    this.currentEnergy = this.def.p.maxPowerGenerationFromWater;
  }
  override getPassthroughAmount(outputSlot = 0): number {
    return outputSlot !== 0 ? 0 : this.currentEnergy;
  }
  override readouts(): Readout[] {
    return [{ k: "generating", v: this.currentEnergy, of: this.def.p.maxPowerGenerationFromWater }];
  }
}

/** `FuelGenerator`: 40 mientras esté prendido y tenga combustible (`fuelPerSec` por segundo, cobrado cada 3 s). */
export class FuelGenerator extends IOEntity {
  private pendingFuel = 0;
  private readonly fuelTickRate = 3;
  /** Combustible de baja calidad en la ranura. */
  fuel = this.cfg.fuel ?? 500;

  override isRootEntity(): boolean {
    return true;
  }
  override maximalPowerOutput(): number {
    return this.def.p.outputEnergy;
  }
  override init(): void {
    if (this.cfg.on) {
      // Acá: un generador guardado prendido arranca prendido (en el juego, `Init` con la bandera `On` ya puesta).
      this.setFlag(Flag.On, this.useFuel(1));
    }
    if (this.isOn()) {
      this.updateCurrentEnergy();
      this.invokeRepeating("FuelConsumption", () => this.fuelConsumption(), this.fuelTickRate, this.fuelTickRate);
    }
    super.init();
  }
  override updateFromInput(inputAmount: number, inputSlot: number): void {
    if (inputSlot === 0 && inputAmount > 0) this.turnOn();
    if (inputSlot === 1 && inputAmount > 0) this.turnOff();
    super.updateFromInput(inputAmount, inputSlot);
  }
  override calculateCurrentEnergy(): number {
    return this.isOn() ? this.def.p.outputEnergy : 0;
  }
  updateCurrentEnergy(): void {
    this.currentEnergy = this.calculateCurrentEnergy();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    return outputSlot !== 0 ? 0 : this.currentEnergy;
  }
  override allowDrainFrom(): boolean {
    return false;
  }
  useFuel(seconds: number): boolean {
    if (this.fuel < 1) return false;
    this.pendingFuel += seconds * this.def.p.fuelPerSec;
    if (this.pendingFuel >= 1) {
      const n = Math.floor(this.pendingFuel);
      this.fuel = Math.max(0, this.fuel - n);
      this.pendingFuel -= n;
    }
    return true;
  }
  turnOn(): void {
    if (!this.isOn() && this.useFuel(1)) {
      this.setFlag(Flag.On, true);
      this.updateCurrentEnergy();
      this.markDirty();
      this.invokeRepeating("FuelConsumption", () => this.fuelConsumption(), this.fuelTickRate, this.fuelTickRate);
    }
  }
  fuelConsumption(): void {
    if (!this.useFuel(this.fuelTickRate)) this.turnOff();
  }
  turnOff(): void {
    if (this.isOn()) {
      this.setFlag(Flag.On, false);
      this.updateCurrentEnergy();
      this.markDirty();
      this.cancelInvoke("FuelConsumption");
    }
  }
  override readouts(): Readout[] {
    const perHour = this.def.p.fuelPerSec * 3600;
    return [
      { k: "generating", v: this.currentEnergy, of: this.def.p.outputEnergy },
      { k: "fuel", v: this.fuel },
      { k: "fuelPerHour", v: Math.round(perHour) },
    ];
  }
  override actions(): Action[] {
    return [
      { k: "power", kind: "toggle", value: this.isOn() ? 1 : 0 },
      { k: "fuel", kind: "number", value: this.fuel, min: 0, max: 5000, step: 50 },
    ];
  }
  override act(key: string, value?: number): void {
    if (key === "power") {
      if (this.isOn()) this.turnOff();
      else this.turnOn();
      this.cfg.on = this.isOn() ? 1 : 0;
    }
    if (key === "fuel" && value !== undefined) {
      this.fuel = value;
      this.cfg.fuel = value;
    }
  }
}

/** `ElectricGenerator` (el generador de prueba): empuja `electricAmount` por todas sus salidas, sin esperar `responsetime`. */
export class ElectricGenerator extends IOEntity {
  override isRootEntity(): boolean {
    return true;
  }
  override maximalPowerOutput(): number {
    return Math.floor(this.def.p.electricAmount);
  }
  override getCurrentEnergy(): number {
    return Math.trunc(this.def.p.electricAmount);
  }
  override getPassthroughAmount(): number {
    return this.getCurrentEnergy();
  }
  override updateOutputs(): void {
    this.currentEnergy = this.getCurrentEnergy();
    for (let i = 0; i < this.outputs.length; i++) this.send(i, this.currentEnergy);
  }
  override readouts(): Readout[] {
    return [{ k: "generating", v: this.getCurrentEnergy() }];
  }
}
