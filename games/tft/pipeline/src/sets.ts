/**
 * Qué set de TFT está vivo, cuál publica el sitio, y cuándo cambia cada cosa.
 *
 * Antes de este módulo el número de set estaba escrito a mano en cinco lugares
 * que no se hablaban entre sí —`catalog.ts`, `build.ts`, `summarize-run.ts`,
 * `compare-tiers.ts` y el `SET_OPENS_AT` de `patch.ts`—, cada uno con su propio
 * literal `17`. Cinco verdades que pueden contradecirse es exactamente la forma
 * de que un cambio de set salga mal: alcanza con acordarse de cuatro.
 *
 * ---
 *
 * **Los dos relojes.** Un cambio de set son dos preguntas distintas y confundirlas
 * rompe el sitio:
 *
 * - `currentSet()` — **qué set está vivo en el juego**. Cambia solo, en la fecha
 *   de abajo. Es lo que decide qué partidas vale la pena guardar: desde el
 *   momento en que abre el 18, una partida del 17 es basura que sólo ocupa lugar,
 *   porque el 17 se va a borrar.
 *
 * - `publishedSet()` — **de qué set habla el sitio**. NO cambia en la fecha:
 *   cambia recién cuando el set viejo se congela a mano (ver `close-set`). Si
 *   cambiara con el calendario, el 26 de agosto a las 00:00 UTC el sitio pasaría
 *   a publicar un set del que no tiene una sola partida y quedaría con las cinco
 *   bandas vacías durante horas. Es la misma falla que ya costó una vez con los
 *   parches (por eso la tier list se poolea por set), y con un set nuevo poolear
 *   no la salva: no hay datos que poolear todavía.
 *
 * O sea que entre el 26 de agosto y el día que se congele el 17, Vestigo junta
 * partidas del 18 mientras sigue mostrando el 17 quieto. Eso es deliberado: el
 * 17 ya no se mueve porque el juego no lo juega más, no porque falle algo.
 */

/** Un set, tal como Riot lo lanza. */
export interface SetDef {
  /** El número con el que el juego lo nombra: `info.tft_set_number`. */
  number: number;
  /**
   * Primer día del set en vivo, en UTC (`YYYY-MM-DD`).
   *
   * Riot despliega escalonado por región durante ~24 h, así que esta fecha NO
   * sirve para clasificar partidas — para eso está `set_number`, que viene
   * adentro de cada partida y es exacto. Lo único que decide es a partir de
   * cuándo dejamos de aceptar el set anterior.
   */
  opensAt: string;
  /**
   * Primera versión de CLIENTE del set, que no es lo mismo que el número de
   * parche de TFT: el Set 17 abrió en cliente 16.8, y lo que los jugadores
   * llaman "17.7" es el cliente 16.14.
   *
   * `null` mientras no se haya visto en datos reales. Es lo que hace que
   * `patchLabel()` muestre la versión cruda en vez de inventar un número: para
   * el 18 sabemos la fecha (Riot la anunció) pero no la versión de cliente, y un
   * número de parche equivocado en pantalla es peor que uno desconocido. Se
   * completa mirando la primera partida que entre del set nuevo.
   */
  opensAtVersion: string | null;
}

/**
 * Los sets que este proyecto conoce, en orden.
 *
 * Agregar un set es agregar una línea acá. Eso es todo lo que hay que hacer para
 * que la ingesta corte sola el día correcto.
 *
 * - **Set 17**: verificado contra nuestras propias partidas — abre en cliente
 *   16.8 el 2026-04-15, el mismo día que el 16 cierra en 16.7.
 * - **Set 18 "Enchanted Wilds"**: fecha del anuncio de Riot, no de fan sites.
 *   La página oficial dice que el set sale con el parche 18.1 el 26 de agosto;
 *   varias fan sites decían el 25 y estaban equivocadas por un día.
 *   https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/enchanted-wilds-overview/
 */
export const SETS: readonly SetDef[] = [
  { number: 17, opensAt: "2026-04-15", opensAtVersion: "16.8" },
  { number: 18, opensAt: "2026-08-26", opensAtVersion: null },
];

/** El día UTC de un instante, `YYYY-MM-DD`. */
const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * El set que está vivo en el juego ahora mismo: el más nuevo que ya abrió.
 *
 * La comparación es de strings y no de fechas a propósito. Los dos lados son
 * `YYYY-MM-DD` en UTC, formato que ordena igual como texto que como fecha, así
 * que no hay ni un `new Date("...")` que interpretar en la zona horaria de quien
 * corra esto. Un `Date` construido de un string sin hora se lee como UTC, pero
 * uno con hora no, y esa inconsistencia es una fuente clásica de corrimientos de
 * un día.
 *
 * Antes del primer set conocido devuelve el primero: no hay ningún caso real
 * —los datos empiezan en el 17— y devolver 0 obligaría a cada consumidor a
 * defenderse de un set que no existe.
 */
export function currentSet(now: Date = new Date()): number {
  const hoy = utcDay(now);
  const abiertos = SETS.filter((s) => s.opensAt <= hoy);
  const elegido = abiertos.length > 0 ? abiertos[abiertos.length - 1] : SETS[0];
  return elegido.number;
}

/**
 * De qué set habla el sitio: el más nuevo que todavía NO se congeló.
 *
 * `archivados` son los sets que ya tienen su tier list congelada en
 * `games/tft/data/sets/` — los escribe `close-set --freeze` y los lee el índice
 * que ese comando genera. Mientras el 17 no esté ahí, el sitio publica el 17,
 * aunque el juego ya esté en el 18.
 *
 * Es el **más viejo** sin archivar, no el más nuevo, y esa palabra es todo el
 * comportamiento: entre el 26 de agosto y el congelado hay dos sets abiertos y
 * sin archivar a la vez, y el que hay que seguir mostrando es el que tiene los
 * datos. La consecuencia buscada es que cerrar un set sea obligatorio para pasar
 * al siguiente, y que olvidarse se note —el sitio se queda en el set viejo— en
 * vez de romperse en silencio.
 *
 * Nunca devuelve un set que no abrió: si todos los conocidos están archivados
 * —que no debería pasar, porque no se archiva el set vigente— cae al que está
 * vivo, y el guardián de `sampleSize` de la Action se encarga del resto.
 */
export function publishedSet(archivados: readonly number[], now: Date = new Date()): number {
  const vivo = currentSet(now);
  const cerrados = new Set(archivados);
  const candidatos = SETS.filter((s) => s.number <= vivo && !cerrados.has(s.number));
  return candidatos.length > 0 ? candidatos[0].number : vivo;
}

/** La definición de un set, o `undefined` si no está en la tabla. */
export function setDef(number: number): SetDef | undefined {
  return SETS.find((s) => s.number === number);
}

/**
 * Las primeras versiones de cliente conocidas, en la forma que `patchLabel()`
 * necesita: derivadas de `SETS`, no escritas por segunda vez.
 *
 * Los sets cuya versión todavía no se vio quedan afuera del objeto, que es
 * exactamente lo que `patchLabel()` trata como "set desconocido" y responde
 * devolviendo la versión cruda.
 */
export function setOpeningVersions(): Record<number, string> {
  const out: Record<number, string> = {};
  for (const s of SETS) if (s.opensAtVersion) out[s.number] = s.opensAtVersion;
  return out;
}

/**
 * El set que pide el entorno, o `null` si no pidió ninguno.
 *
 * `TFT_SET` sobrevive como **override explícito** —reconstruir un set viejo,
 * congelar uno recién cerrado— y deja de ser el valor de todos los días. Tira
 * ante cualquier cosa que no sea un entero: `Number("")` da 0 y `Number("diecisiete")`
 * da `NaN`, y nada es `=== NaN`, así que un typo descartaría el 100% de cada
 * lote en silencio en vez de fallar. Es la misma guarda que tenía
 * `assertValidSet` en summarize-run.ts, movida acá para que valga en los cuatro
 * consumidores y no en uno solo.
 */
export function setFromEnv(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new Error(
      `TFT_SET inválido: "${raw}" no da un entero (Number(...) = ${n}). ` +
        "Con un set roto no se descarta un poco: se descarta todo, y en silencio."
    );
  }
  return n;
}
