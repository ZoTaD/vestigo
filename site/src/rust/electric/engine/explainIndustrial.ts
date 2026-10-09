/**
 * "Explicar" para la red industrial (2026-10-09): de dónde a dónde mueve la cinta, cuánto y con qué filtro; qué tiene
 * cada caja u horno y qué ranuras usa la cinta; qué fabrica el crafteador. Plan:
 * docs/superpowers/plans/2026-10-09-rust-agua-industrial.md.
 */
import type { IOEntity } from "./ioentity";
import { CONVEYOR_MOVE_FREQUENCY, INDUSTRIAL_CRAFTER_FREQUENCY, type BaseOven, type IndustrialConveyor, type IndustrialCrafter, type IndustrialStorageEntity } from "./behaviors/industrial";

type Lang = "en" | "es";
type Phr = (e: IOEntity, lang: Lang) => string[];

const itemName = (e: IOEntity, id: string, lang: Lang): string => {
  const n = e.world.items[id]?.name;
  return n ? (lang === "es" ? n.es ?? n.en : n.en) : id;
};
const MODES = { en: ["Any", "And", "Not"], es: ["Cualquiera", "Y", "No"] };

const conveyor: Phr = (e, lang) => {
  const k = e as IndustrialConveyor;
  const per = Math.trunc((k.def.p.MaxStackSizePerMove ?? 128) / Math.max(1, k.outputsFound));
  const out: string[] = [];
  out.push(
    k.isOn()
      ? lang === "es"
        ? `Prendida: cada ${CONVEYOR_MOVE_FREQUENCY} s pasa objetos de ${k.inputsFound} origen(es) a ${k.outputsFound} destino(s), hasta ${per} por pila (${k.def.p.MaxStackSizePerMove} repartido entre los destinos).`
        : `On: every ${CONVEYOR_MOVE_FREQUENCY}s it moves items from ${k.inputsFound} source(s) to ${k.outputsFound} destination(s), up to ${per} per stack (${k.def.p.MaxStackSizePerMove} split among the destinations).`
      : k.isPowered()
        ? lang === "es"
          ? "Tiene energía pero está apagada."
          : "It has power but it's switched off."
        : lang === "es"
          ? `Necesita ${k.consumptionAmount()} de energía en "Power In" para prenderse.`
          : `It needs ${k.consumptionAmount()} power on "Power In" to switch on.`,
  );
  const filters = k.part?.filters ?? [];
  if (filters.length) {
    const list = filters.map((f) => (f.item ? itemName(k, f.item, lang) : f.cat ?? "")).join(", ");
    out.push(lang === "es" ? `Filtro (${MODES.es[k.mode] ?? ""}): ${list}.` : `Filter (${MODES.en[k.mode] ?? ""}): ${list}.`);
  } else out.push(lang === "es" ? "Sin filtro: mueve todo." : "No filter: it moves everything.");
  const moved = [...k.lastMoved].map(([id, n]) => `${n} ${itemName(k, id, lang)}`).join(", ");
  if (moved) out.push(lang === "es" ? `En la última vuelta movió ${moved}.` : `Last run it moved ${moved}.`);
  return out;
};

const storage: Phr = (e, lang) => {
  const s = e as IndustrialStorageEntity;
  const c = s.container;
  const out = [lang === "es" ? `Tiene ${c.items.length} pilas en ${c.capacity} ranuras.` : `It holds ${c.items.length} stacks in ${c.capacity} slots.`];
  out.push(lang === "es" ? "Con el adaptador puesto, la cinta saca de cualquier ranura y pone en cualquiera." : "With the adaptor on, a conveyor takes from and puts into any slot.");
  return out;
};

const oven: Phr = (e, lang) => {
  const o = e as BaseOven;
  const [ia, ib] = o.inputRange();
  const [oa, ob] = o.outputRange();
  const fuel = o.def.fuel ? itemName(o, o.def.fuel, lang) : "";
  return [
    o.isOn()
      ? lang === "es"
        ? `Prendido: funde a velocidad ${o.def.p.smeltSpeed} y quema ${fuel} (1 cada ${(o.world.items[o.def.fuel ?? ""]?.burn?.fuel ?? 0) / ((o.def.p.cookingTemperature ?? 0) / 200)} s).`
        : `On: it smelts at speed ${o.def.p.smeltSpeed} and burns ${fuel} (1 every ${(o.world.items[o.def.fuel ?? ""]?.burn?.fuel ?? 0) / ((o.def.p.cookingTemperature ?? 0) / 200)}s).`
      : lang === "es"
        ? `Apagado. Sólo prende con ${fuel} adentro y se apaga cuando se le acaba.`
        : `Off. It only lights with ${fuel} inside and goes out when it runs out.`,
    lang === "es"
      ? `La cinta le pone en las ranuras ${ia}-${ib} (combustible y lo que se funde) y le saca de las ${oa}-${ob} (lo fundido y el carbón).`
      : `A conveyor puts into slots ${ia}-${ib} (fuel and what to smelt) and takes from slots ${oa}-${ob} (smelted items and charcoal).`,
  ];
};

const crafter: Phr = (e, lang) => {
  const x = e as IndustrialCrafter;
  return [
    x.isOn()
      ? lang === "es"
        ? `Prendido: cada ${INDUSTRIAL_CRAFTER_FREQUENCY} s busca un plano en las ranuras 0-3 cuya receta pueda hacer con lo de las ranuras 4-7, y lo deja en las 8-11. Banco de nivel ${x.workbench}.`
        : `On: every ${INDUSTRIAL_CRAFTER_FREQUENCY}s it looks for a blueprint in slots 0-3 it can make with what's in slots 4-7, and puts the result in slots 8-11. Level ${x.workbench} workbench.`
      : lang === "es"
        ? `Necesita ${x.consumptionAmount()} de energía en "Power In" y estar prendido.`
        : `It needs ${x.consumptionAmount()} power on "Power In" and to be switched on.`,
    lang === "es" ? `Fabricó ${x.crafted} hasta ahora.` : `It has made ${x.crafted} so far.`,
  ];
};

export const INDUSTRIAL_PHRASES: Record<string, Phr> = {
  IndustrialConveyor: conveyor,
  BoxStorage: storage,
  BaseOven: oven,
  IndustrialCrafter: crafter,
};
