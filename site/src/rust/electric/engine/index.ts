/**
 * El motor del simulador de electricidad (2026-10-09): arma un `World` con un circuito y lo mantiene al día con los
 * cambios del editor. TypeScript puro, sin React. Plan: docs/superpowers/plans/2026-10-09-rust-electricidad.md.
 */
import { Flag, IOEntity } from "./ioentity";
import { ElectricBattery } from "./behaviors/battery";
import { AutoTurret, Consumer, CustomDoorManipulator, DeployableBoomBox, Igniter, ReactiveTarget, SamSite, TeslaCoil } from "./behaviors/devices";
import { ANDSwitch, ElectricalDFlipFlop, ORSwitch, PowerCounter, TimerSwitch, XORSwitch } from "./behaviors/logic";
import { CableTunnel, ElectricalBlocker, ElectricalBranch, ElectricalCombiner, RANDSwitch, Splitter } from "./behaviors/route";
import { HBHFSensor, LaserDetector, PressurePad, SeismicSensor, StorageMonitor } from "./behaviors/sensors";
import { ElectricGenerator, ElectricWaterWheel, ElectricWindmill, FuelGenerator, SolarPanel } from "./behaviors/sources";
import { ElectricSwitch, PressButton, RFBroadcaster, RFReceiver, SmartSwitch } from "./behaviors/switches";
import type { Circuit, ComponentDef, ElectricityData, Part, PartCfg, Wire } from "./types";
import { DEFAULT_ENV } from "./types";
import { World } from "./world";

export { Flag, IOEntity, World };
export type { Action, Readout } from "./ioentity";

type Ctor = new (world: World, id: string, def: ComponentDef, cfg: PartCfg) => IOEntity;

/** Clase del juego → comportamiento. Lo que no está acá usa `IOEntity` con su consumo (luces, heladera…). */
const BEHAVIORS: Record<string, Ctor> = {
  SolarPanel,
  ElectricWindmill,
  ElectricWaterWheel,
  FuelGenerator,
  ElectricGenerator,
  ElectricBattery,
  Splitter,
  ElectricalBranch,
  ElectricalCombiner,
  ElectricalBlocker,
  RANDSwitch,
  CableTunnel,
  ANDSwitch,
  ORSwitch,
  XORSwitch,
  ElectricalDFlipFlop,
  PowerCounter,
  CustomTimerSwitch: TimerSwitch,
  ElectricSwitch,
  SmartSwitch,
  PressButton,
  RFBroadcaster,
  RFReceiver,
  HBHFSensor,
  LaserDetector,
  PressurePad,
  SeismicSensor,
  StorageMonitor,
  AutoTurret,
  SamSite,
  TeslaCoil,
  Igniter,
  CustomDoorManipulator,
  ReactiveTarget,
  DeployableBoomBox,
};

export const behaviorOf = (cls: string): Ctor => BEHAVIORS[cls] ?? Consumer;

/** El catálogo de componentes por shortname. */
export class Catalog {
  readonly byId: Map<string, ComponentDef>;
  constructor(readonly data: ElectricityData) {
    this.byId = new Map(data.components.map((c) => [c.id, c]));
  }
  get(id: string): ComponentDef | undefined {
    return this.byId.get(id);
  }
}

/** ¿Se puede tender este cable? Salida y entrada existen, del mismo tipo, y la entrada está libre. */
export function wireError(cat: Catalog, circuit: Circuit, w: Wire): "missing" | "type" | "taken" | "self" | null {
  const a = circuit.parts.find((p) => p.id === w.from[0]);
  const b = circuit.parts.find((p) => p.id === w.to[0]);
  const da = a && cat.get(a.type);
  const db = b && cat.get(b.type);
  const so = da?.out[w.from[1]];
  const si = db?.in[w.to[1]];
  if (!so || !si) return "missing";
  if (a === b) return "self";
  if (so.t !== si.t) return "type";
  if (circuit.wires.some((x) => x !== w && ((x.to[0] === w.to[0] && x.to[1] === w.to[1]) || (x.from[0] === w.from[0] && x.from[1] === w.from[1])))) return "taken";
  return null;
}

/** Arma el mundo de un circuito, como cuando el servidor carga un guardado: conexiones primero, después `Init`. */
export function buildWorld(cat: Catalog, circuit: Circuit): World {
  const world = new World();
  world.env = { ...DEFAULT_ENV, ...circuit.env };
  for (const p of circuit.parts) addEntity(cat, world, p, false);
  for (const w of circuit.wires) {
    const a = world.get(w.from[0]);
    const b = world.get(w.to[0]);
    if (!a || !b || wireError(cat, circuit, w)) continue;
    a.outputs[w.from[1]].connectedTo = b;
    a.outputs[w.from[1]].connectedToSlot = w.to[1];
    b.inputs[w.to[1]].connectedTo = a;
    b.inputs[w.to[1]].connectedToSlot = w.from[1];
  }
  for (const e of world.entities.values()) e.serverInit();
  for (const e of world.entities.values()) e.init();
  return world;
}

function addEntity(cat: Catalog, world: World, p: Part, live: boolean): IOEntity | null {
  const def = cat.get(p.type);
  if (!def || world.get(p.id)) return null;
  const Cls = behaviorOf(def.cls);
  // La configuración vive en la parte: lo que el usuario cambia en el inspector queda guardado en el circuito.
  p.cfg ??= {};
  const e = new Cls(world, p.id, def, p.cfg);
  world.entities.set(p.id, e);
  if (live) {
    e.serverInit();
    e.init();
  }
  return e;
}

/** Cambios del editor sobre un mundo vivo (sin perder la carga de las baterías ni los temporizadores en marcha). */
export const live = {
  addPart(cat: Catalog, world: World, p: Part): void {
    addEntity(cat, world, p, true);
  },
  removePart(world: World, id: string): void {
    const e = world.get(id);
    if (!e) return;
    e.shutdown();
    world.entities.delete(id);
  },
  connect(world: World, w: Wire): void {
    const a = world.get(w.from[0]);
    const b = world.get(w.to[0]);
    if (a && b) a.connectTo(b, w.from[1], w.to[1]);
  },
  disconnect(world: World, w: Wire): void {
    world.get(w.from[0])?.disconnect(w.from[1], false);
  },
};

/** Arma el mundo y lo deja correr `seconds` (para los tests y para el prerender de un circuito listo). */
export function simulate(cat: Catalog, circuit: Circuit, seconds: number): World {
  const w = buildWorld(cat, circuit);
  w.tick(seconds);
  return w;
}

export type { Circuit, ComponentDef, ElectricityData, Part, Wire };
