/**
 * Baterías (2026-10-09). Fuente: `ElectricBattery.cs` (RustChangelog, 2024-08-03).
 *
 * - Empuja siempre su `maxOutput` (15/50/100) mientras descarga y tenga ≥ 1 rWs: el reparto lo hacen los de abajo.
 * - Lo que se descuenta de la carga (`activeDrain`) es la suma de lo que piden (`DesiredPower`) todos los que cuelgan de
 *   su salida, con tope en `maxOutput`; se recalcula cada 1 s (`CheckDischarge`) y se cobra cada 1 s (`TickUsage`).
 * - Carga cada 1 s con `min(lo que entra, DesiredPower) × chargeRatio` (0,8): un panel de 20 carga 16 rWs por segundo.
 * - Descarga sólo con ≥ 5 rWs y con algo enchufado a la salida.
 * - La salida "Fully Charged" (Polish and Progress, 5/12/2024) sale del código del servidor dedicado (build 25823813,
 *   9/10/2026), no del decompilado: `Flag_Full` se prende cuando la carga redondeada en rWm llega al máximo y se apaga
 *   cuando baja de ahí sólo si lo que gasta supera lo último que cargó (o si no está cargando): con un cargador que
 *   cubre el gasto sigue "llena". Por esa salida da 1; lo que cuelga de ella suma como mucho 1 al gasto, y con algo
 *   enchufado sólo ahí la batería también descarga (`GetDrain`, `CheckDischarge`, `RefreshFullChargeFlag`).
 */
import { Flag, IOEntity, type Action, type Readout } from "../ioentity";

export class ElectricBattery extends IOEntity {
  rustWattSeconds = this.cfg.charge !== undefined ? this.cfg.charge * 60 : this.def.p.rustWattSeconds;
  activeDrain = 0;
  private inputHistory: number[] = [];
  /** `Flag_Full`: lo que da la salida "Fully Charged". */
  private fullFlag = false;
  /** `lastChargeIn`: lo que cargó en el último `AddCharge` (0 si no le entra nada). */
  lastChargeIn = 0;

  get maxOutput(): number {
    return this.def.p.maxOutput;
  }
  get maxCapactiySeconds(): number {
    return this.def.p.maxCapactiySeconds;
  }
  get chargeRatio(): number {
    return this.def.p.chargeRatio;
  }

  override isRootEntity(): boolean {
    return true;
  }
  override consumptionAmount(): number {
    return 0;
  }
  override maximalPowerOutput(): number {
    return this.maxOutput;
  }
  override getCurrentEnergy(): number {
    return this.currentEnergy;
  }
  override desiredPower(): number {
    if (this.rustWattSeconds >= this.maxCapactiySeconds) return 0;
    if (!this.isFlickering()) return Math.min(this.currentEnergy, Math.floor(this.maxOutput * this.def.p.maximumInboundEnergyRatio));
    return this.highestInputFromHistory();
  }
  override serverInit(): void {
    // `InvokeRandomized(CheckDischarge, Random.Range(0, 1), 1, 0.1)`: acá sin azar.
    this.invokeRepeating("CheckDischarge", () => this.checkDischarge(), 0.5, 1);
    this.refreshFull();
  }

  addConnectedRecursive(root: IOEntity, inputIndex: number, list: Map<IOEntity, Set<number>>): void {
    let slots = list.get(root);
    if (!slots) list.set(root, (slots = new Set()));
    slots.add(inputIndex);
    if (!root.wantsPassthroughPower()) return;
    for (let i = 0; i < root.outputs.length; i++) {
      if (!root.allowDrainFrom(i)) continue;
      const s = root.outputs[i];
      if (s.type !== 0) continue;
      const e = s.connectedTo;
      if (e && !list.get(e)?.has(s.connectedToSlot) && e.wantsPower(s.connectedToSlot)) this.addConnectedRecursive(e, s.connectedToSlot, list);
    }
  }

  getDrain(): number {
    // `HashSet<(IOEntity, int)>`: se recorre en el orden en que se agregó (un `Map` de sets da el mismo orden por entidad).
    const list = new Map<IOEntity, Set<number>>();
    const e = this.outputs[0].connectedTo;
    if (e) {
      const slot = this.outputs[0].connectedToSlot;
      if (e.wantsPower(slot)) this.addConnectedRecursive(e, slot, list);
      else list.set(e, new Set([slot]));
    }
    // "Fully Charged": lo que cuelga de esa salida, recorrido igual, suma 1 como mucho.
    let num = 0;
    const aux = this.outputs[1]?.connectedTo;
    if (this.fullFlag && aux) {
      const auxList = new Map<IOEntity, Set<number>>();
      const slot = this.outputs[1].connectedToSlot;
      if (aux.wantsPower(slot)) this.addConnectedRecursive(aux, slot, auxList);
      else auxList.set(aux, new Set([slot]));
      outer: for (const [ent, slots] of auxList) {
        for (const idx of slots) {
          if (!ent.shouldDrainBattery(this)) continue;
          num += ent.desiredPower(idx);
          if (num >= 1) {
            num = 1;
            break outer;
          }
        }
      }
    }
    for (const [ent, slots] of list) {
      for (const idx of slots) {
        if (!ent.shouldDrainBattery(this)) continue;
        num += ent.desiredPower(idx);
        if (num >= this.maxOutput) return this.maxOutput;
      }
    }
    return num;
  }

  override onCircuitChanged(forceUpdate: boolean): void {
    super.onCircuitChanged(forceUpdate);
    this.activeDrain = this.getDrain();
  }

  checkDischarge(): void {
    if (this.rustWattSeconds < 5) {
      this.setDischarging(false);
      return;
    }
    const e = this.outputs[0].connectedTo;
    const aux = this.outputs[1]?.connectedTo ?? null;
    this.activeDrain = this.getDrain();
    this.setDischarging(e !== null || aux !== null);
  }

  setDischarging(wantsOn: boolean): void {
    this.setPassthroughOn(wantsOn);
  }

  override getPassthroughAmount(outputSlot = 0): number {
    if (outputSlot === 1) return this.fullFlag ? 1 : 0;
    if (outputSlot !== 0 || !this.isOn()) return 0;
    return Math.floor(this.maxOutput * (this.rustWattSeconds >= 1 ? 1 : 0));
  }

  override wantsPower(): boolean {
    return this.rustWattSeconds < this.maxCapactiySeconds;
  }

  private highestInputFromHistory(): number {
    return this.inputHistory.reduce((m, v) => (v > m ? v : m), 0);
  }

  override ioStateChanged(inputAmount: number, inputSlot: number): void {
    super.ioStateChanged(inputAmount, inputSlot);
    if (this.isFlickering()) {
      if (this.inputHistory.length >= 5) this.inputHistory.shift();
      this.inputHistory.push(inputAmount);
    }
    if (inputSlot === 0) {
      if (!this.isPowered() && !this.isFlickering()) {
        this.cancelInvoke("AddCharge");
        this.lastChargeIn = 0;
      }
      else if (!this.isInvoking("AddCharge")) this.invokeRepeating("AddCharge", () => this.addCharge(), 1, 1);
    }
  }

  tickUsage(): void {
    const had = this.rustWattSeconds > 0;
    if (this.rustWattSeconds >= 1) this.rustWattSeconds -= this.activeDrain;
    if (this.rustWattSeconds <= 0) this.rustWattSeconds = 0;
    this.chargeChanged();
    if (had !== this.rustWattSeconds > 0) this.markDirty();
  }

  chargeChanged(): void {
    this.setFlag(Flag.Reserved5, this.rustWattSeconds > this.maxCapactiySeconds * 0.25);
    this.setFlag(Flag.Reserved6, this.rustWattSeconds > this.maxCapactiySeconds * 0.75);
    this.refreshFull();
  }

  /** `RefreshFullChargeFlag`. */
  refreshFull(): void {
    const full = Math.round(this.rustWattSeconds / 60) >= this.maxCapactiySeconds / 60;
    if (full && !this.fullFlag) {
      this.fullFlag = true;
      this.markDirtyForceUpdateOutputs();
    } else if (!full && this.fullFlag && (this.activeDrain > this.lastChargeIn || this.lastChargeIn === 0)) {
      this.fullFlag = false;
      this.markDirtyForceUpdateOutputs();
    }
  }

  /** Lo que muestra la salida "Fully Charged" (`Flag_Full`). */
  isFull(): boolean {
    return this.fullFlag;
  }

  addCharge(): void {
    const num = Math.min(this.isFlickering() ? this.highestInputFromHistory() : this.currentEnergy, this.desiredPower()) * this.chargeRatio;
    this.lastChargeIn = num;
    if (num > 0) {
      this.rustWattSeconds = Math.min(Math.max(this.rustWattSeconds + num, 0), this.maxCapactiySeconds);
      this.chargeChanged();
    }
  }

  setPassthroughOn(wantsOn: boolean): void {
    if (wantsOn === this.isOn()) return;
    this.setFlag(Flag.On, wantsOn);
    if (this.isOn()) {
      if (!this.isInvoking("TickUsage")) this.invokeRepeating("TickUsage", () => this.tickUsage(), 1, 1);
    } else this.cancelInvoke("TickUsage");
    this.markDirty();
  }

  /** rWm, como lo muestra el juego. */
  get chargeMinutes(): number {
    return this.rustWattSeconds / 60;
  }

  override readouts(): Readout[] {
    const out: Readout[] = [
      { k: "charge", v: Math.floor(this.chargeMinutes), of: Math.round(this.maxCapactiySeconds / 60) },
      { k: "input", v: this.currentEnergy },
      { k: "drain", v: this.isOn() ? this.activeDrain : 0, of: this.maxOutput },
    ];
    if (this.isOn() && this.activeDrain > 0) out.push({ k: "lasts", v: Math.floor(this.rustWattSeconds / this.activeDrain) });
    return out;
  }
  override actions(): Action[] {
    const max = Math.round(this.maxCapactiySeconds / 60);
    return [{ k: "charge", kind: "number", value: Math.floor(this.chargeMinutes), min: 0, max, step: Math.max(1, Math.round(max / 100)) }];
  }
  override act(key: string, value?: number): void {
    if (key === "charge" && value !== undefined) {
      this.rustWattSeconds = Math.min(Math.max(value, 0), this.maxCapactiySeconds / 60) * 60;
      this.cfg.charge = value;
      this.chargeChanged();
      this.markDirty();
    }
  }
}
