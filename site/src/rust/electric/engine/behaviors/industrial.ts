/**
 * La red industrial (2026-10-09): inventarios de objetos, la búsqueda de entradas y salidas de una cinta
 * (`IOEntity.FindContainerSource`), la cinta con sus filtros (`IndustrialConveyor`), las cajas y hornos con el adaptador
 * puesto (`IndustrialStorageAdaptor` + `BoxStorage`/`BaseOven`) y el crafteador (`IndustrialCrafter`). Fuente: decompilado
 * RustChangelog (2024-08-03): `IOEntity.cs`, `IndustrialConveyor.cs`, `IndustrialStorageAdaptor.cs`, `BaseOven.cs`,
 * `ItemModCookable.cs`, `IndustrialCrafter.cs`, `ItemContainer.cs` (`QuickIndustrialPreCheck`, `GetTotalItemAmount`) y
 * `ConVar/Server.cs` (`conveyorMoveFrequency` 5 s, `industrialCrafterFrequency` 5 s,
 * `maxItemStacksMovedPerTickIndustrial` 12, `industrialAllowQuickMove`). Plan:
 * docs/superpowers/plans/2026-10-09-rust-agua-industrial.md.
 */
import { Flag, IOEntity, type Action, type Readout } from "../ioentity";
import type { IndItem } from "../types";

/** `ConVar.Server`, valores por defecto. */
export const CONVEYOR_MOVE_FREQUENCY = 5;
export const INDUSTRIAL_CRAFTER_FREQUENCY = 5;
const MAX_ITEM_STACKS_MOVED_PER_TICK = 12;
const INDUSTRIAL_ALLOW_QUICK_MOVE = true;
/** `IndustrialConveyor.MaxContainerDepth`. */
const MAX_CONTAINER_DEPTH = 32;

/** Un objeto en una ranura (`Item`): shortname, cantidad, ranura; si es un plano; lo que le falta para cocinarse y el combustible que le queda. */
export interface Stack {
  id: string;
  amount: number;
  slot: number;
  bp?: boolean;
  cookTimeLeft?: number;
  fuel?: number;
  cooking?: boolean;
}

type Items = Record<string, IndItem>;

/** `ItemContainer`: ranuras con un objeto cada una, pila máxima por objeto, y el filtro de ranuras del dueño. */
export class Container {
  items: Stack[] = [];
  constructor(
    readonly capacity: number,
    private readonly db: () => Items,
    /** `ItemFilter` del dueño (el horno sólo acepta cada cosa en sus ranuras). */
    readonly filter: (s: Stack, slot: number) => boolean = () => true,
    /** `OnItemAddedOrRemoved`: una pila nueva en una ranura vacía, o una que se acabó. */
    readonly onChange: (s: Stack, added: boolean) => void = () => {},
  ) {}

  get(slot: number): Stack | undefined {
    return this.items.find((s) => s.slot === slot);
  }
  isEmpty(): boolean {
    return this.items.length === 0;
  }
  stackable(s: { id: string; bp?: boolean }): number {
    return s.bp ? 1 : (this.db()[s.id]?.stack ?? 1);
  }
  category(id: string): string | undefined {
    return this.db()[id]?.cat;
  }
  /** `GetTotalItemAmount`: el mismo objeto (o el mismo plano) entre dos ranuras. */
  totalAmount(item: Stack, from: number, to: number): number {
    let n = 0;
    for (const s of this.items) if (s.slot >= from && s.slot <= to && s.id === item.id && !!s.bp === !!item.bp) n += s.amount;
    return n;
  }
  totalCategory(cat: string, from: number, to: number): number {
    let n = 0;
    for (const s of this.items) if (s.slot >= from && s.slot <= to && !s.bp && this.category(s.id) === cat) n += s.amount;
    return n;
  }
  /** `QuickIndustrialPreCheck`: una pila igual con lugar en el rango (y su ranura), o alguna ranura libre en el rango. */
  quickPreCheck(item: Stack, range: [number, number]): { ok: boolean; slot: number } {
    const size = range[1] - range[0] + 1;
    let used = 0;
    for (const s of this.items) {
      if (s.slot < range[0] || s.slot > range[1]) continue;
      used++;
      if (s.amount >= this.stackable(s)) continue;
      if (s.id !== item.id || !!s.bp !== !!item.bp) continue;
      return { ok: true, slot: s.slot };
    }
    return { ok: used < size, slot: -1 };
  }
  /** Saca una pila de su ranura. */
  remove(s: Stack): void {
    const i = this.items.indexOf(s);
    if (i >= 0) {
      this.items.splice(i, 1);
      this.onChange(s, false);
    }
  }
  /** `Item.UseItem`: resta y, si se acaba, la saca. */
  use(s: Stack, n: number): void {
    s.amount -= n;
    if (s.amount <= 0) this.remove(s);
  }
  /**
   * `Item.MoveToContainer(container, slot, allowStack)`: a esa ranura si está vacía (y el filtro deja) o encima de una
   * pila igual. Devuelve cuánto entró; `s` queda con lo que no entró. Acá: si entra sólo una parte, el resto se queda en
   * el origen (en el juego también, salvo casos de pila partida que no cambian la cuenta).
   */
  moveInto(s: Stack, slot: number): number {
    if (slot < 0 || slot >= this.capacity) return 0;
    const there = this.get(slot);
    if (!there) {
      if (!this.filter(s, slot)) return 0;
      const n = Math.min(s.amount, this.stackable(s));
      const placed: Stack = { ...s, amount: n, slot, cooking: false };
      this.items.push(placed);
      s.amount -= n;
      this.onChange(placed, true);
      return n;
    }
    if (there.id !== s.id || !!there.bp !== !!s.bp) return 0;
    const n = Math.min(s.amount, this.stackable(there) - there.amount);
    if (n <= 0) return 0;
    there.amount += n;
    s.amount -= n;
    return n;
  }
  /** `Item.MoveToContainer(container)` sin ranura: primero encima de las pilas iguales, después la primera ranura libre que el filtro deje. */
  insert(s: Stack): boolean {
    for (const there of [...this.items].sort((a, b) => a.slot - b.slot)) {
      if (s.amount <= 0) break;
      if (there.id === s.id && !!there.bp === !!s.bp && this.filter(s, there.slot)) this.moveInto(s, there.slot);
    }
    for (let slot = 0; slot < this.capacity && s.amount > 0; slot++) if (!this.get(slot)) this.moveInto(s, slot);
    return s.amount <= 0;
  }
}

/** `IIndustrialStorage`. */
export interface IndustrialStorage {
  readonly container: Container;
  inputRange(slotIndex: number): [number, number];
  outputRange(slotIndex: number): [number, number];
  readonly entity: IOEntity;
}
export const isStorage = (e: IOEntity): e is IOEntity & IndustrialStorage => "container" in e && "inputRange" in e;

/** `ContainerInputOutput`. */
export interface ContainerIO {
  slotIndex: number;
  storage: IndustrialStorage;
  parent: number;
  maxStackSize: number;
  siblings: number;
}

/** `IOEntity.FindContainerSource`: las cajas a las que llega (o de las que sale) la red industrial desde `e`. */
export function findContainerSource(e: IOEntity, found: ContainerIO[], depth: number, input: boolean, ignore: IOEntity[], parentId = -1, stackSize = 0): void {
  if (depth <= 0 || found.length >= 32) return;
  let num2 = 1;
  if (!input) {
    num2 = 0;
    for (const o of e.outputs) if (o.type === 4) num2++;
  }
  const mine: number[] = [];
  for (const s of input ? e.inputs : e.outputs) {
    if (s.type !== 4) continue;
    const other = s.connectedTo;
    if (!other || ignore.includes(other)) continue;
    let index = -1;
    if (isStorage(other)) {
      if (found.filter((f) => f.storage === other).length < 2) {
        found.push({ slotIndex: s.connectedToSlot, storage: other, parent: parentId, maxStackSize: Math.trunc(stackSize / num2), siblings: 0 });
        index = found.length - 1;
        mine.push(index);
      }
    } else ignore.push(other);
    if ((!isStorage(other) || other instanceof IndustrialStorageEntity) && !(other instanceof IndustrialConveyor))
      findContainerSource(other, found, depth - 1, input, ignore, index === -1 ? parentId : index, Math.trunc(stackSize / num2));
  }
  for (const i of mine) found[i].siblings = mine.length;
}

/** Lo común de cinta y crafteador: la energía entra por la ranura 1 (`IOStateChanged`), no por la principal. */
abstract class IndustrialEntity extends IOEntity {
  get items(): Items {
    return this.world.items;
  }
  protected wasOnWhenPowerLost = false;
  override init(): void {
    // Acá: una parte guardada prendida se prende sola cuando le llega energía (como si se hubiera apagado por falta de energía).
    if (this.cfg.on) this.wasOnWhenPowerLost = true;
    super.init();
  }
  override updateHasPower(): void {}
  setSwitch(wantsOn: boolean): void {
    if (wantsOn === this.isOn()) return;
    this.setFlag(Flag.On, wantsOn);
    this.cfg.on = wantsOn ? 1 : 0;
    this.markDirty();
  }
  override shouldDrainBattery(): boolean {
    return this.isOn();
  }
}

type Filter = { item?: string; cat?: string; max: number; min: number; buffer: number; remaining: number };

/**
 * Cinta industrial: con energía y prendida, cada 5 s pasa objetos de cada entrada a cada salida de la red, de a
 * `MaxStackSizePerMove` (60) dividido por la cantidad de salidas, con filtros (objeto o categoría; modos Cualquiera, Y,
 * No; máximo en el destino, mínimo en el origen, tanda). "Filter Pass" da 1 si algo pasa el filtro y "Filter Fail" si no.
 */
export class IndustrialConveyor extends IndustrialEntity {
  private filterItems: Filter[] = [];
  private lastFilterState: boolean | null = null;
  /** Lo que movió en la última vuelta (para el inspector): shortname → cantidad. */
  lastMoved = new Map<string, number>();
  inputsFound = 0;
  outputsFound = 0;

  get mode(): number {
    return this.cfg.mode ?? 0;
  }
  override serverInit(): void {
    this.refreshFilters();
  }
  refreshFilters(): void {
    this.filterItems = (this.part?.filters ?? []).filter((f) => f.item || f.cat).slice(0, 30).map((f) => ({ item: f.item, cat: f.cat, max: f.max ?? 0, min: f.min ?? 0, buffer: f.buffer ?? 0, remaining: 0 }));
  }
  override onFlagsChanged(old: number, next: number): void {
    const was = (old & Flag.On) !== 0;
    const now = (next & Flag.On) !== 0;
    if (was === now) return;
    if (now) this.invokeRepeating("ScheduleMove", () => this.runJob(), CONVEYOR_MOVE_FREQUENCY, CONVEYOR_MOVE_FREQUENCY);
    else this.cancelInvoke("ScheduleMove");
  }
  private matches(f: Filter, s: Stack): boolean {
    if (f.item && f.item === s.id && !s.bp) return true;
    if (f.cat && !s.bp && this.world.items[s.id]?.cat === f.cat) return true;
    return false;
  }
  private filterHas(s: Stack): { f: Filter; i: number } | null {
    for (let i = 0; i < this.filterItems.length; i++) if (this.matches(this.filterItems[i], s)) return { f: this.filterItems[i], i };
    return null;
  }
  /** `GetItemToMove`: algo en las ranuras de salida del origen que el filtro deje (y que no pase el máximo del destino). */
  private itemToMove(storage: IndustrialStorage, slot: number, target?: Container): Stack | null {
    if (storage.container.isEmpty()) return null;
    const [a, b] = storage.outputRange(slot);
    for (let i = a; i <= b; i++) {
      const s = storage.container.get(i);
      if (!s) continue;
      const hit = this.filterItems.length === 0 ? null : this.filterHas(s);
      if (this.filterItems.length === 0 || hit) {
        if (!target || !hit?.f.item || hit.f.max <= 0 || target.totalAmount(s, a, b) < hit.f.max) return s;
      }
    }
    return null;
  }
  private checkInputs(inputs: ContainerIO[]): boolean {
    if (this.filterItems.length === 0) {
      for (const inp of inputs) if (this.itemToMove(inp.storage, inp.slotIndex)) return true;
      return false;
    }
    let num = 0;
    let num2 = 0;
    if (this.mode === 1) for (const f of this.filterItems) if (f.remaining > 0) num2++;
    for (const f of this.filterItems) {
      let num3 = 0;
      let num4 = 0;
      for (const inp of inputs) {
        const [a, b] = inp.storage.outputRange(inp.slotIndex);
        for (let j = a; j <= b; j++) {
          const s = inp.storage.container.get(j);
          if (!s) continue;
          let ok = this.matches(f, s);
          if (this.mode === 2) ok = !ok;
          if (!ok) continue;
          if (f.buffer > 0) {
            num3 += s.amount;
            if (f.remaining > 0) {
              num++;
              break;
            }
            if (num3 >= f.buffer + f.min) {
              if (this.mode !== 1) f.remaining = f.buffer;
              num++;
              break;
            }
          }
          if (f.min > 0) {
            num4 += s.amount;
            if (num4 > f.min + f.buffer) {
              num++;
              break;
            }
          }
          if (f.buffer === 0 && f.min === 0) {
            num++;
            break;
          }
        }
        if ((this.mode === 0 || this.mode === 2) && num > 0) return true;
        if (f.min > 0) num4 = 0;
      }
      if (f.remaining > 0 && num3 === 0) f.remaining = 0;
    }
    if (this.mode === 1 && num > 0 && (num === this.filterItems.length || num === num2)) {
      if (num2 === 0) for (const f of this.filterItems) f.remaining = f.buffer;
      return true;
    }
    return false;
  }
  private updateFilterPassthroughs(hasItems: boolean): void {
    this.lastFilterState = hasItems;
    this.setFlag(Flag.Reserved9, hasItems);
    this.setFlag(Flag.Reserved10, !hasItems);
    this.ensureOutputsUpdated = true;
    this.markDirty();
  }

  /** `RunJob`. Acá: las entradas y salidas se vuelven a buscar en cada vuelta (el juego las busca cuando cambia la red). */
  runJob(): void {
    const inputs: ContainerIO[] = [];
    const outputs: ContainerIO[] = [];
    findContainerSource(this, inputs, MAX_CONTAINER_DEPTH, true, []);
    findContainerSource(this, outputs, MAX_CONTAINER_DEPTH, false, [], -1, this.def.p.MaxStackSizePerMove ?? 128);
    this.inputsFound = inputs.length;
    this.outputsFound = outputs.length;
    this.lastMoved = new Map();
    let hasItems = this.checkInputs(inputs);
    if ((this.lastFilterState === null || hasItems !== this.lastFilterState) && !hasItems) this.updateFilterPassthroughs(hasItems);
    if (!hasItems) return;
    let maxedOut = false;
    let moved = 0;
    const count = outputs.length;
    const anyOrAnd = this.mode === 1 || this.mode === 0;
    for (const out of outputs) {
      for (const inp of inputs) {
        let stacksMoved = 0;
        if (inp.storage.entity === out.storage.entity) continue;
        const src = inp.storage.container;
        const dst = out.storage.container;
        if (src.isEmpty()) continue;
        const [a, b] = inp.storage.outputRange(inp.slotIndex);
        for (let i = a; i <= b; i++) {
          const range = out.storage.inputRange(out.slotIndex);
          const s = src.get(i);
          if (!s) continue;
          let pass = true;
          let hit: { f: Filter; i: number } | null = null;
          if (this.filterItems.length > 0) {
            if (this.mode === 0 || this.mode === 1) {
              hit = this.filterHas(s);
              pass = !!hit;
            }
            if (this.mode === 2) pass = !this.filterHas(s);
          }
          if (!pass) continue;
          const f = hit?.f;
          if (anyOrAnd && f?.item && f.max > 0 && dst.totalAmount(s, range[0], range[1]) >= f.max) {
            maxedOut = true;
            continue;
          }
          let n = Math.trunc(Math.min(this.def.p.MaxStackSizePerMove ?? 128, src.stackable(s)) / count);
          if (anyOrAnd && f && f.min > 0) {
            if (f.item && f.item === s.id) n = Math.min(n, src.totalAmount(s, a, b) - f.min);
            else if (f.cat) n = Math.min(n, src.totalCategory(f.cat, range[0], range[1]) - f.min);
            if (n === 0) continue;
          }
          if (s.amount === 1 || (n <= 0 && s.amount > 0)) n = 1;
          if (anyOrAnd && f && f.buffer > 0) n = Math.min(n, f.remaining);
          if (anyOrAnd && f && f.max > 0) {
            if (f.item && f.item === s.id) n = Math.min(n, f.max - dst.totalAmount(s, range[0], range[1]));
            else if (f.cat) n = Math.min(n, f.max - dst.totalCategory(f.cat, range[0], range[1]));
            if (n <= 0) maxedOut = true;
          }
          let take = Math.min(s.amount, n);
          if (take > 0 && take < 1) take = 1;
          n = Math.trunc(take);
          const pre = dst.quickPreCheck(s, range);
          if (n <= 0 || !pre.ok) continue;
          let ok = false;
          let movedNow = 0;
          const there = pre.slot >= 0 ? dst.get(pre.slot) : undefined;
          if (INDUSTRIAL_ALLOW_QUICK_MOVE && there && there.id === s.id && there !== s && !!there.bp === !!s.bp) {
            const k = Math.min(n, dst.stackable(there) - there.amount);
            there.amount += k;
            src.use(s, k);
            movedNow = k;
            ok = k > 0;
          }
          if (!ok) {
            // `SplitItem` si sobra; si no, la pila entera.
            const piece: Stack = { ...s, amount: Math.min(n, s.amount) };
            for (let j = range[0]; j <= range[1]; j++) {
              const t = dst.get(j);
              if (t && t.id !== s.id) continue;
              const got = dst.moveInto(piece, j);
              if (got > 0) {
                movedNow = got;
                ok = true;
                break;
              }
            }
            if (ok) src.use(s, movedNow);
          }
          if (f && f.remaining > 0) f.remaining -= movedNow;
          if (ok) {
            stacksMoved++;
            moved++;
            this.lastMoved.set(s.id, (this.lastMoved.get(s.id) ?? 0) + movedNow);
          }
          if (stacksMoved >= MAX_ITEM_STACKS_MOVED_PER_TICK) break;
        }
      }
    }
    if (moved === 0 && hasItems && maxedOut) hasItems = false;
    if (this.lastFilterState === null || hasItems !== this.lastFilterState) this.updateFilterPassthroughs(hasItems);
  }

  override ioStateChanged(inputAmount: number, inputSlot: number): void {
    super.ioStateChanged(inputAmount, inputSlot);
    if (inputSlot === 1) {
      const enough = inputAmount >= this.consumptionAmount() && inputAmount > 0;
      if (this.isPowered() && this.isOn() && !enough) this.wasOnWhenPowerLost = true;
      this.setFlag(Flag.Reserved8, enough);
      if (!enough) {
        this.setFlag(Flag.Reserved9, false);
        this.setFlag(Flag.Reserved10, false);
      }
      this.currentEnergy = inputAmount;
      this.ensureOutputsUpdated = true;
      if (inputAmount <= 0 && this.isOn()) this.setSwitch(false);
      if (inputAmount > 0 && this.wasOnWhenPowerLost && !this.isOn()) {
        this.setSwitch(true);
        this.wasOnWhenPowerLost = false;
      }
      this.markDirty();
    }
    if (inputSlot === 2 && !this.isOn() && inputAmount > 0 && this.isPowered()) this.setSwitch(true);
    if (inputSlot === 3 && this.isOn() && inputAmount > 0) this.setSwitch(false);
  }
  override setSwitch(wantsOn: boolean): void {
    if (wantsOn === this.isOn()) return;
    this.setFlag(Flag.On, wantsOn);
    this.cfg.on = wantsOn ? 1 : 0;
    this.setFlag(Flag.Reserved10, false);
    this.setFlag(Flag.Reserved9, false);
    if (!wantsOn) this.lastFilterState = null;
    this.ensureOutputsUpdated = true;
    for (const f of this.filterItems) f.remaining = 0;
    this.markDirty();
  }
  override getPassthroughAmount(outputSlot = 0): number {
    const result = Math.min(1, this.getCurrentEnergy());
    switch (outputSlot) {
      case 2:
        return this.hasFlag(Flag.Reserved10) ? result : 0;
      case 3:
        return this.hasFlag(Flag.Reserved9) ? result : 0;
      case 1:
        return this.getCurrentEnergy();
      default:
        return 0;
    }
  }
  override readouts(): Readout[] {
    return [
      { k: "needs", v: this.consumptionAmount() },
      { k: "online", v: this.isOn() },
      { k: "sources", v: this.inputsFound },
      { k: "targets", v: this.outputsFound },
      { k: "movedLast", v: [...this.lastMoved.values()].reduce((a, b) => a + b, 0) },
    ];
  }
  override actions(): Action[] {
    return [{ k: "power", kind: "toggle", value: this.isOn() ? 1 : 0 }];
  }
  override act(key: string): void {
    if (key === "power") {
      if (this.isOn()) this.setSwitch(false);
      else if (this.isPowered()) this.setSwitch(true);
      else this.cfg.on = this.cfg.on ? 0 : 1;
    }
  }
}

/**
 * Caja u horno con el adaptador de almacenamiento puesto: una sola parte en el editor. Los enchufes son los del
 * adaptador (que no consume y pasa la energía por "Passthrough"); las ranuras y sus rangos, los del contenedor.
 */
export class IndustrialStorageEntity extends IOEntity implements IndustrialStorage {
  readonly container: Container;
  constructor(...args: ConstructorParameters<typeof IOEntity>) {
    super(...args);
    this.container = new Container(this.def.p.slots ?? 1, () => this.world.items, (s, slot) => this.itemFilter(s, slot), (s, added) => this.onItemAddedOrRemoved(s, added));
  }
  get entity(): IOEntity {
    return this;
  }
  /** `ItemFilter` (las cajas aceptan todo). */
  itemFilter(_s: Stack, _slot: number): boolean {
    return true;
  }
  onItemAddedOrRemoved(_s: Stack, _added: boolean): void {}
  inputRange(): [number, number] {
    return [0, this.container.capacity - 1];
  }
  outputRange(): [number, number] {
    return [0, this.container.capacity - 1];
  }
  override serverInit(): void {
    for (const it of this.part?.inv ?? []) {
      const s: Stack = { id: it.id.replace(/^bp:/, ""), bp: it.id.startsWith("bp:"), amount: it.n, slot: it.slot };
      if (this.container.get(it.slot) || it.slot >= this.container.capacity) this.container.insert(s);
      else this.container.moveInto(s, it.slot);
    }
  }
  override readouts(): Readout[] {
    return [{ k: "slotsUsed", v: this.container.items.length, of: this.container.capacity }];
  }
}

/** Horno a leña (`BaseOven`, temperatura de fundición): funde lo de sus ranuras de entrada mientras tenga combustible. */
export class BaseOven extends IndustrialStorageEntity {
  private byproductCredit = 0;
  get T(): number {
    return this.def.p.cookingTemperature ?? 15;
  }
  get inputIndex(): number {
    return this.def.p.fuelSlots ?? 1;
  }
  get outputIndex(): number {
    return this.inputIndex + (this.def.p.inputSlots ?? 1);
  }
  private isBurnable(s: Stack): boolean {
    return !!this.world.items[s.id]?.burn && (!this.def.fuel || s.id === this.def.fuel) && !s.bp;
  }
  private isMaterialInput(s: Stack): boolean {
    const c = this.world.items[s.id]?.cook;
    return !!c && !(c.low > this.T || c.high < this.T) && !s.bp;
  }
  private isOutput(s: Stack): boolean {
    if (s.bp) return false;
    const T = this.T;
    for (const it of Object.values(this.world.items)) if (it.cook && it.cook.into === s.id && T > it.cook.low && T < it.cook.high) return true;
    return !!this.def.fuel && this.world.items[this.def.fuel]?.burn?.by === s.id;
  }
  /** `GetAllowedSlots`. */
  private allowed(s: Stack): [number, number] | null {
    if (this.isBurnable(s)) return [0, (this.def.p.fuelSlots ?? 1) - 1];
    if (this.isOutput(s)) return [this.outputIndex, this.outputIndex + (this.def.p.outputSlots ?? 1) - 1];
    if (this.isMaterialInput(s)) return [this.inputIndex, this.inputIndex + (this.def.p.inputSlots ?? 1) - 1];
    return null;
  }
  override itemFilter(s: Stack, slot: number): boolean {
    const r = this.allowed(s);
    return !!r && slot >= r[0] && slot <= r[1];
  }
  override onItemAddedOrRemoved(s: Stack, added: boolean): void {
    if (!added) return;
    const c = this.world.items[s.id]?.cook;
    if (c) s.cookTimeLeft = c.time;
    if (s.fuel === undefined && this.world.items[s.id]?.burn) s.fuel = this.world.items[s.id].burn!.fuel;
    s.cooking = false;
  }
  /** `InputSlotRange` / `OutputSlotRange` según `IndustrialMode`. */
  override inputRange(): [number, number] {
    switch (this.def.p.IndustrialMode) {
      case 1:
        return [0, 6];
      case 2:
      case 3:
        return [0, 1];
      default:
        return [0, 2];
    }
  }
  override outputRange(): [number, number] {
    switch (this.def.p.IndustrialMode) {
      case 1:
        return [7, 16];
      case 2:
      case 3:
        return [2, 4];
      default:
        return [3, 5];
    }
  }
  override init(): void {
    super.init();
    if (this.cfg.on) this.invoke("StartCooking", () => this.startCooking(), 0.5);
  }
  findBurnable(): Stack | undefined {
    return this.container.items.find((s) => this.isBurnable(s));
  }
  startCooking(): void {
    if (this.findBurnable()) {
      this.invokeRepeating("Cook", () => this.cook(), 0.5, 0.5);
      this.setFlag(Flag.On, true);
      this.cfg.on = 1;
    }
  }
  stopCooking(): void {
    for (const s of this.container.items) s.cooking = false;
    this.cancelInvoke("Cook");
    this.setFlag(Flag.On, false);
    this.cfg.on = 0;
  }
  private cook(): void {
    const fuel = this.findBurnable();
    if (!fuel) {
      this.stopCooking();
      return;
    }
    for (const s of this.container.items) if (s.slot >= this.inputIndex && s.slot < this.inputIndex + (this.def.p.inputSlots ?? 1)) s.cooking = true;
    this.increaseCookTime(0.5 * (this.def.p.smeltSpeed ?? 1));
    fuel.fuel = (fuel.fuel ?? this.world.items[fuel.id].burn!.fuel) - 0.5 * (this.T / 200);
    if (fuel.fuel <= 0) this.consumeFuel(fuel);
  }
  private increaseCookTime(amount: number): void {
    const list = this.container.items.filter((s) => s.cooking);
    const delta = amount / list.length;
    for (const s of list) this.cycleCooking(s, delta);
  }
  /** `ItemModCookable.CycleCooking`. */
  private cycleCooking(s: Stack, delta: number): void {
    const c = this.world.items[s.id]?.cook;
    if (!c || !(this.T > c.low && this.T < c.high) || (s.cookTimeLeft ?? 0) < 0) return;
    s.cookTimeLeft = (s.cookTimeLeft ?? c.time) - delta;
    if (s.cookTimeLeft > 0) return;
    const over = -s.cookTimeLeft;
    let n = 1 + Math.floor(over / c.time);
    s.cookTimeLeft = c.time - (over % c.time);
    n = Math.min(n, s.amount);
    this.container.use(s, n);
    const made: Stack = { id: c.into, amount: c.n * n, slot: -1 };
    if (!this.container.insert(made) && !this.container.insert(made)) this.stopCooking();
  }
  /** `ConsumeFuel`. Acá: el carbón sale 1 vez cada 1 ÷ (1 − probabilidad) leños, sin azar (el juego tira un dado). */
  private consumeFuel(fuel: Stack): void {
    const b = this.world.items[fuel.id]?.burn;
    if (!b) return;
    if (this.def.p.allowByproductCreation && b.by) {
      this.byproductCredit += 1 - b.byChance;
      if (this.byproductCredit >= 1) {
        this.byproductCredit -= 1;
        if (!this.container.insert({ id: b.by, amount: b.byN, slot: -1 })) this.stopCooking();
      }
    }
    if (fuel.amount <= 1) {
      this.container.remove(fuel);
      return;
    }
    fuel.amount -= 1;
    fuel.fuel = b.fuel;
  }
  override readouts(): Readout[] {
    return [...super.readouts(), { k: "smelting", v: this.isOn() }];
  }
  override actions(): Action[] {
    return [{ k: "power", kind: "toggle", value: this.isOn() ? 1 : 0 }];
  }
  override act(key: string): void {
    if (key === "power") {
      if (this.isOn()) this.stopCooking();
      else this.startCooking();
    }
  }
}

/** Caja de madera (grande o chica): ranuras genéricas. */
export class BoxStorage extends IndustrialStorageEntity {}

/**
 * Crafteador industrial: con energía y prendido, cada 5 s busca un plano en sus ranuras 0-3 cuya receta pueda hacer con
 * lo que hay en sus ranuras de entrada (4-7) y lugar en las de salida (8-11), y lo fabrica en el tiempo de la receta.
 * Va puesto en un banco de trabajo (el nivel del banco limita qué planos se pueden usar).
 */
export class IndustrialCrafter extends IndustrialEntity implements IndustrialStorage {
  readonly container: Container;
  private currentlyCrafting: string | null = null;
  private currentlyCraftingAmount = 0;
  crafted = 0;
  constructor(...args: ConstructorParameters<typeof IOEntity>) {
    super(...args);
    this.container = new Container(12, () => this.world.items, (s, slot) => !(slot >= 0 && slot <= 3 && !s.bp));
  }
  get entity(): IOEntity {
    return this;
  }
  get workbench(): number {
    return this.cfg.workbench ?? 3;
  }
  inputRange(slotIndex: number): [number, number] {
    return slotIndex === 3 ? [0, 3] : [4, 7];
  }
  outputRange(slotIndex: number): [number, number] {
    return slotIndex === 1 ? [0, 3] : [8, 11];
  }
  override serverInit(): void {
    for (const it of this.part?.inv ?? []) {
      const s: Stack = { id: it.id.replace(/^bp:/, ""), bp: it.id.startsWith("bp:"), amount: it.n, slot: it.slot };
      this.container.moveInto(s, it.slot);
    }
  }
  override onFlagsChanged(old: number, next: number): void {
    const was = (old & Flag.On) !== 0;
    const now = (next & Flag.On) !== 0;
    if (was === now) return;
    if (now) this.invokeRepeating("CheckCraft", () => this.runJob(), INDUSTRIAL_CRAFTER_FREQUENCY, INDUSTRIAL_CRAFTER_FREQUENCY);
    else this.cancelInvoke("CheckCraft");
  }
  private inputAmount(id: string): number {
    let n = 0;
    for (let i = 4; i <= 7; i++) {
      const s = this.container.get(i);
      if (s && !s.bp && s.id === id) n += s.amount;
    }
    return n;
  }
  private consume(id: string, amount: number): void {
    let left = amount;
    for (let i = 4; i <= 7 && left > 0; i++) {
      const s = this.container.get(i);
      if (s && !s.bp && s.id === id) {
        const k = Math.min(left, s.amount);
        this.container.use(s, k);
        left -= k;
      }
    }
  }
  runJob(): void {
    if (this.hasFlag(Flag.Reserved1) || this.currentlyCrafting) return;
    for (let i = 0; i <= 3; i++) {
      const bp = this.container.get(i);
      if (!bp?.bp) continue;
      const recipe = this.world.items[bp.id]?.craft;
      if (!recipe || this.workbench < recipe.wb) continue;
      if (!recipe.in.every(([id, n]) => this.inputAmount(id) >= n)) continue;
      let room = false;
      for (let j = 8; j <= 11; j++) {
        const s = this.container.get(j);
        if (!s || (s.id === bp.id && !s.bp && s.amount + recipe.n <= this.container.stackable(s))) {
          room = true;
          break;
        }
      }
      if (!room) {
        this.setFlag(Flag.Reserved2, true);
        continue;
      }
      this.setFlag(Flag.Reserved2, false);
      for (const [id, n] of recipe.in) this.consume(id, n);
      this.currentlyCrafting = bp.id;
      this.currentlyCraftingAmount = recipe.n;
      this.invoke("CompleteCraft", () => this.completeCraft(), recipe.time);
      this.setFlag(Flag.Reserved1, true);
      break;
    }
  }
  private completeCraft(): void {
    const id = this.currentlyCrafting;
    if (!id) return;
    for (let i = 8; i <= 11; i++) {
      const s = this.container.get(i);
      if (!s) {
        this.container.moveInto({ id, amount: this.currentlyCraftingAmount, slot: i }, i);
        break;
      }
      if (s.id === id && !s.bp && s.amount + this.currentlyCraftingAmount <= this.container.stackable(s)) {
        s.amount += this.currentlyCraftingAmount;
        break;
      }
    }
    this.crafted += this.currentlyCraftingAmount;
    this.currentlyCrafting = null;
    this.currentlyCraftingAmount = 0;
    this.setFlag(Flag.Reserved1, false);
  }
  override ioStateChanged(inputAmount: number, inputSlot: number): void {
    super.ioStateChanged(inputAmount, inputSlot);
    if (inputSlot === 1) {
      this.setFlag(Flag.Reserved8, inputAmount >= this.consumptionAmount() && inputAmount > 0);
      this.currentEnergy = inputAmount;
      this.ensureOutputsUpdated = true;
      this.markDirty();
      if (inputAmount > 0 && this.wasOnWhenPowerLost && !this.isOn()) {
        this.setSwitch(true);
        this.wasOnWhenPowerLost = false;
      }
    }
    if (inputSlot === 1 && inputAmount <= 0 && this.isOn()) this.setSwitch(false);
    if (inputSlot === 2) {
      if (this.isOn() && inputAmount === 0) this.setSwitch(false);
      else if (!this.isOn() && inputAmount > 0 && this.hasFlag(Flag.Reserved8)) this.setSwitch(true);
    }
    if (inputSlot === 4 && inputAmount > 0 && this.hasFlag(Flag.Reserved8)) this.setSwitch(true);
    if (inputSlot === 5 && inputAmount > 0 && this.hasFlag(Flag.Reserved8)) this.setSwitch(false);
  }
  override wantsPassthroughPower(): boolean {
    return false;
  }
  override wantsPower(inputIndex: number): boolean {
    return inputIndex === 1;
  }
  override readouts(): Readout[] {
    return [
      { k: "needs", v: this.consumptionAmount() },
      { k: "online", v: this.isOn() },
      { k: "crafting", v: this.currentlyCrafting ?? "" },
      { k: "crafted", v: this.crafted },
    ];
  }
  override actions(): Action[] {
    return [
      { k: "power", kind: "toggle", value: this.isOn() ? 1 : 0 },
      { k: "workbench", kind: "number", value: this.workbench, min: 1, max: 3, step: 1 },
    ];
  }
  override act(key: string, value?: number): void {
    if (key === "power") {
      if (this.isOn()) this.setSwitch(false);
      else if (this.hasFlag(Flag.Reserved8)) this.setSwitch(true);
      else this.cfg.on = this.cfg.on ? 0 : 1;
    }
    if (key === "workbench" && value !== undefined) this.cfg.workbench = Math.min(3, Math.max(1, Math.round(value)));
  }
}
