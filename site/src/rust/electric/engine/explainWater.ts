/**
 * "Explicar" para la red de agua (2026-10-09): cuánta agua hay, de qué tipo, el caudal, a dónde empuja, y la gravedad
 * con la altura de cada enchufe. Plan: docs/superpowers/plans/2026-10-09-rust-agua-industrial.md.
 */
import type { IOEntity } from "./ioentity";
import type { LiquidContainer, PoweredWaterPurifier, Sprinkler, WaterPump } from "./behaviors/water";

type Lang = "en" | "es";
type Phr = (e: IOEntity, lang: Lang) => string[];

/** "agua salada" / "salt water", del tipo de agua del juego. */
export const waterName = (kind: string | null | undefined, lang: Lang): string =>
  kind === "water.salt" ? (lang === "es" ? "agua salada" : "salt water") : lang === "es" ? "agua dulce" : "fresh water";

/** "2,03 m". */
export const meters = (v: number, lang: Lang): string => `${Math.round(v * 100) / 100}`.replace(".", lang === "es" ? "," : ".") + " m";

/**
 * ¿La gravedad corta este enchufe? La regla de `IOEntity.UpdateOutputs`: si ninguno de los dos está eximido
 * (contenedor con energía, interruptor de fluidos con bomba) y el destino no deja pasar desde la altura del origen.
 */
export function gravityBlocks(a: IOEntity, slot: number, b: IOEntity): boolean {
  if (a.outputs[slot]?.type !== 1) return false;
  if (a.disregardGravityRestrictionsOnLiquid || b.disregardGravityRestrictionsOnLiquid) return false;
  return !b.allowLiquidPassthrough(a, a.outY(slot));
}

/** Lo que "explicar" agrega a un cable de agua: si pasa, con la altura de la salida y de la entrada. */
export function wireWater(a: IOEntity, slot: number, b: IOEntity, lang: Lang): string[] {
  if (a.outputs[slot]?.type !== 1) return [];
  const from = meters(a.outY(slot), lang);
  const to = meters(b.inY(0), lang);
  if (gravityBlocks(a, slot, b))
    return [
      lang === "es"
        ? `El agua no pasa: el enchufe de salida está a ${from} y la entrada a ${to}. Sin bomba, el agua sólo baja (o sube menos de 1 m).`
        : `Water doesn't go through: the outlet is at ${from} and the inlet at ${to}. Without a pump, water only flows down (or up less than 1 m).`,
    ];
  if (a.disregardGravityRestrictionsOnLiquid || b.disregardGravityRestrictionsOnLiquid)
    return [
      lang === "es"
        ? `Hay una bomba en el medio: el agua sube sin importar la altura (salida a ${from}, entrada a ${to}).`
        : `There's a pump in the way: water goes up regardless of height (outlet at ${from}, inlet at ${to}).`,
    ];
  return [lang === "es" ? `Salida a ${from}, entrada a ${to}: el agua pasa.` : `Outlet at ${from}, inlet at ${to}: water goes through.`];
}

function liquidLines(c: LiquidContainer, lang: Lang): string[] {
  const out: string[] = [];
  out.push(
    c.liquid
      ? lang === "es"
        ? `Tiene ${c.liquidCount} de ${waterName(c.liquid.kind, lang)} (lugar para ${c.maxStackSize}).`
        : `It holds ${c.liquidCount} ${waterName(c.liquid.kind, lang)} (room for ${c.maxStackSize}).`
      : lang === "es"
        ? "Está vacío."
        : "It's empty.",
  );
  if (c.liquid && c.outputs.some((o) => o.connectedTo))
    out.push(
      lang === "es"
        ? `Por la salida marca un caudal de ${c.getCurrentEnergy()} (lo que tiene, con tope en ${c.maxOutputFlow}). Cada ${c.def.p.autofillTickRate ?? 2} s reparte ${c.def.p.autofillTickAmount ?? 0} entre los contenedores de abajo, y cada segundo le descuentan lo que gastan los aspersores.`
        : `Its output shows a flow of ${c.getCurrentEnergy()} (what it holds, capped at ${c.maxOutputFlow}). Every ${c.def.p.autofillTickRate ?? 2}s it shares ${c.def.p.autofillTickAmount ?? 0} among the containers below, and every second the sprinklers take what they use.`,
    );
  if (c.height !== 0) out.push(lang === "es" ? `Está a ${meters(c.height, lang)} de altura.` : `It sits at ${meters(c.height, lang)}.`);
  return out;
}

export const WATER_PHRASES: Record<string, Phr> = {
  LiquidContainer: (e, lang) => liquidLines(e as LiquidContainer, lang),
  WaterCatcher: (e, lang) => [
    ...liquidLines(e as LiquidContainer, lang),
    lang === "es"
      ? "Junta agua cada minuto, más con niebla y mucho más con lluvia, y la deja directo en el contenedor de abajo que tenga lugar."
      : "It collects water every minute, more with fog and much more with rain, and drops it straight into the container below that has room.",
  ],
  WaterPump: (e, lang) => {
    const p = e as WaterPump;
    const kind = waterName(p.waterKind(), lang);
    return [
      p.isPowered()
        ? lang === "es"
          ? `Con energía bombea ${p.def.p.AmountPerPump} de ${kind} cada ${p.def.p.PumpInterval} s y empuja hacia arriba sin mirar la gravedad.`
          : `Powered, it pumps ${p.def.p.AmountPerPump} ${kind} every ${p.def.p.PumpInterval}s and pushes uphill regardless of gravity.`
        : lang === "es"
          ? `Necesita ${p.consumptionAmount()} de energía para bombear.`
          : `It needs ${p.consumptionAmount()} power to pump.`,
      ...liquidLines(p, lang),
    ];
  },
  PoweredWaterPurifier: (e, lang) => {
    const u = e as PoweredWaterPurifier;
    const per = u.def.p.waterToProcessPerMinute ?? 0;
    const ratio = u.def.p.freshWaterRatio ?? 1;
    return [
      u.isPowered()
        ? lang === "es"
          ? `Con energía convierte ${per} de agua por minuto en ${Math.round(per / ratio)} de agua dulce (${ratio} a 1) y la deja en su depósito, que la empuja por "Water Out".`
          : `Powered, it turns ${per} water per minute into ${Math.round(per / ratio)} fresh water (${ratio} to 1) and stores it in its tank, which pushes it out of "Water Out".`
        : lang === "es"
          ? `Necesita ${u.consumptionAmount()} de energía para purificar.`
          : `It needs ${u.consumptionAmount()} power to purify.`,
      lang === "es"
        ? `Tiene ${u.liquidCount} de agua para purificar y ${u.storage?.liquidCount ?? 0} de agua dulce en el depósito.`
        : `It holds ${u.liquidCount} water to purify and ${u.storage?.liquidCount ?? 0} fresh water in its tank.`,
    ];
  },
  Sprinkler: (e, lang) => {
    const s = e as Sprinkler;
    return [
      s.isOn()
        ? lang === "es"
          ? `Le llega un caudal de ${s.currentEnergy}: está regando y gasta ${s.desiredPower()} de agua por segundo del contenedor que lo abastece.`
          : `It gets a flow of ${s.currentEnergy}: it's watering and uses ${s.desiredPower()} water per second from the container feeding it.`
        : lang === "es"
          ? "No le llega agua: no riega."
          : "No water reaches it: it isn't watering.",
    ];
  },
  FluidSwitch: (e, lang) => [
    e.isOn() ? (lang === "es" ? "Prendido: deja pasar el agua." : "On: water goes through.") : lang === "es" ? "Apagado: no deja pasar el agua." : "Off: no water goes through.",
    e.disregardGravityRestrictionsOnLiquid
      ? lang === "es"
        ? 'Con energía en "Pump Power" hace de bomba: el agua sube.'
        : 'With power on "Pump Power" it works as a pump: water goes uphill.'
      : lang === "es"
        ? 'Sin energía en "Pump Power", el agua no sube.'
        : 'Without power on "Pump Power", water doesn\'t go uphill.',
  ],
};
