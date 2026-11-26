/**
 * Una unidad armada con los bonos de su civ y sus tecnologías (2026-11-21, movido el 2026-11-26 desde la calculadora:
 * también lo usa la ficha del árbol para comparar cada unidad con la misma genérica).
 */
import { aplicar, type Combatiente, type Fx } from "./calc";
import { estado, type Arbol, type CivFx, type Tecnologia, type Unidad } from "./data";

export const base = (u: Unidad): Combatiente => ({
  id: u.id,
  cls: u.class,
  hp: u.hp,
  attacks: Object.fromEntries(u.attacks),
  armors: Object.fromEntries(u.armors),
  reload: u.reload,
  accuracy: u.accuracy || 100,
  range: u.range,
  speed: u.speed,
  los: u.los,
});

/** Las tecnologías que la civ tiene hasta esa edad y que tocan a la unidad, de la edad más baja a la más alta. */
export function mejorasPara(ts: readonly Tecnologia[], a: Arbol, civ: string, u: Unidad, e: number): Tecnologia[] {
  return ts.filter((x) => x.units.includes(u.id) && x.age <= e && x.fx.length > 0 && estado(a, civ, `t${x.id}`) !== "0").sort((x, y) => x.age - y.age || x.id - y.id);
}

/** La unidad con los bonos de su civ hasta esa edad y las tecnologías elegidas. */
export function armar(u: Unidad, civ: string, e: number, fx: CivFx, techs: readonly Tecnologia[]): Combatiente {
  const bonos: Fx[] = (fx[civ]?.bonus ?? []).filter(([edadMin]) => edadMin <= e).flatMap(([, f]) => f);
  return aplicar(base(u), [...bonos, ...techs.flatMap((x) => x.fx)]);
}
