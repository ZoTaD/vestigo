/**
 * Qué set de TFT está vivo. La copia del Worker.
 *
 * El dueño de esta tabla es el pipeline (`games/tft/pipeline/src/sets.ts`); esto
 * es la copia que corre del lado de Cloudflare. Los dos paquetes no comparten
 * código —`cloudflare/` no importa nada del pipeline, y no debería: son dos
 * despliegues distintos con dos tsconfig distintos—, así que la tabla se copia,
 * exactamente igual que `ui/src/bands.ts` copia `pipeline/src/bands.ts`.
 *
 * **Que no diverjan lo garantiza un test**, no la buena memoria:
 * `pipeline/test/sets.test.ts` importa este archivo y lo compara contra el
 * original. Si alguien agrega un set de un lado y no del otro, CI se pone en
 * rojo. Sin ese test, el síntoma sería el Worker tirando a la basura todas las
 * partidas del set nuevo durante días, en silencio y sin que nada falle.
 *
 * Acá vive SÓLO lo que el Worker necesita: qué set está vivo, para no guardar
 * partidas de uno que se va a borrar. Qué set publica el sitio es una pregunta
 * del pipeline y no viaja en esta copia.
 */

export interface SetDef {
  number: number;
  /** Primer día del set en vivo, UTC (`YYYY-MM-DD`). */
  opensAt: string;
  /** Primera versión de cliente del set; `null` hasta verla en datos reales. */
  opensAtVersion: string | null;
}

/** Idéntica a la del pipeline. No editar una sin la otra: hay un test que mira. */
export const SETS: readonly SetDef[] = [
  { number: 17, opensAt: "2026-04-15", opensAtVersion: "16.8" },
  { number: 18, opensAt: "2026-08-26", opensAtVersion: null },
];

/**
 * El set que está vivo en el juego ahora mismo: el más nuevo que ya abrió.
 *
 * Comparación de strings sobre `YYYY-MM-DD` en UTC, que ordena igual como texto
 * que como fecha. Los isolates de Workers corren en UTC, pero eso es un detalle
 * de la plataforma y no algo de lo que valga la pena depender.
 */
export function currentSet(now: Date = new Date()): number {
  const hoy = now.toISOString().slice(0, 10);
  const abiertos = SETS.filter((s) => s.opensAt <= hoy);
  return (abiertos.length > 0 ? abiertos[abiertos.length - 1] : SETS[0]).number;
}
