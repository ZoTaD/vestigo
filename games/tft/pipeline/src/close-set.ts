import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { BANDS, bandPath } from "./bands";
import { currentSet, setDef } from "./sets";
import {
  SETS_INDEX,
  setDir,
  manifestPath,
  readSetsIndex,
  type ArchivedSet,
  type SetManifest,
} from "./setsArchive";
import { r2Client, r2Config, R2_BUCKET } from "./r2Archive";
import { listKeysFromR2, getObjectFromR2, patchesForSetFromR2, deleteKeysFromR2 } from "./r2Summary";
import { d1Fetcher, d1Runner } from "./d1";

/**
 * Cerrar un set: congelar su tier list y después soltar lo que la sostenía.
 *
 *   npm run close-set -- --freeze 17     (reversible: sólo escribe)
 *   npm run close-set -- --purge  17     (irreversible: borra D1 y R2)
 *
 * **Son dos comandos y no uno, a propósito.** El congelado se puede correr las
 * veces que haga falta y no destruye nada; el borrado no se deshace. Juntarlos
 * en un `close-set 17` que hace todo sería cómodo una vez cada cuatro meses y
 * catastrófico la vez que salga mal.
 *
 * ---
 *
 * **Cuándo correr el congelado: apenas abra el set nuevo, no una semana después.**
 *
 * Esto no es una preferencia, es una cuenta. `comps.json` sale del resumen de R2
 * y está completo para siempre, pero `units`, `items`, `habits` y la calibración
 * salen de la **ventana de crudas**, que guarda las 14.000 partidas más nuevas
 * (`RAW_RETENTION_MATCHES`). Con la ingesta midiendo ~1.056 partidas por hora,
 * esas 14.000 se renuevan enteras en poco más de **medio día**. O sea que a las
 * ~13 horas de que abra el Set 18, la ventana ya no tiene una sola partida del
 * 17 y esas cuatro cosas quedan en `insufficient` para siempre.
 *
 * Por eso `--freeze` se planta y no escribe si lo publicado ya viene hueco: un
 * congelado incompleto no se nota hasta que alguien abre la página del set
 * viejo meses después, y para entonces no hay de dónde rehacerlo.
 */

const DATA = "../data";
const COMPS = `${DATA}/comps.json`;
const UNITS = `${DATA}/units.json`;
const ITEMS = `${DATA}/items.json`;
const HABITS = `${DATA}/habits.json`;
const CATALOG = `${DATA}/catalog.json`;

interface CompsFile {
  band?: string;
  patch?: string;
  patchLabel?: string;
  sampleSize: number;
  insufficient?: boolean;
  comps: unknown[];
}

interface UnitsFile {
  insufficient?: boolean;
  units?: unknown[];
}

/** Lo que se copia tal cual, con su nombre de destino. */
function frozenFiles(): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const band of BANDS) {
    for (const base of [COMPS, UNITS, ITEMS]) {
      const from = bandPath(base, band.id);
      out.push({ from, to: from.slice(DATA.length + 1) });
    }
  }
  out.push({ from: HABITS, to: "habits.json" });
  // El catálogo viaja con el set congelado porque `npm run catalog` lo va a
  // regenerar para el set nuevo, y sin él la página archivada no tendría de
  // dónde sacar el nombre ni la imagen de una sola unidad: la UI resuelve cada
  // id contra este archivo. Es el archivo más pesado del congelado y el más
  // fácil de olvidar, porque nada falla hasta que alguien abre la página.
  out.push({ from: CATALOG, to: "catalog.json" });
  return out;
}

/**
 * Que lo publicado sirva para congelarse.
 *
 * Devuelve los motivos por los que NO habría que congelar. Vacío es luz verde.
 */
export function freezeBlockers(
  comps: Record<string, CompsFile>,
  units: Record<string, UnitsFile>,
  set: number
): string[] {
  const motivos: string[] = [];

  for (const band of BANDS) {
    const c = comps[band.id];
    if (!c) {
      motivos.push(`falta comps de la banda ${band.id}`);
      continue;
    }
    if (c.insufficient || c.comps.length === 0) {
      motivos.push(`la banda ${band.id} no tiene comps publicadas`);
    }
    // Congelar la tier list del set equivocado sería lo peor que puede pasar
    // acá: se archiva bajo un número y adentro tiene otro.
    const label = c.patchLabel ?? "";
    const delSet = label.startsWith(`${set}.`);
    if (label && !delSet) {
      motivos.push(`comps de ${band.id} dice parche "${label}", que no es del set ${set}`);
    }
  }

  // units/items/habits salen de la ventana de crudas, que se vacía del set viejo
  // en medio día. Que estén huecos es la señal de que se llegó tarde.
  const huecas = BANDS.filter((b) => units[b.id]?.insufficient).map((b) => b.id);
  if (huecas.length === BANDS.length) {
    motivos.push(
      "units viene vacío en TODAS las bandas: la ventana de crudas ya no tiene " +
        "partidas de este set, así que un congelado ahora saldría sin unidades ni ítems"
    );
  }

  return motivos;
}

/** Lee un JSON del directorio de datos, o `null` si no está. */
function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

async function freeze(set: number, force: boolean): Promise<void> {
  const comps: Record<string, CompsFile> = {};
  const units: Record<string, UnitsFile> = {};
  for (const band of BANDS) {
    const c = readJson<CompsFile>(bandPath(COMPS, band.id));
    const u = readJson<UnitsFile>(bandPath(UNITS, band.id));
    if (c) comps[band.id] = c;
    if (u) units[band.id] = u;
  }

  const motivos = freezeBlockers(comps, units, set);
  if (motivos.length > 0) {
    const lista = motivos.map((m) => `  - ${m}`).join("\n");
    if (!force) {
      throw new Error(
        `no congelo el set ${set}, lo publicado no está en condiciones:\n${lista}\n` +
          "Si igual querés congelarlo así, agregá --force. Ojo: esto no se puede " +
          "rehacer después, porque lo que falta ya no está en ninguna parte."
      );
    }
    console.warn(`ADVERTENCIA: congelando igual por --force, con estos problemas:\n${lista}`);
  }

  // Los parches del set salen de R2, que es lo único que los conoce todos: la
  // ventana de crudas de D1 sólo llega a los últimos días del set.
  console.log("buscando en R2 qué parches compusieron el set...");
  const cliente = r2Client(r2Config());
  const patches = await patchesForSetFromR2(
    listKeysFromR2(cliente),
    getObjectFromR2(cliente),
    set
  );
  if (patches.length === 0) {
    throw new Error(
      `R2 no tiene ni un objeto de resumen del set ${set}. Sin la lista de parches ` +
        "el borrado no puede ser exacto, así que no dejo un manifiesto que miente."
    );
  }
  console.log(`  ${patches.length} parches: ${patches.join(", ")}`);

  const dir = setDir(set);
  mkdirSync(dir, { recursive: true });
  for (const { from, to } of frozenFiles()) {
    if (!existsSync(from)) throw new Error(`falta ${from}, que es parte del congelado`);
    copyFileSync(from, `${dir}/${to}`);
  }

  const rango = await matchDateRange(set);
  const manifest: SetManifest = {
    set,
    patches,
    from: rango.from,
    to: rango.to,
    sampleSize: comps[BANDS[0].id]?.sampleSize ?? 0,
    frozenAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath(set), `${JSON.stringify(manifest, null, 2)}\n`);

  // El índice es lo que hace que el set congelado exista para el resto del
  // sistema: la UI lo lee para ofrecerlo, y `publishedSet()` lo lee para saber
  // que puede pasar al siguiente. Escribirlo es el último paso del congelado.
  const indice = readSetsIndex();
  const entrada: ArchivedSet = {
    number: set,
    label: String(set),
    frozenAt: manifest.frozenAt,
    sampleSize: manifest.sampleSize,
  };
  indice.sets = [...indice.sets.filter((s) => s.number !== set), entrada].sort(
    (a, b) => b.number - a.number
  );
  writeFileSync(SETS_INDEX, `${JSON.stringify(indice, null, 2)}\n`);

  console.log(
    `\nset ${set} congelado en ${dir} (${manifest.sampleSize} tableros, ` +
      `${patches.length} parches, ${rango.from} → ${rango.to}).`
  );
  console.log("Commiteá esto y dejá que se publique ANTES de correr --purge.");
}

/**
 * El primer y último día con partidas del set, según lo que quede en D1.
 *
 * Es informativo —no lo usa ningún borrado— así que un fallo no aborta el
 * congelado: mejor un manifiesto sin rango que no poder cerrar un set porque la
 * base no contestó.
 */
async function matchDateRange(set: number): Promise<{ from: string; to: string }> {
  try {
    const d1 = d1Fetcher();
    const filas = (await d1({
      sql: "select min(game_datetime) as min_dt, max(game_datetime) as max_dt from matches where set_number = ?",
      params: [set],
    })) as { min_dt: number | null; max_dt: number | null }[];
    const { min_dt, max_dt } = filas[0] ?? { min_dt: null, max_dt: null };
    const dia = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");
    return { from: dia(min_dt), to: dia(max_dt) };
  } catch (e) {
    console.warn(`aviso: no pude leer el rango de fechas de D1 (${(e as Error).message})`);
    return { from: "", to: "" };
  }
}

/**
 * Lo que impide borrar un set. Vacío es luz verde.
 *
 * Es una función pura y aparte del borrado porque es la parte que no se puede
 * probar en producción: cada una de estas cuatro condiciones describe un estado
 * en el que borrar deja al sitio sin nada que mostrar de ese set, para siempre.
 * Un test barato acá vale más que cualquier cuidado al ejecutar.
 */
export function purgeBlockers(estado: {
  set: number;
  vivo: number;
  hayManifiesto: boolean;
  enElIndice: boolean;
  patches: string[];
}): string[] {
  const motivos: string[] = [];
  if (estado.set === estado.vivo) {
    motivos.push(`el set ${estado.set} es el que está vivo ahora mismo: no se borra un set en curso`);
  }
  if (!estado.hayManifiesto) {
    motivos.push(
      `no hay manifiesto del set ${estado.set}: hay que correr --freeze primero, ` +
        "porque sin el congelado esto borraría el set sin dejar nada"
    );
  }
  if (!estado.enElIndice) {
    motivos.push(
      `el set ${estado.set} no figura en el índice de archivados, así que el sitio ` +
        "todavía no lo publica: si el congelado no está desplegado, esto deja un hueco"
    );
  }
  if (estado.hayManifiesto && estado.patches.length === 0) {
    motivos.push(`el manifiesto del set ${estado.set} no lista parches: no sabría qué borrar de R2`);
  }
  return motivos;
}

async function purge(set: number): Promise<void> {
  const hayManifiesto = existsSync(manifestPath(set));
  const manifest = hayManifiesto
    ? (JSON.parse(readFileSync(manifestPath(set), "utf8")) as SetManifest)
    : null;

  const motivos = purgeBlockers({
    set,
    vivo: currentSet(),
    hayManifiesto,
    enElIndice: readSetsIndex().sets.some((s) => s.number === set),
    patches: manifest?.patches ?? [],
  });
  if (motivos.length > 0) {
    throw new Error(`no borro el set ${set}:\n${motivos.map((m) => `  - ${m}`).join("\n")}`);
  }
  // purgeBlockers ya garantizó que existe y tiene parches.
  const patches = manifest!.patches;

  console.log(`borrando el set ${set} (${patches.length} parches)...`);

  // 1. Las crudas de D1. `match_players` tiene `on delete cascade`, así que se
  //    va sola con su partida.
  const borrar = d1Runner();
  const borradas = await borrar({
    sql: "delete from matches where set_number = ?",
    params: [set],
  });
  console.log(`  D1: ${borradas} partidas borradas (y sus tableros por cascade)`);

  // 2 y 3. R2: las crudas archivadas y el resumen, parche por parche. Los
  //    prefijos son los que arman `archivePath` y `snapshotPath`; borrar por
  //    prefijo es lo que garantiza llevarse también los objetos por día.
  const cliente = r2Client(r2Config());
  const list = listKeysFromR2(cliente);
  const del = deleteKeysFromR2(cliente);
  for (const patch of patches) {
    for (const prefijo of [`tft/matches/patch=${patch}/`, `summary/patch=${patch}/`]) {
      const keys = await list(prefijo);
      if (keys.length === 0) continue;
      await del(keys);
      console.log(`  R2: ${keys.length} objetos borrados de ${R2_BUCKET}/${prefijo}`);
    }
  }

  manifest!.purgedAt = new Date().toISOString();
  writeFileSync(manifestPath(set), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nset ${set} borrado. Lo único que queda de él es ${setDir(set)}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const modo = args.find((a) => a === "--freeze" || a === "--purge");
  const set = Number(args[args.indexOf(modo ?? "") + 1]);

  if (!modo || !Number.isInteger(set)) {
    console.error("uso: npm run close-set -- --freeze <set>   |   -- --purge <set>");
    process.exit(2);
  }
  if (!setDef(set)) {
    console.error(`el set ${set} no está en la tabla de sets.ts. Agregalo antes de cerrarlo.`);
    process.exit(2);
  }

  if (modo === "--freeze") await freeze(set, force);
  else await purge(set);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
