import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BANDS, bandPath } from "./bands";
import { d1Fetcher } from "./d1";

/**
 * Las tres guardas de la publicación automática, porque nadie va a estar mirando.
 *
 * Se corre DESPUÉS del build, comparando lo recién construido contra la copia que se
 * guardó antes de construir. Sale con:
 *   0 — publicar
 *   3 — no hay nada que publicar (nada cambió salvo la hora)
 *   1 — abortar (la muestra se desplomó, o la key está vencida hace un día entero)
 */

/**
 * Los archivos que el build escribe, derivados de BANDS y no tipeados a mano: una
 * segunda lista de bandas es justo el tipo de divergencia silenciosa que este
 * proyecto ya pagó caro (ver bands.ts y su test). Agregar o renombrar una banda acá
 * se entera solo. `habits.json` no tiene copia por banda, así que va aparte.
 */
const FILES = [
  ...BANDS.flatMap((band) =>
    ["comps.json", "units.json", "items.json"].map((base) => bandPath(base, band.id))
  ),
  "habits.json",
];

/** Cuánto puede caer la muestra antes de que sea una lectura rota y no menos partidas. */
const MAX_DROP = 0.3;
/**
 * Corridas seguidas con la key vencida antes de gritar. 48 son 24 horas.
 *
 * Alto a propósito. Que la key se venza es la rutina, no una falla: el cron sigue
 * llamando cada 30 minutos y en cuanto se sube la nueva vuelve a traer solo. Gritar
 * por eso sería ruido diario. Un día entero sin traer nada ya no es la rutina, es un
 * olvido — y ahí sí conviene el mail de GitHub.
 */
const DEAD_KEY_HOURS = 24;

/**
 * Cuántas corridas hacen falta para que el silencio signifique algo.
 *
 * Sin este piso, un cron detenido —cero o dos corridas en 24 h, todas fallidas—
 * se leería igual que una key vencida. Son cosas distintas y el mensaje sería el
 * equivocado.
 */
const MIN_DEAD_RUNS = 6;

/** Todo menos la hora de construcción, que cambia siempre y no dice nada. */
function withoutTimestamp(json: string): string {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  delete parsed.generatedAt;
  return JSON.stringify(parsed);
}

export function meaningfulChange(before: string, after: string): boolean {
  return withoutTimestamp(before) !== withoutTimestamp(after);
}

/** Caída de muestra como fracción de lo que estaba publicado. Crecer no es caer. */
export function sampleDrop(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.max(0, (before - after) / before);
}

/** Lo que un `comps*.json` necesita decir para que la guarda de caída decida. */
export interface CompsSnapshot {
  patch?: string;
  sampleSize?: number;
}

/**
 * Si la caída de muestra de un `comps*.json` debe abortar la publicación.
 *
 * Un cambio de parche no es "la lectura se rompió", es "hay menos partidas" a
 * propósito: el parche nuevo arranca con muy pocos tableros por diseño (ver
 * PROVISIONAL_BAND_BOARDS en build.ts), y esa caída puede ser del 98% sin que
 * nada esté mal. Para eso existen el piso provisional y su aviso en pantalla —
 * no para que esta guarda los pise. Cuando el parche es el mismo, MAX_DROP
 * sigue aplicando con la misma dureza de siempre.
 */
export function sampleDropAborts(before: CompsSnapshot, after: CompsSnapshot): boolean {
  if (before.patch !== after.patch) return false;
  return sampleDrop(before.sampleSize ?? 0, after.sampleSize ?? 0) > MAX_DROP;
}

export interface PullRun {
  status: string;
  detail: string | null;
}

export function keyLooksDead(runs: PullRun[]): boolean {
  if (runs.length < MIN_DEAD_RUNS) return false;
  return runs.every((r) => r.status === "error" && (r.detail ?? "").includes("RIOT_401"));
}

async function main() {
  const [beforeDir, afterDir] = process.argv.slice(2);
  if (!beforeDir || !afterDir) {
    console.error("uso: publish-guard <dir-antes> <dir-después>");
    process.exitCode = 1;
    return;
  }

  // La ventana es de TIEMPO, no de corridas. Antes eran "las últimas 48", con un
  // comentario que decía "48 son 24 horas" — cierto cuando el cron corría cada 30
  // minutos, falso desde que pasó a cada 5, donde 48 corridas son 4 horas. Con la
  // key venciendo a diario, eso convertía la publicación en un mail rojo todos los
  // días: exactamente el ruido que la guarda quería evitar. Preguntando por horas,
  // el próximo cambio de frecuencia no la vuelve a romper.
  const since = new Date(Date.now() - DEAD_KEY_HOURS * 3_600_000).toISOString();
  const runs = (await d1Fetcher()({
    sql: "select status, detail from pull_runs where started_at >= ? order by started_at desc",
    params: [since],
  })) as PullRun[];
  if (keyLooksDead(runs)) {
    console.error(
      "La key de Riot viene fallando con RIOT_401 hace un día entero: el cron no está " +
        "trayendo partidas nuevas. Renovarla en el portal de Riot y volver a correr esto."
    );
    process.exitCode = 1;
    return;
  }

  let changed = false;
  for (const name of FILES) {
    const before = `${beforeDir}/${name}`;
    const after = `${afterDir}/${name}`;
    if (!existsSync(after)) continue;
    if (!existsSync(before)) {
      changed = true;
      continue;
    }
    const b = readFileSync(before, "utf-8");
    const a = readFileSync(after, "utf-8");

    if (name.startsWith("comps")) {
      const beforeSnap = JSON.parse(b) as CompsSnapshot;
      const afterSnap = JSON.parse(a) as CompsSnapshot;
      if (sampleDropAborts(beforeSnap, afterSnap)) {
        const drop = sampleDrop(beforeSnap.sampleSize ?? 0, afterSnap.sampleSize ?? 0);
        console.error(
          `${name}: la muestra cayó ${(drop * 100).toFixed(0)}%. Eso no es "hay menos ` +
            `partidas", es una lectura rota. No se publica.`
        );
        process.exitCode = 1;
        return;
      }
    }

    if (meaningfulChange(b, a)) changed = true;
  }

  if (!changed) {
    console.log("nada cambió salvo la hora: no hay nada que publicar");
    process.exitCode = 3;
    return;
  }
  console.log("hay cambios: publicar");
}

// Guarded so importing this file for meaningfulChange/sampleDrop/keyLooksDead (as
// publishGuard.test.ts does) doesn't also fire off a live comparison against Postgres.
//
// main() sets process.exitCode and returns rather than calling process.exit(): on
// Windows, calling process.exit() right after an in-flight fetch (pgFetcher) races
// libuv's handle teardown and crashes the process with "Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)" instead of exiting with the intended code.
// Setting exitCode and letting the event loop drain naturally sidesteps that.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  });
}
