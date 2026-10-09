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

/**
 * Poste de tendido eléctrico (Power Trip, 6/8/2026). Fuente: el servidor dedicado (build 25823813, 9/10/2026),
 * `PowergridIOAccessPoint` y `PowergridManager.Server_GetCurrentPowerlineEnergy`: con F fusibles pesados puestos en la
 * central y R ranuras (15 + 5 = 20), da `(int) Lerp(base, max, Clamp01((F − 1) / (R − 1)))`, 0 sin fusibles; convars
 * `powergrid.powerlinebasepoweroutput` 5 y `powergrid.powerlinemaxpoweroutput` 50. No consume, y no pisa
 * `GetPassthroughAmount`: lo que da se reparte entre las salidas conectadas como cualquier `IOEntity`.
 */
export const POLE = { slots: 20, base: 5, max: 50 };
export function powerlineEnergy(fuses: number, slots = POLE.slots): number {
  if (fuses <= 0) return 0;
  const t = slots <= 1 ? 0 : Math.min(1, Math.max(0, (fuses - 1) / (slots - 1)));
  return Math.trunc(POLE.base + (POLE.max - POLE.base) * t);
}
export class PowerlinePole extends IOEntity {
  override isRootEntity(): boolean {
    return true;
  }
  /** Los fusibles pesados puestos en la central (lo que se elige en el inspector); por defecto, la red llena. */
  fuses(): number {
    return Math.max(0, Math.min(POLE.slots, Math.round(this.cfg.fuses ?? POLE.slots)));
  }
  override consumptionAmount(): number {
    return 0;
  }
  override getCurrentEnergy(): number {
    return powerlineEnergy(this.fuses());
  }
  override maximalPowerOutput(): number {
    return 9999;
  }
  override updateOutputs(): void {
    this.currentEnergy = this.getCurrentEnergy();
    for (let i = 0; i < this.outputs.length; i++) this.send(i, this.getPassthroughAmount(i));
  }
  override onCircuitChanged(forceUpdate: boolean): void {
    super.onCircuitChanged(forceUpdate);
    // Una conexión nueva o quitada cambia el reparto entre salidas.
    this.markDirtyForceUpdateOutputs();
  }
  override readouts(): Readout[] {
    return [{ k: "generating", v: this.getCurrentEnergy() }, { k: "outputsUsed", v: this.cachedOutputsUsed }];
  }
  override actions(): Action[] {
    return [{ k: "fuses", kind: "number", value: this.fuses(), min: 0, max: POLE.slots, step: 1 }];
  }
  override act(key: string, value?: number): void {
    if (key === "fuses" && value !== undefined) {
      this.cfg.fuses = Math.max(0, Math.min(POLE.slots, Math.round(value)));
      this.markDirtyForceUpdateOutputs();
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
