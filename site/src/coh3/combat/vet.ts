/**
 * La veteranía de una unidad en números (2026-11-04). Los datos la traen como el texto del juego ("+25% weapon
 * penetration \n+30% rotation rate"), así que se lee el texto en inglés de cada nivel y se suman los efectos que
 * cambian el combate. Lo que no se reconoce no se aplica (y la página lo dice con el texto original al lado).
 *
 * coh3stats muestra la veteranía como texto y no la cuenta; acá sí entra en la calculadora.
 */
export interface VetMods {
  /** Multiplicadores del atacante. */
  accuracy: number;
  penetration: number;
  rateOfFire: number;
  damage: number;
  /** Del blanco: precisión con la que le pegan (×) y daño que recibe (×). */
  receivedAccuracy: number;
  receivedDamage: number;
  /** Vida que suma (por modelo) y blindaje frontal y lateral que suma. */
  health: number;
  frontArmor: number;
  sideArmor: number;
}

export const NO_VET: VetMods = { accuracy: 1, penetration: 1, rateOfFire: 1, damage: 1, receivedAccuracy: 1, receivedDamage: 1, health: 0, frontArmor: 0, sideArmor: 0 };

type Rule = [RegExp, (m: VetMods, v: number) => void];

/** Cada regla con un número (`v`, con signo). Lo de "main gun" se toma como del arma: es la que importa en un tanque. */
const RULES: Rule[] = [
  [/^([-+]?\d+(?:\.\d+)?)% (?:weapon |main gun )?accuracy$/i, (m, v) => (m.accuracy *= 1 + v / 100)],
  [/^([-+]?\d+(?:\.\d+)?)% weapon penetration$/i, (m, v) => (m.penetration *= 1 + v / 100)],
  [/^([-+]?\d+(?:\.\d+)?)% rate of fire$/i, (m, v) => (m.rateOfFire *= 1 + v / 100)],
  [/^([-+]?\d+(?:\.\d+)?)% damage$/i, (m, v) => (m.damage *= 1 + v / 100)],
  [/^([-+]?\d+(?:\.\d+)?)% harder to hit$/i, (m, v) => (m.receivedAccuracy *= 1 - v / 100)],
  [/^([-+]?\d+(?:\.\d+)?)% damage reduction$/i, (m, v) => (m.receivedDamage *= 1 - v / 100)],
  [/^([-+]?\d+(?:\.\d+)?) health\.?$/i, (m, v) => (m.health += v)],
  [/^([-+]?\d+(?:\.\d+)?) frontal armor$/i, (m, v) => (m.frontArmor += v)],
  [/^([-+]?\d+(?:\.\d+)?) side armor$/i, (m, v) => (m.sideArmor += v)],
];

/** Los efectos de un texto de veteranía que se reconocieron (y las líneas que no). */
export function parseVetLines(text: string, into: VetMods = { ...NO_VET }): { mods: VetMods; unknown: string[] } {
  const unknown: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^\+(?=\d)/, "+");
    if (!line) continue;
    const rule = RULES.find(([re]) => re.test(line));
    if (!rule) {
      unknown.push(line);
      continue;
    }
    const v = Number(line.match(rule[0])![1]);
    rule[1](into, v);
  }
  return { mods: into, unknown };
}

/** Los efectos acumulados hasta el nivel `level` (0 = sin veteranía; los niveles suman). */
export function vetAt(levels: { desc: { en: string } | null }[] | null | undefined, level: number): VetMods {
  const mods = { ...NO_VET };
  for (const l of (levels ?? []).slice(0, level)) if (l.desc?.en) parseVetLines(l.desc.en, mods);
  return mods;
}
