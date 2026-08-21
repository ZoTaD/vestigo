import { useEffect, useState } from "react";

/**
 * La capa de datos de la curva de maestría.
 *
 * **La confusión que este número tiene sacada, y por qué importa saberlo al
 * leerlo:** "el que juega más un héroe gana más" no prueba que el héroe premie la
 * práctica, porque quien acumula 250 partidas con alguien suele ser mejor
 * jugador. Por eso el pipeline lo mide **dentro de una sola banda**, con el nivel
 * de juego fijo. Lo que queda sin controlar es la habilidad individual adentro de
 * esa banda, y eso está dicho en la copia en vez de escondido.
 *
 * Lo que sostiene que esto mide al héroe y no a un artefacto: **el efecto varía
 * por héroe**. Medido el 2026-08-01 sobre Arcón/Oráculo, va de −4,4 a +8,6 puntos
 * con mediana +3,5. Un sesgo de selección global daría el mismo número para los
 * 38.
 *
 * Se baja con `import()`: el archivo pesa 9 KB y nadie lo mira sin abrir una fila.
 */

export interface MasteryBucket {
  /** Piso del tramo, en partidas previas con ese héroe. */
  from: number;
  matches: number;
  winRate: number;
}

export interface MasteryHero {
  heroId: number;
  buckets: MasteryBucket[];
  /** Puntos de winrate entre el tramo más alto con muestra y el más bajo. */
  boost?: number;
}

export interface MasteryFile {
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  pairs: number;
  heroes: MasteryHero[];
}

let pidiendo: Promise<MasteryFile | null> | null = null;
let cargado: MasteryFile | null = null;

/**
 * Se pide una sola vez para todas las filas.
 *
 * Sin esto, abrir cinco héroes dispararía cinco descargas del mismo archivo: el
 * navegador las cachea, pero el módulo se evalúa igual y la primera fila abierta
 * ya pagó el viaje.
 */
function load(): Promise<MasteryFile | null> {
  pidiendo ??= import("@deadlock/mastery.json")
    .then((m) => {
      cargado = m.default as unknown as MasteryFile;
      return cargado;
    })
    .catch(() => null);
  return pidiendo;
}

/**
 * La curva de un héroe, o `null` mientras baja o si no hay.
 *
 * **`null` cuando el héroe no tiene `boost`**: con un solo tramo con muestra no
 * hay curva que dibujar, y un panel con un punto suelto diría menos que no estar.
 */
export function useMastery(heroId: number): MasteryHero | null {
  const [file, setFile] = useState<MasteryFile | null>(cargado);

  useEffect(() => {
    if (cargado) return;
    let alive = true;
    load().then((f) => {
      if (alive) setFile(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  const hero = file?.heroes.find((h) => h.heroId === heroId);
  return hero && hero.boost !== undefined ? hero : null;
}
