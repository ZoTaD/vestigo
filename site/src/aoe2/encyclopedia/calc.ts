/**
 * El motor de la calculadora de AoE2 (2026-11-21), sin React: aplica los efectos del juego (tecnologías y bonos de civ)
 * a una unidad y calcula el daño de un golpe y cuánto tarda en matar. Mismas reglas que el juego: el daño es la suma,
 * por cada clase que tienen los dos, de ataque − armadura (sin bajar de 0), con mínimo 1. Tests en
 * `test/aoe2Calc.test.ts`.
 */

/** Un efecto del juego: [tipo, unidad, clase, atributo, valor]. Tipo 0 fija, 4 suma, 5 multiplica. */
export type Fx = [number, number, number, number, number];

export type Combatiente = {
  id: number;
  cls: number;
  hp: number;
  attacks: Record<number, number>;
  armors: Record<number, number>;
  reload: number;
  accuracy: number;
  range: number;
  speed: number;
  los: number;
  /** Cuánto del daño de bonificación no recibe (0,4 = -40%: los soldados sicilianos). Atributo 24 del juego. */
  bonusRes?: number;
};

/** Ataque y armadura en los efectos: clase × 256 + valor (un byte con signo). */
export function claseValor(d: number): [number, number] {
  const n = Math.round(d);
  let v = n & 0xff;
  if (v > 127) v -= 256;
  return [(n - v) / 256, v];
}

const toca = (u: Combatiente, [, uid, cls]: Fx) => !(uid === -1 && cls === -1) && (uid === -1 || uid === u.id) && (cls === -1 || cls === u.cls);

function numero(actual: number, tipo: number, v: number): number {
  return tipo === 0 ? v : tipo === 4 ? actual + v : tipo === 5 ? actual * v : actual;
}

/** La unidad con los efectos aplicados en orden (los que no le tocan se ignoran). */
export function aplicar(u: Combatiente, fxs: readonly Fx[]): Combatiente {
  const o: Combatiente = { ...u, attacks: { ...u.attacks }, armors: { ...u.armors } };
  for (const fx of fxs) {
    if (!toca(o, fx)) continue;
    const [tipo, , , attr, d] = fx;
    if (attr === 8 || attr === 9) {
      const tabla = attr === 9 ? o.attacks : o.armors;
      if (tipo === 5) {
        // Multiplicar: clase × 256 + porcentaje, sin signo (125 = ×1,25). Sólo si la unidad tiene esa clase.
        const n = Math.round(d);
        const c = Math.floor(n / 256);
        if (tabla[c] !== undefined) tabla[c] = Math.round((tabla[c] * (n % 256)) / 100);
        continue;
      }
      const [c, v] = claseValor(d);
      tabla[c] = tipo === 0 ? v : (tabla[c] ?? 0) + v;
      continue;
    }
    if (attr === 0) o.hp = numero(o.hp, tipo, d);
    else if (attr === 1) o.los = numero(o.los, tipo, d);
    else if (attr === 5) o.speed = numero(o.speed, tipo, d);
    else if (attr === 10) o.reload = numero(o.reload, tipo, d);
    else if (attr === 11) o.accuracy = Math.min(100, numero(o.accuracy, tipo, d));
    else if (attr === 12) o.range = numero(o.range, tipo, d);
    else if (attr === 24) o.bonusRes = Math.min(1, Math.max(0, numero(o.bonusRes ?? 0, tipo, d)));
  }
  o.hp = Math.round(o.hp);
  return o;
}

/** El daño de un golpe de A a B. Lo que no es el ataque base (cuerpo a cuerpo 4, a distancia 3) es daño de
 * bonificación, y B recibe sólo `1 − bonusRes` de eso. */
export function danio(a: Pick<Combatiente, "attacks">, b: Pick<Combatiente, "armors" | "bonusRes">): number {
  let s = 0;
  const res = b.bonusRes ?? 0;
  for (const [c, v] of Object.entries(a.attacks)) {
    const arm = b.armors[Number(c)];
    if (arm === undefined) continue;
    const parte = Math.max(0, v - arm);
    s += c === "3" || c === "4" ? parte : parte * (1 - res);
  }
  return Math.max(1, s);
}

export type Duelo = { dano: number; golpes: number; esperados: number; segundos: number };

/** Cuánto le cuesta a A matar a B: golpes que pegan, golpes esperados con la precisión y segundos (el primero sale al
 * empezar; con precisión < 100 se cuentan los esperados). */
export function duelo(a: Combatiente, b: Combatiente): Duelo {
  const dano = danio(a, b);
  const golpes = Math.ceil(b.hp / dano);
  const acierto = Math.max(1, a.accuracy) / 100;
  const esperados = golpes / acierto;
  return { dano, golpes, esperados, segundos: Math.max(0, Math.ceil(esperados) - 1) * a.reload };
}
