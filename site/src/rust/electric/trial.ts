/**
 * "Probarlo en el simulador" (2026-10-09): la ficha de Objetos abre el simulador con `#try=<shortname>` y la pestaña
 * arma un circuito mínimo con ese componente. Va en el `#hash` y no en `?try=` porque la app normaliza la dirección al
 * entrar.
 */
import type { Catalog } from "./engine";
import type { Circuit } from "./engine/types";

export const TRY_KEY = "try=";

/**
 * Un componente solo, listo para probar: el generador de prueba en su entrada de energía y una luz en su primera salida
 * eléctrica; si es de agua, un barril lleno más arriba en su entrada de agua y otro más abajo en su salida de agua.
 */
export function tryCircuit(cat: Catalog, id: string): Circuit | null {
  const def = cat.get(id);
  if (!def || def.hidden) return null;
  const parts: Circuit["parts"] = [{ id: "p1", type: id, x: 220, y: 0 }];
  const wires: Circuit["wires"] = [];
  const power = def.in.findIndex((s) => s.m === 1 && s.t === 0);
  if (power >= 0) {
    parts.push({ id: "p0", type: "electric.generator.small", x: 0, y: 0 });
    wires.push({ from: ["p0", 0], to: ["p1", power] });
  }
  const waterIn = def.in.findIndex((s) => s.t === 1);
  if (waterIn >= 0) {
    parts.push({ id: "p3", type: "water.barrel", x: 0, y: 160, cfg: { water: 2000, height: 2 } });
    wires.push({ from: ["p3", 0], to: ["p1", waterIn] });
  }
  const out = def.out.findIndex((s) => s.t === 0);
  if (out >= 0) {
    parts.push({ id: "p2", type: "electric.simplelight", x: 440, y: 0 });
    wires.push({ from: ["p1", out], to: ["p2", 0] });
  }
  const waterOut = def.out.findIndex((s) => s.t === 1);
  if (waterOut >= 0) {
    parts.push({ id: "p4", type: "water.barrel", x: 440, y: 160, cfg: { height: -2 } });
    wires.push({ from: ["p1", waterOut], to: ["p4", 0] });
  }
  return { parts, wires };
}
