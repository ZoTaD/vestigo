/**
 * "Explicar" (2026-10-09): el porqué de lo que hace una parte o un cable, armado con los números del estado del mundo,
 * en inglés y en español. Frases fijas por clase con cifras; nada de texto libre. Plan:
 * docs/superpowers/plans/2026-10-09-rust-electricidad.md.
 */
import { Flag, type IOEntity } from "./ioentity";
import type { ElectricBattery } from "./behaviors/battery";
import type { World } from "./world";
import type { Circuit, Wire } from "./types";
import { sunDot } from "./behaviors/sources";

export type Lang = "en" | "es";

const n = (v: number, lang: Lang): string => Math.round(v).toLocaleString(lang === "es" ? "es-AR" : "en-US");

/** "8 h 27 min" a partir de segundos. */
export function duration(seconds: number, lang: Lang): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return lang === "es" ? `${h} h ${m} min` : `${h}h ${m}m`;
  if (m > 0) return lang === "es" ? `${m} min ${s % 60} s` : `${m}m ${s % 60}s`;
  return `${s} s`;
}

type Phr = (e: IOEntity, lang: Lang) => string[];

const name = (e: IOEntity, lang: Lang): string => (lang === "es" ? e.def.name.es ?? e.def.name.en : e.def.name.en);
const outName = (e: IOEntity, i: number): string => e.outputs[i]?.niceName || `#${i + 1}`;

/** Lo de cualquier consumidor: cuánto pide, cuánto le llega y qué pasa con lo que sobra. */
const consumer: Phr = (e, lang) => {
  const use = e.consumptionAmount();
  const got = e.currentEnergy;
  const out: string[] = [];
  if (use === 0) out.push(lang === "es" ? "No consume nada." : "It uses no power.");
  else if (got >= use && got > 0)
    out.push(lang === "es" ? `Necesita ${use} y le llegan ${n(got, lang)}: funciona.` : `It needs ${use} and gets ${n(got, lang)}: it works.`);
  else if (got > 0)
    out.push(lang === "es" ? `Necesita ${use} y le llegan ${n(got, lang)}: no le alcanza, no funciona y no gasta nada.` : `It needs ${use} but only gets ${n(got, lang)}: not enough, so it stays off and uses nothing.`);
  else out.push(lang === "es" ? `Necesita ${use} y no le llega nada.` : `It needs ${use} and gets nothing.`);
  const pass = e.outputs.findIndex((o) => o.niceName.toLowerCase().includes("passthrough"));
  if (pass >= 0 && e.outputs[pass].connectedTo)
    out.push(lang === "es" ? `Deja pasar lo que le sobra (${n(e.sent[pass], lang)}) por "${outName(e, pass)}".` : `It passes what it doesn't use (${n(e.sent[pass], lang)}) out of "${outName(e, pass)}".`);
  return out;
};

const BY_CLASS: Record<string, Phr> = {
  SolarPanel: (e, lang) => {
    const dot = sunDot(e.world.env.hour);
    if (dot === null) return [lang === "es" ? "Es de noche: no genera nada." : "It's night: it makes nothing."];
    return [lang === "es" ? `A las ${Math.floor(e.world.env.hour)} h el sol le da ${e.currentEnergy} de ${e.def.p.maximalPowerOutput}. Rinde más con el sol alto.` : `At ${Math.floor(e.world.env.hour)}:00 the sun gives it ${e.currentEnergy} of ${e.def.p.maximalPowerOutput}. It makes more with the sun high.`];
  },
  ElectricWindmill: (e, lang) => [lang === "es" ? `Genera ${e.currentEnergy} de ${e.def.p.maxPowerGeneration}: más alto y con más viento, más (hasta 50 m de altura suma la mitad).` : `It makes ${e.currentEnergy} of ${e.def.p.maxPowerGeneration}: higher and windier means more (up to 50 m of height adds half).`],
  ElectricWaterWheel: (e, lang) => [lang === "es" ? `En el agua genera ${e.currentEnergy}.` : `In water it makes ${e.currentEnergy}.`],
  FuelGenerator: (e, lang) =>
    e.isOn()
      ? [lang === "es" ? `Prendido: da ${e.def.p.outputEnergy} y quema combustible de baja calidad.` : `On: it gives ${e.def.p.outputEnergy} and burns low grade fuel.`]
      : [lang === "es" ? "Apagado: no da nada. Se prende a mano o con energía en \"Force Start\"." : "Off: it gives nothing. Turn it on by hand or with power on \"Force Start\"."],
  ElectricGenerator: (e, lang) => [lang === "es" ? `Da ${e.getCurrentEnergy()} por cada salida (sólo en modo creativo).` : `It gives ${e.getCurrentEnergy()} on every output (creative mode only).`],
  ElectricBattery: (e, lang) => {
    const b = e as ElectricBattery;
    const out: string[] = [];
    if (b.isOn())
      out.push(lang === "es" ? `Descarga: empuja ${b.maxOutput} (su máximo) y sólo gasta lo que piden los que cuelgan de ella: ${b.activeDrain} por segundo.` : `Discharging: it pushes ${b.maxOutput} (its max) and only spends what the things after it ask for: ${b.activeDrain} per second.`);
    else if (b.rustWattSeconds < 5) out.push(lang === "es" ? "Está vacía: no descarga." : "It's empty: it can't discharge.");
    else out.push(lang === "es" ? "No tiene nada enchufado a la salida: no descarga." : "Nothing is plugged into its output: it doesn't discharge.");
    if (b.isOn() && b.activeDrain > 0) out.push(lang === "es" ? `Con esta carga dura ${duration(b.rustWattSeconds / b.activeDrain, lang)}.` : `At this rate it lasts ${duration(b.rustWattSeconds / b.activeDrain, lang)}.`);
    if (b.currentEnergy > 0 && !b.isFull()) {
      const c = Math.min(b.currentEnergy, b.desiredPower()) * b.chargeRatio;
      out.push(lang === "es" ? `Le entran ${b.currentEnergy}: guarda ${n(c, lang)} por segundo (el 80 %).` : `It gets ${b.currentEnergy} in: it stores ${n(c, lang)} per second (80%).`);
    }
    if (b.isFull()) out.push(lang === "es" ? "Está llena: no pide más carga." : "It's full: it takes no more charge.");
    return out;
  },
  Splitter: (e, lang) => {
    const used = e.outputs.map((o, i) => (o.connectedTo ? `${outName(e, i)}: ${e.sent[i]}` : null)).filter(Boolean);
    return [lang === "es" ? `Reparte lo que le entra (${e.currentEnergy}) en partes iguales entre las ${used.length || 1} salidas conectadas, sin mirar lo que pide cada una; lo que no se usa se pierde.` : `It splits what it gets (${e.currentEnergy}) evenly between its ${used.length || 1} connected outputs, without looking at what each one needs; what isn't used is lost.`, used.join(" · ")];
  },
  ElectricalBranch: (e, lang) => {
    const b = (e as unknown as { branchAmount: number }).branchAmount;
    return [lang === "es" ? `Saca ${b} por "Branch Out" y el resto (${e.sent[0]}) por "Power Out".` : `It sends ${b} out of "Branch Out" and the rest (${e.sent[0]}) out of "Power Out".`];
  },
  ElectricalCombiner: (e, lang) => {
    const out = [lang === "es" ? `Suma sus entradas: da ${e.getPassthroughAmount()}.` : `It adds its inputs: it gives ${e.getPassthroughAmount()}.`];
    if (e.hasFlag(Flag.Reserved7)) out.push(lang === "es" ? "Una entrada viene de su propia salida: el juego la cuenta como 0." : "One input comes from its own output: the game counts it as 0.");
    return out;
  },
  ElectricalBlocker: (e, lang) => [e.isOn() ? (lang === "es" ? "\"Block Passthrough\" tiene energía: no deja pasar nada." : "\"Block Passthrough\" is powered: nothing goes through.") : lang === "es" ? `Deja pasar ${e.sent[0]}.` : `It lets ${e.sent[0]} through.`],
  ANDSwitch: (e, lang) => gate(e, lang, lang === "es" ? "Da lo mayor de A y B si las dos tienen energía." : "It gives the larger of A and B if both are powered."),
  ORSwitch: (e, lang) => gate(e, lang, lang === "es" ? "Da lo mayor de A y B si alguna tiene energía." : "It gives the larger of A and B if either is powered."),
  XORSwitch: (e, lang) => gate(e, lang, lang === "es" ? "Da energía sólo si una de las dos entradas tiene (no las dos)." : "It gives power only if exactly one input is powered."),
  ElectricalDFlipFlop: (e, lang) => [
    e.isOn() ? (lang === "es" ? `Guardó "prendido": lo que entra (${e.currentEnergy}) sale por "Output".` : `It's set: what comes in (${e.currentEnergy}) goes out of "Output".`) : lang === "es" ? `Guardó "apagado": lo que entra (${e.currentEnergy}) sale por "Inverted Output".` : `It's reset: what comes in (${e.currentEnergy}) goes out of "Inverted Output".`,
    lang === "es" ? "Set la prende, Reset la apaga, Toggle la invierte; sólo cambia con \"Power In\" alimentado." : "Set turns it on, Reset off, Toggle flips it; it only changes while \"Power In\" is powered.",
  ],
  PowerCounter: (e, lang) => {
    const k = e as unknown as { counterNumber: number; targetCounterNumber: number };
    return [lang === "es" ? `Va ${k.counterNumber} de ${k.targetCounterNumber}: ${k.counterNumber >= k.targetCounterNumber ? "llegó, deja pasar la energía." : "todavía no deja pasar nada."}` : `It's at ${k.counterNumber} of ${k.targetCounterNumber}: ${k.counterNumber >= k.targetCounterNumber ? "reached, power goes through." : "nothing goes through yet."}`];
  },
  CustomTimerSwitch: (e, lang) => {
    const left = e.world.invokeIn(e, "AdvanceTime") !== null ? (e.readouts().find((r) => r.k === "left")?.v as number | undefined) : undefined;
    if (e.isOn()) return [lang === "es" ? `Corriendo: deja pasar ${e.sent[0]}${left !== undefined ? `, faltan ${left} s` : ""}.` : `Running: it lets ${e.sent[0]} through${left !== undefined ? `, ${left}s left` : ""}.`];
    return [e.isPowered() ? (lang === "es" ? "Esperando: energía en \"Toggle On\" lo prende." : "Waiting: power on \"Toggle On\" starts it.") : lang === "es" ? "Sin energía en \"Power In\": no arranca." : "No power on \"Power In\": it can't start."];
  },
  ElectricSwitch: (e, lang) => [e.isOn() ? (lang === "es" ? `Prendido: deja pasar ${e.currentEnergy}.` : `On: it lets ${e.currentEnergy} through.`) : lang === "es" ? "Apagado: no deja pasar nada (y lo de atrás no gasta)." : "Off: nothing goes through (and what's behind it uses nothing)."],
  PressButton: (e, lang) => [lang === "es" ? `Al apretarlo da un pulso de ${e.def.p.pressPowerTime} s con lo que le entra, o ${e.def.p.pressPowerAmount} si no le entra nada.` : `Pressing it sends a ${e.def.p.pressPowerTime}s pulse with what comes in, or ${e.def.p.pressPowerAmount} if nothing does.`],
  HBHFSensor: (e, lang) => [lang === "es" ? `Da 1 por cada jugador que ve (${e.sent[0]}), hasta lo que le entra menos 1.` : `It gives 1 for each player it sees (${e.sent[0]}), up to what it gets minus 1.`],
  AutoTurret: (e, lang) => [...consumer(e, lang), lang === "es" ? "Las salidas de estado dan 1 con lo que sobra de sus 10: con 10 justos dan 0." : "Its status outputs give 1 out of what's left after its 10: with exactly 10 they give 0."],
  SamSite: (e, lang) => [...consumer(e, lang), lang === "es" ? `Deja pasar lo que sobra de sus 25 por "Passthrough" (${e.sent[3] ?? 0}).` : `It passes what's left after its 25 out of "Passthrough" (${e.sent[3] ?? 0}).`],
  TeslaCoil: (e, lang) => [...consumer(e, lang), lang === "es" ? "Hace más daño cuanta más energía le llega (hasta 25) y se daña sola mientras descarga." : "More power means more damage (up to 25), and it damages itself while it fires."],
};

function gate(e: IOEntity, lang: Lang, rule: string): string[] {
  const a = e.received[0] ?? 0;
  const b = e.received[1] ?? 0;
  const out = [rule, `A ${a} · B ${b} → ${e.sent[0] ?? 0}`];
  if (e.hasFlag(Flag.Reserved7)) out.push(lang === "es" ? "Una entrada viene de su propia salida: el juego la anula." : "One input comes from its own output: the game cancels it.");
  return out;
}

/** El porqué de una parte. */
export function explainPart(world: World, id: string, lang: Lang): string[] {
  const e = world.get(id);
  if (!e) return [];
  const f = BY_CLASS[e.def.cls] ?? (e.def.cat === "source" || e.def.cat === "battery" ? () => [] : consumer);
  return f(e, lang).filter(Boolean);
}

/** El porqué de un cable: cuánto lleva y de dónde a dónde. */
export function explainWire(world: World, w: Wire, lang: Lang): string[] {
  const a = world.get(w.from[0]);
  const b = world.get(w.to[0]);
  if (!a || !b) return [];
  const v = a.sent[w.from[1]] ?? 0;
  return [lang === "es" ? `Lleva ${v} de "${outName(a, w.from[1])}" (${name(a, lang)}) a "${b.inputs[w.to[1]]?.niceName}" (${name(b, lang)}).` : `It carries ${v} from "${outName(a, w.from[1])}" (${name(a, lang)}) to "${b.inputs[w.to[1]]?.niceName}" (${name(b, lang)}).`];
}

/** Los avisos del circuito: consumidores sin energía suficiente, cortos y lazos que no se calman. */
export type Issue = { id: string; kind: "unpowered" | "short" | "unwired" } | { id: null; kind: "overload" };

export function issues(world: World, circuit: Circuit): Issue[] {
  const out: Issue[] = [];
  for (const p of circuit.parts) {
    const e = world.get(p.id);
    if (!e) continue;
    const main = e.inputs.findIndex((s) => s.mainPowerSlot && s.type === 0);
    if (e.hasFlag(Flag.Reserved7)) out.push({ id: p.id, kind: "short" });
    else if (main >= 0 && !e.inputs[main].connectedTo && e.def.cat !== "battery" && e.def.cat !== "sensor" && e.def.cat !== "switch" && e.def.cat !== "logic" && e.def.cat !== "route") out.push({ id: p.id, kind: "unwired" });
    else if (main >= 0 && e.inputs[main].connectedTo && e.consumptionAmount() > 0 && e.currentEnergy > 0 && e.currentEnergy < e.consumptionAmount()) out.push({ id: p.id, kind: "unpowered" });
  }
  if (world.overloaded) out.push({ id: null, kind: "overload" });
  return out;
}
