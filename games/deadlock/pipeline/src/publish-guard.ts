import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, existsSync } from "node:fs";

/**
 * ¿Vale la pena commitear lo que acaba de construirse?
 *
 *   npm run publish:guard -- <directorio-de-antes> <directorio-de-ahora>
 *
 * Sale con 0 si hay que publicar, **3 si no cambió nada que importe**, y 1 si
 * algo está mal. El 3 es un código aparte y no un 1 porque "no hay novedades" no
 * es un error: la Action lo lee para saltear el commit sin ponerse en rojo.
 *
 * **Existe porque `generatedAt` cambia siempre.** Un `git diff` nunca da vacío,
 * así que sin esto cada corrida dejaría un commit diciendo que la tier list se
 * movió cuando lo único distinto es la hora. Es la misma guarda que el pipeline
 * de TFT, con una diferencia: allá el peso es la historia de git (~9,6 GB al
 * año), acá los archivos suman 56 KB y lo que se cuida es el ruido — un
 * historial donde cada commit dice algo es un historial que se puede leer.
 */

/** Todo menos la marca de tiempo, que cambia aunque los números no. */
function significant(json: string): string {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  delete parsed.generatedAt;
  return JSON.stringify(parsed);
}

/**
 * Los archivos que cambiaron de verdad entre dos directorios.
 *
 * Un archivo nuevo cuenta como cambio: la primera vez que se publica una banda,
 * o el día que el juego suma un rango, no hay contra qué comparar y publicar es
 * exactamente lo que corresponde.
 */
export function changedFiles(before: string, after: string, names: string[]): string[] {
  return names.filter((name) => {
    const nuevo = readFileSync(`${after}/${name}`, "utf8");
    const viejo = `${before}/${name}`;
    if (!existsSync(viejo)) return true;
    try {
      return significant(readFileSync(viejo, "utf8")) !== significant(nuevo);
    } catch {
      // Un archivo de antes que no parsea no es motivo para no publicar: lo que
      // se acaba de construir sí parsea, y es lo que va a servirse.
      return true;
    }
  });
}

function main() {
  const [before, after] = process.argv.slice(2);
  if (!before || !after) {
    console.error("uso: publish:guard <directorio-de-antes> <directorio-de-ahora>");
    process.exit(1);
  }

  const names = readdirSync(after).filter((f) => f.endsWith(".json"));
  if (names.length === 0) {
    console.error(`${after} no tiene ni un JSON: el build no escribió nada.`);
    process.exit(1);
  }

  const changed = changedFiles(before, after, names);
  if (changed.length === 0) {
    console.log(`sin cambios reales en ${names.length} archivos (sólo generatedAt) — no publico`);
    process.exit(3);
  }

  console.log(`cambiaron ${changed.length} de ${names.length}: ${changed.join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
