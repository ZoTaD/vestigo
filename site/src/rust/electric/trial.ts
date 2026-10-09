/**
 * "Probarlo en el simulador" (2026-10-09): la ficha de Objetos abre el simulador con `#try=<shortname>` y la pestaña
 * arma un circuito mínimo con ese componente. Va en el `#hash` y no en `?try=` porque la app normaliza la dirección al
 * entrar.
 */
import type { Catalog } from "./engine";
import type { Circuit } from "./engine/types";

export const TRY_KEY = "try=";

/**
 * Un componente solo, listo para probar: el generador de prueba en su entrada de energía (si tiene) y una luz en su
 * primera salida eléctrica (si tiene).
 */
export function tryCircuit(cat: Catalog, id: string): Circuit | null {
  const def = cat.get(id);
  if (!def) return null;
  const parts: Circuit["parts"] = [{ id: "p1", type: id, x: 220, y: 0 }];
  const wires: Circuit["wires"] = [];
  const main = def.in.findIndex((s) => s.m === 1 && s.t === 0);
  if (main >= 0) {
    parts.push({ id: "p0", type: "electric.generator.small", x: 0, y: 0 });
    wires.push({ from: ["p0", 0], to: ["p1", main] });
  }
  const out = def.out.findIndex((s) => s.t === 0);
  if (out >= 0) {
    parts.push({ id: "p2", type: "electric.simplelight", x: 440, y: 0 });
    wires.push({ from: ["p1", out], to: ["p2", 0] });
  }
  return { parts, wires };
}
